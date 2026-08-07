import AdmZip from "adm-zip";
import DatabaseConstructor from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  hasRequiredBackupEntries,
  isBusinessBackupEntryName,
  normalizeBackupEntryName,
} from "../../src/shared/backup";

const GIB = 1024 * 1024 * 1024;

// A backup archive is a file the user picks off disk, so it is untrusted input.
// These ceilings bound the work done before anything is decompressed or written,
// which is what keeps a crafted archive from exhausting memory or disk.
export const backupArchiveLimits = {
  maxCompressedFileBytes: 4 * GIB,
  maxEntryCount: 20_000,
  maxUncompressedEntryBytes: 1 * GIB,
  maxTotalUncompressedBytes: 8 * GIB,
} as const;

export type BackupType =
  | "manual"
  | "auto"
  | "safety_before_restore"
  | "safety_before_migration";

export type BackupMetadata = {
  appVersion?: string;
  backupDate?: string;
  backupType?: string;
  // Present only on safety_before_migration archives.
  sourceSchemaVersion?: number;
  targetSchemaVersion?: number;
};

export type BackupArchive = {
  filePath: string;
  entryNames: string[];
  readMetadata: () => BackupMetadata;
  hasUploads: () => boolean;
  extractTo: (targetPath: string) => void;
};

/**
 * Opens a backup archive for inspection, enforcing the size and shape limits
 * before any entry is decompressed. Throws a user-facing message on rejection.
 */
export function openBackupArchive(filePath: string): BackupArchive {
  assertCompressedFileSize(fs.statSync(filePath).size);

  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  assertEntryBudget(toEntrySizes(entries));

  const entryNames = entries.map((entry) => entry.entryName);
  assertBusinessEntryNames(entryNames);

  return {
    filePath,
    entryNames,
    readMetadata: () => readMetadata(zip),
    hasUploads: () =>
      entryNames.some((entryName) =>
        normalizeBackupEntryName(entryName)?.startsWith("uploads/"),
      ),
    extractTo: (targetPath: string) => extractArchiveTo(zip, targetPath),
  };
}

/**
 * Restore and preview additionally require a complete, restorable archive.
 * Verification deliberately does not, so that a partial archive can still be
 * inspected and reported on.
 */
export function assertRestorableStructure(archive: BackupArchive): void {
  if (!hasRequiredBackupEntries(archive.entryNames)) {
    throw new Error(
      "Invalid backup file structure: missing metadata.json or rental_app.db.",
    );
  }
}

export function writeBackupZip(
  filePath: string,
  databasePath: string,
  uploadsPath: string,
  backupType: BackupType,
  extraMetadata: Partial<BackupMetadata> = {},
  appVersion = "",
): void {
  const zip = new AdmZip();
  const metadata: BackupMetadata = {
    appVersion,
    backupDate: new Date().toISOString(),
    backupType,
    ...extraMetadata,
  };

  zip.addFile(
    "metadata.json",
    Buffer.from(JSON.stringify(metadata, null, 2), "utf8"),
  );

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

/** Windows paths are case-insensitive, so compare them case-folded there. */
function normalizeForComparison(target: string): string {
  const resolved = path.resolve(target);

  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInsideDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(
    normalizeForComparison(directory),
    normalizeForComparison(candidate),
  );

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * A backup must never be written on top of the data it is backing up. Writing
 * to rental_app.db, one of its sidecars, or anywhere inside uploads would
 * destroy live data at the moment the user asked to protect it.
 */
export function assertBackupDestinationIsSafe(
  finalPath: string,
  databasePath: string,
  uploadsPath: string,
): void {
  const target = normalizeForComparison(finalPath);
  const protectedFiles = [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ].map(normalizeForComparison);

  if (protectedFiles.includes(target)) {
    throw new Error(
      "A backup cannot be saved over the app's own data file. Choose a different location.",
    );
  }

  if (
    target === normalizeForComparison(uploadsPath) ||
    isInsideDirectory(finalPath, uploadsPath)
  ) {
    throw new Error(
      "A backup cannot be saved inside the app's uploads folder. Choose a location outside it.",
    );
  }
}

export type VerifiedBackupRequest = {
  /** Final destination; the archive only appears here once it is proven good. */
  finalPath: string;
  databasePath: string;
  uploadsPath: string;
  backupType: BackupType;
  appVersion: string;
  extraMetadata?: Partial<BackupMetadata>;
  /** When set, the archived database must record exactly this schema version. */
  expectedSchemaVersion?: number | null;
};

/**
 * Writes an archive to a unique `.partial` name, proves it is restorable, and
 * only then renames it into place. A caller that sees the returned path knows
 * the file at it has been reopened, structurally validated, extracted, and
 * checked for integrity, foreign keys, schema version and upload completeness.
 *
 * Nothing is ever pruned here: retention is the caller's decision and must
 * happen after this returns, so a failed attempt cannot cost an existing good
 * archive.
 */
export function writeVerifiedBackupArchive(request: VerifiedBackupRequest): string {
  // Enforced here, not only at the UI layer, so no caller can route around it.
  assertBackupDestinationIsSafe(
    request.finalPath,
    request.databasePath,
    request.uploadsPath,
  );

  const directory = path.dirname(request.finalPath);
  fs.mkdirSync(directory, { recursive: true });

  const uniqueSuffix = `${process.pid}-${randomUUID()}`;
  const partialPath = `${request.finalPath}.${uniqueSuffix}.partial`;
  const stagingPath = path.join(directory, `.verify-${uniqueSuffix}`);

  try {
    writeBackupZip(
      partialPath,
      request.databasePath,
      request.uploadsPath,
      request.backupType,
      request.extraMetadata ?? {},
      request.appVersion,
    );

    verifyBackupArchive(partialPath, stagingPath, request);
    fs.renameSync(partialPath, request.finalPath);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  } finally {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }

  return request.finalPath;
}

function verifyBackupArchive(
  archivePath: string,
  stagingPath: string,
  request: VerifiedBackupRequest,
): void {
  const archive = openBackupArchive(archivePath);
  assertRestorableStructure(archive);
  assertMetadataUsable(archive.readMetadata(), request);
  assertUploadsRepresented(archive.entryNames, request.uploadsPath);
  archive.extractTo(stagingPath);

  const restoredDatabasePath = path.join(stagingPath, "rental_app.db");

  if (!fs.existsSync(restoredDatabasePath)) {
    throw new Error("The backup did not contain a restorable data file.");
  }

  const restored = new DatabaseConstructor(restoredDatabasePath, { readonly: true });

  try {
    const integrity = restored.pragma("integrity_check", { simple: true }) as string;

    if (integrity !== "ok") {
      throw new Error(`The backup failed its integrity check (${integrity}).`);
    }

    if ((restored.pragma("foreign_key_check") as unknown[]).length > 0) {
      throw new Error("The backup failed its foreign key check.");
    }

    if (request.expectedSchemaVersion != null) {
      const row = restored
        .prepare("select value from app_settings where key = 'schema_version'")
        .get() as { value?: string } | undefined;

      if (Number(row?.value) !== request.expectedSchemaVersion) {
        throw new Error(
          `The backup records schema version ${row?.value ?? "none"} but the data file is at version ${request.expectedSchemaVersion}.`,
        );
      }
    }
  } finally {
    restored.close();
  }
}

/** The metadata must be readable and describe the archive we just asked for. */
function assertMetadataUsable(
  metadata: BackupMetadata,
  request: VerifiedBackupRequest,
): void {
  if (metadata.backupType !== request.backupType) {
    throw new Error(
      `The backup records type "${metadata.backupType ?? "none"}" instead of "${request.backupType}".`,
    );
  }

  if (typeof metadata.backupDate !== "string" || Number.isNaN(Date.parse(metadata.backupDate))) {
    throw new Error("The backup does not record a usable backup date.");
  }

  if (typeof metadata.appVersion !== "string") {
    throw new Error("The backup does not record the app version.");
  }

  for (const field of ["sourceSchemaVersion", "targetSchemaVersion"] as const) {
    const expected = request.extraMetadata?.[field];

    if (expected === undefined) {
      continue;
    }

    if (!Number.isInteger(metadata[field]) || metadata[field] !== expected) {
      throw new Error(
        `The backup records ${field} ${String(metadata[field])} instead of ${String(expected)}.`,
      );
    }
  }
}

/** Every upload eligible for backup must actually be in the archive. */
export function assertUploadsRepresented(
  entryNames: string[],
  uploadsPath: string,
): void {
  if (!fs.existsSync(uploadsPath)) {
    return;
  }

  const archived = new Set(entryNames);

  for (const relativePath of listBackupEligibleUploads(uploadsPath)) {
    if (!archived.has(`uploads/${relativePath}`)) {
      throw new Error(`The backup is missing an uploaded file (${relativePath}).`);
    }
  }
}

export function listBackupEligibleUploads(uploadsPath: string): string[] {
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

export function shouldIncludeBackupUploadPath(
  uploadsPath: string,
  fileName: string,
): boolean {
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

/** One entry's declared sizes, as read from the archive's central directory. */
export type BackupEntrySize = {
  isDirectory: boolean;
  uncompressedBytes: number;
};

/**
 * Split out from archive opening so the multi-gigabyte ceilings can be tested
 * without producing multi-gigabyte fixtures.
 */
export function assertCompressedFileSize(sizeBytes: number): void {
  if (sizeBytes > backupArchiveLimits.maxCompressedFileBytes) {
    throw new Error("Backup file is too large to open safely.");
  }
}

export function assertEntryBudget(entries: BackupEntrySize[]): void {
  if (entries.length > backupArchiveLimits.maxEntryCount) {
    throw new Error("Backup file contains too many entries.");
  }

  let totalUncompressedBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    // The central directory declares the uncompressed size, so an oversized
    // entry is rejected without ever decompressing it.
    if (entry.uncompressedBytes > backupArchiveLimits.maxUncompressedEntryBytes) {
      throw new Error("Backup file contains an oversized entry.");
    }

    totalUncompressedBytes += entry.uncompressedBytes;

    if (totalUncompressedBytes > backupArchiveLimits.maxTotalUncompressedBytes) {
      throw new Error("Backup file expands to too much data.");
    }
  }
}

function toEntrySizes(entries: AdmZip.IZipEntry[]): BackupEntrySize[] {
  return entries.map((entry) => ({
    isDirectory: entry.isDirectory,
    uncompressedBytes: entry.header.size,
  }));
}

function assertBusinessEntryNames(entryNames: string[]): void {
  for (const entryName of entryNames) {
    if (!isBusinessBackupEntryName(entryName)) {
      throw new Error("Invalid backup file structure: unexpected file found.");
    }
  }
}

function readMetadata(zip: AdmZip): BackupMetadata {
  const metadataEntry = zip.getEntry("metadata.json");

  if (!metadataEntry) {
    return {};
  }

  try {
    return JSON.parse(metadataEntry.getData().toString("utf8")) as BackupMetadata;
  } catch {
    throw new Error("Invalid backup file structure: metadata.json is unreadable.");
  }
}

function extractArchiveTo(zip: AdmZip, targetPath: string): void {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.mkdirSync(targetPath, { recursive: true });

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const normalizedEntryName = normalizeBackupEntryName(entry.entryName);

    if (!normalizedEntryName) {
      continue;
    }

    if (normalizedEntryName === "rental_app.db") {
      writeZipEntryToPath(entry, path.join(targetPath, "rental_app.db"), targetPath);
    }

    if (normalizedEntryName.startsWith("uploads/")) {
      writeZipEntryToPath(
        entry,
        path.join(targetPath, ...normalizedEntryName.split("/")),
        targetPath,
      );
    }
  }
}

function writeZipEntryToPath(
  entry: AdmZip.IZipEntry,
  targetPath: string,
  rootPath: string,
): void {
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedRootPath = path.resolve(rootPath);
  const relativeToRoot = path.relative(resolvedRootPath, resolvedTargetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Invalid backup file structure: unsafe restore path.");
  }

  fs.mkdirSync(path.dirname(resolvedTargetPath), { recursive: true });
  fs.writeFileSync(resolvedTargetPath, entry.getData());
}
