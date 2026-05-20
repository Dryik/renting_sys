export function hasRequiredBackupEntries(entryNames: string[]): boolean {
  return (
    entryNames.includes("metadata.json") &&
    entryNames.includes("rental_app.db") &&
    entryNames.every(isSafeBackupEntryName)
  );
}

export function isSafeBackupEntryName(entryName: string): boolean {
  if (entryName.trim() === "") {
    return false;
  }

  if (entryName.includes("..") || entryName.startsWith("/") || entryName.startsWith("\\")) {
    return false;
  }

  return !/^[a-zA-Z]:[\\/]/.test(entryName);
}
