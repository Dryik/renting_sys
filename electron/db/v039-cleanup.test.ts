import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanInstalledData,
  cleanDatabase,
  clearedTables,
  dryRunBackupArchive,
  hasRentalDeskProcess,
  transformBackupArchive,
} from "../../scripts/cleanup-v0.3.9.mjs";

const releasedV039Schema = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "__fixtures__",
    "released-v0.3.9-schema-v11.sql",
  ),
  "utf8",
);
const now = "2026-08-15T12:00:00.000Z";

describe("v0.3.9 customer-and-vehicle cleanup", () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "rental-v039-cleanup-test-"));
  });

  afterEach(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it("creates a restorable clean backup while preserving customers, vehicles, and their files", () => {
    const inputPath = createBackupArchive(workspacePath);
    const outputPath = path.join(workspacePath, "cleaned.zip");
    const originalHash = fileHash(inputPath);

    const preview = dryRunBackupArchive(inputPath);
    expect(preview).toMatchObject({
      customersPreserved: 2,
      vehiclesPreserved: 4,
      usersPreserved: 1,
      customerVehicleAttachmentsPreserved: 2,
      otherAttachmentsRemoved: 2,
      vehiclesResetToAvailable: 1,
    });

    const result = transformBackupArchive(inputPath, outputPath);
    expect(result.outputPath).toBe(outputPath);
    expect(fileHash(inputPath)).toBe(originalHash);

    const extractedPath = path.join(workspacePath, "extracted");
    new AdmZip(outputPath).extractAllTo(extractedPath);
    const database = new Database(path.join(extractedPath, "rental_app.db"), {
      readonly: true,
    });

    try {
      for (const tableName of clearedTables) {
        expect(countRows(database, tableName), tableName).toBe(0);
      }

      expect(countRows(database, "customers")).toBe(2);
      expect(countRows(database, "vehicles")).toBe(4);
      expect(countRows(database, "users")).toBe(1);
      expect(countRows(database, "roles")).toBe(1);
      expect(countRows(database, "role_permissions")).toBe(1);
      expect(countRows(database, "money_locations")).toBe(3);
      expect(countRows(database, "app_settings")).toBe(1);
      expect(
        database
          .prepare("select entity_type from attachments order by id")
          .all()
          .map((row) => (row as { entity_type: string }).entity_type),
      ).toEqual(["customer", "vehicle"]);
      expect(
        database
          .prepare("select plate_number, status from vehicles order by id")
          .all(),
      ).toEqual([
        { plate_number: "V-001", status: "available" },
        { plate_number: "V-002", status: "maintenance" },
        { plate_number: "V-003", status: "inactive" },
        { plate_number: "V-004", status: "available" },
      ]);
      expect(database.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }

    expect(
      fs.existsSync(path.join(extractedPath, "uploads", "customers", "1", "customer.jpg")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(extractedPath, "uploads", "vehicles", "1", "vehicle.jpg")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(extractedPath, "uploads", "rentals", "1", "contract.pdf")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(extractedPath, "uploads", "maintenance", "1", "invoice.pdf")),
    ).toBe(false);

    const metadata = JSON.parse(
      fs.readFileSync(path.join(extractedPath, "metadata.json"), "utf8"),
    ) as { appVersion: string; cleanup?: { profile?: string; schemaVersion?: number } };
    expect(metadata).toMatchObject({
      appVersion: "0.3.9",
      cleanup: { profile: "customers-and-vehicles-only", schemaVersion: 11 },
    });
  });

  it("rolls back every database change when any deletion fails", () => {
    const databasePath = createSeededDatabase(workspacePath);
    const database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.exec(`
      create trigger reject_payment_cleanup
      before delete on payments
      begin
        select raise(abort, 'simulated cleanup failure');
      end;
    `);

    try {
      expect(() => cleanDatabase(database)).toThrow("simulated cleanup failure");
      expect(countRows(database, "rentals")).toBe(1);
      expect(countRows(database, "rental_accessories")).toBe(1);
      expect(countRows(database, "payments")).toBe(1);
      expect(countRows(database, "customers")).toBe(2);
      expect(countRows(database, "vehicles")).toBe(4);
      expect(
        database.prepare("select status from vehicles where id = 1").get(),
      ).toEqual({ status: "rented" });
    } finally {
      database.close();
    }
  });

  it("backs up and cleans an installed v0.3.9 data directory in one operation", () => {
    const dataDirectory = path.join(workspacePath, "installed-data");
    const databasePath = createSeededDatabase(dataDirectory);
    writeUpload(dataDirectory, "customers/1/customer.jpg", "customer-photo");
    writeUpload(dataDirectory, "vehicles/1/vehicle.jpg", "vehicle-photo");
    writeUpload(dataDirectory, "rentals/1/contract.pdf", "rental-contract");
    writeUpload(dataDirectory, "maintenance/1/invoice.pdf", "maintenance-invoice");
    const backupPath = path.join(workspacePath, "automatic-safety-backup.zip");

    const result = cleanInstalledData(dataDirectory, backupPath);
    expect(result.backupPath).toBe(backupPath);
    expect(fs.existsSync(backupPath)).toBe(true);

    const cleaned = new Database(databasePath, { readonly: true });
    try {
      expect(countRows(cleaned, "customers")).toBe(2);
      expect(countRows(cleaned, "vehicles")).toBe(4);
      expect(countRows(cleaned, "rentals")).toBe(0);
      expect(cleaned.prepare("select status from vehicles where id = 1").get()).toEqual({
        status: "available",
      });
      expect(cleaned.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(cleaned.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      cleaned.close();
    }

    const backupPreview = dryRunBackupArchive(backupPath);
    expect(backupPreview.tableCounts.rentals).toBe(1);
    expect(backupPreview.customersPreserved).toBe(2);
    expect(backupPreview.vehiclesPreserved).toBe(4);
    expect(
      fs.existsSync(path.join(dataDirectory, "uploads", "customers", "1", "customer.jpg")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(dataDirectory, "uploads", "vehicles", "1", "vehicle.jpg")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(dataDirectory, "uploads", "rentals", "1", "contract.pdf")),
    ).toBe(false);
  });

  it("automatically restores the verified backup when installed cleanup fails", () => {
    const dataDirectory = path.join(workspacePath, "installed-rollback");
    const databasePath = createSeededDatabase(dataDirectory);
    const database = new Database(databasePath);
    database.exec(`
      create trigger reject_installed_cleanup
      before delete on payments
      begin
        select raise(abort, 'simulated installed cleanup failure');
      end;
    `);
    database.close();
    const backupPath = path.join(workspacePath, "rollback-safety-backup.zip");

    expect(() => cleanInstalledData(dataDirectory, backupPath)).toThrow(
      "The installed data was restored",
    );
    expect(fs.existsSync(backupPath)).toBe(true);

    const restored = new Database(databasePath, { readonly: true });
    try {
      expect(countRows(restored, "rentals")).toBe(1);
      expect(countRows(restored, "payments")).toBe(1);
      expect(restored.prepare("select status from vehicles where id = 1").get()).toEqual({
        status: "rented",
      });
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(restored.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      restored.close();
    }
  });

  it("recognizes the installed Rental Desk process from tasklist output", () => {
    expect(hasRentalDeskProcess('"ARAK Rental Desk.exe","1024","Console","1","90,000 K"')).toBe(true);
    expect(hasRentalDeskProcess("INFO: No tasks are running which match the specified criteria.")).toBe(false);
  });

  it("refuses a backup not produced by v0.3.9", () => {
    const inputPath = createBackupArchive(workspacePath, { appVersion: "0.4.0" });
    expect(() => dryRunBackupArchive(inputPath)).toThrow(
      "Expected a v0.3.9 backup, but metadata reports 0.4.0",
    );
  });

  it("refuses a database that does not record schema version 11", () => {
    const inputPath = createBackupArchive(workspacePath, { schemaVersion: 12 });
    expect(() => dryRunBackupArchive(inputPath)).toThrow(
      "Expected v0.3.9 schema 11, but found 12",
    );
  });
});

function createBackupArchive(
  workspacePath: string,
  options: { appVersion?: string; schemaVersion?: number } = {},
): string {
  const sourcePath = path.join(workspacePath, `source-${options.appVersion ?? "0.3.9"}`);
  fs.mkdirSync(sourcePath, { recursive: true });
  const databasePath = createSeededDatabase(sourcePath, options.schemaVersion);
  writeUpload(sourcePath, "customers/1/customer.jpg", "customer-photo");
  writeUpload(sourcePath, "vehicles/1/vehicle.jpg", "vehicle-photo");
  writeUpload(sourcePath, "rentals/1/contract.pdf", "rental-contract");
  writeUpload(sourcePath, "maintenance/1/invoice.pdf", "maintenance-invoice");

  const metadata = {
    appVersion: options.appVersion ?? "0.3.9",
    backupDate: now,
    backupType: "manual",
  };
  fs.writeFileSync(
    path.join(sourcePath, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );

  const archivePath = path.join(workspacePath, `backup-${options.appVersion ?? "0.3.9"}-${options.schemaVersion ?? 11}.zip`);
  const zip = new AdmZip();
  zip.addLocalFile(path.join(sourcePath, "metadata.json"));
  zip.addLocalFile(databasePath);
  zip.addLocalFolder(path.join(sourcePath, "uploads"), "uploads");
  zip.writeZip(archivePath);
  return archivePath;
}

function createSeededDatabase(directoryPath: string, schemaVersion = 11): string {
  fs.mkdirSync(directoryPath, { recursive: true });
  const databasePath = path.join(directoryPath, "rental_app.db");
  const database = new Database(databasePath);

  try {
    database.exec(releasedV039Schema);
    database.pragma("foreign_keys = ON");
    if (schemaVersion !== 11) {
      database
        .prepare("update app_settings set value = ? where key = 'schema_version'")
        .run(String(schemaVersion));
    }
    seedAllData(database);
  } finally {
    database.close();
  }

  return databasePath;
}

function seedAllData(database: Database.Database): void {
  database.exec(`
    insert into roles values ('owner', 'مالك', 'Owner', 'مالك', 'Owner', 1, '${now}', '${now}');
    insert into role_permissions values ('owner', 'rentals.view');
    insert into users (
      id, full_name, username, password_hash, password_algo, role_key,
      is_active, must_change_password, failed_login_count, created_at, updated_at,
      earns_commission
    ) values (1, 'Owner', 'owner', 'hash', 'scrypt', 'owner', 1, 0, 0, '${now}', '${now}', 1);

    insert into money_locations values ('cash_drawer', 'درج النقد', 'Cash drawer', 1, '${now}', '${now}');
    insert into money_locations values ('shop_safe', 'الخزنة', 'Shop safe', 1, '${now}', '${now}');
    insert into money_locations values ('bank', 'البنك', 'Bank', 1, '${now}', '${now}');

    insert into customers (id, full_name, phone, is_active, created_at, updated_at)
      values (1, 'Customer One', '0910000001', 1, '${now}', '${now}');
    insert into customers (id, full_name, phone, is_active, created_at, updated_at)
      values (2, 'Customer Two', '0910000002', 1, '${now}', '${now}');

    insert into vehicles (
      id, type, brand, model, plate_number, daily_price, deposit_amount,
      status, mileage, created_at, updated_at
    ) values (1, 'motorcycle', 'Brand', 'One', 'V-001', 50, 0, 'rented', 1000, '${now}', '${now}');
    insert into vehicles (
      id, type, brand, model, plate_number, daily_price, deposit_amount,
      status, mileage, created_at, updated_at
    ) values (2, 'motorcycle', 'Brand', 'Two', 'V-002', 60, 0, 'maintenance', 2000, '${now}', '${now}');
    insert into vehicles (
      id, type, brand, model, plate_number, daily_price, deposit_amount,
      status, mileage, created_at, updated_at
    ) values (3, 'motorcycle', 'Brand', 'Three', 'V-003', 70, 0, 'inactive', 3000, '${now}', '${now}');
    insert into vehicles (
      id, type, brand, model, plate_number, daily_price, deposit_amount,
      status, mileage, created_at, updated_at
    ) values (4, 'motorcycle', 'Brand', 'Four', 'V-004', 80, 0, 'available', 4000, '${now}', '${now}');

    insert into accessories (id, name, quantity_owned, default_charge, is_active, created_at, updated_at)
      values (1, 'Helmet', 2, 5, 1, '${now}', '${now}');
    insert into rentals (
      id, contract_no, customer_id, vehicle_id, status, start_datetime,
      expected_return_datetime, daily_price, deposit_required, deposit_paid,
      total_amount, paid_amount, remaining_amount, created_by_user_id,
      activated_by_user_id, last_updated_by_user_id, created_at, updated_at
    ) values (
      1, 'CNT-000001', 1, 1, 'active', '${now}', '2026-08-20T12:00:00.000Z',
      50, 0, 0, 250, 50, 200, 1, 1, 1, '${now}', '${now}'
    );
    insert into payments (
      id, rental_id, type, method, receipt_no, status, amount, payment_date,
      created_by_user_id, created_at, updated_at
    ) values (1, 1, 'rent', 'cash', 'RCP-000001', 'posted', 50, '${now}', 1, '${now}', '${now}');
    insert into rental_accessories (
      id, rental_id, accessory_id, quantity, unit_charge, returned_quantity,
      missing_quantity, created_at, updated_at
    ) values (1, 1, 1, 1, 5, 0, 0, '${now}', '${now}');
    insert into rental_collateral_items (
      id, rental_id, type, description, status, received_at, created_at, updated_at
    ) values (1, 1, 'passport', 'Passport', 'held', '${now}', '${now}', '${now}');

    insert into maintenance_records (
      id, vehicle_id, title, cost, start_date, is_archived, created_by_user_id,
      last_updated_by_user_id, created_at, updated_at
    ) values (1, 2, 'Service', 20, '${now}', 0, 1, 1, '${now}', '${now}');
    insert into maintenance_reminders (
      id, vehicle_id, title, status, completed_maintenance_record_id, created_at, updated_at
    ) values (1, 2, 'Reminder', 'completed', 1, '${now}', '${now}');
    insert into vehicle_mileage_events (
      id, vehicle_id, rental_id, event_type, mileage, event_datetime, created_at
    ) values (1, 1, 1, 'rental_out', 1000, '${now}', '${now}');
    insert into vehicle_mileage_events (
      id, vehicle_id, maintenance_record_id, event_type, mileage, event_datetime, created_at
    ) values (2, 2, 1, 'maintenance', 2000, '${now}', '${now}');

    insert into expenses (
      id, category, location, method, amount, expense_date, vehicle_id, status,
      created_by_user_id, created_at, updated_at
    ) values (1, 'fuel', 'cash_drawer', 'cash', 10, '${now}', 1, 'posted', 1, '${now}', '${now}');
    insert into cash_movements (
      id, type, from_location, to_location, amount, movement_date, status,
      created_by_user_id, created_at, updated_at
    ) values (1, 'transfer', 'cash_drawer', 'shop_safe', 10, '${now}', 'posted', 1, '${now}', '${now}');
    insert into daily_closings (
      id, closing_date, expected_cash, counted_cash, difference, closed_at, updated_at
    ) values (1, '2026-08-15', 100, 100, 0, '${now}', '${now}');
    insert into accounting_adjustments (
      id, location, direction, amount, adjustment_date, reason, status,
      created_by_user_id, created_at, updated_at
    ) values (1, 'cash_drawer', 'increase', 10, '${now}', 'Opening', 'posted', 1, '${now}', '${now}');

    insert into employee_loans (
      id, loan_no, employee_user_id, amount, issued_at, source_location,
      remaining_amount, status, created_by_user_id, created_at, updated_at
    ) values (1, 'LOAN-000001', 1, 100, '${now}', 'cash_drawer', 50, 'open', 1, '${now}', '${now}');
    insert into employee_loan_payments (
      id, loan_id, amount, payment_date, method, location, status,
      created_by_user_id, created_at, updated_at
    ) values (1, 1, 50, '${now}', 'cash', 'cash_drawer', 'posted', 1, '${now}', '${now}');

    insert into vehicle_sales (
      id, sale_no, vehicle_id, buyer_name, sale_date, sale_price, payment_method,
      status, previous_vehicle_status, created_by_user_id, created_at, updated_at
    ) values (1, 'SALE-000001', 3, 'Buyer', '2026-08-15', 1000, 'cash', 'posted', 'available', 1, '${now}', '${now}');
    insert into number_sequences values ('contract', 'CNT', 2, 6, '${now}');
    insert into number_sequences values ('receipt', 'RCP', 2, 6, '${now}');

    insert into attachments (
      id, entity_type, entity_id, original_name, stored_relative_path, mime_type,
      attachment_type, document_type, original_file_name, stored_file_name,
      relative_path, file_size, sha256, created_at, created_by_user_id, updated_at
    ) values (
      1, 'customer', 1, 'customer.jpg', 'customers/1/customer.jpg', 'image/jpeg',
      'customer_photo', 'customer_photo', 'customer.jpg', 'customer.jpg',
      'uploads/customers/1/customer.jpg', 14, 'customer', '${now}', 1, '${now}'
    );
    insert into attachments (
      id, entity_type, entity_id, original_name, stored_relative_path, mime_type,
      attachment_type, document_type, original_file_name, stored_file_name,
      relative_path, file_size, sha256, created_at, created_by_user_id, updated_at
    ) values (
      2, 'vehicle', 1, 'vehicle.jpg', 'vehicles/1/vehicle.jpg', 'image/jpeg',
      'vehicle_photo', 'vehicle_photo', 'vehicle.jpg', 'vehicle.jpg',
      'uploads/vehicles/1/vehicle.jpg', 13, 'vehicle', '${now}', 1, '${now}'
    );
    insert into attachments (
      id, entity_type, entity_id, original_name, stored_relative_path, mime_type,
      attachment_type, document_type, original_file_name, stored_file_name,
      relative_path, file_size, sha256, created_at, created_by_user_id, updated_at
    ) values (
      3, 'rental', 1, 'contract.pdf', 'rentals/1/contract.pdf', 'application/pdf',
      'other', 'other', 'contract.pdf', 'contract.pdf',
      'uploads/rentals/1/contract.pdf', 15, 'rental', '${now}', 1, '${now}'
    );
    insert into attachments (
      id, entity_type, entity_id, original_name, stored_relative_path, mime_type,
      attachment_type, document_type, original_file_name, stored_file_name,
      relative_path, file_size, sha256, created_at, created_by_user_id, updated_at
    ) values (
      4, 'maintenance', 1, 'invoice.pdf', 'maintenance/1/invoice.pdf', 'application/pdf',
      'other', 'other', 'invoice.pdf', 'invoice.pdf',
      'uploads/maintenance/1/invoice.pdf', 19, 'maintenance', '${now}', 1, '${now}'
    );

    insert into app_events (id, event_type, entity_type, entity_id, severity, message, created_at)
      values (1, 'rental_created', 'rental', 1, 'info', 'Rental created', '${now}');
    insert into audit_events (
      id, occurred_at, actor_user_id, action, entity_type, entity_id, app_version
    ) values (1, '${now}', 1, 'rental.created', 'rental', 1, '0.3.9');
  `);
}

function writeUpload(workspacePath: string, relativePath: string, contents: string): void {
  const filePath = path.join(workspacePath, "uploads", relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function countRows(database: Database.Database, tableName: string): number {
  return (
    database.prepare(`select count(*) as count from ${tableName}`).get() as { count: number }
  ).count;
}

function fileHash(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
