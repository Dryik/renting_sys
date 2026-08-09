/**
 * The rehearsal's own copy of the money rules, and the inventory it checks.
 *
 * Two things live here rather than being imported from `src/shared/money.ts`
 * and `electron/db/money-columns.ts`: the rehearsal runs as plain Node against
 * an installed application, so it cannot load the TypeScript sources, and an
 * independent restatement is worth more than a shared one anyway. If the
 * harness derived its expectations from the same code that produced the data,
 * a bug in that code would agree with itself and the rehearsal would pass.
 *
 * `electron/upgrade-rehearsal.test.ts` holds both copies to the originals, so
 * they cannot drift silently.
 */

const MONEY_SCALE_DIGITS = 2;

/** Matches what `String(number)` produces, including its exponent forms. */
const decimalTextPattern = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * Major units to minor units, rounding half away from zero, reading the
 * shortest round-trip decimal text rather than the double's exact binary
 * value. 1.005 becomes 101 because that is what someone typing "1.005" into a
 * price field means, even though the stored double is 1.00499999999999989…
 *
 * This is the migration's expectation, which is not the same as the mirror
 * rule the triggers enforce. Migration 12 deliberately leaves historical REAL
 * values alone, so a row can hold legacy 100.005 beside minor 10001 forever.
 * Comparing `legacy === minor / 100` would reject that correct row; comparing
 * `minor === toMinorUnits(legacy)` accepts it and still catches real drift.
 */
export function toMinorUnits(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`not a usable amount: ${String(value)}`);
  }

  const minor = decimalStringToMinor(String(value));

  if (
    minor > BigInt(Number.MAX_SAFE_INTEGER) ||
    minor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`outside the safe range: ${String(value)}`);
  }

  const asNumber = Number(minor);

  return asNumber === 0 ? 0 : asNumber;
}

export function toMinorUnitsOrNull(value) {
  return value === null || value === undefined ? null : toMinorUnits(value);
}

function decimalStringToMinor(text) {
  const match = decimalTextPattern.exec(text);

  if (!match) {
    throw new Error(`could not be read as a decimal amount: ${text}`);
  }

  const negative = match[1] === "-";
  const fractionDigits = match[3] ?? "";
  const digits = BigInt(`${match[2]}${fractionDigits}`);
  const shift =
    (match[4] ? Number(match[4]) : 0) - fractionDigits.length + MONEY_SCALE_DIGITS;

  let magnitude;

  if (shift >= 0) {
    magnitude = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    magnitude = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }

  return negative ? -magnitude : magnitude;
}

/**
 * Every stored money column, restated independently of production's registry.
 * The rehearsal fails if the upgraded file is missing any of these, if it
 * carries one that is not here, or if any row's minor value disagrees with the
 * conversion of its mirror.
 */
export const expectedMoneyPairs = Object.freeze([
  { table: "vehicles", legacyColumn: "daily_price", nullable: false },
  { table: "vehicles", legacyColumn: "deposit_amount", nullable: false },
  { table: "vehicles", legacyColumn: "commission_rate_override", nullable: true },

  { table: "vehicle_sales", legacyColumn: "sale_price", nullable: false },

  { table: "rentals", legacyColumn: "daily_price", nullable: false },
  { table: "rentals", legacyColumn: "deposit_required", nullable: false },
  { table: "rentals", legacyColumn: "deposit_paid", nullable: false },
  { table: "rentals", legacyColumn: "extra_charges", nullable: false },
  { table: "rentals", legacyColumn: "accessory_charges", nullable: false },
  { table: "rentals", legacyColumn: "discount", nullable: false },
  { table: "rentals", legacyColumn: "total_amount", nullable: false },
  { table: "rentals", legacyColumn: "paid_amount", nullable: false },
  { table: "rentals", legacyColumn: "remaining_amount", nullable: false },
  { table: "rentals", legacyColumn: "commission_rate_per_day", nullable: false },
  { table: "rentals", legacyColumn: "commission_amount", nullable: false },

  { table: "accessories", legacyColumn: "default_charge", nullable: false },
  { table: "rental_accessories", legacyColumn: "unit_charge", nullable: false },
  { table: "rental_collateral_items", legacyColumn: "estimated_value", nullable: true },

  { table: "payments", legacyColumn: "amount", nullable: false },
  { table: "expenses", legacyColumn: "amount", nullable: false },
  { table: "cash_movements", legacyColumn: "amount", nullable: false },

  { table: "employee_loans", legacyColumn: "amount", nullable: false },
  { table: "employee_loans", legacyColumn: "remaining_amount", nullable: false },
  { table: "employee_loan_payments", legacyColumn: "amount", nullable: false },
  { table: "accounting_adjustments", legacyColumn: "amount", nullable: false },

  { table: "maintenance_records", legacyColumn: "cost", nullable: false },
  { table: "daily_closings", legacyColumn: "expected_cash", nullable: false },
  { table: "daily_closings", legacyColumn: "counted_cash", nullable: false },
  { table: "daily_closings", legacyColumn: "difference", nullable: false },
].map((entry) => Object.freeze({ ...entry, minorColumn: `${entry.legacyColumn}_minor` })));

/** Both triggers a pair gets, by the name production generates. */
export function expectedTriggerNames(pair) {
  return [
    `${pair.table}_${pair.minorColumn}_ins_ck`,
    `${pair.table}_${pair.minorColumn}_upd_ck`,
  ];
}

export const expectedTriggerNameList = Object.freeze(
  expectedMoneyPairs.flatMap((pair) => expectedTriggerNames(pair)),
);
