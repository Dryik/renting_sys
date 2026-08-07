import { describe, expect, it } from "vitest";
import {
  MONEY_MINOR_ZERO,
  MONEY_SCALE,
  addMoney,
  assertMoneyMinor,
  formatMoney,
  fromMinorUnits,
  fromMinorUnitsOrNull,
  isMoneyMinor,
  maxMoney,
  minMoney,
  multiplyMoney,
  negateMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  toMinorUnitsOrNull,
  type MoneyMinor,
} from "./money";

const minor = (value: number): MoneyMinor => assertMoneyMinor(value);

describe("toMinorUnits", () => {
  it("uses the scale the whole app agrees on", () => {
    expect(MONEY_SCALE).toBe(100);
    expect(toMinorUnits(1)).toBe(100);
  });

  it("converts the classic float error to an exact 30 cents", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. Adding major
    // units is what produced the drifting totals this migration removes.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });

  it("rounds a positive half cent away from zero", () => {
    expect(toMinorUnits(1.005)).toBe(101);
    expect(toMinorUnits(0.005)).toBe(1);
    expect(toMinorUnits(0.015)).toBe(2);
  });

  it("rounds a negative half cent away from zero", () => {
    expect(toMinorUnits(-1.005)).toBe(-101);
    expect(toMinorUnits(-0.005)).toBe(-1);
    expect(toMinorUnits(-0.015)).toBe(-2);
  });

  it("rounds 2.675 to 268 rather than the binary value's 267", () => {
    // 2.675 is stored as 2.67499999999999982…, so exact binary rounding would
    // answer 267. Reading the shortest round-trip text answers what was typed.
    expect(toMinorUnits(2.675)).toBe(268);
  });

  it("keeps values that are already exact", () => {
    expect(toMinorUnits(0)).toBe(0);
    expect(toMinorUnits(12.34)).toBe(1234);
    expect(toMinorUnits(-12.34)).toBe(-1234);
    expect(toMinorUnits(1000000)).toBe(100000000);
  });

  it("normalizes negative zero to zero", () => {
    const converted = toMinorUnits(-0);

    expect(converted).toBe(0);
    expect(Object.is(converted, -0)).toBe(false);
  });

  it("truncates below the half cent instead of rounding up", () => {
    expect(toMinorUnits(1.004999)).toBe(100);
    expect(toMinorUnits(-1.004999)).toBe(-100);
    expect(toMinorUnits(1e-7)).toBe(0);
  });

  it("handles exponent notation on both ends", () => {
    expect(toMinorUnits(1.5e-4)).toBe(0);
    expect(toMinorUnits(1e-3)).toBe(0);
    expect(toMinorUnits(5e-3)).toBe(1);
    expect(toMinorUnits(1.25e4)).toBe(1250000);
  });

  it("rejects values that are not usable amounts", () => {
    expect(() => toMinorUnits(Number.NaN)).toThrow(/not a usable amount/);
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY)).toThrow(
      /not a usable amount/,
    );
    expect(() => toMinorUnits(Number.NEGATIVE_INFINITY)).toThrow(
      /not a usable amount/,
    );
  });

  it("rejects amounts that cannot be stored as safe integers", () => {
    expect(() => toMinorUnits(1e21)).toThrow(/outside the range/);
    expect(() => toMinorUnits(-1e21)).toThrow(/outside the range/);
    expect(() => toMinorUnits(Number.MAX_SAFE_INTEGER)).toThrow(
      /outside the range/,
    );
  });

  it("names the caller's context so a failure identifies the exact row", () => {
    expect(() =>
      toMinorUnits(Number.NaN, "payments row 42 column amount"),
    ).toThrow(/payments row 42 column amount/);
  });

  it("accepts the largest amount that still fits", () => {
    const largest = Number.MAX_SAFE_INTEGER / MONEY_SCALE;

    expect(toMinorUnits(Math.floor(largest * 100) / 100)).toBeLessThanOrEqual(
      Number.MAX_SAFE_INTEGER,
    );
  });
});

describe("nullable conversion helpers", () => {
  it("passes null and undefined through untouched", () => {
    expect(toMinorUnitsOrNull(null)).toBeNull();
    expect(toMinorUnitsOrNull(undefined)).toBeNull();
    expect(fromMinorUnitsOrNull(null)).toBeNull();
    expect(fromMinorUnitsOrNull(undefined)).toBeNull();
  });

  it("converts a present value like the non-nullable helper", () => {
    expect(toMinorUnitsOrNull(1.005)).toBe(101);
    expect(fromMinorUnitsOrNull(minor(101))).toBe(1.01);
  });

  it("does not treat zero as absent", () => {
    expect(toMinorUnitsOrNull(0)).toBe(0);
    expect(fromMinorUnitsOrNull(MONEY_MINOR_ZERO)).toBe(0);
  });

  it("still rejects an unusable present value", () => {
    expect(() => toMinorUnitsOrNull(Number.NaN)).toThrow(/not a usable amount/);
  });
});

describe("fromMinorUnits", () => {
  it("returns major units for the public boundary", () => {
    expect(fromMinorUnits(minor(101))).toBe(1.01);
    expect(fromMinorUnits(minor(-101))).toBe(-1.01);
    expect(fromMinorUnits(MONEY_MINOR_ZERO)).toBe(0);
  });

  it("round-trips every conversion this app performs", () => {
    for (const value of [0, 0.01, 0.1, 1.01, 12.34, 999.99, -45.67, 100000.5]) {
      expect(fromMinorUnits(toMinorUnits(value))).toBe(value);
    }
  });

  it("rejects a value that was never converted", () => {
    expect(() => fromMinorUnits(1.5 as MoneyMinor)).toThrow(
      /whole number of minor units/,
    );
  });
});

describe("assertMoneyMinor", () => {
  it("accepts safe integers and normalizes negative zero", () => {
    expect(assertMoneyMinor(0)).toBe(0);
    expect(Object.is(assertMoneyMinor(-0), -0)).toBe(false);
    expect(assertMoneyMinor(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(assertMoneyMinor(Number.MIN_SAFE_INTEGER)).toBe(
      Number.MIN_SAFE_INTEGER,
    );
  });

  it("rejects fractions, non-finite values and unsafe integers", () => {
    expect(() => assertMoneyMinor(1.5)).toThrow(/whole number of minor units/);
    expect(() => assertMoneyMinor(Number.NaN)).toThrow();
    expect(() => assertMoneyMinor(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => assertMoneyMinor(Number.MAX_SAFE_INTEGER + 2)).toThrow(
      /whole number of minor units/,
    );
  });

  it("reports the context it was given", () => {
    expect(() => assertMoneyMinor(1.5, "rentals row 7 column total_amount")).toThrow(
      /rentals row 7 column total_amount/,
    );
  });
});

describe("isMoneyMinor", () => {
  it("recognises stored integer amounts only", () => {
    expect(isMoneyMinor(0)).toBe(true);
    expect(isMoneyMinor(-2500)).toBe(true);
    expect(isMoneyMinor(1.5)).toBe(false);
    expect(isMoneyMinor(Number.NaN)).toBe(false);
    expect(isMoneyMinor("100")).toBe(false);
    expect(isMoneyMinor(null)).toBe(false);
  });
});

describe("integer arithmetic", () => {
  it("adds without floating point drift", () => {
    const total = sumMoney([toMinorUnits(0.1), toMinorUnits(0.2)]);

    expect(total).toBe(30);
    expect(fromMinorUnits(total)).toBe(0.3);
  });

  it("sums an empty list to zero", () => {
    expect(sumMoney([])).toBe(0);
  });

  it("sums many fractional rows exactly", () => {
    const rows = Array.from({ length: 1000 }, () => toMinorUnits(0.07));

    expect(sumMoney(rows)).toBe(7000);
    expect(fromMinorUnits(sumMoney(rows))).toBe(70);
  });

  it("adds and subtracts, including into negatives", () => {
    expect(addMoney(minor(1000), minor(250))).toBe(1250);
    expect(subtractMoney(minor(1000), minor(2500))).toBe(-1500);
    expect(negateMoney(minor(1500))).toBe(-1500);
    expect(negateMoney(MONEY_MINOR_ZERO)).toBe(0);
  });

  it("compares with max and min", () => {
    expect(maxMoney(minor(-500), MONEY_MINOR_ZERO)).toBe(0);
    expect(minMoney(minor(-500), MONEY_MINOR_ZERO)).toBe(-500);
  });

  it("multiplies by whole days and quantities", () => {
    expect(multiplyMoney(toMinorUnits(12.5), 3)).toBe(3750);
    expect(multiplyMoney(toMinorUnits(0.01), 0)).toBe(0);
    expect(multiplyMoney(toMinorUnits(-2.5), 4)).toBe(-1000);
  });

  it("rejects multiplication by a fractional count", () => {
    expect(() => multiplyMoney(minor(100), 1.5)).toThrow(/whole number/);
    expect(() => multiplyMoney(minor(100), Number.NaN)).toThrow(/whole number/);
  });

  it("rejects a sum that outgrows the safe range", () => {
    const nearLimit = minor(Number.MAX_SAFE_INTEGER - 1);

    expect(() => sumMoney([nearLimit, nearLimit])).toThrow(/add safely/);
  });

  it("rejects a product that outgrows the safe range", () => {
    expect(() => multiplyMoney(minor(Number.MAX_SAFE_INTEGER), 2)).toThrow(
      /store safely/,
    );
    expect(() => multiplyMoney(minor(Number.MIN_SAFE_INTEGER), 2)).toThrow(
      /store safely/,
    );
  });

  it("rejects arithmetic on an unconverted major-unit number", () => {
    expect(() => sumMoney([1.5 as MoneyMinor])).toThrow(
      /whole number of minor units/,
    );
    expect(() => subtractMoney(1.5 as MoneyMinor, MONEY_MINOR_ZERO)).toThrow(
      /whole number of minor units/,
    );
  });
});

describe("roundMoney", () => {
  it("snaps a major-unit value to what storage would hold", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(0)).toBe(0);
  });

  it("rounds negatives away from zero, unlike Math.round", () => {
    // The six private copies this replaced used Math.round, which rounds
    // -1.005 towards positive infinity and answered -1.00.
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(Math.round(-1.005 * 100) / 100).toBe(-1);
  });

  it("rejects values it cannot represent", () => {
    expect(() => roundMoney(Number.NaN)).toThrow();
    expect(() => roundMoney(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("formatMoney", () => {
  it("still formats major-unit numbers for display", () => {
    expect(formatMoney(fromMinorUnits(minor(101)), "USD", "en-US")).toBe("$ 1.01");
  });
});
