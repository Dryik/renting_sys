import DatabaseConstructor from "better-sqlite3";
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  assertRestorableStructure,
  openBackupArchive,
  shouldIncludeBackupUploadPath,
  writeBackupZip,
} from "./backup-archive";
import { LATEST_SCHEMA_VERSION, migrations } from "./migrations";
import { runIdempotentSeeds } from "./seeds";
import { allIndexSql, allTableSql } from "./table-ddl";

export const migrationBackupsDirectoryName = "migration_backups";
export const retainedMigrationBackups = 3;

export type MigrationOutcome =
  | { kind: "created"; version: number }
  | { kind: "current"; version: number }
  | {
      kind: "upgraded";
      fromVersion: number;
      toVersion: number;
      safetyBackupPath: string;
    };

/**
 * Carries the safety backup location so the startup handler can tell the user
 * exactly which file to restore from.
 */
export class MigrationFailedError extends Error {
  readonly safetyBackupPath: string | null;
  readonly fromVersion: number | null;

  constructor(
    message: string,
    options: { safetyBackupPath?: string | null; fromVersion?: number | null } = {},
  ) {
    super(message);
    this.name = "MigrationFailedError";
    this.safetyBackupPath = options.safetyBackupPath ?? null;
    this.fromVersion = options.fromVersion ?? null;
  }
}

export type MigrateOptions = {
  userDataPath: string;
  databasePath: string;
  uploadsPath: string;
  appVersion: string;
  /** Injectable so tests can assert backup creation without Electron. */
  createSafetyBackup?: (context: SafetyBackupContext) => string;
};

export type SafetyBackupContext = {
  userDataPath: string;
  databasePath: string;
  uploadsPath: string;
  appVersion: string;
  fromVersion: number;
  toVersion: number;
};

export function migrateDatabase(
  database: Database.Database,
  options: MigrateOptions,
): MigrationOutcome {
  const now = new Date().toISOString();

  if (isFreshDatabase(database)) {
    return createFreshDatabase(database, now);
  }

  const currentVersion = readSchemaVersion(database);

  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new MigrationFailedError(
      `This data file was created by a newer version of the app (database version ${currentVersion}, this app supports ${LATEST_SCHEMA_VERSION}). Install the latest version to open it.`,
      { fromVersion: currentVersion },
    );
  }

  // A database that is already damaged must be reported before anything is
  // backed up or written, so the damage is never propagated into the archive.
  assertIntegrity(database, null);
  assertForeignKeys(database, null);

  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((left, right) => left.version - right.version);

  if (pending.length === 0) {
    finishSchema(database, now);
    return { kind: "current", version: currentVersion };
  }

  const safetyBackupPath = createSafetyBackup(database, options, currentVersion);

  // From here the backup exists, so every failure must carry its location.
  try {
    for (const migration of pending) {
      try {
        // The migration and the version bump commit together, so an interrupted
        // upgrade can never leave the recorded version ahead of the schema.
        database.transaction(() => {
          migration.up(database, now);
          writeSchemaVersion(database, migration.version);
        })();
      } catch (error) {
        throw new Error(
          `step ${migration.version} (${migration.name}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    finishSchema(database, now);
    assertIntegrity(database, safetyBackupPath);
    assertForeignKeys(database, safetyBackupPath);
  } catch (error) {
    if (error instanceof MigrationFailedError) {
      throw new MigrationFailedError(error.message, {
        safetyBackupPath,
        fromVersion: currentVersion,
      });
    }

    throw new MigrationFailedError(
      `Upgrading the data file failed at ${
        error instanceof Error ? error.message : String(error)
      }`,
      { safetyBackupPath, fromVersion: currentVersion },
    );
  }

  return {
    kind: "upgraded",
    fromVersion: currentVersion,
    toVersion: LATEST_SCHEMA_VERSION,
    safetyBackupPath,
  };
}

function isFreshDatabase(database: Database.Database): boolean {
  const row = database
    .prepare(
      "select count(*) as count from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    )
    .get() as { count: number };

  return row.count === 0;
}

function createFreshDatabase(
  database: Database.Database,
  now: string,
): MigrationOutcome {
  database.transaction(() => {
    database.exec(allTableSql);
    writeSchemaVersion(database, LATEST_SCHEMA_VERSION);
  })();

  finishSchema(database, now);

  return { kind: "created", version: LATEST_SCHEMA_VERSION };
}

/**
 * Seeds and indexes are idempotent, so both paths end the same way. They run in
 * one transaction because seeding deletes and reinserts every role permission:
 * a failure partway through would otherwise leave roles stripped of access.
 */
function finishSchema(database: Database.Database, now: string): void {
  database.transaction(() => {
    runIdempotentSeeds(database, now);
    assertNoDuplicateOpenRentals(database);
    database.exec(allIndexSql);
  })();
}

function readSchemaVersion(database: Database.Database): number {
  const hasAppSettings = database
    .prepare(
      "select count(*) as count from sqlite_master where type = 'table' and name = 'app_settings'",
    )
    .get() as { count: number };

  if (hasAppSettings.count === 0) {
    throw new MigrationFailedError(
      "This file is not a Rental Desk data file: the app_settings table is missing.",
    );
  }

  const row = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;

  if (!row?.value) {
    throw new MigrationFailedError(
      "This data file is missing its schema version and cannot be upgraded safely.",
    );
  }

  const version = Number(row.value);

  if (!Number.isInteger(version) || version < 1) {
    throw new MigrationFailedError(
      `This data file records an unusable schema version (${row.value}).`,
    );
  }

  return version;
}

function writeSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `insert into app_settings (key, value) values ('schema_version', ?)
       on conflict(key) do update set value = excluded.value`,
    )
    .run(String(version));
}

function assertIntegrity(
  database: Database.Database,
  safetyBackupPath: string | null,
): void {
  const integrity = database.pragma("integrity_check", { simple: true }) as string;

  if (integrity !== "ok") {
    throw new MigrationFailedError(
      `The data file failed its integrity check (${integrity}).`,
      { safetyBackupPath },
    );
  }
}

function assertForeignKeys(
  database: Database.Database,
  safetyBackupPath: string | null,
): void {
  const violations = database.pragma("foreign_key_check") as unknown[];

  if (violations.length > 0) {
    throw new MigrationFailedError(
      `The upgraded data file failed its foreign key check (${violations.length} violation(s)).`,
      { safetyBackupPath },
    );
  }
}

function assertNoDuplicateOpenRentals(database: Database.Database): void {
  const duplicates = database
    .prepare(
      `select vehicle_id as vehicleId, count(*) as count
       from rentals
       where status in ('active', 'overdue')
       group by vehicle_id
       having count(*) > 1`,
    )
    .all() as Array<{ vehicleId: number; count: number }>;

  if (duplicates.length === 0) {
    return;
  }

  const vehicleIds = duplicates.map((row) => row.vehicleId).join(", ");
  throw new MigrationFailedError(
    `Cannot initialize database: duplicate active rentals exist for vehicle(s): ${vehicleIds}.`,
  );
}

function createSafetyBackup(
  database: Database.Database,
  options: MigrateOptions,
  fromVersion: number,
): string {
  const context: SafetyBackupContext = {
    userDataPath: options.userDataPath,
    databasePath: options.databasePath,
    uploadsPath: options.uploadsPath,
    appVersion: options.appVersion,
    fromVersion,
    toVersion: LATEST_SCHEMA_VERSION,
  };

  if (options.createSafetyBackup) {
    return options.createSafetyBackup(context);
  }

  assertWalFullyCheckpointed(database);

  return writeMigrationSafetyBackup(context);
}

/**
 * The archive copies rental_app.db off disk, so any WAL frame that has not been
 * folded back into the main file would be silently missing from the backup.
 * A backup that quietly loses recent writes is worse than no backup, so an
 * incomplete or busy checkpoint aborts the upgrade rather than being ignored.
 */
export function assertWalFullyCheckpointed(database: Database.Database): void {
  let result: unknown;

  try {
    result = database.pragma("wal_checkpoint(TRUNCATE)");
  } catch (error) {
    throw new MigrationFailedError(
      `Could not flush pending writes before backing up the data file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const row = Array.isArray(result) ? (result[0] as Record<string, unknown>) : undefined;

  if (!row || typeof row !== "object") {
    throw new MigrationFailedError(
      "Could not confirm pending writes were flushed before backing up the data file.",
    );
  }

  const busy = Number(row.busy);
  const log = Number(row.log);
  const checkpointed = Number(row.checkpointed);

  if (!Number.isFinite(busy) || !Number.isFinite(log) || !Number.isFinite(checkpointed)) {
    throw new MigrationFailedError(
      "Could not confirm pending writes were flushed before backing up the data file.",
    );
  }

  if (busy !== 0) {
    throw new MigrationFailedError(
      "Another process is using the data file, so a safe backup could not be taken. Close other copies of the app and try again.",
    );
  }

  if (log !== checkpointed) {
    throw new MigrationFailedError(
      `Only ${checkpointed} of ${log} pending writes could be flushed, so the backup would be incomplete.`,
    );
  }
}

/**
 * Writes to a `.partial` name, proves the archive is restorable, and only then
 * renames it into place. Older backups are pruned after that rename, so a
 * failed attempt never costs the user a previously good backup.
 */
export function writeMigrationSafetyBackup(context: SafetyBackupContext): string {
  const backupsDirectory = path.join(
    context.userDataPath,
    migrationBackupsDirectoryName,
  );
  fs.mkdirSync(backupsDirectory, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const baseName = `migration_backup_v${context.fromVersion}_to_v${context.toVersion}_${stamp}`;
  const partialPath = path.join(backupsDirectory, `${baseName}.${process.pid}.partial`);
  const finalPath = path.join(backupsDirectory, `${baseName}.zip`);
  const stagingPath = path.join(
    backupsDirectory,
    `.verify-${baseName}.${process.pid}`,
  );

  try {
    writeBackupZip(
      partialPath,
      context.databasePath,
      context.uploadsPath,
      "safety_before_migration",
      {
        sourceSchemaVersion: context.fromVersion,
        targetSchemaVersion: context.toVersion,
      },
      context.appVersion,
    );

    verifySafetyBackup(partialPath, stagingPath, context);
    fs.renameSync(partialPath, finalPath);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error instanceof MigrationFailedError
      ? error
      : new MigrationFailedError(
          `The safety backup could not be verified, so the upgrade was stopped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }

  pruneMigrationBackups(backupsDirectory);

  return finalPath;
}

function verifySafetyBackup(
  archivePath: string,
  stagingPath: string,
  context: SafetyBackupContext,
): void {
  const archive = openBackupArchive(archivePath);
  assertRestorableStructure(archive);
  assertUploadsRepresented(archive.entryNames, context.uploadsPath);
  archive.extractTo(stagingPath);

  const restoredDatabasePath = path.join(stagingPath, "rental_app.db");

  if (!fs.existsSync(restoredDatabasePath)) {
    throw new MigrationFailedError(
      "The safety backup did not contain a restorable data file.",
    );
  }

  const restored = new DatabaseConstructor(restoredDatabasePath, { readonly: true });

  try {
    const integrity = restored.pragma("integrity_check", { simple: true }) as string;

    if (integrity !== "ok") {
      throw new MigrationFailedError(
        `The safety backup failed its integrity check (${integrity}).`,
      );
    }

    if ((restored.pragma("foreign_key_check") as unknown[]).length > 0) {
      throw new MigrationFailedError(
        "The safety backup failed its foreign key check.",
      );
    }

    const row = restored
      .prepare("select value from app_settings where key = 'schema_version'")
      .get() as { value?: string } | undefined;

    if (Number(row?.value) !== context.fromVersion) {
      throw new MigrationFailedError(
        `The safety backup records schema version ${row?.value ?? "none"} but the data file is at version ${context.fromVersion}.`,
      );
    }
  } finally {
    restored.close();
  }
}

/** Every upload eligible for backup must actually be in the archive. */
function assertUploadsRepresented(entryNames: string[], uploadsPath: string): void {
  if (!fs.existsSync(uploadsPath)) {
    return;
  }

  const archived = new Set(entryNames);

  for (const relativePath of listBackupEligibleUploads(uploadsPath)) {
    if (!archived.has(`uploads/${relativePath}`)) {
      throw new MigrationFailedError(
        `The safety backup is missing an uploaded file (${relativePath}).`,
      );
    }
  }
}

function listBackupEligibleUploads(uploadsPath: string): string[] {
  const found: string[] = [];

  const walk = (directory: string, prefix: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(path.join(directory, entry.name), relativePath);
        continue;
      }

      if (shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, relativePath))) {
        found.push(relativePath);
      }
    }
  };

  walk(uploadsPath, "");

  return found;
}

function pruneMigrationBackups(backupsDirectory: string): void {
  const archives = fs
    .readdirSync(backupsDirectory)
    .filter((name) => name.startsWith("migration_backup_") && name.endsWith(".zip"))
    .map((name) => path.join(backupsDirectory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  for (const staleArchive of archives.slice(retainedMigrationBackups)) {
    try {
      fs.rmSync(staleArchive, { force: true });
    } catch {
      // Retention is best effort; a locked old archive must not block startup.
    }
  }
}
