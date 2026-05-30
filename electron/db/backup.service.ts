import AdmZip from "adm-zip";
import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  type BackupPreview,
  type BackupStatus,
  type BackupVerifyResult,
  hasRequiredBackupEntries,
  isBusinessBackupEntryName,
  normalizeBackupEntryName,
} from "../../src/shared/backup";
import { z } from "zod";
import Database from "better-sqlite3";
import { closeDatabase, getDatabase, getSqliteDatabase, initializeDatabase } from "./database";
import { appSettings } from "./schema";
import { clearCurrentSession, getCurrentUserForService, requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { approvalTokenSchema } from "../../src/shared/security";
import { requireSensitiveApproval } from "./security.service";

const restoreInputSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

function getUserDataPath(): string {
  return process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
}

export type BackupResult = {
  success: boolean;
  filePath?: string;
  error?: string;
};

export type RestoreResult = {
  success: boolean;
  safetyBackupPath?: string;
  error?: string;
};

export async function runBackup(): Promise<BackupResult> {
  requirePermissionForCurrentSession("backup.export");

  try {
    const userDataPath = getUserDataPath();
    const databasePath = path.join(userDataPath, "rental_app.db");
    const uploadsPath = path.join(userDataPath, "uploads");
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const defaultName = `rental_backup_${dateStr}.zip`;

    const { filePath } = await dialog.showSaveDialog({
      title: "Export Backup ZIP",
      defaultPath: defaultName,
      filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
    });

    if (!filePath) {
      return { success: false, error: "Backup process cancelled by user." };
    }

    checkpointDatabase();
    closeDatabase();

    try {
      writeBackupZip(filePath, databasePath, uploadsPath, "manual");
    } finally {
      initializeDatabase();
    }

    saveBackupSetting("last_backup_at", new Date().toISOString());
    saveBackupSetting("last_backup_path", filePath);
    logAuditEvent(getDatabase(), {
      action: "backup.exported",
      entityType: "backup",
      entityLabel: path.basename(filePath),
      summaryAr: "تم إنشاء نسخة احتياطية",
      summaryEn: "Backup was exported.",
      metadata: { filePath },
    });

    return { success: true, filePath };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unknown error occurred during backup.",
    };
  }
}

export async function runRestore(input: unknown): Promise<RestoreResult> {
  requirePermissionForCurrentSession("backup.restore");
  const values = restoreInputSchema.parse(input);
  requireSensitiveApproval("backup.restore", values.approvalToken);
  const userDataPath = getUserDataPath();
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");
  const stagingPath = path.join(userDataPath, `.restore-staging-${Date.now()}`);
  const rollbackPath = path.join(userDataPath, `.restore-rollback-${Date.now()}`);
  const actorSnapshot = getCurrentUserForService();

  appendRestoreOperationLog(userDataPath, "started", {
    actor: actorSnapshot
      ? {
          id: actorSnapshot.id,
          username: actorSnapshot.username,
          fullName: actorSnapshot.fullName,
          roleKey: actorSnapshot.roleKey,
        }
      : null,
    reason: values.reason,
  });
  logAuditEvent(getDatabase(), {
    action: "backup.restore.started",
    entityType: "backup",
    summaryAr: "بدأت استعادة نسخة احتياطية",
    summaryEn: "Backup restore started.",
    metadata: { actorSnapshot },
    reason: values.reason,
  });

  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: "Select Backup ZIP to Restore",
      filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: "Restore process cancelled by user." };
    }

    const backupFilePath = filePaths[0]!;
    const zip = new AdmZip(backupFilePath);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);

    if (!hasRequiredBackupEntries(entryNames)) {
      throw new Error("Invalid backup file structure: missing metadata.json or rental_app.db.");
    }

    validateBackupEntries(entryNames);
    extractBackupToStaging(zip, stagingPath);

    if (!fs.existsSync(path.join(stagingPath, "rental_app.db"))) {
      throw new Error("Invalid backup file structure: database file was not restored.");
    }

    validateStagedDatabase(path.join(stagingPath, "rental_app.db"));
    checkpointDatabase();
    closeDatabase();

    let safetyBackupPath = "";

    try {
      safetyBackupPath = path.join(
        userDataPath,
        `safety_backup_before_restore_${Date.now()}.zip`,
      );
      writeBackupZip(safetyBackupPath, databasePath, uploadsPath, "safety_before_restore");
      copyCurrentDataToRollback(databasePath, uploadsPath, rollbackPath);
      replaceCurrentDataFromStaging(stagingPath, databasePath, uploadsPath);
      try {
        initializeDatabase();
      } catch (error) {
        closeDatabase();
        restoreRollbackData(rollbackPath, databasePath, uploadsPath);
        initializeDatabase();
        throw error;
      }
    } catch (error) {
      closeDatabase();
      restoreRollbackData(rollbackPath, databasePath, uploadsPath);
      initializeDatabase();
      throw error;
    } finally {
      cleanupDirectory(stagingPath);
      cleanupDirectory(rollbackPath);
    }

    saveBackupSetting("last_restore_at", new Date().toISOString());
    saveBackupSetting("last_safety_backup_path", safetyBackupPath);
    appendRestoreOperationLog(userDataPath, "completed", {
      safetyBackupPath,
      reason: values.reason,
    });
    logAuditEvent(getDatabase(), {
      action: "backup.restore.completed",
      entityType: "backup",
      summaryAr: "اكتملت استعادة النسخة الاحتياطية",
      summaryEn: "Backup restore completed.",
      metadata: { safetyBackupPath, actorSnapshot },
      reason: values.reason,
      actorOverride: null,
      sessionIdOverride: null,
    });
    clearCurrentSession();

    return { success: true, safetyBackupPath };
  } catch (error) {
    cleanupDirectory(stagingPath);
    cleanupDirectory(rollbackPath);
    const message =
      error instanceof Error
        ? error.message
        : "An unknown error occurred during restore.";
    appendRestoreOperationLog(userDataPath, "failed", {
      error: message,
      reason: values.reason,
    });

    try {
      logAuditEvent(getDatabase(), {
        action: "backup.restore.failed",
        entityType: "backup",
        summaryAr: "فشلت استعادة النسخة الاحتياطية",
        summaryEn: "Backup restore failed.",
        metadata: { error: message },
        reason: values.reason,
      });
    } catch {
      // The database may be closed or mid-restore; external restore log is kept.
    }

    return {
      success: false,
      error: message,
    };
  }
}

export function getBackupStatus(): BackupStatus {
  const userDataPath = getUserDataPath();
  const settings = new Map(
    getDatabase()
      .select()
      .from(appSettings)
      .all()
      .map((row) => [row.key, row.value]),
  );

  return {
    lastBackupAt: settings.get("last_backup_at") ?? null,
    lastBackupPath: settings.get("last_backup_path") ?? null,
    lastRestoreAt: settings.get("last_restore_at") ?? null,
    lastSafetyBackupPath: settings.get("last_safety_backup_path") ?? null,
    databasePath: path.join(userDataPath, "rental_app.db"),
    uploadsPath: path.join(userDataPath, "uploads"),
  };
}

export async function previewBackup(): Promise<BackupPreview> {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: "Select Backup ZIP to Preview",
      filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: "Preview cancelled by user." };
    }

    return readBackupPreview(filePaths[0]!);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Backup preview failed.",
    };
  }
}

export async function verifyBackup(): Promise<BackupVerifyResult> {
  const tempPath = path.join(getUserDataPath(), `.backup-verify-${Date.now()}`);

  try {
    const { filePaths } = await dialog.showOpenDialog({
      title: "Select Backup ZIP to Verify",
      filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
      properties: ["openFile"],
    });

    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: "Verify cancelled by user." };
    }

    const backupFilePath = filePaths[0]!;
    const zip = new AdmZip(backupFilePath);
    const entryNames = zip.getEntries().map((entry) => entry.entryName);
    validateBackupEntries(entryNames);
    extractBackupToStaging(zip, tempPath);

    const databasePath = path.join(tempPath, "rental_app.db");
    const sqlite = new Database(databasePath, { readonly: true });
    try {
      const integrity = sqlite.pragma("integrity_check", { simple: true }) as string;
      for (const tableName of getRequiredBackupTables(sqlite)) {
        sqlite.prepare(`select count(*) as count from ${tableName}`).get();
      }

      return {
        success: integrity === "ok",
        filePath: backupFilePath,
        integrity,
        error: integrity === "ok" ? undefined : "SQLite integrity check failed.",
      };
    } finally {
      sqlite.close();
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Backup verification failed.",
    };
  } finally {
    cleanupDirectory(tempPath);
  }
}

function readBackupPreview(filePath: string): BackupPreview {
  const zip = new AdmZip(filePath);
  const entryNames = zip.getEntries().map((entry) => entry.entryName);

  if (!hasRequiredBackupEntries(entryNames)) {
    throw new Error("Invalid backup file structure: missing metadata.json or rental_app.db.");
  }

  validateBackupEntries(entryNames);
  const metadataEntry = zip.getEntry("metadata.json");
  const metadata = metadataEntry
    ? JSON.parse(metadataEntry.getData().toString("utf8")) as {
        appVersion?: string;
        backupDate?: string;
        backupType?: string;
      }
    : {};

  return {
    success: true,
    filePath,
    appVersion: metadata.appVersion,
    backupDate: metadata.backupDate,
    backupType: metadata.backupType,
    hasUploads: entryNames.some((entryName) =>
      normalizeBackupEntryName(entryName)?.startsWith("uploads/"),
    ),
  };
}

function writeBackupZip(
  filePath: string,
  databasePath: string,
  uploadsPath: string,
  backupType: "manual" | "safety_before_restore",
): void {
  const zip = new AdmZip();
  const metadata = {
    appVersion: app.getVersion(),
    backupDate: new Date().toISOString(),
    backupType,
  };

  zip.addFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));

  if (fs.existsSync(databasePath)) {
    zip.addLocalFile(databasePath);
  }

  if (fs.existsSync(uploadsPath) && fs.readdirSync(uploadsPath).length > 0) {
    zip.addLocalFolder(uploadsPath, "uploads", (fileName) =>
      shouldIncludeBackupUploadPath(uploadsPath, fileName),
    );
  }

  zip.writeZip(filePath);
}

function validateBackupEntries(entryNames: string[]): void {
  for (const entryName of entryNames) {
    if (!isBusinessBackupEntryName(entryName)) {
      throw new Error("Invalid backup file structure: unexpected file found.");
    }
  }
}

function extractBackupToStaging(zip: AdmZip, stagingPath: string): void {
  cleanupDirectory(stagingPath);
  fs.mkdirSync(stagingPath, { recursive: true });

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const normalizedEntryName = normalizeBackupEntryName(entry.entryName);

    if (!normalizedEntryName) {
      continue;
    }

    if (normalizedEntryName === "rental_app.db") {
      writeZipEntryToPath(entry, path.join(stagingPath, "rental_app.db"), stagingPath);
    }

    if (normalizedEntryName.startsWith("uploads/")) {
      writeZipEntryToPath(
        entry,
        path.join(stagingPath, ...normalizedEntryName.split("/")),
        stagingPath,
      );
    }
  }
}

export function shouldIncludeBackupUploadPath(uploadsPath: string, fileName: string): boolean {
  const absolutePath = path.isAbsolute(fileName)
    ? path.resolve(fileName)
    : path.resolve(uploadsPath, fileName);
  const relativePath = path.relative(uploadsPath, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  const entryName = normalizeBackupEntryName(`uploads/${normalizedRelativePath}`);

  return entryName !== null && isBusinessBackupEntryName(entryName);
}

function writeZipEntryToPath(entry: AdmZip.IZipEntry, targetPath: string, rootPath: string): void {
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedRootPath = path.resolve(rootPath);
  const relativeToRoot = path.relative(resolvedRootPath, resolvedTargetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Invalid backup file structure: unsafe restore path.");
  }

  fs.mkdirSync(path.dirname(resolvedTargetPath), { recursive: true });
  fs.writeFileSync(resolvedTargetPath, entry.getData());
}

function copyCurrentDataToRollback(
  databasePath: string,
  uploadsPath: string,
  rollbackPath: string,
): void {
  cleanupDirectory(rollbackPath);
  fs.mkdirSync(rollbackPath, { recursive: true });

  if (fs.existsSync(databasePath)) {
    fs.copyFileSync(databasePath, path.join(rollbackPath, "rental_app.db"));
  }

  if (fs.existsSync(uploadsPath)) {
    fs.cpSync(uploadsPath, path.join(rollbackPath, "uploads"), {
      recursive: true,
    });
  }
}

function replaceCurrentDataFromStaging(
  stagingPath: string,
  databasePath: string,
  uploadsPath: string,
): void {
  removeSqliteSidecars(databasePath);
  fs.copyFileSync(path.join(stagingPath, "rental_app.db"), databasePath);
  cleanupDirectory(uploadsPath);

  const stagedUploadsPath = path.join(stagingPath, "uploads");
  if (fs.existsSync(stagedUploadsPath)) {
    fs.cpSync(stagedUploadsPath, uploadsPath, { recursive: true });
  } else {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
}

function restoreRollbackData(
  rollbackPath: string,
  databasePath: string,
  uploadsPath: string,
): void {
  const rollbackDatabasePath = path.join(rollbackPath, "rental_app.db");
  const rollbackUploadsPath = path.join(rollbackPath, "uploads");

  if (fs.existsSync(rollbackDatabasePath)) {
    removeSqliteSidecars(databasePath);
    fs.copyFileSync(rollbackDatabasePath, databasePath);
  }

  cleanupDirectory(uploadsPath);

  if (fs.existsSync(rollbackUploadsPath)) {
    fs.cpSync(rollbackUploadsPath, uploadsPath, { recursive: true });
  } else {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
}

function cleanupDirectory(directoryPath: string): void {
  if (fs.existsSync(directoryPath)) {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
}

function saveBackupSetting(key: string, value: string): void {
  getDatabase()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value },
    })
    .run();
}

function checkpointDatabase(): void {
  try {
    getSqliteDatabase().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Backup/restore should continue even if the DB has not been opened yet.
  }
}

function removeSqliteSidecars(databasePath: string): void {
  for (const sidecarPath of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (fs.existsSync(sidecarPath)) {
      fs.rmSync(sidecarPath, { force: true });
    }
  }
}

function validateStagedDatabase(databasePath: string): void {
  const sqlite = new Database(databasePath, { readonly: true });

  try {
    const integrity = sqlite.pragma("integrity_check", { simple: true }) as string;

    if (integrity !== "ok") {
      throw new Error("SQLite integrity check failed.");
    }

    const foreignKeyRows = sqlite.pragma("foreign_key_check") as unknown[];

    if (foreignKeyRows.length > 0) {
      throw new Error("SQLite foreign key check failed.");
    }

    for (const tableName of getRequiredBackupTables(sqlite)) {
      sqlite.prepare(`select count(*) as count from ${tableName}`).get();
    }
  } finally {
    sqlite.close();
  }
}

function getRequiredBackupTables(sqlite: Database.Database): string[] {
  const baseTables = [
    "app_settings",
    "vehicles",
    "customers",
    "rentals",
    "payments",
  ];
  const schemaVersionRow = sqlite
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const schemaVersion = Number(schemaVersionRow?.value) || 1;

  if (schemaVersion < 5) {
    return baseTables;
  }

  const accountingTables = [
    ...baseTables,
    "money_locations",
    "expenses",
    "cash_movements",
  ];

  if (schemaVersion < 6) {
    return accountingTables;
  }

  return [
    ...accountingTables,
    "accounting_adjustments",
  ];
}

function appendRestoreOperationLog(
  userDataPath: string,
  status: "completed" | "failed" | "started",
  details: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    occurredAt: new Date().toISOString(),
    status,
    ...details,
  });

  fs.appendFileSync(path.join(userDataPath, "restore_operations.log"), `${line}\n`, "utf8");
}
