import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const TARGET_APP_VERSION = "0.3.9";
export const TARGET_SCHEMA_VERSION = 11;
export const CONFIRMATION_PHRASE = "CLEAR-V0.3.9-TRANSACTIONS";

export const expectedTables = [
  "accessories",
  "accounting_adjustments",
  "app_events",
  "app_settings",
  "attachments",
  "audit_events",
  "cash_movements",
  "customers",
  "daily_closings",
  "employee_loan_payments",
  "employee_loans",
  "expenses",
  "maintenance_records",
  "maintenance_reminders",
  "money_locations",
  "number_sequences",
  "payments",
  "rental_accessories",
  "rental_collateral_items",
  "rentals",
  "role_permissions",
  "roles",
  "users",
  "vehicle_mileage_events",
  "vehicle_sales",
  "vehicles",
];

export const clearedTables = [
  "accessories",
  "accounting_adjustments",
  "app_events",
  "audit_events",
  "cash_movements",
  "daily_closings",
  "employee_loan_payments",
  "employee_loans",
  "expenses",
  "maintenance_records",
  "maintenance_reminders",
  "number_sequences",
  "payments",
  "rental_accessories",
  "rental_collateral_items",
  "rentals",
  "vehicle_mileage_events",
  "vehicle_sales",
];

const deleteOrder = [
  "rental_accessories",
  "rental_collateral_items",
  "payments",
  "vehicle_mileage_events",
  "maintenance_reminders",
  "maintenance_records",
  "employee_loan_payments",
  "employee_loans",
  "rentals",
  "expenses",
  "cash_movements",
  "daily_closings",
  "accounting_adjustments",
  "vehicle_sales",
  "accessories",
  "app_events",
  "audit_events",
  "number_sequences",
];

const fullyPreservedTables = [
  "app_settings",
  "customers",
  "money_locations",
  "role_permissions",
  "roles",
  "users",
];

const maxArchiveBytes = 4 * 1024 * 1024 * 1024;
const maxEntryBytes = 1024 * 1024 * 1024;
const maxTotalEntryBytes = 8 * 1024 * 1024 * 1024;
const maxEntryCount = 20_000;

export function validateTargetDatabase(database) {
  database.pragma("foreign_keys = ON");

  const integrity = database.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`The source database failed its integrity check (${integrity}).`);
  }

  const foreignKeyProblems = database.pragma("foreign_key_check");
  if (foreignKeyProblems.length > 0) {
    throw new Error("The source database failed its foreign-key check.");
  }

  const actualTables = database
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    )
    .all()
    .map((row) => row.name);

  if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
    throw new Error(
      "This is not the exact released v0.3.9 database layout. Cleanup was refused.",
    );
  }

  const versionRow = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get();
  const schemaVersion = Number(versionRow?.value);

  if (schemaVersion !== TARGET_SCHEMA_VERSION) {
    throw new Error(
      `Expected v0.3.9 schema ${TARGET_SCHEMA_VERSION}, but found ${versionRow?.value ?? "none"}. Cleanup was refused.`,
    );
  }

  return { schemaVersion };
}

export function analyzeDatabase(database) {
  validateTargetDatabase(database);

  const tableCounts = Object.fromEntries(
    expectedTables.map((tableName) => [tableName, countRows(database, tableName)]),
  );
  const preservedAttachments = database
    .prepare("select count(*) as count from attachments where entity_type in ('customer', 'vehicle')")
    .get().count;
  const removedAttachments = tableCounts.attachments - preservedAttachments;
  const vehiclesReset = database
    .prepare("select count(*) as count from vehicles where status = 'rented'")
    .get().count;

  return {
    appVersion: TARGET_APP_VERSION,
    schemaVersion: TARGET_SCHEMA_VERSION,
    customersPreserved: tableCounts.customers,
    vehiclesPreserved: tableCounts.vehicles,
    usersPreserved: tableCounts.users,
    customerVehicleAttachmentsPreserved: preservedAttachments,
    otherAttachmentsRemoved: removedAttachments,
    vehiclesResetToAvailable: vehiclesReset,
    tableCounts,
  };
}

export function cleanDatabase(database) {
  const before = analyzeDatabase(database);
  const preservedSnapshot = snapshotPreservedData(database);
  const removedAttachmentPaths = readAttachmentPaths(
    database,
    "where entity_type not in ('customer', 'vehicle')",
  );
  const preservedAttachmentPaths = new Set(
    readAttachmentPaths(
      database,
      "where entity_type in ('customer', 'vehicle')",
    ),
  );

  const cleanup = database.transaction(() => {
    for (const tableName of deleteOrder) {
      database.prepare(`delete from ${tableName}`).run();
    }

    database
      .prepare("delete from attachments where entity_type not in ('customer', 'vehicle')")
      .run();
    database.prepare("update vehicles set status = 'available' where status = 'rented'").run();

    const sequencePlaceholders = clearedTables.map(() => "?").join(", ");
    database
      .prepare(`delete from sqlite_sequence where name in (${sequencePlaceholders})`)
      .run(...clearedTables);

    assertCleared(database);
    assertPreserved(database, preservedSnapshot);

    const foreignKeyProblems = database.pragma("foreign_key_check");
    if (foreignKeyProblems.length > 0) {
      throw new Error("Cleanup would leave broken database references; all changes were rolled back.");
    }

    const integrity = database.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      throw new Error(
        `Cleanup would fail database integrity (${integrity}); all changes were rolled back.`,
      );
    }
  });

  cleanup();

  const integrity = database.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`The cleaned database failed its integrity check (${integrity}).`);
  }

  const after = analyzeDatabase(database);
  return {
    before,
    after,
    preservedSnapshot,
    removedAttachmentPaths: removedAttachmentPaths.filter(
      (attachmentPath) => !preservedAttachmentPaths.has(attachmentPath),
    ),
  };
}

export function inspectBackupArchive(inputPath) {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput) || !fs.statSync(resolvedInput).isFile()) {
    throw new Error(`Backup file was not found: ${resolvedInput}`);
  }

  if (fs.statSync(resolvedInput).size > maxArchiveBytes) {
    throw new Error("Backup file is too large to inspect safely.");
  }

  const zip = new AdmZip(resolvedInput);
  const entries = zip.getEntries();
  if (entries.length > maxEntryCount) {
    throw new Error("Backup contains too many entries.");
  }

  let totalBytes = 0;
  const normalizedNames = new Set();

  for (const entry of entries) {
    const normalizedName = normalizeArchiveEntryName(entry.entryName);
    if (!normalizedName || !isAllowedBackupEntry(normalizedName)) {
      throw new Error("Backup contains an unsafe or unexpected entry.");
    }

    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Backup contains a duplicate entry (${normalizedName}).`);
    }
    normalizedNames.add(normalizedName);

    const entryBytes = Number(entry.header.size);
    if (!Number.isSafeInteger(entryBytes) || entryBytes < 0 || entryBytes > maxEntryBytes) {
      throw new Error(`Backup entry is too large (${normalizedName}).`);
    }
    totalBytes += entryBytes;
  }

  if (totalBytes > maxTotalEntryBytes) {
    throw new Error("Backup expands beyond the safe extraction limit.");
  }

  if (!normalizedNames.has("metadata.json") || !normalizedNames.has("rental_app.db")) {
    throw new Error("Backup is missing metadata.json or rental_app.db.");
  }

  const metadataEntry = zip.getEntry("metadata.json");
  let metadata;
  try {
    metadata = JSON.parse(metadataEntry.getData().toString("utf8"));
  } catch {
    throw new Error("Backup metadata is unreadable.");
  }

  if (metadata?.appVersion !== TARGET_APP_VERSION) {
    throw new Error(
      `Expected a v${TARGET_APP_VERSION} backup, but metadata reports ${metadata?.appVersion ?? "none"}.`,
    );
  }

  return { inputPath: resolvedInput, metadata, zip };
}

export function dryRunBackupArchive(inputPath) {
  const stagingPath = fs.mkdtempSync(path.join(os.tmpdir(), "arak-cleanup-v039-dry-run-"));

  try {
    const archive = inspectBackupArchive(inputPath);
    extractArchive(archive.zip, stagingPath);
    const database = new Database(path.join(stagingPath, "rental_app.db"), {
      readonly: true,
      fileMustExist: true,
    });

    try {
      return analyzeDatabase(database);
    } finally {
      database.close();
    }
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
}

export function transformBackupArchive(inputPath, outputPath) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);

  if (samePath(resolvedInput, resolvedOutput)) {
    throw new Error("The cleaned backup must have a different filename from the original backup.");
  }
  if (fs.existsSync(resolvedOutput)) {
    throw new Error(`Output already exists; it will not be overwritten: ${resolvedOutput}`);
  }

  const stagingPath = fs.mkdtempSync(path.join(os.tmpdir(), "arak-cleanup-v039-"));
  const verificationPath = fs.mkdtempSync(path.join(os.tmpdir(), "arak-cleanup-v039-verify-"));
  const partialOutput = `${resolvedOutput}.${process.pid}.partial`;
  let cleanupResult;

  try {
    const archive = inspectBackupArchive(resolvedInput);
    extractArchive(archive.zip, stagingPath);
    const databasePath = path.join(stagingPath, "rental_app.db");
    const database = new Database(databasePath, { fileMustExist: true });

    try {
      database.pragma("journal_mode = DELETE");
      cleanupResult = cleanDatabase(database);
    } finally {
      database.close();
    }

    removeClearedAttachmentFiles(stagingPath, cleanupResult.removedAttachmentPaths);
    const cleanedAt = new Date().toISOString();
    const outputMetadata = {
      ...archive.metadata,
      appVersion: TARGET_APP_VERSION,
      backupDate: cleanedAt,
      backupType: "manual",
      cleanup: {
        profile: "customers-and-vehicles-only",
        sourceBackupDate: archive.metadata.backupDate ?? null,
        sourceAppVersion: TARGET_APP_VERSION,
        schemaVersion: TARGET_SCHEMA_VERSION,
        cleanedAt,
      },
    };
    fs.writeFileSync(
      path.join(stagingPath, "metadata.json"),
      JSON.stringify(outputMetadata, null, 2),
      "utf8",
    );

    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    writeArchive(stagingPath, partialOutput);
    verifyCleanedArchive(partialOutput, verificationPath, cleanupResult);
    fs.renameSync(partialOutput, resolvedOutput);

    return {
      ...cleanupResult,
      inputPath: resolvedInput,
      outputPath: resolvedOutput,
    };
  } catch (error) {
    fs.rmSync(partialOutput, { force: true });
    throw error;
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
    fs.rmSync(verificationPath, { recursive: true, force: true });
  }
}

export function createVerifiedInstalledBackup(dataDirectory, backupPath) {
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const resolvedBackupPath = path.resolve(backupPath);
  const databasePath = path.join(resolvedDataDirectory, "rental_app.db");
  const uploadsPath = path.join(resolvedDataDirectory, "uploads");

  assertInstalledPathsSafe(resolvedDataDirectory, resolvedBackupPath);
  if (fs.existsSync(resolvedBackupPath)) {
    throw new Error(`Backup already exists; it will not be overwritten: ${resolvedBackupPath}`);
  }

  const database = new Database(databasePath, { fileMustExist: true });
  let summary;
  try {
    summary = analyzeDatabase(database);
    assertWalCheckpointed(database);
  } finally {
    database.close();
  }

  const partialPath = `${resolvedBackupPath}.${process.pid}.partial`;
  try {
    fs.mkdirSync(path.dirname(resolvedBackupPath), { recursive: true });
    const zip = new AdmZip();
    zip.addFile(
      "metadata.json",
      Buffer.from(
        JSON.stringify(
          {
            appVersion: TARGET_APP_VERSION,
            backupDate: new Date().toISOString(),
            backupType: "manual",
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    zip.addLocalFile(databasePath);
    if (fs.existsSync(uploadsPath) && fs.statSync(uploadsPath).isDirectory()) {
      zip.addLocalFolder(uploadsPath, "uploads");
    }
    zip.writeZip(partialPath);

    const verifiedSummary = dryRunBackupArchive(partialPath);
    if (JSON.stringify(verifiedSummary) !== JSON.stringify(summary)) {
      throw new Error("The safety backup does not match the installed database.");
    }
    fs.renameSync(partialPath, resolvedBackupPath);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  }

  return { backupPath: resolvedBackupPath, summary };
}

export function cleanInstalledData(dataDirectory, backupPath) {
  const resolvedDataDirectory = path.resolve(dataDirectory);
  const resolvedBackupPath = path.resolve(backupPath);
  const databasePath = path.join(resolvedDataDirectory, "rental_app.db");
  const backup = createVerifiedInstalledBackup(
    resolvedDataDirectory,
    resolvedBackupPath,
  );
  let cleanupResult = null;
  let mutationStarted = false;

  try {
    const database = new Database(databasePath, { fileMustExist: true });
    try {
      mutationStarted = true;
      cleanupResult = cleanDatabase(database);
      assertWalCheckpointed(database);
    } finally {
      database.close();
    }

    removeClearedAttachmentFiles(
      resolvedDataDirectory,
      cleanupResult.removedAttachmentPaths,
    );
    verifyInstalledCleanup(databasePath, cleanupResult);

    return {
      ...cleanupResult,
      backupPath: backup.backupPath,
      dataDirectory: resolvedDataDirectory,
    };
  } catch (error) {
    if (mutationStarted) {
      try {
        restoreInstalledDataFromBackup(resolvedDataDirectory, resolvedBackupPath);
      } catch (restoreError) {
        throw new Error(
          `Cleanup failed and automatic recovery also failed. Keep the app closed and restore the safety backup at ${resolvedBackupPath}. Recovery error: ${errorMessage(restoreError)}. Cleanup error: ${errorMessage(error)}`,
        );
      }
    }

    throw new Error(
      `Cleanup failed. The installed data was ${mutationStarted ? "restored" : "not changed"}. Safety backup: ${resolvedBackupPath}. ${errorMessage(error)}`,
    );
  }
}

export function analyzeInstalledData(dataDirectory) {
  const databasePath = path.join(path.resolve(dataDirectory), "rental_app.db");
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return analyzeDatabase(database);
  } finally {
    database.close();
  }
}

export function hasRentalDeskProcess(taskListOutput) {
  return typeof taskListOutput === "string" &&
    taskListOutput.toLocaleLowerCase().includes("arak rental desk.exe");
}

function snapshotPreservedData(database) {
  const snapshot = Object.fromEntries(
    fullyPreservedTables.map((tableName) => [
      tableName,
      hashRows(database.prepare(`select * from ${tableName} order by rowid`).all()),
    ]),
  );
  const vehicles = database
    .prepare("select * from vehicles order by rowid")
    .all()
    .map((vehicle) => ({
      ...vehicle,
      status: vehicle.status === "rented" ? "available" : vehicle.status,
    }));
  snapshot.vehicles = hashRows(vehicles);
  snapshot.attachments = hashRows(
    database
      .prepare(
        "select * from attachments where entity_type in ('customer', 'vehicle') order by rowid",
      )
      .all(),
  );
  return snapshot;
}

function assertPreserved(database, expectedSnapshot) {
  const actualSnapshot = snapshotPreservedData(database);
  for (const [name, expectedHash] of Object.entries(expectedSnapshot)) {
    if (actualSnapshot[name] !== expectedHash) {
      throw new Error(`Cleanup changed preserved ${name} data; all changes were rolled back.`);
    }
  }
}

function assertCleared(database) {
  for (const tableName of clearedTables) {
    if (countRows(database, tableName) !== 0) {
      throw new Error(`Cleanup did not empty ${tableName}; all changes were rolled back.`);
    }
  }

  const otherAttachments = database
    .prepare("select count(*) as count from attachments where entity_type not in ('customer', 'vehicle')")
    .get().count;
  if (otherAttachments !== 0) {
    throw new Error("Cleanup did not remove non-customer/vehicle attachments.");
  }

  const rentedVehicles = database
    .prepare("select count(*) as count from vehicles where status = 'rented'")
    .get().count;
  if (rentedVehicles !== 0) {
    throw new Error("Cleanup did not release all rented vehicles.");
  }
}

function countRows(database, tableName) {
  return database.prepare(`select count(*) as count from ${tableName}`).get().count;
}

function hashRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function readAttachmentPaths(database, whereClause) {
  const rows = database
    .prepare(
      `select stored_relative_path, relative_path, thumbnail_relative_path from attachments ${whereClause}`,
    )
    .all();
  const found = new Set();

  for (const row of rows) {
    const primaryPath = row.relative_path ||
      (row.stored_relative_path ? `uploads/${row.stored_relative_path}` : "");
    for (const candidate of [primaryPath, row.thumbnail_relative_path]) {
      const normalized = normalizeUploadReference(candidate);
      if (normalized) {
        found.add(normalized);
      }
    }
  }

  return [...found];
}

function normalizeUploadReference(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const normalized = normalizeArchiveEntryName(value);
  return normalized?.startsWith("uploads/") ? normalized : null;
}

export function removeClearedAttachmentFiles(stagingPath, attachmentPaths) {
  for (const relativePath of attachmentPaths) {
    const absolutePath = resolveInside(stagingPath, relativePath);
    fs.rmSync(absolutePath, { force: true });
  }
  removeEmptyDirectories(path.join(stagingPath, "uploads"));
}

function verifyInstalledCleanup(databasePath, cleanupResult) {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    validateTargetDatabase(database);
    assertCleared(database);
    assertPreserved(database, snapshotFromCleanupResult(cleanupResult));
  } finally {
    database.close();
  }
}

function restoreInstalledDataFromBackup(dataDirectory, backupPath) {
  const stagingPath = fs.mkdtempSync(path.join(os.tmpdir(), "arak-cleanup-v039-recovery-"));
  const databasePath = path.join(dataDirectory, "rental_app.db");
  const uploadsPath = path.join(dataDirectory, "uploads");

  try {
    const archive = inspectBackupArchive(backupPath);
    extractArchive(archive.zip, stagingPath);
    const stagedDatabasePath = path.join(stagingPath, "rental_app.db");
    const staged = new Database(stagedDatabasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      validateTargetDatabase(staged);
    } finally {
      staged.close();
    }

    removeSqliteSidecars(databasePath);
    fs.copyFileSync(stagedDatabasePath, databasePath);
    fs.rmSync(uploadsPath, { recursive: true, force: true });
    const stagedUploadsPath = path.join(stagingPath, "uploads");
    if (fs.existsSync(stagedUploadsPath)) {
      fs.cpSync(stagedUploadsPath, uploadsPath, { recursive: true });
    } else {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }

    const restored = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      validateTargetDatabase(restored);
    } finally {
      restored.close();
    }
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
}

function assertWalCheckpointed(database) {
  const result = database.pragma("wal_checkpoint(TRUNCATE)");
  const row = Array.isArray(result) ? result[0] : null;
  if (!row || Number(row.busy) !== 0 || Number(row.log) !== Number(row.checkpointed)) {
    throw new Error(
      "The database is busy. Close Rental Desk completely and try again.",
    );
  }
}

function assertInstalledPathsSafe(dataDirectory, backupPath) {
  const databasePath = path.join(dataDirectory, "rental_app.db");
  if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile()) {
    throw new Error(`Rental Desk v0.3.9 data was not found at ${databasePath}.`);
  }

  const relative = path.relative(dataDirectory, backupPath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error("Choose a backup location outside the Rental Desk data folder.");
  }
}

function removeSqliteSidecars(databasePath) {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function removeEmptyDirectories(directoryPath) {
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      removeEmptyDirectories(path.join(directoryPath, entry.name));
    }
  }
  if (fs.readdirSync(directoryPath).length === 0) {
    fs.rmdirSync(directoryPath);
  }
}

function extractArchive(zip, targetPath) {
  for (const entry of zip.getEntries()) {
    const normalizedName = normalizeArchiveEntryName(entry.entryName);
    if (!normalizedName || entry.isDirectory) {
      continue;
    }
    const destination = resolveInside(targetPath, normalizedName);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, entry.getData());
  }
}

function writeArchive(stagingPath, outputPath) {
  const zip = new AdmZip();
  zip.addLocalFile(path.join(stagingPath, "metadata.json"));
  zip.addLocalFile(path.join(stagingPath, "rental_app.db"));
  const uploadsPath = path.join(stagingPath, "uploads");
  if (fs.existsSync(uploadsPath)) {
    zip.addLocalFolder(uploadsPath, "uploads");
  }
  zip.writeZip(outputPath);
}

function verifyCleanedArchive(archivePath, verificationPath, cleanupResult) {
  const archive = inspectBackupArchive(archivePath);
  extractArchive(archive.zip, verificationPath);
  const database = new Database(path.join(verificationPath, "rental_app.db"), {
    readonly: true,
    fileMustExist: true,
  });

  try {
    validateTargetDatabase(database);
    assertCleared(database);
    assertPreserved(database, snapshotFromCleanupResult(cleanupResult));
  } finally {
    database.close();
  }
}

function snapshotFromCleanupResult(cleanupResult) {
  if (!cleanupResult.preservedSnapshot) {
    throw new Error("Cleanup verification snapshot is missing.");
  }
  return cleanupResult.preservedSnapshot;
}

function normalizeArchiveEntryName(entryName) {
  if (typeof entryName !== "string") {
    return null;
  }
  const normalized = entryName.replace(/\\/g, "/").trim().replace(/\/+$/g, "");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    return null;
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return parts.join("/");
}

function isAllowedBackupEntry(entryName) {
  return (
    entryName === "metadata.json" ||
    entryName === "rental_app.db" ||
    entryName === "uploads" ||
    entryName.startsWith("uploads/")
  );
}

function resolveInside(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Backup entry resolves outside the staging directory.");
  }
  return resolved;
}

function samePath(left, right) {
  const normalize = (value) =>
    process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(left) === normalize(right);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--execute" || argument === "--help") {
      parsed[argument.slice(2)] = true;
      continue;
    }
    if (argument === "--input" || argument === "--output" || argument === "--confirm") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      parsed[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

function printSummary(summary) {
  console.log(`Target: Rental Desk v${summary.appVersion}, schema ${summary.schemaVersion}`);
  console.log(`Customers preserved: ${summary.customersPreserved}`);
  console.log(`Vehicles preserved: ${summary.vehiclesPreserved}`);
  console.log(`Login users preserved: ${summary.usersPreserved}`);
  console.log(
    `Customer/vehicle attachments preserved: ${summary.customerVehicleAttachmentsPreserved}`,
  );
  console.log(`Other attachments removed: ${summary.otherAttachmentsRemoved}`);
  console.log(`Rented vehicles reset to available: ${summary.vehiclesResetToAvailable}`);
  console.log("Rows scheduled for removal:");
  for (const tableName of clearedTables) {
    console.log(`  ${tableName}: ${summary.tableCounts[tableName]}`);
  }
}

function printHelp() {
  console.log(`Rental Desk v0.3.9 backup cleanup

Dry run:
  npm run cleanup:v0.3.9 -- --input <backup.zip> --dry-run

Create cleaned backup:
  npm run cleanup:v0.3.9 -- --input <backup.zip> --output <cleaned.zip> --execute --confirm ${CONFIRMATION_PHRASE}

The original backup is never modified.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.input) {
    throw new Error("--input is required.");
  }
  if (Boolean(args["dry-run"]) === Boolean(args.execute)) {
    throw new Error("Choose exactly one mode: --dry-run or --execute.");
  }

  if (args["dry-run"]) {
    printSummary(dryRunBackupArchive(args.input));
    console.log("Dry run only: no files were changed.");
    return;
  }

  if (!args.output) {
    throw new Error("--output is required with --execute.");
  }
  if (args.confirm !== CONFIRMATION_PHRASE) {
    throw new Error(`Execution requires --confirm ${CONFIRMATION_PHRASE}`);
  }

  const result = transformBackupArchive(args.input, args.output);
  printSummary(result.before);
  console.log(`Cleaned and verified backup created: ${result.outputPath}`);
  console.log("The original backup was not modified.");
}

const isMainModule = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runCommandLine().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function runCommandLine() {
  const electronApp = process.versions.electron
    ? (await import("electron")).app
    : null;
  electronApp?.disableHardwareAcceleration();

  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    electronApp?.exit(process.exitCode ?? 0);
  }
}
