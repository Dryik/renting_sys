import { describe, expect, it } from "vitest";
import { calculateCommission } from "./commission";

describe("calculateCommission", () => {
  it("should calculate correct commission for active/returned rentals with standard rate", () => {
    const result = calculateCommission({
      rentedDays: 5,
      dailyRate: 2,
      status: "active",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDay).toBe(2);
    expect(result.commissionAmount).toBe(10);
  });

  it("should enforce minimum 1 day calculation for active rentals", () => {
    const result = calculateCommission({
      rentedDays: 0,
      dailyRate: 2.5,
      status: "returned",
      userEarnsCommission: true,
    });
    expect(result.commissionAmount).toBe(2.5);
  });

  it("should return 0 commission if user is not commission eligible (e.g. owner)", () => {
    const result = calculateCommission({
      rentedDays: 10,
      dailyRate: 2,
      status: "active",
      userEarnsCommission: false,
    });
    expect(result.commissionRatePerDay).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it("should return 0 commission for cancelled rentals", () => {
    const result = calculateCommission({
      rentedDays: 4,
      dailyRate: 3,
      status: "cancelled",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDay).toBe(3);
    expect(result.commissionAmount).toBe(0);
  });

  it("should return 0 commission when global commission system is disabled", () => {
    const result = calculateCommission({
      rentedDays: 3,
      dailyRate: 2,
      status: "active",
      userEarnsCommission: true,
      commissionEnabled: false,
    });
    expect(result.commissionRatePerDay).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it("should respect vehicle override rate", () => {
    const result = calculateCommission({
      rentedDays: 3,
      dailyRate: 5, // vehicle override rate
      status: "returned",
      userEarnsCommission: true,
    });
    expect(result.commissionRatePerDay).toBe(5);
    expect(result.commissionAmount).toBe(15);
  });
});
