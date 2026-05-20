import AdmZip from "adm-zip";
import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  hasRequiredBackupEntries,
  isSafeBackupEntryName,
} from "../../src/shared/backup";
import { closeDatabase, initializeDatabase } from "./database";

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

    closeDatabase();

    try {
      writeBackupZip(filePath, databasePath, uploadsPath, "manual");

      return { success: true, filePath };
    } finally {
      initializeDatabase();
    }
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

export async function runRestore(): Promise<RestoreResult> {
  const userDataPath = getUserDataPath();
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");
  const stagingPath = path.join(userDataPath, `.restore-staging-${Date.now()}`);
  const rollbackPath = path.join(userDataPath, `.restore-rollback-${Date.now()}`);

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

      return { success: true, safetyBackupPath };
    } catch (error) {
      restoreRollbackData(rollbackPath, databasePath, uploadsPath);
      throw error;
    } finally {
      cleanupDirectory(stagingPath);
      cleanupDirectory(rollbackPath);
      initializeDatabase();
    }
  } catch (error) {
    cleanupDirectory(stagingPath);
    cleanupDirectory(rollbackPath);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unknown error occurred during restore.",
    };
  }
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
    zip.addLocalFolder(uploadsPath, "uploads");
  }

  zip.writeZip(filePath);
}

function validateBackupEntries(entryNames: string[]): void {
  for (const entryName of entryNames) {
    if (!isSafeBackupEntryName(entryName)) {
      throw new Error("Invalid backup file structure: unsafe file path.");
    }

    if (
      entryName !== "metadata.json" &&
      entryName !== "rental_app.db" &&
      !entryName.startsWith("uploads/")
    ) {
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

    if (entry.entryName === "rental_app.db") {
      zip.extractEntryTo(entry.entryName, stagingPath, false, true);
    }

    if (entry.entryName.startsWith("uploads/")) {
      zip.extractEntryTo(entry.entryName, stagingPath, true, true);
    }
  }
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
