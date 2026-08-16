import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DB_INTEGRATION_TEST_TIMEOUT_MS } from "./test-timeouts";

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
const { closeDatabase, getSqliteDatabase, initializeDatabase } = await import("./database");
const { runBackup, runRestore } = await import("./backup.service");
const { writeVerifiedBackupArchive } = await import("./backup-archive");

type TestDatabase = ReturnType<typeof startTestDatabase>;

let database: TestDatabase;
let userDataPath = "";
let databasePath = "";
let uploadsPath = "";

const restoreInput = { reason: "Restoring a verified backup." };

function liveUploadNames(): string[] {
  if (!fs.existsSync(uploadsPath)) {
    return [];
  }

  return fs.readdirSync(uploadsPath).sort();
}

function ownerUsernames(): string[] {
  return (
    getSqliteDatabase()
      .prepare("select username from users order by username")
      .all() as Array<{ username: string }>
  ).map((row) => row.username);
}

function customerNames(): string[] {
  return (
    getSqliteDatabase()
      .prepare("select full_name from customers order by full_name")
      .all() as Array<{ full_name: string }>
  ).map((row) => row.full_name);
}

/**
 * Builds a restorable archive from a copy of the live database, with a marker
 * row so a successful restore is distinguishable from a no-op.
 */
function buildIncomingArchive(markerName: string): string {
  const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "restore-source-"));
  const sourceDatabasePath = path.join(sourceDirectory, "rental_app.db");

  closeDatabase();
  fs.copyFileSync(databasePath, sourceDatabasePath);
  initializeDatabase();

  const source = new Database(sourceDatabasePath);
  const now = new Date().toISOString();
  source
    .prepare(
      "insert into customers (full_name, phone, created_at, updated_at) values (?, '0910000000', ?, ?)",
    )
    .run(markerName, now, now);
  source.close();

  const zip = new AdmZip();
  zip.addFile(
    "metadata.json",
    Buffer.from(
      JSON.stringify({
        appVersion: "0.4.0-test",
        backupDate: now,
        backupType: "manual",
      }),
      "utf8",
    ),
  );
  zip.addLocalFile(sourceDatabasePath);
  zip.addFile("uploads/incoming.pdf", Buffer.from("incoming", "utf8"));

  const archivePath = path.join(sourceDirectory, "incoming.zip");
  zip.writeZip(archivePath);

  return archivePath;
}

function seedLiveUploads(): void {
  fs.mkdirSync(uploadsPath, { recursive: true });
  fs.writeFileSync(path.join(uploadsPath, "live-one.pdf"), "live-one");
  fs.writeFileSync(path.join(uploadsPath, "live-two.pdf"), "live-two");
}

beforeEach(() => {
  database = startTestDatabase();
  userDataPath = database.userDataPath;
  databasePath = path.join(userDataPath, "rental_app.db");
  uploadsPath = path.join(userDataPath, "uploads");
  showOpenDialog.mockReset();
  saveDialog.mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  stopTestDatabase(database);
});

describe("a successful restore", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("replaces the database and uploads with the archive contents", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Restored Marker");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(true);
    expect(result.safetyBackupPath).toBeTruthy();
    expect(fs.existsSync(result.safetyBackupPath!)).toBe(true);

    expect(customerNames()).toContain("Restored Marker");
    expect(liveUploadNames()).toEqual(["incoming.pdf"]);
  });

  it("leaves no rollback or staging directories behind", async () => {
    const archivePath = buildIncomingArchive("Restored Marker");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    await runRestore(restoreInput);

    const leftovers = fs
      .readdirSync(userDataPath)
      .filter((name) => name.startsWith(".restore-"));
    expect(leftovers).toEqual([]);
  });
});

describe(
  "failures before live data is touched",
  { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS },
  () => {
  it("keeps the database and uploads when the safety archive cannot be written", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    // The safety archive is the first thing written; make its verification
    // impossible by making the rename step fail.
    const realRename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).includes("safety_backup_before_restore")) {
        throw new Error("injected safety archive failure");
      }

      return realRename(from, to);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/injected safety archive failure/);
    expect(customerNames()).not.toContain("Should Not Appear");
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("keeps live data when the rollback database copy fails", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const realCopy = fs.copyFileSync;
    vi.spyOn(fs, "copyFileSync").mockImplementation((from, to, mode) => {
      if (String(to).includes(".restore-rollback-")) {
        throw new Error("injected rollback database copy failure");
      }

      return realCopy(from, to, mode);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/injected rollback database copy failure/);
    expect(customerNames()).not.toContain("Should Not Appear");
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("keeps live data when the rollback uploads copy fails", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const realCp = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      if (String(to).includes(".restore-rollback-")) {
        throw new Error("injected rollback uploads copy failure");
      }

      return realCp(from, to, options);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/injected rollback uploads copy failure/);
    expect(customerNames()).not.toContain("Should Not Appear");
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });
  },
);

describe(
  "failures after replacement has started",
  { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS },
  () => {
  it("restores the original database and uploads when the uploads copy fails", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const realCp = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      // Fail only the replacement copy, which comes from staging. The rollback
      // copy comes from the snapshot directory and must be allowed through, or
      // this would test rollback failure instead of replacement failure.
      if (
        path.resolve(String(to)) === path.resolve(uploadsPath) &&
        String(from).includes(".restore-staging-")
      ) {
        throw new Error("injected replacement uploads failure");
      }

      return realCp(from, to, options);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/injected replacement uploads failure/);
    expect(customerNames()).not.toContain("Should Not Appear");
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("restores the original when the replaced database fails to initialize", async () => {
    seedLiveUploads();
    // A database recorded at an impossible schema version passes the staged
    // checks but is rejected when the app tries to open it.
    const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "restore-bad-"));
    const sourceDatabasePath = path.join(sourceDirectory, "rental_app.db");
    closeDatabase();
    fs.copyFileSync(databasePath, sourceDatabasePath);
    initializeDatabase();

    const source = new Database(sourceDatabasePath);
    source
      .prepare("update app_settings set value = '999' where key = 'schema_version'")
      .run();
    source.close();

    const zip = new AdmZip();
    zip.addFile(
      "metadata.json",
      Buffer.from(JSON.stringify({ backupType: "manual" }), "utf8"),
    );
    zip.addLocalFile(sourceDatabasePath);
    const archivePath = path.join(sourceDirectory, "bad.zip");
    zip.writeZip(archivePath);

    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/newer version of the app/);
    // The original database is back, open, and still holds its owner account.
    expect(ownerUsernames()).toEqual(["owner"]);
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("preserves both artifacts when the rollback copies succeed but reopening fails", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const realCp = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      if (
        path.resolve(String(to)) === path.resolve(uploadsPath) &&
        String(from).includes(".restore-staging-")
      ) {
        throw new Error("injected replacement uploads failure");
      }

      return realCp(from, to, options);
    });

    // The rollback copies run cleanly; only reopening the restored database
    // fails. Rollback is not complete until that reopen succeeds, so both
    // artifacts must survive.
    const realCopyFile = fs.copyFileSync;
    let rollbackDatabaseRestored = false;
    vi.spyOn(fs, "copyFileSync").mockImplementation((from, to, mode) => {
      const result = realCopyFile(from, to, mode);

      if (String(from).includes(".restore-rollback-")) {
        rollbackDatabaseRestored = true;
        // Corrupt the database only after the rollback copy has completed, so
        // the copy itself is genuinely successful and the reopen is what fails.
        fs.writeFileSync(String(to), "not a database");
      }

      return result;
    });

    const result = await runRestore(restoreInput);

    expect(rollbackDatabaseRestored).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rollback could not complete/);
    expect(result.error).toMatch(/safety_backup_before_restore/);
    expect(result.error).toMatch(/\.restore-rollback-/);

    const rollbackDirectories = fs
      .readdirSync(userDataPath)
      .filter((name) => name.startsWith(".restore-rollback-"));
    expect(rollbackDirectories).toHaveLength(1);

    const safetyArchives = fs
      .readdirSync(userDataPath)
      .filter((name) => name.startsWith("safety_backup_before_restore"));
    expect(safetyArchives).toHaveLength(1);
  });

  it("preserves both recovery artifacts and names them when rollback itself fails", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    const realCp = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      if (path.resolve(String(to)) === path.resolve(uploadsPath)) {
        throw new Error("injected replacement uploads failure");
      }

      return realCp(from, to, options);
    });

    // Corrupt the rollback snapshot's manifest the moment it is written, so the
    // rollback attempt itself fails.
    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation((target, data, options) => {
      if (String(target).endsWith("rollback-manifest.json")) {
        return realWrite(target, "{ this is not json", options);
      }

      return realWrite(target, data as never, options as never);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rollback could not complete/);
    expect(result.error).toMatch(/safety_backup_before_restore/);
    expect(result.error).toMatch(/\.restore-rollback-/);

    // Both artifacts survive for manual recovery.
    const rollbackDirectories = fs
      .readdirSync(userDataPath)
      .filter((name) => name.startsWith(".restore-rollback-"));
    expect(rollbackDirectories).toHaveLength(1);
  });
  },
);

describe(
  "the WAL checkpoint gates backup creation",
  { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS },
  () => {
  function stubCheckpoint(result: unknown): void {
    const live = getSqliteDatabase();
    const realPragma = live.pragma.bind(live);
    vi.spyOn(live, "pragma").mockImplementation(((source: string, options?: unknown) => {
      if (String(source).includes("wal_checkpoint")) {
        if (result instanceof Error) {
          throw result;
        }

        return result;
      }

      return realPragma(source, options as never);
    }) as never);
  }

  it.each([
    ["busy", [{ busy: 1, log: 2, checkpointed: 2 }]],
    ["partial", [{ busy: 0, log: 10, checkpointed: 3 }]],
    ["malformed", undefined],
    ["throwing", new Error("disk I/O error")],
  ])("writes no final archive when the checkpoint is %s", async (_label, result) => {
    seedLiveUploads();
    const destination = path.join(userDataPath, "manual-backup.zip");
    saveDialog.mockResolvedValue({ filePath: destination });
    stubCheckpoint(result);

    const outcome = await runBackup();

    expect(outcome.success).toBe(false);
    expect(fs.existsSync(destination)).toBe(false);
    // No partially written artefact is left next to it either.
    expect(
      fs.readdirSync(userDataPath).filter((name) => name.includes("partial")),
    ).toEqual([]);
    // Live data is untouched.
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("writes a verified archive when the checkpoint is clean", async () => {
    seedLiveUploads();
    const destination = path.join(userDataPath, "manual-backup.zip");
    saveDialog.mockResolvedValue({ filePath: destination });

    const outcome = await runBackup();

    expect(outcome.success).toBe(true);
    expect(fs.existsSync(destination)).toBe(true);
    expect(
      fs.readdirSync(userDataPath).filter((name) => name.includes("partial")),
    ).toEqual([]);
  });
  },
);

describe(
  "backup destinations are protected",
  { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS },
  () => {
  function liveDatabaseIsUsable(): boolean {
    return ownerUsernames().length === 1;
  }

  it("refuses to write over the live database and leaves it open and intact", async () => {
    saveDialog.mockResolvedValue({ filePath: databasePath });
    const bytesBefore = fs.readFileSync(databasePath).length;

    const outcome = await runBackup();

    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/cannot be saved over the app's own data file/);
    // Still open, still valid, still the same file.
    expect(liveDatabaseIsUsable()).toBe(true);
    expect(getSqliteDatabase().pragma("integrity_check", { simple: true })).toBe("ok");
    expect(fs.readFileSync(databasePath).length).toBe(bytesBefore);
  });

  it.each(["-wal", "-shm", "-journal"])(
    "refuses to write over the %s sidecar",
    async (suffix) => {
      saveDialog.mockResolvedValue({ filePath: `${databasePath}${suffix}` });

      const outcome = await runBackup();

      expect(outcome.success).toBe(false);
      expect(outcome.error).toMatch(/cannot be saved over the app's own data file/);
      expect(liveDatabaseIsUsable()).toBe(true);
    },
  );

  it("refuses to overwrite an existing upload and leaves its bytes unchanged", async () => {
    seedLiveUploads();
    const uploadPath = path.join(uploadsPath, "live-one.pdf");
    saveDialog.mockResolvedValue({ filePath: uploadPath });

    const outcome = await runBackup();

    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/inside the app's uploads folder/);
    expect(fs.readFileSync(uploadPath, "utf8")).toBe("live-one");
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("refuses a nested path inside uploads", async () => {
    seedLiveUploads();
    saveDialog.mockResolvedValue({
      filePath: path.join(uploadsPath, "nested", "deep", "backup.zip"),
    });

    const outcome = await runBackup();

    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/inside the app's uploads folder/);
    expect(liveUploadNames()).toEqual(["live-one.pdf", "live-two.pdf"]);
  });

  it("still accepts a normal destination outside the data directory", async () => {
    seedLiveUploads();
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "external-"));
    const destination = path.join(externalDirectory, "shop-backup.zip");
    saveDialog.mockResolvedValue({ filePath: destination });

    const outcome = await runBackup();

    expect(outcome.success).toBe(true);
    expect(fs.existsSync(destination)).toBe(true);
    fs.rmSync(externalDirectory, { recursive: true, force: true });
  });

  it("is enforced inside the writer itself, not only by the service", () => {
    expect(() =>
      writeVerifiedBackupArchive({
        finalPath: databasePath,
        databasePath,
        uploadsPath,
        backupType: "manual",
        appVersion: "0.4.0-test",
      }),
    ).toThrow(/cannot be saved over the app's own data file/);
  });
  },
);

describe(
  "the rollback snapshot is never trusted blindly",
  { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS },
  () => {
  it("refuses to clear live uploads when the snapshot has no manifest", async () => {
    seedLiveUploads();
    const archivePath = buildIncomingArchive("Should Not Appear");
    showOpenDialog.mockResolvedValue({ filePaths: [archivePath] });

    // Delete the manifest as soon as it is written: the snapshot then looks
    // present but is unverifiable, which previously read as "the original had
    // no uploads" and silently destroyed them.
    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation((target, data, options) => {
      const result = realWrite(target, data as never, options as never);

      if (String(target).endsWith("rollback-manifest.json")) {
        fs.rmSync(String(target), { force: true });
      }

      return result;
    });

    const realCp = fs.cpSync;
    vi.spyOn(fs, "cpSync").mockImplementation((from, to, options) => {
      if (path.resolve(String(to)) === path.resolve(uploadsPath)) {
        throw new Error("injected replacement uploads failure");
      }

      return realCp(from, to, options);
    });

    const result = await runRestore(restoreInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/manifest is missing/);

    // The live uploads directory was cleared by the replacement step, but the
    // rollback refused to run, so the snapshot is preserved for recovery
    // rather than the data being silently replaced with an empty folder.
    const rollbackDirectories = fs
      .readdirSync(userDataPath)
      .filter((name) => name.startsWith(".restore-rollback-"));
    expect(rollbackDirectories).toHaveLength(1);

    const preservedUploads = fs
      .readdirSync(path.join(userDataPath, rollbackDirectories[0]!, "uploads"))
      .sort();
    expect(preservedUploads).toEqual(["live-one.pdf", "live-two.pdf"]);
  });
  },
);
