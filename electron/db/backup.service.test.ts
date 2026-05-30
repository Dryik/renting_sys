import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { shouldIncludeBackupUploadPath } from "./backup.service";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\temp\\rental-test"),
    getVersion: vi.fn(() => "0.1.0-test"),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
}));

describe("backup upload export filter", () => {
  it("excludes sensitive files recursively while allowing normal business attachments", () => {
    const uploadsPath = path.resolve("C:\\temp\\rental-test\\uploads");

    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "customer-doc.pdf"))).toBe(true);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "license.json"))).toBe(false);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "trial.json"))).toBe(false);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "trial-issued.json"))).toBe(false);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "client.private.pem"))).toBe(false);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "file.map"))).toBe(false);
    expect(shouldIncludeBackupUploadPath(uploadsPath, path.join(uploadsPath, "secret", "note.txt"))).toBe(false);
  });
});
