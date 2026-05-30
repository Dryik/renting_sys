import { describe, expect, it } from "vitest";
import {
  calculatePaidAmount,
  paymentCorrectionInputSchema,
  paymentVoidInputSchema,
} from "./payments";

describe("payment safety helpers", () => {
  it("requires a reason when voiding a payment", () => {
    expect(
      paymentVoidInputSchema.parse({
        approvalToken: "11111111-1111-4111-8111-111111111111",
        paymentId: 1,
        reason: "Wrong amount recorded.",
      }),
    ).toEqual({
      approvalToken: "11111111-1111-4111-8111-111111111111",
      paymentId: 1,
      reason: "Wrong amount recorded.",
    });

    expect(() =>
      paymentVoidInputSchema.parse({ paymentId: 1, reason: "" }),
    ).toThrow();
  });

  it("accepts approval tokens for payment corrections", () => {
    expect(
      paymentCorrectionInputSchema.parse({
        approvalToken: "11111111-1111-4111-8111-111111111111",
        paymentId: 1,
        reason: "Wrong amount.",
        replacement: {
          rentalId: 2,
          type: "refund",
          method: "cash",
          amount: 20,
          paymentDate: "2026-05-22T10:00:00.000Z",
          notes: null,
        },
      }).replacement.type,
    ).toBe("refund");
  });

  it("ignores voided payments when calculating paid amount", () => {
    expect(
      calculatePaidAmount([
        { type: "rent", amount: 100, status: "posted" },
        { type: "deposit", amount: 200, status: "voided" },
        { type: "refund", amount: 50, status: "voided" },
        { type: "extra_charge", amount: 25, status: "posted" },
      ]),
    ).toBe(125);
  });
});
