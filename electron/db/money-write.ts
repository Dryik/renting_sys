import { assertMoneyMinor, fromMinorUnits, type MoneyMinor } from "../../src/shared/money";

/**
 * Helpers for writing and reading money at the database boundary.
 *
 * Every stored amount lives in two columns: the integer `*_minor` column the
 * app calculates with, and the REAL column kept as a compatibility mirror. The
 * mirror is always derived from the already-converted integer — never from the
 * caller's input a second time — so the two can never disagree by a rounding
 * decision made in two places. Triggers enforce that at the database level;
 * these helpers make it the easy thing to do in a service.
 */

/** Both halves of a required money pair, from one converted amount. */
export function moneyColumns<Name extends string>(
  name: Name,
  minor: MoneyMinor,
): Record<`${Name}Minor`, number> & Record<`${Name}Legacy`, number> {
  const checked = assertMoneyMinor(minor, `${name}`);

  return {
    [`${name}Minor`]: checked,
    [`${name}Legacy`]: fromMinorUnits(checked),
  } as Record<`${Name}Minor`, number> & Record<`${Name}Legacy`, number>;
}

/** Both halves of a nullable money pair; null stays null on both sides. */
export function nullableMoneyColumns<Name extends string>(
  name: Name,
  minor: MoneyMinor | null,
): Record<`${Name}Minor`, number | null> & Record<`${Name}Legacy`, number | null> {
  if (minor === null) {
    return {
      [`${name}Minor`]: null,
      [`${name}Legacy`]: null,
    } as Record<`${Name}Minor`, number | null> &
      Record<`${Name}Legacy`, number | null>;
  }

  return moneyColumns(name, minor);
}

/**
 * Reads a SQL `sum(...)` result as minor units.
 *
 * SQLite returns NULL for a sum over no rows, and raises "integer overflow"
 * rather than silently switching to floating point, so a value that arrives
 * here is either absent or exact. The safe-integer check is the last guard
 * before the number reaches a balance.
 */
export function sumToMinor(value: unknown, context: string): MoneyMinor {
  if (value === null || value === undefined) {
    return assertMoneyMinor(0, context);
  }

  if (typeof value === "bigint") {
    const asNumber = Number(value);

    if (!Number.isSafeInteger(asNumber)) {
      throw new Error(
        `${context} totals beyond the range this app can add safely (${value}).`,
      );
    }

    return assertMoneyMinor(asNumber, context);
  }

  if (typeof value === "string") {
    // Some drivers hand back large integers as text; parse rather than guess.
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
      throw new Error(
        `${context} totals beyond the range this app can add safely (${value}).`,
      );
    }

    return assertMoneyMinor(parsed, context);
  }

  if (typeof value !== "number") {
    throw new Error(`${context} did not total to a number (${String(value)}).`);
  }

  return assertMoneyMinor(value, context);
}

/** Reads a stored `*_minor` column, rejecting anything that is not an amount. */
export function columnToMinor(value: unknown, context: string): MoneyMinor {
  if (typeof value !== "number") {
    throw new Error(`${context} did not hold a stored amount (${String(value)}).`);
  }

  return assertMoneyMinor(value, context);
}

export function nullableColumnToMinor(
  value: unknown,
  context: string,
): MoneyMinor | null {
  if (value === null || value === undefined) {
    return null;
  }

  return columnToMinor(value, context);
}
