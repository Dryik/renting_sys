import AdmZip from "adm-zip";
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
