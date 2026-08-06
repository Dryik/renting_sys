import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const userDataPath = path.join(os.tmpdir(), "rental-settings-service-test");
const uploadsPath = path.join(userDataPath, "uploads");

const settingsRows = [
  { key: "shop_name", value: "Test Shop" },
  { key: "app_language", value: "ar" },
  { key: "default_currency", value: "LYD" },
  { key: "shop_logo_path", value: "logo.png" },
  { key: "owner_signature_path", value: "signature.png" },
  { key: "scheduled_backup_folder", value: "D:\\backups\\rental" },
];

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

vi.mock("./database", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        all: () => settingsRows,
      }),
    }),
  }),
}));

const currentUserCan = vi.fn();

vi.mock("./auth.service", () => ({
  currentUserCan: (permission: string) => currentUserCan(permission),
  requirePermissionForCurrentSession: vi.fn(),
}));

vi.mock("./audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("./security.service", () => ({ requireSensitiveApproval: vi.fn() }));

const { getShopSettings, getShopSettingsForRenderer } = await import("./settings.service");

describe("settings exposed over the unauthenticated settings:get channel", () => {
  beforeAll(() => {
    // The stored paths only resolve when the files are really on disk.
    fs.mkdirSync(uploadsPath, { recursive: true });
    fs.writeFileSync(path.join(uploadsPath, "logo.png"), "logo-bytes");
    fs.writeFileSync(path.join(uploadsPath, "signature.png"), "signature-bytes");
  });

  beforeEach(() => {
    currentUserCan.mockReset();
  });

  it("withholds the owner signature and local paths from callers without settings.view", () => {
    currentUserCan.mockReturnValue(false);

    const settings = getShopSettingsForRenderer();

    expect(settings.ownerSignatureDataUrl).toBeNull();
    expect(settings.ownerSignaturePath).toBeNull();
    expect(settings.shopLogoPath).toBeNull();
    expect(settings.scheduledBackupFolder).toBeNull();
  });

  it("still serves the branding the login and lock screens need", () => {
    currentUserCan.mockReturnValue(false);

    const settings = getShopSettingsForRenderer();

    expect(settings.shopName).toBe("Test Shop");
    expect(settings.language).toBe("ar");
    expect(settings.defaultCurrency).toBe("LYD");
    // The sidebar logo renders for every signed-in user, so it is not withheld.
    expect(settings.shopLogoDataUrl).toContain("data:image/png;base64,");
  });

  it("returns the administrative fields to a caller holding settings.view", () => {
    currentUserCan.mockReturnValue(true);

    const settings = getShopSettingsForRenderer();

    expect(currentUserCan).toHaveBeenCalledWith("settings.view");
    expect(settings.ownerSignatureDataUrl).toContain("data:image/png;base64,");
    expect(settings.ownerSignaturePath).toBe(path.join(uploadsPath, "signature.png"));
    expect(settings.shopLogoPath).toBe(path.join(uploadsPath, "logo.png"));
    expect(settings.scheduledBackupFolder).toBe("D:\\backups\\rental");
  });

  it("leaves the in-process accessor unredacted for printing and reports", () => {
    currentUserCan.mockReturnValue(false);

    const settings = getShopSettings();

    expect(settings.ownerSignatureDataUrl).toContain("data:image/png;base64,");
    expect(settings.ownerSignaturePath).toBe(path.join(uploadsPath, "signature.png"));
    expect(settings.scheduledBackupFolder).toBe("D:\\backups\\rental");
    expect(currentUserCan).not.toHaveBeenCalled();
  });
});
