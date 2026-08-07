import type Database from "better-sqlite3";
import { MONEY_SCALE, toMinorUnits } from "../../src/shared/money";

/**
 * The audited inventory of every stored money column.
 *
 * Schema version 12 moved calculation onto integer minor units. Each REAL
 * column kept its name and became a read-only compatibility mirror, and an
 * INTEGER `*_minor` column beside it became the source of truth.
 *
 * One list drives all three consumers — the migration that adds and backfills
 * the columns, the triggers that keep a pair from drifting, and the schema
 * drift guard — so a column can never be migrated but left untriggered, or
 * triggered but never backfilled.
 *
 * The mirror exists because an older installed build does not refuse a version
 * 12 file. It would write only the REAL column and calculate from it. The
 * triggers turn that into a clean failure instead of a silently wrong balance.
 * Recovering to 0.3.x means restoring the pre-migration safety backup, not
 * editing a version 12 file with old code.
 */
export type MoneyColumnPair = {
  /** Table holding both members of the pair. */
  table: string;
  /** The original REAL column, now a read-only mirror. */
  legacyColumn: string;
  /** The INTEGER minor-unit column that calculations use. */
  minorColumn: string;
  /** True only where the legacy column already allowed NULL. */
  nullable: boolean;
};

export const moneyColumnPairs: readonly MoneyColumnPair[] = [
  pair("vehicles", "daily_price"),
  pair("vehicles", "deposit_amount"),
  nullablePair("vehicles", "commission_rate_override"),

  pair("vehicle_sales", "sale_price"),

  pair("rentals", "daily_price"),
  pair("rentals", "deposit_required"),
  pair("rentals", "deposit_paid"),
  pair("rentals", "extra_charges"),
  pair("rentals", "accessory_charges"),
  pair("rentals", "discount"),
  pair("rentals", "total_amount"),
  pair("rentals", "paid_amount"),
  pair("rentals", "remaining_amount"),
  pair("rentals", "commission_rate_per_day"),
  pair("rentals", "commission_amount"),

  pair("accessories", "default_charge"),
  pair("rental_accessories", "unit_charge"),
  nullablePair("rental_collateral_items", "estimated_value"),

  pair("payments", "amount"),
  pair("expenses", "amount"),
  pair("cash_movements", "amount"),

  pair("employee_loans", "amount"),
  pair("employee_loans", "remaining_amount"),
  pair("employee_loan_payments", "amount"),

  pair("accounting_adjustments", "amount"),
  pair("maintenance_records", "cost"),

  pair("daily_closings", "expected_cash"),
  pair("daily_closings", "counted_cash"),
  pair("daily_closings", "difference"),
];

function pair(table: string, legacyColumn: string): MoneyColumnPair {
  return {
    table,
    legacyColumn,
    minorColumn: `${legacyColumn}_minor`,
    nullable: false,
  };
}

function nullablePair(table: string, legacyColumn: string): MoneyColumnPair {
  return { ...pair(table, legacyColumn), nullable: true };
}

/**
 * The column definition both paths use.
 *
 * A required column carries `default 0` even though every row is backfilled
 * immediately: SQLite refuses to add a NOT NULL column without one, and using
 * the same text on the fresh path is what keeps the two schemas identical.
 */
export function moneyMinorColumnDefinition(pair: MoneyColumnPair): string {
  return pair.nullable ? "integer" : "integer not null default 0";
}

/**
 * Builds the pair of triggers that refuse a write leaving a mirror and its
 * minor column disagreeing.
 *
 * The rule is exact: the mirror must be `minor / 100`, computed the same way
 * `fromMinorUnits` computes it. IEEE division is correctly rounded, so SQLite's
 * `cast(minor as real) / 100.0` and JavaScript's `minor / 100` produce the same
 * double for every safe integer. Nothing is approximate, so no near-miss pair
 * such as `1.005` beside `100` or `2.675` beside `267` can slip through.
 *
 * Rows migrated from version 11 keep the shop's original REAL value, which is
 * deliberately *not* normalized — 2.675 stays 2.675 next to 268, and that pair
 * fails the exact rule. Two things keep those rows usable:
 *
 * - The INSERT trigger only sees new rows, which this app always writes
 *   normalized.
 * - The UPDATE trigger checks nothing unless a member actually changed. A
 *   historical row can be edited for any other reason, or have the same values
 *   resubmitted, without being forced to normalize. Changing either member does
 *   demand a correct pair, which is exactly what an old build cannot produce.
 *
 * The UPDATE trigger also names both columns, so a statement that never
 * mentions them is not considered at all.
 */
export function moneyMirrorTriggerSql(pair: MoneyColumnPair): string {
  const { table, legacyColumn, minorColumn } = pair;
  const message = `${table}.${legacyColumn} and ${table}.${minorColumn} disagree. This data file was written by an app version that does not keep them together; restore the backup taken before the upgrade.`;

  // A REAL smuggled into the minor column would silently reintroduce fractions.
  const integerCheck = `new.${minorColumn} <> cast(new.${minorColumn} as integer)`;
  const mirrorCheck = `new.${legacyColumn} is not cast(new.${minorColumn} as real) / ${MONEY_SCALE}.0`;
  const condition = pair.nullable
    ? `((new.${legacyColumn} is null) <> (new.${minorColumn} is null))
        or (new.${minorColumn} is not null and (${integerCheck} or ${mirrorCheck}))`
    : `${integerCheck} or ${mirrorCheck}`;

  // `is not` rather than `<>` so a NULL on either side still counts as a change.
  const changed = `new.${legacyColumn} is not old.${legacyColumn}
        or new.${minorColumn} is not old.${minorColumn}`;

  const body = `begin
    select raise(abort, '${message.replace(/'/g, "''")}');
  end;`;

  return `
  create trigger if not exists ${triggerName(pair, "insert")}
  before insert on ${table}
  for each row when ${condition}
  ${body}

  create trigger if not exists ${triggerName(pair, "update")}
  before update of ${legacyColumn}, ${minorColumn} on ${table}
  for each row when (${changed})
    and (${condition})
  ${body}
`;
}

export function triggerName(
  pair: MoneyColumnPair,
  event: "insert" | "update",
): string {
  return `${pair.table}_${pair.minorColumn}_${event === "insert" ? "ins" : "upd"}_ck`;
}

/** Every mirror trigger, idempotent, applied on the fresh and upgrade paths. */
export const allMoneyMirrorTriggerSql = moneyColumnPairs
  .map((pair) => moneyMirrorTriggerSql(pair))
  .join("\n");

type MoneyRow = { id: number; legacy: unknown };

/**
 * Fills every `*_minor` column from its mirror and proves the result.
 *
 * Conversion happens in JavaScript, one value at a time, so a half cent rounds
 * the same way it will for every later write. SQL `round(x * 100)` would be a
 * second, subtly different rule applied to the one dataset that can never be
 * re-derived.
 *
 * Nothing is deleted, clamped or replaced. A value that cannot convert throws,
 * which rolls back the whole migration and leaves the version 11 file intact
 * beside its safety backup.
 */
export function backfillMoneyMinorColumns(
  database: Database.Database,
  pairs: readonly MoneyColumnPair[] = moneyColumnPairs,
): MoneyBackfillReport {
  const report: MoneyBackfillReport = { pairs: pairs.length, rowsConverted: 0 };

  for (const pair of pairs) {
    const rows = database
      .prepare(
        `select id as id, ${pair.legacyColumn} as legacy from ${pair.table} order by id`,
      )
      .all() as MoneyRow[];
    const update = database.prepare(
      `update ${pair.table} set ${pair.minorColumn} = ? where id = ?`,
    );

    for (const row of rows) {
      const expected = convertLegacyValue(pair, row);
      update.run(expected, row.id);
      report.rowsConverted += 1;
    }

    verifyPair(database, pair, rows);
  }

  return report;
}

export type MoneyBackfillReport = { pairs: number; rowsConverted: number };

function convertLegacyValue(pair: MoneyColumnPair, row: MoneyRow): number | null {
  const context = `${pair.table} row ${row.id} column ${pair.legacyColumn}`;

  if (row.legacy === null || row.legacy === undefined) {
    if (!pair.nullable) {
      throw new Error(`${context} is empty, but this column always holds an amount.`);
    }

    return null;
  }

  if (typeof row.legacy !== "number") {
    throw new Error(
      `${context} does not hold a number (${JSON.stringify(row.legacy)}).`,
    );
  }

  return toMinorUnits(row.legacy, context);
}

/**
 * Reads every row back and re-derives the expected value. This catches a lost
 * update, a mismatched row count and any storage-level surprise before the
 * migration is allowed to commit.
 */
function verifyPair(
  database: Database.Database,
  pair: MoneyColumnPair,
  expectedRows: readonly MoneyRow[],
): void {
  const stored = database
    .prepare(
      `select id as id, ${pair.legacyColumn} as legacy, ${pair.minorColumn} as minor
       from ${pair.table} order by id`,
    )
    .all() as Array<MoneyRow & { minor: unknown }>;

  if (stored.length !== expectedRows.length) {
    throw new Error(
      `${pair.table}.${pair.minorColumn} was backfilled for ${expectedRows.length} row(s) but ${stored.length} row(s) are present.`,
    );
  }

  for (const row of stored) {
    const context = `${pair.table} row ${row.id} column ${pair.minorColumn}`;
    const expected = convertLegacyValue(pair, row);

    if (expected === null) {
      if (row.minor !== null) {
        throw new Error(`${context} should have stayed empty but holds ${String(row.minor)}.`);
      }

      continue;
    }

    if (row.minor !== expected) {
      throw new Error(
        `${context} stored ${String(row.minor)} but ${expected} was expected.`,
      );
    }
  }
}
