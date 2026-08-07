import { describe, expect, it } from "vitest";
import { toMinorUnits } from "../../src/shared/money";
import { calculateCommission } from "./commission";

describe("calculateCommission", () => {
  it("should calculate correct commission for active/returned rentals with standard rate", () => {
    const result = calculateCommission({
      rentedDays: 5,
      dailyRateMinor: toMinorUnits(2),
      status: "active",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDayMinor).toBe(200);
    expect(result.commissionAmountMinor).toBe(1000);
  });

  it("should enforce minimum 1 day calculation for active rentals", () => {
    const result = calculateCommission({
      rentedDays: 0,
      dailyRateMinor: toMinorUnits(2.5),
      status: "returned",
      userEarnsCommission: true,
    });
    expect(result.commissionAmountMinor).toBe(250);
  });

  it("should return 0 commission if user is not commission eligible (e.g. owner)", () => {
    const result = calculateCommission({
      rentedDays: 10,
      dailyRateMinor: toMinorUnits(2),
      status: "active",
      userEarnsCommission: false,
    });
    expect(result.commissionRatePerDayMinor).toBe(0);
    expect(result.commissionAmountMinor).toBe(0);
  });

  it("should return 0 commission for cancelled rentals", () => {
    const result = calculateCommission({
      rentedDays: 4,
      dailyRateMinor: toMinorUnits(3),
      status: "cancelled",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDayMinor).toBe(300);
    expect(result.commissionAmountMinor).toBe(0);
  });

  it("should return 0 commission when global commission system is disabled", () => {
    const result = calculateCommission({
      rentedDays: 3,
      dailyRateMinor: toMinorUnits(2),
      status: "active",
      userEarnsCommission: true,
      commissionEnabled: false,
    });
    expect(result.commissionRatePerDayMinor).toBe(0);
    expect(result.commissionAmountMinor).toBe(0);
  });

  it("should respect vehicle override rate", () => {
    const result = calculateCommission({
      rentedDays: 3,
      dailyRateMinor: toMinorUnits(5), // vehicle override rate
      status: "returned",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDayMinor).toBe(500);
    expect(result.commissionAmountMinor).toBe(1500);
  });

  it("accumulates a fractional daily rate without floating point drift", () => {
    // 0.07 a day for 30 days is 2.0999999999999996 in floating point.
    const result = calculateCommission({
      rentedDays: 30,
      dailyRateMinor: toMinorUnits(0.07),
      status: "returned",
      userEarnsCommission: true,
    });

    expect(result.commissionAmountMinor).toBe(210);
  });
});
