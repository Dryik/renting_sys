import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertCompressedFileSize,
  assertEntryBudget,
  assertRestorableStructure,
  backupArchiveLimits,
  openBackupArchive,
  writeBackupZip,
  type BackupEntrySize,
} from "./backup-archive";

let workspacePath = "";

function makeWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "backup-archive-test-"));
}

function entry(uncompressedBytes: number, isDirectory = false): BackupEntrySize {
  return { isDirectory, uncompressedBytes };
}

function writeArchive(
  fileName: string,
  build: (zip: AdmZip) => void,
): string {
  const zip = new AdmZip();
  build(zip);
  const filePath = path.join(workspacePath, fileName);
  zip.writeZip(filePath);

  return filePath;
}

function writeValidArchive(fileName = "valid.zip"): string {
  return writeArchive(fileName, (zip) => {
    zip.addFile(
      "metadata.json",
      Buffer.from(
        JSON.stringify({
          appVersion: "0.4.0",
          backupDate: "2026-08-07T10:00:00.000Z",
          backupType: "manual",
        }),
        "utf8",
      ),
    );
    zip.addFile("rental_app.db", Buffer.from("sqlite-bytes", "utf8"));
    zip.addFile("uploads/customer-doc.pdf", Buffer.from("pdf-bytes", "utf8"));
  });
}

beforeEach(() => {
  workspacePath = makeWorkspace();
});

afterEach(() => {
  fs.rmSync(workspacePath, { recursive: true, force: true });
});

describe("archive size limits", () => {
  it("accepts a compressed file at the ceiling and rejects one past it", () => {
    expect(() =>
      assertCompressedFileSize(backupArchiveLimits.maxCompressedFileBytes),
    ).not.toThrow();
    expect(() =>
      assertCompressedFileSize(backupArchiveLimits.maxCompressedFileBytes + 1),
    ).toThrow("Backup file is too large to open safely.");
  });

  it("rejects an archive with too many entries", () => {
    const withinBudget = Array.from({ length: backupArchiveLimits.maxEntryCount }, () =>
      entry(1),
    );
    expect(() => assertEntryBudget(withinBudget)).not.toThrow();

    expect(() => assertEntryBudget([...withinBudget, entry(1)])).toThrow(
      "Backup file contains too many entries.",
    );
  });

  it("rejects a single entry that declares more than the per-entry ceiling", () => {
    expect(() =>
      assertEntryBudget([entry(backupArchiveLimits.maxUncompressedEntryBytes)]),
    ).not.toThrow();

    expect(() =>
      assertEntryBudget([entry(backupArchiveLimits.maxUncompressedEntryBytes + 1)]),
    ).toThrow("Backup file contains an oversized entry.");
  });

  it("rejects an archive whose entries together exceed the total ceiling", () => {
    // Nine entries under the per-entry ceiling still bust the 8 GiB total.
    const bomb = Array.from({ length: 9 }, () =>
      entry(backupArchiveLimits.maxUncompressedEntryBytes),
    );

    expect(() => assertEntryBudget(bomb)).toThrow(
      "Backup file expands to too much data.",
    );
  });

  it("ignores directory entries when totalling declared sizes", () => {
    const withDirectories = [
      entry(backupArchiveLimits.maxTotalUncompressedBytes, true),
      entry(1),
    ];

    expect(() => assertEntryBudget(withDirectories)).not.toThrow();
  });
});

describe("archive inspection", () => {
  it("reads metadata and upload presence from a valid archive", () => {
    const archive = openBackupArchive(writeValidArchive());

    expect(() => assertRestorableStructure(archive)).not.toThrow();
    expect(archive.readMetadata()).toMatchObject({
      appVersion: "0.4.0",
      backupType: "manual",
    });
    expect(archive.hasUploads()).toBe(true);
  });

  it("rejects an archive containing a file outside the business set", () => {
    const filePath = writeArchive("unexpected.zip", (zip) => {
      zip.addFile("metadata.json", Buffer.from("{}", "utf8"));
      zip.addFile("rental_app.db", Buffer.from("db", "utf8"));
      zip.addFile("license.json", Buffer.from("secret", "utf8"));
    });

    expect(() => openBackupArchive(filePath)).toThrow(
      "Invalid backup file structure: unexpected file found.",
    );
  });

  it("rejects a traversal entry name before anything is written", () => {
    const filePath = writeArchive("traversal.zip", (zip) => {
      zip.addFile("metadata.json", Buffer.from("{}", "utf8"));
      zip.addFile("rental_app.db", Buffer.from("db", "utf8"));
      zip.addFile("uploads/../../escape.txt", Buffer.from("escape", "utf8"));
    });

    expect(() => openBackupArchive(filePath)).toThrow(
      "Invalid backup file structure: unexpected file found.",
    );
  });

  it("reports a missing database as an unrestorable structure", () => {
    const filePath = writeArchive("no-db.zip", (zip) => {
      zip.addFile("metadata.json", Buffer.from("{}", "utf8"));
    });

    const archive = openBackupArchive(filePath);

    expect(() => assertRestorableStructure(archive)).toThrow(
      "Invalid backup file structure: missing metadata.json or rental_app.db.",
    );
  });

  it("surfaces unreadable metadata as a structure error", () => {
    const filePath = writeArchive("bad-metadata.zip", (zip) => {
      zip.addFile("metadata.json", Buffer.from("{not json", "utf8"));
      zip.addFile("rental_app.db", Buffer.from("db", "utf8"));
    });

    expect(() => openBackupArchive(filePath).readMetadata()).toThrow(
      "Invalid backup file structure: metadata.json is unreadable.",
    );
  });
});

describe("archive extraction", () => {
  it("extracts the database and uploads into the target directory", () => {
    const archive = openBackupArchive(writeValidArchive());
    const targetPath = path.join(workspacePath, "staging");

    archive.extractTo(targetPath);

    expect(fs.readFileSync(path.join(targetPath, "rental_app.db"), "utf8")).toBe(
      "sqlite-bytes",
    );
    expect(
      fs.readFileSync(path.join(targetPath, "uploads", "customer-doc.pdf"), "utf8"),
    ).toBe("pdf-bytes");
  });

  it("clears a stale target directory before extracting", () => {
    const targetPath = path.join(workspacePath, "staging");
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, "stale.txt"), "stale");

    openBackupArchive(writeValidArchive()).extractTo(targetPath);

    expect(fs.existsSync(path.join(targetPath, "stale.txt"))).toBe(false);
    expect(fs.existsSync(path.join(targetPath, "rental_app.db"))).toBe(true);
  });
});

describe("archive writing", () => {
  it("round-trips a database and uploads while filtering sensitive files", () => {
    const sourcePath = path.join(workspacePath, "source");
    const uploadsPath = path.join(sourcePath, "uploads");
    fs.mkdirSync(uploadsPath, { recursive: true });

    const databasePath = path.join(sourcePath, "rental_app.db");
    fs.writeFileSync(databasePath, "sqlite-bytes");
    fs.writeFileSync(path.join(uploadsPath, "contract.pdf"), "keep");
    fs.writeFileSync(path.join(uploadsPath, "client.private.pem"), "drop");

    const archivePath = path.join(workspacePath, "written.zip");
    writeBackupZip(
      archivePath,
      databasePath,
      uploadsPath,
      "safety_before_migration",
      { sourceSchemaVersion: 11, targetSchemaVersion: 12 },
      "0.4.0",
    );

    const archive = openBackupArchive(archivePath);

    expect(archive.readMetadata()).toMatchObject({
      appVersion: "0.4.0",
      backupType: "safety_before_migration",
      sourceSchemaVersion: 11,
      targetSchemaVersion: 12,
    });
    expect(archive.entryNames).toContain("uploads/contract.pdf");
    expect(archive.entryNames).not.toContain("uploads/client.private.pem");
  });
});
