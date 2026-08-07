import { z } from "zod";
import { fromMinorUnitsOrNull, isMoneyMinor } from "./money";
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

  const money = describeMoneyKeys(value as Record<string, unknown>);
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

    if (money.drop.has(key)) {
      continue;
    }

    const majorKey = money.rename.get(key);

    if (majorKey !== undefined) {
      result[majorKey] = fromMinorUnitsOrNull(isMoneyMinor(child) ? child : null);
      continue;
    }

    result[key] = redactValue(child);
  }

  return result;
}

/**
 * The activity screen shows these snapshots verbatim, so a raw table row would
 * put the shop's staff in front of `amountMinor: 1235` and a mirror column they
 * have no way to interpret. Storage names are folded back to the one name the
 * rest of the app uses, in the units the rest of the app shows.
 *
 * Only a `*Minor` key holding an amount is folded, and only a `*Legacy` key with
 * a `*Minor` sibling is dropped, so an unrelated field that happens to end in
 * one of those words is left alone.
 */
function describeMoneyKeys(value: Record<string, unknown>): {
  rename: Map<string, string>;
  drop: Set<string>;
} {
  const rename = new Map<string, string>();
  const drop = new Set<string>();

  for (const [key, child] of Object.entries(value)) {
    if (!key.endsWith("Minor") || key.length === "Minor".length) {
      continue;
    }

    if (child !== null && !isMoneyMinor(child)) {
      continue;
    }

    const base = key.slice(0, -"Minor".length);
    rename.set(key, base);
    // The stored integer is the source of truth, so a major-unit key already
    // present is re-emitted from it rather than copied through.
    drop.add(base);
    drop.add(`${base}Legacy`);
  }

  return { rename, drop };
}
