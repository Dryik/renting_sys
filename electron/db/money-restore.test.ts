import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const showOpenDialog = vi.fn();
const saveDialog = vi.fn();

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.RENTAL_APP_USER_DATA_DIR ?? ""),
    getVersion: vi.fn(() => "0.4.0-test"),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
    showSaveDialog: (...args: unknown[]) => saveDialog(...args),
  },
}));

vi.mock("../licensing/service", () => ({
  isWriteAccessAllowed: vi.fn(() => true),
  getLicenseStatus: vi.fn(() => ({ canWrite: true })),
}));

const { startTestDatabase, stopTestDatabase } = await import("./database-test-harness");
const { getSqliteDatabase } = await import("./database");
const { runRestore } = await import("./backup.service");
const { moneyColumnPairs } = await import("./money-columns");
const { LATEST_SCHEMA_VERSION } = await import("./migrations");

type TestDatabase = ReturnType<typeof startTestDatabase>;

const fixturesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);
const releasedV11Sql = fs.readFileSync(
  path.join(fixturesPath, "released-v0.3.9-schema-v11.sql"),
  "utf8",
);

let database: TestDatabase;
let userDataPath = "";

const restoreInput = { reason: "Restoring a version 11 backup." };

/**
 * A backup archive holding a genuine version 11 database, as an installation
 * still on 0.3.x would have produced it.
 */
function buildVersion11Archive(): string {
  const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "v11-backup-"));
  const sourceDatabasePath = path.join(sourceDirectory, "rental_app.db");
  const source = new Database(sourceDatabasePath);
  const now = "2026-02-02T00:00:00.000Z";

  try {
    source.exec(releasedV11Sql);
    source
      .prepare(
        `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
         values ('car', 'Toyota', 'Corolla', 'OLD-1', 1.005, 2.675, 'available', ?, ?)`,
      )
      .run(now, now);
    source
      .prepare(
        `insert into customers (full_name, phone, created_at, updated_at)
         values ('Restored Customer', '0921111111', ?, ?)`,
      )
      .run(now, now);
    source
      .prepare(
        `insert into rentals (contract_no, customer_id, vehicle_id, status, start_datetime,
           expected_return_datetime, daily_price, total_amount, paid_amount, remaining_amount, created_at, updated_at)
         values ('CNT-OLD-1', 1, 1, 'returned', ?, ?, 1.005, 12.345, 0.1, 12.245, ?, ?)`,
      )
      .run(now, now, now, now);
    source
      .prepare(
        `insert into payments (rental_id, type, method, amount, payment_date, status, created_at, updated_at)
         values (1, 'rent', 'cash', 0.1, ?, 'posted', ?, ?)`,
      )
      .run(now, now, now);
  } finally {
    source.close();
  }

  const zip = new AdmZip();
  zip.addFile(
    "metadata.json",
    Buffer.from(
      JSON.stringify({
        appVersion: "0.3.9",
        backupDate: now,
        backupType: "manual",
        schemaVersion: 11,
      }),
      "utf8",
    ),
  );
  zip.addLocalFile(sourceDatabasePath);
  zip.addFile("uploads/old-contract.pdf", Buffer.from("old", "utf8"));

  const archivePath = path.join(sourceDirectory, "v11-backup.zip");
  zip.writeZip(archivePath);

  return archivePath;
}

function schemaVersion(): string | undefined {
  const row = getSqliteDatabase()
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;

  return row?.value;
}

beforeEach(() => {
  database = startTestDatabase();
  userDataPath = database.userDataPath;
  showOpenDialog.mockReset();
  saveDialog.mockReset();
});

afterEach(() => {
  stopTestDatabase(database);
});

describe("restoring a version 11 backup", () => {
  it("migrates the restored file to version 12 and converts its amounts", async () => {
    const archivePath = buildVersion11Archive();
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [archivePath] });

    const result = await runRestore(restoreInput);
    expect(result.success).toBe(true);

    // The restore reopens the database, and reopening runs the migration.
    expect(schemaVersion()).toBe(String(LATEST_SCHEMA_VERSION));

    const rental = getSqliteDatabase()
      .prepare(
        `select contract_no as contractNo, total_amount as total, total_amount_minor as totalMinor,
                remaining_amount as remaining, remaining_amount_minor as remainingMinor
         from rentals where id = 1`,
      )
      .get() as Record<string, unknown>;

    expect(rental).toEqual({
      contractNo: "CNT-OLD-1",
      total: 12.345,
      totalMinor: 1235,
      remaining: 12.245,
      remainingMinor: 1225,
    });
  });

  it("keeps the restored uploads alongside the migrated database", async () => {
    const archivePath = buildVersion11Archive();
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [archivePath] });

    await runRestore(restoreInput);

    expect(fs.readdirSync(path.join(userDataPath, "uploads"))).toContain(
      "old-contract.pdf",
    );
  });

  it("gives every restored table its minor columns and mirror triggers", async () => {
    const archivePath = buildVersion11Archive();
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [archivePath] });

    await runRestore(restoreInput);

    const triggers = (
      getSqliteDatabase()
        .prepare("select name from sqlite_master where type = 'trigger'")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    for (const pair of moneyColumnPairs) {
      const columns = (
        getSqliteDatabase()
          .prepare(`pragma table_info(${pair.table})`)
          .all() as Array<{ name: string }>
      ).map((column) => column.name);

      expect(columns).toContain(pair.minorColumn);
      expect(triggers).toContain(`${pair.table}_${pair.minorColumn}_ins_ck`);
      expect(triggers).toContain(`${pair.table}_${pair.minorColumn}_upd_ck`);
    }
  });

  it("writes the pre-restore safety backup before touching live data", async () => {
    const archivePath = buildVersion11Archive();
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [archivePath] });

    const result = await runRestore(restoreInput);

    expect(result.safetyBackupPath).toBeTruthy();
    expect(fs.existsSync(result.safetyBackupPath!)).toBe(true);
  });
});
