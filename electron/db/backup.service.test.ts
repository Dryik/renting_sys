import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getRequiredBackupTablesForVersion,
  shouldIncludeBackupUploadPath,
} from "./backup.service";

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

describe("backup schema table validation", () => {
  it("keeps version 1 validation compatible with the original core schema", () => {
    expect(getRequiredBackupTablesForVersion(1)).toEqual([
      "app_settings",
      "vehicles",
      "customers",
      "rentals",
      "payments",
      "maintenance_records",
    ]);
  });

  it.each([
    [2, "number_sequences"],
    [3, "audit_events"],
    [4, "attachments"],
    [5, "money_locations"],
    [6, "accounting_adjustments"],
    [7, "accounting_adjustments"],
    [8, "vehicle_sales"],
    [9, "employee_loans"],
  ])(
    "requires the tables introduced through schema version %i",
    (schemaVersion, expectedTable) => {
      expect(getRequiredBackupTablesForVersion(schemaVersion)).toContain(
        expectedTable,
      );
    },
  );

  it("requires every table introduced through schema version 9", () => {
    expect(getRequiredBackupTablesForVersion(9)).toEqual(
      expect.arrayContaining([
        "roles",
        "role_permissions",
        "users",
        "audit_events",
        "attachments",
        "app_events",
        "maintenance_reminders",
        "vehicle_mileage_events",
        "number_sequences",
        "money_locations",
        "expenses",
        "cash_movements",
        "daily_closings",
        "accounting_adjustments",
        "vehicle_sales",
        "employee_loans",
        "employee_loan_payments",
        "accessories",
        "rental_accessories",
        "rental_collateral_items",
      ]),
    );
  });
});
