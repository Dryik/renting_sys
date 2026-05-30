import { z } from "zod";
import type { Permission } from "./auth";

export const sensitiveActionValues = [
  "payments.void",
  "payments.correct",
  "expenses.void",
  "cashMovements.ownerWithdrawal",
  "cashMovements.void",
  "accountingAdjustments.create",
  "accountingAdjustments.void",
  "vehicleSales.void",
  "rentals.cancel",
  "backup.restore",
  "settings.edit",
  "ownerPin.change",
] as const;

export type SensitiveAction = (typeof sensitiveActionValues)[number];

export const sensitiveActionPermissionMap: Record<SensitiveAction, Permission> = {
  "payments.void": "payments.void",
  "payments.correct": "payments.void",
  "expenses.void": "expenses.void",
  "cashMovements.ownerWithdrawal": "cashMovements.create",
  "cashMovements.void": "cashMovements.void",
  "accountingAdjustments.create": "accountingAdjustments.create",
  "accountingAdjustments.void": "accountingAdjustments.void",
  "vehicleSales.void": "vehicleSales.void",
  "rentals.cancel": "rentals.cancel",
  "backup.restore": "backup.restore",
  "settings.edit": "settings.edit",
  "ownerPin.change": "settings.edit",
};

export const approvalTokenSchema = z.string().uuid("Owner PIN approval is required.");

export const ownerPinSetupSchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
  approvalToken: approvalTokenSchema.optional(),
});

export const ownerPinVerifySchema = z.object({
  pin: z.string().trim().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export const sensitiveApprovalInputSchema = z.object({
  action: z.enum(sensitiveActionValues),
  pin: z.string().trim().regex(/^\d{4}$/, "PIN must be exactly 4 digits."),
});

export const sensitiveApprovedInputSchema = z.object({
  approvalToken: approvalTokenSchema.optional(),
});

export type OwnerPinSetupInput = z.infer<typeof ownerPinSetupSchema>;
export type OwnerPinVerifyInput = z.infer<typeof ownerPinVerifySchema>;
export type SensitiveApprovalInput = z.infer<typeof sensitiveApprovalInputSchema>;
export type SensitiveApproval = {
  token: string;
  action: SensitiveAction;
  expiresAt: string;
};
