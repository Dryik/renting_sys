import { z } from "zod";
import type { PageRequest } from "./pagination";

export const auditActionValues = [
  "auth.login.success",
  "auth.login.failed",
  "auth.logout",
  "auth.locked",
  "auth.unlocked",
  "auth.unlock.failed",
  "user.created",
  "user.updated",
  "user.deactivated",
  "user.reactivated",
  "user.passwordReset",
  "user.roleChanged",
  "user.passwordChanged",
  "vehicle.created",
  "vehicle.updated",
  "vehicle.statusChanged",
  "vehicle.deactivated",
  "customer.created",
  "customer.updated",
  "customer.deactivated",
  "customer.document.added",
  "customer.document.replaced",
  "customer.document.archived",
  "customer.photo.captured",
  "rental.created",
  "rental.activated",
  "rental.updated",
  "rental.returned",
  "rental.cancelled",
  "payment.created",
  "payment.refunded",
  "payment.voided",
  "payment.corrected",
  "maintenance.created",
  "maintenance.updated",
  "maintenance.completed",
  "maintenance.archived",
  "settings.updated",
  "security.sensitiveApprovalGranted",
  "security.sensitiveApprovalFailed",
  "backup.exported",
  "backup.restore.started",
  "backup.restore.completed",
  "backup.restore.failed",
  "report.exported",
  "vehicle.document.added",
  "vehicle.document.replaced",
  "vehicle.document.archived",
  "vehicle.photo.added",
] as const;

export type AuditAction = (typeof auditActionValues)[number] | string;

export const auditEntityTypeValues = [
  "auth",
  "user",
  "vehicle",
  "customer",
  "attachment",
  "rental",
  "payment",
  "maintenance",
  "settings",
  "backup",
  "report",
] as const;

export type AuditEntityType = (typeof auditEntityTypeValues)[number] | string;

export type AuditEventRecord = {
  id: number;
  occurredAt: string;
  actorUserId: number | null;
  actorUsernameSnapshot: string | null;
  actorFullNameSnapshot: string | null;
  actorRoleKeySnapshot: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  entityLabel: string | null;
  summaryAr: string | null;
  summaryEn: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  metadataJson: string | null;
  reason: string | null;
  sessionId: string | null;
  appVersion: string | null;
};

export type AuditListRequest = PageRequest & {
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: number;
  action?: string;
  entityType?: string;
};

export const auditListRequestSchema = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  actorUserId: z.number().int().positive().optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
});

export const sensitiveAuditActions = new Set<string>([
  "payment.voided",
  "payment.corrected",
  "rental.cancelled",
  "customer.deactivated",
  "vehicle.deactivated",
  "customer.document.replaced",
  "customer.document.archived",
  "vehicle.document.replaced",
  "vehicle.document.archived",
  "backup.restore.started",
  "backup.restore.completed",
  "user.deactivated",
  "user.roleChanged",
  "user.passwordReset",
  "settings.updated",
  "maintenance.archived",
]);

export function requiresAuditReason(action: string): boolean {
  return sensitiveAuditActions.has(action);
}

export function redactAuditSnapshot<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();

    if (
      normalized.includes("password") ||
      normalized.includes("hash") ||
      normalized.includes("salt") ||
      normalized.includes("pin") ||
      normalized.includes("logodataurl")
    ) {
      result[key] = "[redacted]";
      continue;
    }

    result[key] = redactValue(child);
  }

  return result;
}
