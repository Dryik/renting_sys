import { describe, expect, it } from "vitest";
import {
  calculateCancelledRentalBalance,
  calculateInitialRentalBalance,
  calculateLateDays,
  calculateRentalDays,
  calculateRentalTotal,
  calculateReturnSummary,
} from "./rentals";
import { calculatePaidAmount, calculateRemainingAmount } from "./payments";
import { hasRequiredBackupEntries } from "./backup";
import { formatMoney } from "./money";
import { getVehicleStatusAfterMaintenanceChange } from "./maintenance";

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

  it("counts deposit paid at activation toward the first remaining balance", () => {
    expect(calculateInitialRentalBalance(300, 100)).toEqual({
      paidAmount: 100,
      remainingAmount: 200,
    });
  });

  it("sets cancelled rental remaining balance to zero", () => {
    expect(calculateCancelledRentalBalance()).toEqual({
      remainingAmount: 0,
    });
  });

  it("keeps maintenance status while active maintenance records exist", () => {
    expect(getVehicleStatusAfterMaintenanceChange("available", 1)).toBe(
      "maintenance",
    );
    expect(getVehicleStatusAfterMaintenanceChange("maintenance", 0)).toBe(
      "available",
    );
  });

  it("does not change rented vehicle status from maintenance helpers", () => {
    expect(getVehicleStatusAfterMaintenanceChange("rented", 1)).toBe("rented");
  });

  it("validates required backup ZIP entries", () => {
    expect(
      hasRequiredBackupEntries(["metadata.json", "rental_app.db", "uploads/doc.txt"]),
    ).toBe(true);
    expect(hasRequiredBackupEntries(["metadata.json", "../rental_app.db"])).toBe(
      false,
    );
  });

  it("formats money with a symbol fallback", () => {
    expect(formatMoney(12.5, "$")).toBe("$12.50");
    expect(formatMoney(1250, "LYD", "ar-LY-u-nu-latn")).toBe("1,250.00 LYD");
  });
});
