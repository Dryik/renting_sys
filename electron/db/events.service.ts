import { getDatabase } from "./database";
import { appEvents } from "./schema";

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type EventExecutor = ReturnType<typeof getDatabase> | DbTransaction;

export type AppEventInput = {
  eventType: string;
  entityType?: string | null;
  entityId?: number | null;
  severity?: "info" | "warning" | "danger";
  message: string;
  details?: unknown;
};

export function recordAppEvent(tx: EventExecutor, input: AppEventInput): void {
  tx.insert(appEvents)
    .values({
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      severity: input.severity ?? "info",
      message: input.message,
      detailsJson:
        input.details === undefined ? null : JSON.stringify(input.details),
      createdAt: new Date().toISOString(),
    })
    .run();
}
