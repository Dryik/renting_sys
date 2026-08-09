/**
 * Reads the application's data file from outside the application.
 *
 * Everything here opens SQLite read-only through `better-sqlite3-node`, the
 * Node-ABI alias the test suite already uses, because the shipped
 * `better-sqlite3` is compiled for Electron's ABI and plain Node cannot load
 * it. Nothing in this file writes to the database: the upgrade is performed by
 * the real application, and this only inspects the result.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromHere = createRequire(import.meta.url);

/** Names the mirror triggers end with, two per money column pair. */
const mirrorTriggerSuffixes = ["_minor_ins_ck", "_minor_upd_ck"];

/** Schema version lives in a row, not in `pragma user_version`. */
export function readSchemaVersion(database) {
  const row = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get();

  return row?.value === undefined ? null : Number(row.value);
}

export function openReadOnly(databasePath) {
  const Database = requireFromHere("better-sqlite3-node");

  return new Database(databasePath, { readonly: true, fileMustExist: true });
}

/**
 * Every user table and its row count. Derived from the file rather than a
 * hardcoded list, so a table the rehearsal forgot about still gets compared.
 */
export function readTableCounts(database) {
  const tables = database
    .prepare(
      `select name from sqlite_master
       where type = 'table' and name not like 'sqlite_%'
       order by name`,
    )
    .all();

  const counts = {};

  for (const { name } of tables) {
    const row = database.prepare(`select count(*) as count from "${name}"`).get();
    counts[name] = row.count;
  }

  return counts;
}

/**
 * The money values the report compares, read at the public major-unit
 * boundary. Before the upgrade the REAL column is the source of truth; after
 * it, it is the mirror of the integer column. Either way the number a user
 * would see is the same one, which is exactly the property being proved.
 */
export function readRepresentativeValues(database) {
  const pick = (label, sql) => {
    try {
      return { label, rows: database.prepare(sql).all() };
    } catch (error) {
      return { label, error: error instanceof Error ? error.message : String(error) };
    }
  };

  return [
    pick(
      "rentals",
      `select id, contract_number, status, daily_price, total_amount, paid_amount,
              remaining_amount, deposit_required, deposit_paid, extra_charges,
              discount, commission_rate_per_day, commission_amount
       from rentals order by id`,
    ),
    pick(
      "payments",
      `select id, rental_id, payment_type, amount, is_voided
       from payments order by id`,
    ),
    pick("expenses", "select id, amount, is_voided from expenses order by id"),
    pick(
      "cash_movements",
      "select id, movement_type, amount, is_voided from cash_movements order by id",
    ),
    pick(
      "employee_loans",
      "select id, employee_id, amount, is_voided from employee_loans order by id",
    ),
    pick(
      "vehicle_sales",
      "select id, vehicle_id, sale_price, is_voided from vehicle_sales order by id",
    ),
    pick(
      "vehicles",
      `select id, plate_number, daily_price, deposit_amount, commission_rate_override, status
       from vehicles order by id`,
    ),
    pick(
      "daily_closings",
      "select * from daily_closings order by id",
    ),
  ];
}

/**
 * Sums every money column in the registry's tables. A per-row comparison can
 * pass while an aggregate is wrong if rows were reordered or re-keyed, so both
 * are recorded.
 */
export function readMonetaryTotals(database) {
  const totals = {};
  const columns = listMinorColumns(database);

  for (const { table, legacyColumn, minorColumn } of columns) {
    const row = database
      .prepare(
        `select
           coalesce(sum("${legacyColumn}"), 0) as legacyTotal,
           coalesce(sum("${minorColumn}"), 0) as minorTotal
         from "${table}"`,
      )
      .get();

    totals[`${table}.${legacyColumn}`] = round2(row.legacyTotal);

    // Only meaningful after the upgrade; before it the column does not exist
    // and `listMinorColumns` returns nothing at all.
    totals[`${table}.${minorColumn}`] = row.minorTotal;
  }

  if (columns.length === 0) {
    // Version 11: sum the REAL columns that exist, so the pre-upgrade manifest
    // still carries totals to compare against.
    for (const table of listUserTables(database)) {
      for (const column of listRealMoneyColumns(database, table)) {
        const row = database
          .prepare(`select coalesce(sum("${column}"), 0) as total from "${table}"`)
          .get();
        totals[`${table}.${column}`] = round2(row.total);
      }
    }
  }

  return totals;
}

/** Every `*_minor` column present in the file, with its mirror. */
export function listMinorColumns(database) {
  const found = [];

  for (const table of listUserTables(database)) {
    for (const column of database.prepare(`pragma table_info("${table}")`).all()) {
      if (column.name.endsWith("_minor")) {
        found.push({
          table,
          minorColumn: column.name,
          legacyColumn: column.name.slice(0, -"_minor".length),
        });
      }
    }
  }

  return found;
}

/** Mirror triggers, by the naming convention `money-columns.ts` generates. */
export function listMirrorTriggers(database) {
  return database
    .prepare(
      `select name, tbl_name from sqlite_master
       where type = 'trigger' order by name`,
    )
    .all()
    .filter((trigger) =>
      mirrorTriggerSuffixes.some((suffix) => trigger.name.endsWith(suffix)),
    );
}

/**
 * Every row of every money column, keyed by id.
 *
 * This is what makes the money proof exhaustive rather than representative:
 * the same rows are read before and after, so the comparison can insist that
 * each id still holds the same major-unit value and that its new integer
 * column is the conversion of that value. Before the upgrade the minor column
 * does not exist and is reported as `undefined`.
 */
export function readMoneyPairRows(database, pairs) {
  const present = new Set(
    listMinorColumns(database).map((column) => `${column.table}.${column.minorColumn}`),
  );
  const tables = new Set(listUserTables(database));
  const result = {};

  for (const pair of pairs) {
    const key = `${pair.table}.${pair.legacyColumn}`;

    if (!tables.has(pair.table)) {
      result[key] = { missingTable: true, rows: [] };
      continue;
    }

    const hasMinor = present.has(`${pair.table}.${pair.minorColumn}`);
    const columns = hasMinor
      ? `id, "${pair.legacyColumn}" as legacy, "${pair.minorColumn}" as minor`
      : `id, "${pair.legacyColumn}" as legacy`;

    result[key] = {
      hasMinorColumn: hasMinor,
      rows: database.prepare(`select ${columns} from "${pair.table}" order by id`).all(),
    };
  }

  return result;
}

export function readIntegrity(database) {
  const integrity = database.prepare("pragma integrity_check").all();
  const foreignKeys = database.prepare("pragma foreign_key_check").all();

  return {
    integrityCheck: integrity.map((row) => row.integrity_check ?? Object.values(row)[0]),
    foreignKeyViolations: foreignKeys,
  };
}

/** Every uploaded file with its SHA-256, relative to the uploads directory. */
export function hashUploads(uploadsPath) {
  if (!fs.existsSync(uploadsPath)) {
    return [];
  }

  const files = [];

  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }

      const bytes = fs.readFileSync(absolute);
      files.push({
        path: relative,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  };

  walk(uploadsPath, "");

  return files;
}

/**
 * The whole picture of one data directory at one moment: what the report
 * compares before and after.
 */
export function readManifest(databasePath, uploadsPath, moneyPairs = []) {
  const database = openReadOnly(databasePath);

  try {
    return {
      schemaVersion: readSchemaVersion(database),
      tableCounts: readTableCounts(database),
      representatives: readRepresentativeValues(database),
      monetaryTotals: readMonetaryTotals(database),
      moneyPairRows: readMoneyPairRows(database, moneyPairs),
      minorColumns: listMinorColumns(database).map(
        (column) => `${column.table}.${column.minorColumn}`,
      ),
      mirrorTriggers: listMirrorTriggers(database).map((trigger) => trigger.name),
      integrity: readIntegrity(database),
      uploads: hashUploads(uploadsPath),
    };
  } finally {
    database.close();
  }
}

function listUserTables(database) {
  return database
    .prepare(
      `select name from sqlite_master
       where type = 'table' and name not like 'sqlite_%' order by name`,
    )
    .all()
    .map((row) => row.name);
}

/**
 * Best-effort money detection for a version 11 file, where there is no
 * registry to consult: REAL columns whose names read like amounts.
 */
function listRealMoneyColumns(database, table) {
  return database
    .prepare(`pragma table_info("${table}")`)
    .all()
    .filter(
      (column) =>
        String(column.type).toUpperCase() === "REAL" &&
        /price|amount|charge|discount|fee|value|commission|balance|total|cash/i.test(
          column.name,
        ),
    )
    .map((column) => column.name);
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}
