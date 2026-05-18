import { describe, expect, it } from "vitest";
import {
  calculateLateDays,
  calculateRentalDays,
  calculateRentalTotal,
  calculateReturnSummary,
} from "./rentals";
import { calculatePaidAmount, calculateRemainingAmount } from "./payments";

describe("rental calculations", () => {
  it("uses at least one rental day for same-day rentals", () => {
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-14T12:00:00.000Z"),
    ).toBe(1);
  });

  it("rounds partial days up", () => {
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-16T10:00:00.000Z"),
    ).toBe(3);
  });

  it("calculates total from days and daily price", () => {
    expect(calculateRentalTotal(3, 42.5)).toBe(127.5);
  });

  it("calculates late days only after expected return", () => {
    expect(
      calculateLateDays("2026-05-16T10:00:00.000Z", "2026-05-18T09:00:00.000Z"),
    ).toBe(2);
  });

  it("adds late fee and damage charges then subtracts discount", () => {
    expect(
      calculateReturnSummary({
        expectedReturnDatetime: "2026-05-16T10:00:00.000Z",
        actualReturnDatetime: "2026-05-18T09:00:00.000Z",
        baseTotalAmount: 150,
        paidAmount: 50,
        lateFeePerDay: 25,
        damageCharge: 40,
        discount: 10,
      }),
    ).toEqual({
      lateDays: 2,
      lateFee: 50,
      extraCharges: 90,
      finalAmount: 230,
      remainingAmount: 180,
    });
  });

  it("calculates paid amount with refunds subtracted", () => {
    expect(
      calculatePaidAmount([
        { type: "deposit", amount: 100 },
        { type: "rent", amount: 150 },
        { type: "refund", amount: 40 },
      ]),
    ).toBe(210);
  });

  it("calculates remaining amount from total minus paid", () => {
    expect(calculateRemainingAmount(300, 210)).toBe(90);
  });
});
