import { eq } from "drizzle-orm";
import { getDatabase } from "./database";
import { numberSequences } from "./schema";

type DbTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

type SequenceExecutor = ReturnType<typeof getDatabase> | DbTransaction;

export function getNextSequenceValue(
  tx: SequenceExecutor,
  name: string,
  fallbackPrefix: string,
  fallbackPadding = 6,
): string {
  const now = new Date().toISOString();
  const current = tx
    .select()
    .from(numberSequences)
    .where(eq(numberSequences.name, name))
    .get();

  if (!current) {
    tx.insert(numberSequences)
      .values({
        name,
        prefix: fallbackPrefix,
        nextNumber: 2,
        padding: fallbackPadding,
        updatedAt: now,
      })
      .run();

    return formatSequence(fallbackPrefix, 1, fallbackPadding);
  }

  tx.update(numberSequences)
    .set({
      nextNumber: current.nextNumber + 1,
      updatedAt: now,
    })
    .where(eq(numberSequences.name, name))
    .run();

  return formatSequence(current.prefix, current.nextNumber, current.padding);
}

function formatSequence(prefix: string, value: number, padding: number): string {
  const normalizedPrefix = prefix.trim() || "CNT";

  return `${normalizedPrefix}-${String(value).padStart(padding, "0")}`;
}
