/**
 * Money is stored and calculated as an integer number of minor units (cents).
 *
 * Every amount that reaches the database, a comparison, or an aggregate must go
 * through `toMinorUnits` first. Binary floating point cannot represent 0.1, so
 * adding major units silently accumulates error; integers cannot.
 *
 * The public surface — IPC payloads, shared DTOs, the renderer, printing and
 * exports — stays in major units. `fromMinorUnits` is the single conversion
 * back, called once while building the outgoing shape.
 */
export const MONEY_SCALE = 100;

/** How many decimal places `MONEY_SCALE` shifts by. */
const MONEY_SCALE_DIGITS = 2;

declare const moneyMinorBrand: unique symbol;

/** An integer number of minor units. The brand makes an unconverted major-unit
 * number a compile error wherever a stored or calculated amount is expected. */
export type MoneyMinor = number & { readonly [moneyMinorBrand]: true };

export const MONEY_MINOR_ZERO = 0 as MoneyMinor;

/**
 * Narrows a plain number to `MoneyMinor`, rejecting anything that is not a
 * safe integer. `context` is echoed in the message so a migration can name the
 * exact table, row and column that failed.
 */
export function assertMoneyMinor(value: number, context?: string): MoneyMinor {
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `${describeContext(context)}is not a whole number of minor units within the safe range (${describeValue(value)}).`,
    );
  }

  // -0 is a safe integer but compares oddly and prints as "-0"; normalize it.
  return (value === 0 ? 0 : value) as MoneyMinor;
}

export function isMoneyMinor(value: unknown): value is MoneyMinor {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Converts a major-unit amount to minor units, rounding half away from zero:
 * 1.005 becomes 101 and -1.005 becomes -101.
 *
 * Rounding reads the shortest decimal text that round-trips the double rather
 * than the double's exact binary value, because 1.005 is stored as
 * 1.00499999999999989… and exact rounding would answer 100 — not what a person
 * typing "1.005" into a price field means. All arithmetic is BigInt, so there
 * is no `value * 100` step to lose precision and no epsilon fudge to tune.
 */
export function toMinorUnits(value: number, context?: string): MoneyMinor {
  assertFiniteMoney(value, context);

  const minor = decimalStringToMinor(String(value), context);

  if (
    minor > BigInt(Number.MAX_SAFE_INTEGER) ||
    minor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(
      `${describeContext(context)}is outside the range this app can store safely (${describeValue(value)}).`,
    );
  }

  return assertMoneyMinor(Number(minor), context);
}

/** Nullable columns keep their null; anything else converts. */
export function toMinorUnitsOrNull(
  value: number | null | undefined,
  context?: string,
): MoneyMinor | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toMinorUnits(value, context);
}

/** The single conversion back to major units, for the public boundary only. */
export function fromMinorUnits(minor: MoneyMinor): number {
  const value = assertMoneyMinor(minor) / MONEY_SCALE;

  return value === 0 ? 0 : value;
}

export function fromMinorUnitsOrNull(
  minor: MoneyMinor | null | undefined,
): number | null {
  if (minor === null || minor === undefined) {
    return null;
  }

  return fromMinorUnits(minor);
}

/**
 * Snaps a major-unit number to the nearest storable amount. Used where a value
 * has to stay a major-unit number — settings, legacy mirrors, display input —
 * and must still agree with what minor-unit storage would hold.
 */
export function roundMoney(value: number): number {
  return fromMinorUnits(toMinorUnits(value));
}

export function addMoney(...amounts: readonly MoneyMinor[]): MoneyMinor {
  return sumMoney(amounts);
}

export function subtractMoney(left: MoneyMinor, right: MoneyMinor): MoneyMinor {
  return assertMoneyMinor(
    assertMoneyMinor(left) - assertMoneyMinor(right),
    "subtraction result",
  );
}

export function negateMoney(amount: MoneyMinor): MoneyMinor {
  return assertMoneyMinor(-assertMoneyMinor(amount));
}

/**
 * Adds a list of amounts, checking every running total. Two safe integers can
 * add to something a double can no longer represent exactly, so the check has
 * to happen each step rather than once at the end.
 */
export function sumMoney(
  amounts: Iterable<MoneyMinor>,
  context?: string,
): MoneyMinor {
  let total = 0;

  for (const amount of amounts) {
    total += assertMoneyMinor(amount, context);

    if (!Number.isSafeInteger(total)) {
      throw new Error(
        `${describeContext(context ?? "a running total")}grew beyond the range this app can add safely.`,
      );
    }
  }

  return total as MoneyMinor;
}

/**
 * Multiplies an amount by a whole count — rental days, accessory quantity.
 * BigInt keeps the product exact so an overflow is detected rather than
 * silently rounded into a plausible-looking number.
 */
export function multiplyMoney(
  amount: MoneyMinor,
  count: number,
  context?: string,
): MoneyMinor {
  if (!Number.isSafeInteger(count)) {
    throw new Error(
      `${describeContext(context)}must be multiplied by a whole number (${describeValue(count)}).`,
    );
  }

  const product = BigInt(assertMoneyMinor(amount, context)) * BigInt(count);

  if (
    product > BigInt(Number.MAX_SAFE_INTEGER) ||
    product < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(
      `${describeContext(context ?? "a multiplication result")}grew beyond the range this app can store safely.`,
    );
  }

  return assertMoneyMinor(Number(product), context);
}

/**
 * Splits an amount into parts weighted by `weights`, losing nothing.
 *
 * Used where one contract's money has to be attributed to more than one
 * vehicle, because the customer was moved onto a replacement partway through.
 * Plain proportional arithmetic leaves a minor unit stranded whenever the
 * shares do not divide evenly — three equal parts of 100.00 are 33.33 each and
 * a cent short — which would make a report quietly disagree with the contract
 * it was built from. Whole units are handed out first and every remaining unit
 * goes to the largest fraction, so the parts always add back up to the amount.
 *
 * Weights of zero overall mean nothing distinguishes the parts — a free
 * contract, or one whose vehicles were all out for no days. The amount then
 * goes to the last part, the vehicle the contract ended on, rather than
 * vanishing.
 */
export function allocateMinorByWeights(
  amountMinor: MoneyMinor,
  weights: readonly number[],
): MoneyMinor[] {
  const amount = assertMoneyMinor(amountMinor, "an amount being split");

  if (weights.length === 0) {
    return [];
  }

  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("A share of an amount cannot be negative or unknown.");
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return weights.map((_, index) =>
      index === weights.length - 1 ? (amount as MoneyMinor) : MONEY_MINOR_ZERO,
    );
  }

  const exact = weights.map((weight) => (amount * weight) / totalWeight);
  const parts = exact.map((value) => Math.floor(value));
  // Non-negative whether the amount is a charge or a refund: flooring can only
  // ever take the running total further from the amount in one direction.
  let remainder = amount - parts.reduce((sum, part) => sum + part, 0);
  const byLargestFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const entry of byLargestFraction) {
    if (remainder <= 0) {
      break;
    }

    parts[entry.index] += 1;
    remainder -= 1;
  }

  return parts.map((part) => assertMoneyMinor(part, "a split amount"));
}

/** Largest of a set, for clamps like "never let a balance go below zero". */
export function maxMoney(left: MoneyMinor, right: MoneyMinor): MoneyMinor {
  return assertMoneyMinor(left) >= assertMoneyMinor(right) ? left : right;
}

export function minMoney(left: MoneyMinor, right: MoneyMinor): MoneyMinor {
  return assertMoneyMinor(left) <= assertMoneyMinor(right) ? left : right;
}

function assertFiniteMoney(value: number, context?: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `${describeContext(context)}is not a usable amount (${describeValue(value)}).`,
    );
  }
}

/** Matches the shortest round-trip text `String(number)` produces, including
 * the exponent forms it switches to beyond 1e21 and below 1e-6. */
const decimalTextPattern = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

function decimalStringToMinor(text: string, context?: string): bigint {
  const match = decimalTextPattern.exec(text);

  if (!match) {
    throw new Error(
      `${describeContext(context)}could not be read as a decimal amount (${text}).`,
    );
  }

  const negative = match[1] === "-";
  const fractionDigits = match[3] ?? "";
  const digits = BigInt(`${match[2]}${fractionDigits}`);
  // The digits above represent value * 10^fractionDigits.length / 10^exponent;
  // the extra +2 is the conversion to minor units.
  const shift =
    (match[4] ? Number(match[4]) : 0) - fractionDigits.length + MONEY_SCALE_DIGITS;

  let magnitude: bigint;

  if (shift >= 0) {
    magnitude = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    // Half away from zero: the sign is reapplied after, so comparing the
    // magnitude's remainder is enough.
    magnitude = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }

  return negative ? -magnitude : magnitude;
}

function describeContext(context?: string): string {
  return context ? `${context} ` : "This amount ";
}

function describeValue(value: unknown): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

const currencyDisplayMap: Record<string, { symbol: string; position: "prefix" | "suffix" }> = {
  EUR: { symbol: "€", position: "prefix" },
  GBP: { symbol: "£", position: "prefix" },
  JPY: { symbol: "¥", position: "prefix" },
  LYD: { symbol: "د.ل", position: "prefix" },
  USD: { symbol: "$", position: "prefix" },
};

export function formatMoney(
  value: number,
  currency = "USD",
  locale = "en-US",
): string {
  const amount = Number.isFinite(value) ? value : 0;
  const normalizedCurrency = currency.trim();
  const upperCurrency = normalizedCurrency.toUpperCase();

  if (/^[A-Z]{3}$/.test(upperCurrency)) {
    if (upperCurrency === "LYD") {
      const formattedAmount = formatNumber(amount);

      return locale.toLowerCase().startsWith("ar")
        ? `${formattedAmount} د.ل`
        : `LYD ${formattedAmount}`;
    }

    const displayCurrency = currencyDisplayMap[upperCurrency];

    if (displayCurrency) {
      return formatCurrencyWithPosition(amount, displayCurrency);
    }

    return `${formatNumber(amount)} ${upperCurrency}`;
  }

  if (normalizedCurrency.length > 0) {
    if (/^[^\w\s]+$/.test(normalizedCurrency)) {
      return `${normalizedCurrency}${formatNumber(amount)}`;
    }

    return `${formatNumber(amount)} ${normalizedCurrency}`;
  }

  return formatNumber(amount);
}

function formatCurrencyWithPosition(
  value: number,
  display: { symbol: string; position: "prefix" | "suffix" },
): string {
  const amount = formatNumber(value);

  if (display.position === "prefix") {
    return `${display.symbol} ${amount}`;
  }

  return `${amount} ${display.symbol}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
