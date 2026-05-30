import { and, count, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";
import {
  auditListRequestSchema,
  redactAuditSnapshot,
  requiresAuditReason,
  type AuditEventRecord,
  type AuditListRequest,
} from "../../src/shared/audit";
import type { CurrentUser } from "../../src/shared/auth";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { auditEvents } from "./schema";

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type AuditExecutor = ReturnType<typeof getDatabase> | DbTransaction;

type AuditActorProvider = () => {
  user: CurrentUser | null;
  sessionId: string | null;
  appVersion: string | null;
};

let actorProvider: AuditActorProvider = () => ({
  user: null,
  sessionId: null,
  appVersion: null,
});

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: number | null;
  entityLabel?: string | null;
  summaryAr?: string | null;
  summaryEn?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  reason?: string | null;
  actorOverride?: CurrentUser | null;
  sessionIdOverride?: string | null;
};

export function setAuditActorProvider(provider: AuditActorProvider): void {
  actorProvider = provider;
}

export function logAuditEvent(tx: AuditExecutor, input: AuditInput): void {
  const actorState = actorProvider();
  const actor = input.actorOverride === undefined ? actorState.user : input.actorOverride;
  const reason = input.reason?.trim() || null;

  if (requiresAuditReason(input.action) && !reason) {
    throw new Error("Reason is required.");
  }

  tx.insert(auditEvents)
    .values({
      occurredAt: new Date().toISOString(),
      actorUserId: actor?.id ?? null,
      actorUsernameSnapshot: actor?.username ?? null,
      actorFullNameSnapshot: actor?.fullName ?? null,
      actorRoleKeySnapshot: actor?.roleKey ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel ?? null,
      summaryAr: input.summaryAr ?? null,
      summaryEn: input.summaryEn ?? null,
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      metadataJson: toJson(input.metadata),
      reason,
      sessionId:
        input.sessionIdOverride === undefined
          ? actorState.sessionId
          : input.sessionIdOverride,
      appVersion: actorState.appVersion,
    })
    .run();
}

export function listAuditEvents(
  request?: AuditListRequest,
): PageResult<AuditEventRecord> {
  const parsed = auditListRequestSchema.parse(request ?? {});
  const db = getDatabase();
  const pageRequest = normalizePageRequest(parsed);
  const conditions: SQL[] = [];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);
    const searchFilter = or(
      like(auditEvents.action, term),
      like(auditEvents.entityType, term),
      like(auditEvents.entityLabel, term),
      like(auditEvents.actorUsernameSnapshot, term),
      like(auditEvents.actorFullNameSnapshot, term),
      like(auditEvents.summaryAr, term),
      like(auditEvents.summaryEn, term),
      like(auditEvents.reason, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (parsed.dateFrom) {
    conditions.push(gte(auditEvents.occurredAt, getLocalDateStart(parsed.dateFrom)));
  }

  if (parsed.dateTo) {
    conditions.push(lte(auditEvents.occurredAt, getLocalDateEnd(parsed.dateTo)));
  }

  if (parsed.actorUserId) {
    conditions.push(eq(auditEvents.actorUserId, parsed.actorUserId));
  }

  if (parsed.action) {
    conditions.push(eq(auditEvents.action, parsed.action));
  }

  if (parsed.entityType) {
    conditions.push(eq(auditEvents.entityType, parsed.entityType));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total =
    db.select({ count: count() }).from(auditEvents).where(whereFilter).get()
      ?.count ?? 0;
  const rows = db
    .select()
    .from(auditEvents)
    .where(whereFilter)
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

function toJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(redactAuditSnapshot(value));
}

function getLocalDateStart(date: string): string {
  return parseDateInput(date).toISOString();
}

function getLocalDateEnd(date: string): string {
  const end = parseDateInput(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);

  return end.toISOString();
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Date is invalid.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Date is invalid.");
  }

  return date;
}
