import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { migrateDatabase, type MigrationOutcome } from "./migration-runner";

export type DatabaseState = {
  databasePath: string;
  uploadsPath: string;
};

let sqlite: Database.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;
let lastMigrationOutcome: MigrationOutcome | null = null;

export function initializeDatabase(): DatabaseState {
  const userDataPath = process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });

  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  try {
    lastMigrationOutcome = migrateDatabase(sqlite, {
      userDataPath,
      databasePath,
      uploadsPath,
      appVersion: readAppVersion(),
    });
  } catch (error) {
    // Leave nothing half-open for the caller to trip over: the startup handler
    // reports the failure and quits without opening the renderer.
    sqlite.close();
    sqlite = null;
    db = null;
    throw error;
  }

  db = drizzle(sqlite, { schema });

  return { databasePath, uploadsPath };
}

/** What the most recent initializeDatabase call did, for startup reporting. */
export function getLastMigrationOutcome(): MigrationOutcome | null {
  return lastMigrationOutcome;
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error("Database has not been initialized.");
  }

  return db;
}

export function getSqliteDatabase(): Database.Database {
  if (!sqlite) {
    throw new Error("Database has not been initialized.");
  }

  return sqlite;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}

function readAppVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "";
  }
}
