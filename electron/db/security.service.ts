import crypto from "node:crypto";
import {
  ownerPinSetupSchema,
  sensitiveActionPermissionMap,
  sensitiveApprovalInputSchema,
  type SensitiveAction,
  type SensitiveApproval,
} from "../../src/shared/security";
import { getDatabase } from "./database";
import { appSettings } from "./schema";
import { recordAppEvent } from "./events.service";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";

const approvalTtlMs = 5 * 60 * 1000;
const ownerPinFailureThreshold = 5;
const ownerPinLockoutMs = 15 * 60 * 1000;

const approvals = new Map<string, {
  action: SensitiveAction;
  expiresAt: number;
  userId: number;
}>();
const ownerPinFailures = new Map<number, {
  count: number;
  lockedUntil: number | null;
}>();

export function setOwnerPin(input: unknown): void {
  requirePermissionForCurrentSession("settings.edit");
  const values = ownerPinSetupSchema.parse(input);
  if (isOwnerPinEnabled()) {
    requireSensitiveApproval("ownerPin.change", values.approvalToken);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPin(values.pin, salt);

  getDatabase().transaction((tx) => {
    upsertSetting(tx, "owner_pin_hash", hash);
    upsertSetting(tx, "owner_pin_salt", salt);
    upsertSetting(tx, "owner_pin_enabled", "true");
    upsertSetting(tx, "owner_pin_updated_at", new Date().toISOString());
    recordAppEvent(tx, {
      eventType: "owner_pin_changed",
      severity: "warning",
      message: "Owner PIN was changed.",
    });
    logAuditEvent(tx, {
      action: "settings.updated",
      entityType: "settings",
      entityLabel: "owner_pin",
      summaryAr: "تم تغيير رمز المالك",
      summaryEn: "Owner PIN was changed.",
      reason: "Owner PIN changed.",
    });
  });
}

export function clearOwnerPin(input?: unknown): void {
  requirePermissionForCurrentSession("settings.edit");
  const approvalToken =
    input && typeof input === "object" && "approvalToken" in input
      ? (input as { approvalToken?: string }).approvalToken
      : undefined;
  if (isOwnerPinEnabled()) {
    requireSensitiveApproval("ownerPin.change", approvalToken);
  }

  getDatabase().transaction((tx) => {
    upsertSetting(tx, "owner_pin_hash", "");
    upsertSetting(tx, "owner_pin_salt", "");
    upsertSetting(tx, "owner_pin_enabled", "false");
    upsertSetting(tx, "owner_pin_updated_at", new Date().toISOString());
    recordAppEvent(tx, {
      eventType: "owner_pin_disabled",
      severity: "warning",
      message: "Owner PIN was disabled.",
    });
    logAuditEvent(tx, {
      action: "settings.updated",
      entityType: "settings",
      entityLabel: "owner_pin",
      summaryAr: "تم تعطيل رمز المالك",
      summaryEn: "Owner PIN was disabled.",
      reason: "Owner PIN disabled.",
    });
  });
}

export function approveSensitiveAction(input: unknown): SensitiveApproval {
  const values = sensitiveApprovalInputSchema.parse(input);
  const user = requirePermissionForCurrentSession(
    sensitiveActionPermissionMap[values.action],
  );
  const now = Date.now();
  const failureState = ownerPinFailures.get(user.id);

  if (failureState?.lockedUntil && failureState.lockedUntil > now) {
    throw new Error("Owner PIN is temporarily locked. Try again later.");
  }

  if (!isOwnerPinEnabled()) {
    return createApproval(values.action, user.id);
  }

  if (!verifyOwnerPinValue(values.pin)) {
    const nextCount = (failureState?.count ?? 0) + 1;
    const lockedUntil =
      nextCount >= ownerPinFailureThreshold
        ? now + ownerPinLockoutMs
        : null;
    ownerPinFailures.set(user.id, { count: nextCount, lockedUntil });
    logAuditEvent(getDatabase(), {
      action: "security.sensitiveApprovalFailed",
      entityType: "settings",
      entityLabel: values.action,
      summaryAr: "فشل اعتماد إجراء حساس",
      summaryEn: "Sensitive action approval failed.",
      metadata: { action: values.action },
      actorOverride: user,
      sessionIdOverride: null,
    });
    throw new Error(
      lockedUntil
        ? "Owner PIN is temporarily locked. Try again later."
        : "Owner PIN is incorrect.",
    );
  }

  ownerPinFailures.delete(user.id);
  const approval = createApproval(values.action, user.id);
  logAuditEvent(getDatabase(), {
    action: "security.sensitiveApprovalGranted",
    entityType: "settings",
    entityLabel: values.action,
    summaryAr: "تم اعتماد إجراء حساس",
    summaryEn: "Sensitive action was approved.",
    metadata: { action: values.action, expiresAt: approval.expiresAt },
  });

  return approval;
}

export function requireSensitiveApproval(
  action: SensitiveAction,
  approvalToken: string | null | undefined,
): void {
  const user = requirePermissionForCurrentSession(sensitiveActionPermissionMap[action]);

  if (!isOwnerPinEnabled()) {
    return;
  }

  if (!approvalToken) {
    throw new Error("Owner PIN approval is required.");
  }

  const approval = approvals.get(approvalToken);
  approvals.delete(approvalToken);

  if (!approval || approval.action !== action || approval.userId !== user.id) {
    throw new Error("Owner PIN approval is required.");
  }

  if (approval.expiresAt < Date.now()) {
    throw new Error("Owner PIN approval expired.");
  }
}

type SecurityTx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

function upsertSetting(tx: SecurityTx, key: string, value: string): void {
  tx.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value },
    })
    .run();
}

function createApproval(action: SensitiveAction, userId: number): SensitiveApproval {
  cleanupExpiredApprovals();
  const token = crypto.randomUUID();
  const expiresAtTime = Date.now() + approvalTtlMs;
  approvals.set(token, {
    action,
    expiresAt: expiresAtTime,
    userId,
  });

  return {
    token,
    action,
    expiresAt: new Date(expiresAtTime).toISOString(),
  };
}

function cleanupExpiredApprovals(): void {
  const now = Date.now();
  for (const [token, approval] of approvals) {
    if (approval.expiresAt < now) {
      approvals.delete(token);
    }
  }
}

function isOwnerPinEnabled(): boolean {
  const rows = getDatabase().select().from(appSettings).all();
  const settings = new Map(rows.map((row) => [row.key, row.value]));

  return settings.get("owner_pin_enabled") === "true";
}

function verifyOwnerPinValue(pin: string): boolean {
  const rows = getDatabase().select().from(appSettings).all();
  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const salt = settings.get("owner_pin_salt");
  const hash = settings.get("owner_pin_hash");

  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hashPin(pin, salt), "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}
