import type Database from "better-sqlite3";

/**
 * Thrown when pending WAL frames could not be proven to be folded back into the
 * main database file. Callers translate this into their own failure type.
 */
export class WalCheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalCheckpointError";
  }
}

/**
 * Every backup copies rental_app.db straight off disk, so any WAL frame still
 * outstanding would be silently missing from the archive. A backup that quietly
 * loses recent writes is worse than no backup, so a busy, partial, malformed or
 * throwing checkpoint aborts the operation instead of being ignored.
 */
export function assertWalFullyCheckpointed(database: Database.Database): void {
  let result: unknown;

  try {
    result = database.pragma("wal_checkpoint(TRUNCATE)");
  } catch (error) {
    throw new WalCheckpointError(
      `Could not flush pending writes before copying the data file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const row = Array.isArray(result) ? (result[0] as Record<string, unknown>) : undefined;

  if (!row || typeof row !== "object") {
    throw new WalCheckpointError(
      "Could not confirm pending writes were flushed before copying the data file.",
    );
  }

  const busy = Number(row.busy);
  const log = Number(row.log);
  const checkpointed = Number(row.checkpointed);

  if (!Number.isFinite(busy) || !Number.isFinite(log) || !Number.isFinite(checkpointed)) {
    throw new WalCheckpointError(
      "Could not confirm pending writes were flushed before copying the data file.",
    );
  }

  if (busy !== 0) {
    throw new WalCheckpointError(
      "Another process is using the data file, so a safe copy could not be taken. Close other copies of the app and try again.",
    );
  }

  if (log !== checkpointed) {
    throw new WalCheckpointError(
      `Only ${checkpointed} of ${log} pending writes could be flushed, so the copy would be incomplete.`,
    );
  }
}
