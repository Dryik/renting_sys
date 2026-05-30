import { describe, expect, it } from "vitest";
import {
  approvalTokenSchema,
  ownerPinSetupSchema,
  sensitiveActionPermissionMap,
  sensitiveApprovalInputSchema,
} from "./security";

describe("sensitive action security helpers", () => {
  it("keeps owner PIN setup local and exactly four digits", () => {
    expect(ownerPinSetupSchema.parse({ pin: "1234" }).pin).toBe("1234");
    expect(() => ownerPinSetupSchema.parse({ pin: "12345" })).toThrow(
      "PIN must be exactly 4 digits.",
    );
    expect(() => ownerPinSetupSchema.parse({ pin: "abcd" })).toThrow();
  });

  it("maps sensitive actions to service permissions", () => {
    expect(sensitiveActionPermissionMap["payments.void"]).toBe("payments.void");
    expect(sensitiveActionPermissionMap["payments.correct"]).toBe("payments.void");
    expect(sensitiveActionPermissionMap["expenses.void"]).toBe("expenses.void");
    expect(sensitiveActionPermissionMap["cashMovements.ownerWithdrawal"]).toBe("cashMovements.create");
    expect(sensitiveActionPermissionMap["cashMovements.void"]).toBe("cashMovements.void");
    expect(sensitiveActionPermissionMap["accountingAdjustments.create"]).toBe("accountingAdjustments.create");
    expect(sensitiveActionPermissionMap["accountingAdjustments.void"]).toBe("accountingAdjustments.void");
    expect(sensitiveActionPermissionMap["rentals.cancel"]).toBe("rentals.cancel");
    expect(sensitiveActionPermissionMap["vehicleSales.void"]).toBe("vehicleSales.void");
    expect(sensitiveActionPermissionMap["backup.restore"]).toBe("backup.restore");
    expect(sensitiveActionPermissionMap["settings.edit"]).toBe("settings.edit");
    expect(sensitiveActionPermissionMap["ownerPin.change"]).toBe("settings.edit");
  });

  it("validates sensitive approval input and approval tokens", () => {
    expect(
      sensitiveApprovalInputSchema.parse({
        action: "backup.restore",
        pin: "0000",
      }),
    ).toEqual({ action: "backup.restore", pin: "0000" });

    expect(() =>
      sensitiveApprovalInputSchema.parse({
        action: "backup.restore",
        pin: "00000",
      }),
    ).toThrow("PIN must be exactly 4 digits.");

    expect(() => approvalTokenSchema.parse("not-a-token")).toThrow();
    expect(
      approvalTokenSchema.parse("11111111-1111-4111-8111-111111111111"),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });
});
