import { describe, expect, it } from "vitest";
import {
  calculateCancelledRentalBalance,
  calculateExtensionSummary,
  calculateInitialRentalBalance,
  calculateLateDays,
  calculateRentalDays,
  calculateRentalTotal,
  calculateReturnSummary,
  getOpenRentalStatusForExpectedReturn,
  hasHeldCollateral,
  rentalCancelInputSchema,
  validateMileageProgression,
} from "./rentals";
import { calculatePaidAmount, calculateRemainingAmount } from "./payments";
import {
  hasRequiredBackupEntries,
  isBusinessBackupEntryName,
  isSafeBackupEntryName,
  isSensitiveBackupEntryName,
} from "./backup";
import { formatMoney } from "./money";
import { getVehicleStatusAfterMaintenanceChange } from "./maintenance";
import { normalizeCompactSearchText, normalizeSearchText } from "./search";

describe("rental calculations", () => {
  it("uses at least one rental day for same-day rentals", () => {
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-14T12:00:00.000Z"),
    ).toBe(1);
  });

  it("rounds partial days up", () => {
    // 49 hours is two full days and an hour, and the hour is charged as a day.
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-16T10:00:00.000Z"),
    ).toBe(3);
    // Whole days stay whole: no phantom extra day from rounding.
    expect(
      calculateRentalDays("2026-05-14", "2026-05-17"),
    ).toBe(3);
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-16T09:00:00.000Z"),
    ).toBe(2);
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
      bookedDays: 1,
      actualDays: 1,
      earlyDays: 0,
      isEarlyReturn: false,
      effectiveBaseAmount: 150,
      lateDays: 2,
      lateFee: 50,
      extraCharges: 90,
      finalAmount: 230,
      remainingAmount: 180,
    });
  });

  it("recalculates base total for actual days on early return when enabled", () => {
    // 30 days booked @ $100/day = $3000, returned at day 28
    const startDatetime = "2026-05-01T10:00:00.000Z";
    const expectedReturnDatetime = "2026-05-31T10:00:00.000Z";
    const actualReturnDatetime = "2026-05-29T10:00:00.000Z";

    const earlyRecalculated = calculateReturnSummary({
      startDatetime,
      expectedReturnDatetime,
      actualReturnDatetime,
      dailyPrice: 100,
      accessoryCharges: 0,
      recalculateForActualDays: true,
      baseTotalAmount: 3000,
      paidAmount: 3000,
      lateFeePerDay: 100,
      damageCharge: 0,
      discount: 0,
    });

    expect(earlyRecalculated).toEqual({
      bookedDays: 30,
      actualDays: 28,
      earlyDays: 2,
      isEarlyReturn: true,
      effectiveBaseAmount: 2800,
      lateDays: 0,
      lateFee: 0,
      extraCharges: 0,
      finalAmount: 2800,
      remainingAmount: -200, // $200 refund owed
    });

    const earlyKeptOriginal = calculateReturnSummary({
      startDatetime,
      expectedReturnDatetime,
      actualReturnDatetime,
      dailyPrice: 100,
      accessoryCharges: 0,
      recalculateForActualDays: false,
      baseTotalAmount: 3000,
      paidAmount: 3000,
      lateFeePerDay: 100,
      damageCharge: 0,
      discount: 0,
    });

    expect(earlyKeptOriginal).toEqual({
      bookedDays: 30,
      actualDays: 28,
      earlyDays: 2,
      isEarlyReturn: true,
      effectiveBaseAmount: 3000,
      lateDays: 0,
      lateFee: 0,
      extraCharges: 0,
      finalAmount: 3000,
      remainingAmount: 0,
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

  it("excludes voided payments from paid amount", () => {
    expect(
      calculatePaidAmount([
        { type: "rent", amount: 200, status: "voided" },
        { type: "rent", amount: 150, status: "posted" },
        { type: "refund", amount: 25, status: "posted" },
      ]),
    ).toBe(125);
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

  it("requires a reason to cancel a rental", () => {
    expect(
      rentalCancelInputSchema.parse({
        approvalToken: "11111111-1111-4111-8111-111111111111",
        rentalId: 1,
        reason: "Customer requested cancellation.",
      }),
    ).toEqual({
      approvalToken: "11111111-1111-4111-8111-111111111111",
      rentalId: 1,
      reason: "Customer requested cancellation.",
    });

    expect(() =>
      rentalCancelInputSchema.parse({ rentalId: 1, reason: "" }),
    ).toThrow();
  });

  it("validates mileage progression on return", () => {
    expect(
      validateMileageProgression({
        mileageIn: 12500,
        mileageOut: 12000,
        currentVehicleMileage: 12100,
      }),
    ).toBeNull();
    expect(
      validateMileageProgression({
        mileageIn: 11999,
        mileageOut: 12000,
        currentVehicleMileage: 12100,
      }),
    ).toBe("Mileage in cannot be less than mileage out.");
    expect(
      validateMileageProgression({
        mileageIn: 12050,
        mileageOut: null,
        currentVehicleMileage: 12100,
      }),
    ).toBe("Mileage in cannot be less than current vehicle mileage.");
  });

  it("chooses active or overdue status from expected return", () => {
    expect(
      getOpenRentalStatusForExpectedReturn(
        "2026-05-21T10:00:00.000Z",
        "2026-05-20T10:00:00.000Z",
      ),
    ).toBe("active");
    expect(
      getOpenRentalStatusForExpectedReturn(
        "2026-05-19T10:00:00.000Z",
        "2026-05-20T10:00:00.000Z",
      ),
    ).toBe("overdue");
  });

  it("detects whether Amanat is still held", () => {
    expect(hasHeldCollateral([{ status: "returned" }])).toBe(false);
    expect(hasHeldCollateral([{ status: "returned" }, { status: "held" }])).toBe(
      true,
    );
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
    expect(isSafeBackupEntryName("uploads/customer/id.pdf")).toBe(true);
    expect(isSafeBackupEntryName("C:\\unsafe\\rental_app.db")).toBe(false);
    expect(isBusinessBackupEntryName("license.json")).toBe(false);
    expect(isBusinessBackupEntryName("trial.json")).toBe(false);
    expect(isBusinessBackupEntryName("trial-issued.json")).toBe(false);
    expect(
      hasRequiredBackupEntries(["metadata.json", "rental_app.db", "license.json"]),
    ).toBe(false);
  });

  it("rejects sensitive backup entries recursively inside uploads", () => {
    expect(isBusinessBackupEntryName("uploads/customer-doc.pdf")).toBe(true);
    expect(isBusinessBackupEntryName("uploads/license.json")).toBe(false);
    expect(isBusinessBackupEntryName("uploads/trial.json")).toBe(false);
    expect(isBusinessBackupEntryName("uploads/trial-issued.json")).toBe(false);
    expect(isBusinessBackupEntryName("uploads/client.private.pem")).toBe(false);
    expect(isBusinessBackupEntryName("uploads/file.map")).toBe(false);
    expect(isBusinessBackupEntryName("uploads/private-key/client.pem")).toBe(false);
    expect(isBusinessBackupEntryName("uploads\\secret\\note.txt")).toBe(false);
    expect(isSensitiveBackupEntryName("uploads/signing-key/key.txt")).toBe(true);
    expect(isBusinessBackupEntryName("../license.json")).toBe(false);
    expect(isBusinessBackupEntryName("C:\\unsafe\\license.json")).toBe(false);
  });

  it("normalizes Arabic text, digits, whitespace, and compact search input", () => {
    expect(normalizeSearchText("أحمد  ١٢٣")).toBe("احمد 123");
    expect(normalizeSearchText("آية")).toBe("ايه");
    expect(normalizeCompactSearchText("  ٠٩٢-123  ")).toBe("092123");
  });

  it("formats money with a symbol fallback", () => {
    expect(formatMoney(12.5, "$")).toBe("$12.50");
    expect(formatMoney(1250, "LYD", "ar-LY-u-nu-latn")).toBe("1,250.00 د.ل");
  });

  it("calculates extension summary correctly for added rental days", () => {
    const summary = calculateExtensionSummary({
      startDatetime: "2026-05-01",
      currentExpectedReturnDatetime: "2026-05-31", // 30 days
      newExpectedReturnDatetime: "2026-06-07", // 37 days (+7 days)
      dailyPrice: 100,
      accessoryCharges: 50,
      paidAmount: 3050, // paid full original total
    });

    expect(summary.currentDays).toBe(30);
    expect(summary.newDays).toBe(37);
    expect(summary.addedDays).toBe(7);
    expect(summary.currentTotalAmount).toBe(3050); // 30*100 + 50
    expect(summary.newTotalAmount).toBe(3750); // 37*100 + 50
    expect(summary.addedRentAmount).toBe(700); // 7 * 100
    expect(summary.newRemainingAmount).toBe(700); // 3750 - 3050
  });
});
