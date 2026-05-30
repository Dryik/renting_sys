import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { DiagnosticsStatus } from "../../src/shared/diagnostics";
import { getSqliteDatabase } from "./database";

function getUserDataPath(): string {
  return process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
}

export function getDiagnosticsStatus(): DiagnosticsStatus {
  const userDataPath = getUserDataPath();
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");
  const sqlite = getSqliteDatabase();
  const tableCounts: Record<string, number> = {};

  for (const tableName of [
    "vehicles",
    "customers",
    "rentals",
    "payments",
    "maintenance_records",
    "attachments",
  ]) {
    tableCounts[tableName] = Number(
      (sqlite.prepare(`select count(*) as count from ${tableName}`).get() as { count: number }).count,
    );
  }

  const integrityCheck = sqlite.pragma("integrity_check", { simple: true }) as string;
  const foreignKeyIssues = sqlite.pragma("foreign_key_check") as unknown[];
  const foreignKeyCheckCount = foreignKeyIssues.length;

  return {
    appVersion: app.getVersion(),
    databasePath,
    uploadsPath,
    databaseSizeBytes: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0,
    uploadsSizeBytes: getDirectorySize(uploadsPath),
    integrityCheck: String(integrityCheck),
    foreignKeyCheckCount,
    tableCounts,
  };
}

function getDirectorySize(directoryPath: string): number {
  if (!fs.existsSync(directoryPath)) {
    return 0;
  }

  return fs.readdirSync(directoryPath).reduce((total, entry) => {
    const filePath = path.join(directoryPath, entry);
    const stats = fs.statSync(filePath);

    return total + (stats.isDirectory() ? getDirectorySize(filePath) : stats.size);
  }, 0);
}
