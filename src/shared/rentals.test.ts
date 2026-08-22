import { describe, expect, it } from "vitest";
import {
  calculateCancelledRentalBalance,
  calculateExtensionSummary,
  calculateInitialRentalBalance,
  calculateLateDays,
  calculateRentalDays,
  calculateRentalTotal,
  calculateReturnSummary,
  calculateReturnSummaryMinor,
  calculateSegmentedRentMinor,
  extendedReturnDatetime,
  getOpenRentalStatusForExpectedReturn,
  hasHeldCollateral,
  normalizeToCalendarDate,
  rentalCancelInputSchema,
  shiftRentalWindowToActualHandover,
  validateMileageProgression,
} from "./rentals";
import { calculatePaidAmount, calculateRemainingAmount } from "./payments";
import {
  hasRequiredBackupEntries,
  isBusinessBackupEntryName,
  isSafeBackupEntryName,
  isSensitiveBackupEntryName,
} from "./backup";
import { allocateMinorByWeights, formatMoney, fromMinorUnits, toMinorUnits } from "./money";
import { getVehicleStatusAfterMaintenanceChange } from "./maintenance";
import { normalizeCompactSearchText, normalizeSearchText } from "./search";

describe("rental calculations", () => {
  it("uses at least one rental day for same-day rentals", () => {
    expect(
      calculateRentalDays("2026-05-14T09:00:00.000Z", "2026-05-14T12:00:00.000Z"),
    ).toBe(1);
  });

  // Built from local components, never from a "Z" literal: a rental day is the
  // shop's calendar day, so a fixture written in UTC would ask a different
  // question in every timezone and pass or fail by accident.
  const at = (year: number, month: number, day: number, hour: number) =>
    new Date(year, month - 1, day, hour).toISOString();

  it("counts calendar days, not 24-hour periods", () => {
    // Out on the 14th, back on the 16th: two days, whatever the clock says.
    expect(calculateRentalDays(at(2026, 5, 14, 9), at(2026, 5, 16, 10))).toBe(2);
    expect(calculateRentalDays(at(2026, 5, 14, 9), at(2026, 5, 16, 9))).toBe(2);
    // The hour a return runs late used to add a whole day. It no longer does.
    expect(calculateRentalDays(at(2026, 5, 14, 8), at(2026, 5, 16, 23))).toBe(2);
  });

  it("charges a same-day rental one day, never zero", () => {
    expect(calculateRentalDays(at(2026, 5, 14, 9), at(2026, 5, 14, 18))).toBe(1);
  });

  it("takes a date without a time literally", () => {
    expect(calculateRentalDays("2026-05-14", "2026-05-17")).toBe(3);
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

  // The same instant must not land on two different days depending on whether
  // it arrives as a string or a Date.
  //
  // Note what this guard can and cannot do: the fault it describes only exists
  // where local time differs from UTC, so on a UTC machine — which is what the
  // hosted runners are — both readings agree and this passes either way. It
  // fails on a developer's clock and on the shops', which is where it matters,
  // but do not read a green CI run as proof of it.
  it("puts an instant on the same calendar day however it is handed over", () => {
    for (const iso of [
      "2026-05-14T23:00:00.000Z",
      "2026-05-15T00:30:00.000Z",
      "2026-05-14T12:00:00.000Z",
      "2026-12-31T22:45:00.000Z",
    ]) {
      expect(normalizeToCalendarDate(iso).getTime()).toBe(
        normalizeToCalendarDate(new Date(iso)).getTime(),
      );
    }
  });

  it("takes a date with no time literally", () => {
    expect(normalizeToCalendarDate("2026-05-14").toISOString()).toBe(
      "2026-05-14T00:00:00.000Z",
    );
  });

  it("keeps the contract's time of day when the return date moves", () => {
    const current = "2026-05-16T10:30:00.000Z";

    // Picking a date seven days later must not silently move the return to
    // midnight, which would shorten the last day and bill it in full anyway.
    const extended = extendedReturnDatetime(current, "2026-05-23");

    expect(new Date(extended).getTime() - new Date(current).getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("adds exactly the days asked for, in billable terms", () => {
    const start = "2026-05-14T09:00:00.000Z";
    const current = "2026-05-16T10:00:00.000Z";
    const extended = extendedReturnDatetime(current, "2026-05-23");

    // Asserted as a difference on purpose. What the two spans count is the day
    // rule's business; what this guards is that asking for seven more days adds
    // seven billable days and not six or eight, which has to hold whichever way
    // the rule counts and in whatever timezone the shop runs.
    expect(
      calculateRentalDays(start, extended) - calculateRentalDays(start, current),
    ).toBe(7);
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

describe("rent split across replacement vehicles", () => {
  // Local components again: a segment boundary is a calendar day like any
  // other, so a "Z" literal would move the split in half the world's shops.
  const day = (year: number, month: number, dayOfMonth: number, hour = 9) =>
    new Date(year, month - 1, dayOfMonth, hour).toISOString();

  const segment = (
    startDatetime: string,
    endDatetime: string | null,
    dailyPrice: number,
  ) => ({
    startDatetime,
    endDatetime,
    dailyPriceMinor: toMinorUnits(dailyPrice),
  });

  it("bills a single segment exactly as an unswapped contract does", () => {
    const start = day(2026, 5, 11);
    const end = day(2026, 5, 14);
    const split = calculateSegmentedRentMinor(start, end, [
      segment(start, null, 500),
    ]);

    expect(split.days).toBe(3);
    expect(split.segmentDays).toEqual([3]);
    expect(fromMinorUnits(split.rentMinor)).toBe(1500);
    expect(fromMinorUnits(split.rentMinor)).toBe(
      calculateRentalTotal(calculateRentalDays(start, end), 500),
    );
  });

  it("charges each vehicle its own rate for the days it was out", () => {
    const start = day(2026, 5, 11);
    const swap = day(2026, 5, 14);
    const end = day(2026, 5, 21);
    const split = calculateSegmentedRentMinor(start, end, [
      segment(start, swap, 500),
      segment(swap, null, 700),
    ]);

    expect(split.segmentDays).toEqual([3, 7]);
    // 3 days on the broken bike at 500, 7 on the replacement at 700.
    expect(fromMinorUnits(split.rentMinor)).toBe(1500 + 4900);
  });

  /**
   * The invariant the whole feature rests on. A swap moves days between
   * vehicles; it must never add or remove one, or a customer is billed for a
   * day nobody rode because their bike broke.
   */
  it("always splits exactly the contract's own days, never more", () => {
    const start = day(2026, 5, 11);
    const end = day(2026, 5, 14);
    // The expected day of each part is written out, not just the total. The
    // total alone proves nothing: the reconciliation step forces it to add up
    // whatever the parts came out as, so a wrong split would still sum right.
    const cases: Array<[string, ReturnType<typeof segment>[], number[]]> = [
      [
        "a swap partway through",
        [segment(start, day(2026, 5, 12), 500), segment(day(2026, 5, 12), null, 700)],
        [1, 2],
      ],
      [
        "broken two hours in, so the outgoing bike earns no day of its own",
        [
          segment(start, day(2026, 5, 11, 11), 500),
          segment(day(2026, 5, 11, 11), null, 700),
        ],
        [0, 3],
      ],
      [
        "swapped on the day it goes back",
        [segment(start, day(2026, 5, 14), 500), segment(day(2026, 5, 14), null, 700)],
        [3, 0],
      ],
      [
        "two swaps in one contract",
        [
          segment(start, day(2026, 5, 12), 500),
          segment(day(2026, 5, 12), day(2026, 5, 13), 700),
          segment(day(2026, 5, 13), null, 600),
        ],
        [1, 1, 1],
      ],
      [
        "a swap logged after an overdue contract's due date",
        [segment(start, day(2026, 5, 20), 500), segment(day(2026, 5, 20), null, 700)],
        [3, 0],
      ],
    ];

    for (const [description, segments, expectedDays] of cases) {
      const split = calculateSegmentedRentMinor(start, end, segments);
      const total = split.segmentDays.reduce((sum, days) => sum + days, 0);

      expect(split.segmentDays, description).toEqual(expectedDays);
      expect(total, description).toBe(split.days);
      expect(split.days, description).toBe(calculateRentalDays(start, end));
    }
  });

  it("keeps a same-day contract at one day and gives it to the vehicle ridden away", () => {
    const start = day(2026, 5, 11, 9);
    const swap = day(2026, 5, 11, 11);
    const end = day(2026, 5, 11, 17);
    const split = calculateSegmentedRentMinor(start, end, [
      segment(start, swap, 500),
      segment(swap, null, 700),
    ]);

    expect(split.days).toBe(1);
    expect(split.segmentDays).toEqual([0, 1]);
    expect(fromMinorUnits(split.rentMinor)).toBe(700);
  });

  it("refuses to price a contract with no vehicle history", () => {
    expect(() =>
      calculateSegmentedRentMinor(day(2026, 5, 11), day(2026, 5, 14), []),
    ).toThrow(/vehicle/i);
  });

  it("reprices an early return over the segments actually ridden", () => {
    const start = day(2026, 5, 11);
    const swap = day(2026, 5, 14);
    const booked = day(2026, 5, 21);
    const broughtBack = day(2026, 5, 17);
    const segments = [segment(start, swap, 500), segment(swap, null, 700)];
    const summary = calculateReturnSummaryMinor({
      startDatetime: start,
      expectedReturnDatetime: booked,
      actualReturnDatetime: broughtBack,
      segments,
      recalculateForActualDays: true,
      baseTotalAmountMinor: calculateSegmentedRentMinor(start, booked, segments).rentMinor,
      paidAmountMinor: toMinorUnits(0),
      lateFeePerDayMinor: toMinorUnits(0),
      damageChargeMinor: toMinorUnits(0),
      discountMinor: toMinorUnits(0),
    });

    // 3 days at 500, then 3 at 700 rather than the booked 7.
    expect(summary.actualDays).toBe(6);
    expect(fromMinorUnits(summary.effectiveBaseAmountMinor)).toBe(1500 + 2100);
  });

  it("charges extension days at the rate of the vehicle the customer now has", () => {
    const start = day(2026, 5, 11);
    const swap = day(2026, 5, 14);
    const summary = calculateExtensionSummary({
      startDatetime: start,
      currentExpectedReturnDatetime: day(2026, 5, 21),
      newExpectedReturnDatetime: day(2026, 5, 24),
      dailyPrice: 700,
      segments: [segment(start, swap, 500), segment(swap, null, 700)],
    });

    expect(summary.addedDays).toBe(3);
    // The three added days go to the replacement at 700, not to the average.
    expect(summary.addedRentAmount).toBe(2100);
    expect(summary.currentTotalAmount).toBe(1500 + 4900);
  });
});

describe("delayed vehicle handover correction", () => {
  const at = (year: number, month: number, day: number, hour: number) =>
    new Date(year, month - 1, day, hour).toISOString();

  it("moves both contract dates by the handover delay", () => {
    const corrected = shiftRentalWindowToActualHandover(
      at(2026, 8, 1, 9),
      at(2026, 8, 11, 9),
      at(2026, 8, 4, 14),
    );

    expect(corrected).toEqual({
      startDatetime: at(2026, 8, 4, 14),
      expectedReturnDatetime: at(2026, 8, 14, 14),
    });
    expect(
      calculateRentalDays(
        corrected.startDatetime,
        corrected.expectedReturnDatetime,
      ),
    ).toBe(10);
  });

  it("refuses to move the handover before the issued start", () => {
    expect(() =>
      shiftRentalWindowToActualHandover(
        at(2026, 8, 4, 9),
        at(2026, 8, 14, 9),
        at(2026, 8, 3, 9),
      ),
    ).toThrow(/before the rental started/i);
  });
});

describe("splitting an amount across vehicles", () => {
  it("splits in proportion to what each vehicle earned", () => {
    const parts = allocateMinorByWeights(toMinorUnits(5000), [1500, 3500]);

    expect(parts.map(fromMinorUnits)).toEqual([1500, 3500]);
  });

  it("hands out every last minor unit when the split does not divide evenly", () => {
    const total = toMinorUnits(100);
    const parts = allocateMinorByWeights(total, [1, 1, 1]);

    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
    expect(parts.map(fromMinorUnits)).toEqual([33.34, 33.33, 33.33]);
  });

  it("splits a net refund without inventing or losing a unit", () => {
    const total = toMinorUnits(-100);
    const parts = allocateMinorByWeights(total, [1, 1, 1]);

    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
  });

  it("gives everything to the vehicle the contract ended on when nothing was earned", () => {
    const total = toMinorUnits(250);
    const parts = allocateMinorByWeights(total, [0, 0]);

    expect(parts.map(fromMinorUnits)).toEqual([0, 250]);
  });
});
