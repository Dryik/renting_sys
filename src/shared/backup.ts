export const backupExcludedRootFileNames = [
  "license.json",
  "trial.json",
  "trial-issued.json",
] as const;

const sensitiveBackupExtensions = [
  ".private.pem",
  ".private.key",
  ".key",
  ".p8",
  ".p12",
  ".pfx",
  ".map",
] as const;

const sensitiveBackupNameFragments = [
  "private-key",
  "license-key",
  "secret",
  "signing-key",
  "license-marker",
  "licensing-marker",
  "trial-marker",
] as const;

export function hasRequiredBackupEntries(entryNames: string[]): boolean {
  return (
    entryNames.some((entryName) => normalizeBackupEntryName(entryName) === "metadata.json") &&
    entryNames.some((entryName) => normalizeBackupEntryName(entryName) === "rental_app.db") &&
    entryNames.every(isBusinessBackupEntryName)
  );
}

export function normalizeBackupEntryName(entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, "/").trim().replace(/\/+$/g, "");

  if (normalized === "") {
    return null;
  }

  if (normalized.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(normalized)) {
    return null;
  }

  const parts = normalized.split("/");

  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }

  return parts.join("/");
}

export function isSafeBackupEntryName(entryName: string): boolean {
  return normalizeBackupEntryName(entryName) !== null;
}

export function isSensitiveBackupEntryName(entryName: string): boolean {
  const normalized = normalizeBackupEntryName(entryName);

  if (!normalized) {
    return true;
  }

  const parts = normalized.toLowerCase().split("/");
  const fileName = parts[parts.length - 1]!;

  if (backupExcludedRootFileNames.includes(fileName as (typeof backupExcludedRootFileNames)[number])) {
    return true;
  }

  if (sensitiveBackupExtensions.some((extension) => fileName.endsWith(extension))) {
    return true;
  }

  return parts.some((part) =>
    sensitiveBackupNameFragments.some((fragment) => part.includes(fragment)),
  );
}

export function isBusinessBackupEntryName(entryName: string): boolean {
  const normalized = normalizeBackupEntryName(entryName);

  if (!normalized || isSensitiveBackupEntryName(normalized)) {
    return false;
  }

  return (
    normalized === "metadata.json" ||
    normalized === "rental_app.db" ||
    normalized === "uploads" ||
    normalized.startsWith("uploads/")
  );
}

export type BackupStatus = {
  lastBackupAt: string | null;
  lastBackupPath: string | null;
  lastRestoreAt: string | null;
  lastSafetyBackupPath: string | null;
  databasePath: string;
  uploadsPath: string;
};

export type BackupPreview = {
  success: boolean;
  filePath?: string;
  appVersion?: string;
  backupDate?: string;
  backupType?: string;
  hasUploads?: boolean;
  tableCounts?: Record<string, number>;
  error?: string;
};

export type BackupVerifyResult = {
  success: boolean;
  filePath?: string;
  integrity?: string;
  error?: string;
};
