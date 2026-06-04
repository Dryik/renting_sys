import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  roleDescriptions,
  roleLabels,
  rolePermissionMap,
  type RoleKey,
} from "../../src/shared/auth";
import * as schema from "./schema";

export type DatabaseState = {
  databasePath: string;
  uploadsPath: string;
};

let sqlite: Database.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;

export function initializeDatabase(): DatabaseState {
  const userDataPath = process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
  const databasePath = path.join(userDataPath, "rental_app.db");
  const uploadsPath = path.join(userDataPath, "uploads");

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(uploadsPath, { recursive: true });

  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  runInitialSchema(sqlite);

  db = drizzle(sqlite, { schema });
  db.run(
    `insert into app_settings (key, value)
     values ('schema_version', '9')
     on conflict(key) do nothing`,
  );

  return {
    databasePath,
    uploadsPath,
  };
}

export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error("Database has not been initialized.");
  }

  return db;
}

export function getSqliteDatabase(): Database.Database {
  if (!sqlite) {
    throw new Error("Database has not been initialized.");
  }

  return sqlite;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}

function runInitialSchema(database: Database.Database): void {
  database.exec(`
    create table if not exists roles (
      key text primary key,
      name_ar text not null,
      name_en text not null,
      description_ar text not null,
      description_en text not null,
      is_system integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists role_permissions (
      role_key text not null references roles(key),
      permission text not null,
      primary key (role_key, permission)
    );

    create table if not exists users (
      id integer primary key autoincrement,
      full_name text not null,
      username text not null unique,
      password_hash text not null,
      password_algo text not null,
      role_key text not null references roles(key),
      is_active integer not null default 1,
      must_change_password integer not null default 0,
      failed_login_count integer not null default 0,
      locked_until text,
      last_login_at text,
      created_at text not null,
      updated_at text not null,
      created_by_user_id integer references users(id),
      deactivated_at text,
      deactivated_by_user_id integer references users(id)
    );

    create table if not exists vehicles (
      id integer primary key autoincrement,
      type text not null check (type in ('car', 'motorcycle')),
      brand text not null,
      model text not null,
      plate_number text not null unique,
      color text,
      year integer,
      daily_price real not null,
      deposit_amount real not null default 0,
      status text not null default 'available' check (status in ('available', 'rented', 'maintenance', 'inactive')),
      mileage integer,
      insurance_expiry_date text,
      registration_expiry_date text,
      technical_inspection_expiry_date text,
      last_oil_change_date text,
      last_oil_change_mileage integer,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists customers (
      id integer primary key autoincrement,
      full_name text not null,
      phone text not null,
      secondary_phone text,
      national_id text,
      driver_license_no text,
      license_expiry_date text,
      address text,
      notes text,
      is_active integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists vehicle_sales (
      id integer primary key autoincrement,
      sale_no text not null unique,
      vehicle_id integer not null references vehicles(id),
      buyer_name text not null,
      buyer_phone text,
      buyer_id_number text,
      sale_date text not null,
      sale_price real not null,
      payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
      status text not null default 'posted' check (status in ('posted', 'voided')),
      previous_vehicle_status text not null check (previous_vehicle_status in ('available', 'inactive')),
      notes text,
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rentals (
      id integer primary key autoincrement,
      contract_no text not null unique,
      customer_id integer not null references customers(id),
      vehicle_id integer not null references vehicles(id),
      status text not null default 'draft' check (status in ('draft', 'active', 'returned', 'cancelled', 'overdue')),
      start_datetime text not null,
      expected_return_datetime text not null,
      actual_return_datetime text,
      daily_price real not null,
      deposit_required real not null default 0,
      deposit_paid real not null default 0,
      mileage_out integer,
      mileage_in integer,
      fuel_out text,
      fuel_in text,
      notes_out text,
      notes_in text,
      damage_notes text,
      extra_charges real not null default 0,
      accessory_charges real not null default 0,
      discount real not null default 0,
      total_amount real not null default 0,
      paid_amount real not null default 0,
      remaining_amount real not null default 0,
      cancelled_at text,
      cancel_reason text,
      created_by_user_id integer references users(id),
      activated_by_user_id integer references users(id),
      returned_by_user_id integer references users(id),
      cancelled_by_user_id integer references users(id),
      last_updated_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists accessories (
      id integer primary key autoincrement,
      name text not null unique,
      quantity_owned integer not null default 0,
      default_charge real not null default 0,
      is_active integer not null default 1,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rental_accessories (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      accessory_id integer not null references accessories(id),
      quantity integer not null,
      unit_charge real not null default 0,
      returned_quantity integer not null default 0,
      missing_quantity integer not null default 0,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rental_collateral_items (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      type text not null check (type in ('passport', 'id_card', 'driver_license', 'cash', 'other_document', 'other_item')),
      description text not null,
      reference_number text,
      estimated_value real,
      currency text,
      status text not null default 'held' check (status in ('held', 'returned')),
      received_at text not null,
      returned_at text,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists payments (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      type text not null check (type in ('rent', 'deposit', 'extra_charge', 'refund')),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      receipt_no text unique,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      amount real not null,
      payment_date text not null,
      notes text,
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      corrected_by_payment_id integer,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists money_locations (
      key text primary key check (key in ('cash_drawer', 'shop_safe', 'bank')),
      name_ar text not null,
      name_en text not null,
      is_system integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists expenses (
      id integer primary key autoincrement,
      category text not null check (category in ('fuel', 'wash', 'parts', 'maintenance', 'insurance', 'registration', 'office', 'other')),
      location text not null references money_locations(key),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      amount real not null,
      expense_date text not null,
      vendor_name text,
      vehicle_id integer references vehicles(id),
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists cash_movements (
      id integer primary key autoincrement,
      type text not null check (type in ('transfer', 'owner_withdrawal')),
      from_location text not null references money_locations(key),
      to_location text references money_locations(key),
      amount real not null,
      movement_date text not null,
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists employee_loans (
      id integer primary key autoincrement,
      loan_no text not null unique,
      employee_user_id integer not null references users(id),
      amount real not null,
      issued_at text not null,
      source_location text not null check (source_location in ('cash_drawer', 'shop_safe', 'bank')),
      remaining_amount real not null,
      status text not null default 'open' check (status in ('open', 'paid', 'voided')),
      notes text,
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists employee_loan_payments (
      id integer primary key autoincrement,
      loan_id integer not null references employee_loans(id),
      amount real not null,
      payment_date text not null,
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      location text not null check (location in ('cash_drawer', 'shop_safe', 'bank')),
      status text not null default 'posted' check (status in ('posted', 'voided')),
      notes text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists accounting_adjustments (
      id integer primary key autoincrement,
      location text not null references money_locations(key),
      direction text not null check (direction in ('increase', 'decrease')),
      amount real not null,
      adjustment_date text not null,
      reason text not null,
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists maintenance_records (
      id integer primary key autoincrement,
      vehicle_id integer not null references vehicles(id),
      title text not null,
      description text,
      cost real not null default 0,
      start_date text not null,
      end_date text,
      is_archived integer not null default 0,
      created_by_user_id integer references users(id),
      completed_by_user_id integer references users(id),
      archived_by_user_id integer references users(id),
      last_updated_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null
    );

    create table if not exists vehicle_mileage_events (
      id integer primary key autoincrement,
      vehicle_id integer not null references vehicles(id),
      rental_id integer references rentals(id),
      maintenance_record_id integer references maintenance_records(id),
      event_type text not null check (event_type in ('rental_out', 'rental_return', 'manual_adjustment', 'maintenance')),
      mileage integer not null,
      previous_mileage integer,
      event_datetime text not null,
      notes text,
      created_at text not null
    );

    create table if not exists attachments (
      id integer primary key autoincrement,
      entity_type text not null check (entity_type in ('customer', 'vehicle', 'rental', 'maintenance')),
      entity_id integer not null,
      original_name text not null,
      stored_relative_path text not null,
      mime_type text not null,
      size_bytes integer not null default 0,
      attachment_type text not null default 'other',
      document_type text not null default 'other',
      title text,
      original_file_name text not null default '',
      stored_file_name text not null default '',
      relative_path text not null default '',
      thumbnail_relative_path text,
      file_size integer not null default 0,
      sha256 text not null default '',
      document_number text,
      issue_date text,
      expiry_date text,
      notes text,
      captured_by_camera integer not null default 0,
      camera_device_label_snapshot text,
      is_primary integer not null default 0,
      is_archived integer not null default 0,
      archived_at text,
      archived_by_user_id integer references users(id),
      archive_reason text,
      created_at text not null,
      created_by_user_id integer references users(id),
      updated_at text not null
    );

    create table if not exists app_events (
      id integer primary key autoincrement,
      event_type text not null,
      entity_type text,
      entity_id integer,
      severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
      message text not null,
      details_json text,
      created_at text not null
    );

    create table if not exists audit_events (
      id integer primary key autoincrement,
      occurred_at text not null,
      actor_user_id integer references users(id),
      actor_username_snapshot text,
      actor_full_name_snapshot text,
      actor_role_key_snapshot text,
      action text not null,
      entity_type text not null,
      entity_id integer,
      entity_label text,
      summary_ar text,
      summary_en text,
      before_json text,
      after_json text,
      metadata_json text,
      reason text,
      session_id text,
      app_version text
    );

    create table if not exists maintenance_reminders (
      id integer primary key autoincrement,
      vehicle_id integer not null references vehicles(id),
      title text not null,
      due_date text,
      due_mileage integer,
      notes text,
      status text not null default 'open' check (status in ('open', 'completed', 'archived')),
      completed_at text,
      completed_maintenance_record_id integer references maintenance_records(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists number_sequences (
      name text primary key,
      prefix text not null,
      next_number integer not null default 1,
      padding integer not null default 6,
      updated_at text not null
    );

    create table if not exists daily_closings (
      id integer primary key autoincrement,
      closing_date text not null unique,
      expected_cash real not null default 0,
      counted_cash real not null default 0,
      difference real not null default 0,
      notes text,
      closed_at text not null,
      updated_at text not null
    );

    create index if not exists vehicles_status_idx on vehicles(status);
    create index if not exists vehicles_status_plate_number_idx on vehicles(status, plate_number);
    create index if not exists vehicles_type_idx on vehicles(type);
    create index if not exists vehicle_sales_vehicle_id_idx on vehicle_sales(vehicle_id);
    create index if not exists vehicle_sales_sale_date_idx on vehicle_sales(sale_date);
    create index if not exists vehicle_sales_status_idx on vehicle_sales(status);
    create index if not exists vehicle_sales_buyer_name_idx on vehicle_sales(buyer_name);
    create unique index if not exists vehicle_sales_one_posted_vehicle_idx
      on vehicle_sales(vehicle_id)
      where status = 'posted';

    create index if not exists users_role_key_idx on users(role_key);
    create index if not exists users_is_active_idx on users(is_active);

    create index if not exists customers_is_active_idx on customers(is_active);
    create index if not exists customers_is_active_full_name_idx on customers(is_active, full_name);
    create index if not exists customers_full_name_idx on customers(full_name);
    create index if not exists customers_phone_idx on customers(phone);
    create index if not exists customers_national_id_idx on customers(national_id);
    create index if not exists customers_driver_license_no_idx on customers(driver_license_no);

    create index if not exists rentals_status_idx on rentals(status);
    create index if not exists rentals_created_at_idx on rentals(created_at);
    create index if not exists rentals_status_created_at_idx on rentals(status, created_at);
    create index if not exists rentals_expected_return_datetime_idx on rentals(expected_return_datetime);
    create index if not exists rentals_status_expected_return_idx on rentals(status, expected_return_datetime);
    create index if not exists rentals_actual_return_datetime_idx on rentals(actual_return_datetime);
    create index if not exists rentals_status_actual_return_idx on rentals(status, actual_return_datetime, created_at);
    create index if not exists rentals_status_remaining_amount_idx on rentals(status, remaining_amount);
    create index if not exists rentals_customer_id_idx on rentals(customer_id);
    create index if not exists rentals_vehicle_id_idx on rentals(vehicle_id);
    create index if not exists accessories_is_active_idx on accessories(is_active);
    create index if not exists rental_accessories_rental_id_idx on rental_accessories(rental_id);
    create index if not exists rental_accessories_accessory_id_idx on rental_accessories(accessory_id);
    create index if not exists rental_collateral_items_rental_id_idx on rental_collateral_items(rental_id);
    create index if not exists rental_collateral_items_status_idx on rental_collateral_items(status);

    create index if not exists payments_payment_date_idx on payments(payment_date);
    create index if not exists payments_type_idx on payments(type);
    create index if not exists payments_rental_id_idx on payments(rental_id);
    create index if not exists payments_status_type_rental_id_idx on payments(status, type, rental_id);
    create index if not exists payments_status_type_rental_amount_idx on payments(status, type, rental_id, amount);
    create index if not exists employee_loans_employee_user_id_idx on employee_loans(employee_user_id);
    create index if not exists employee_loans_status_idx on employee_loans(status);
    create index if not exists employee_loans_issued_at_idx on employee_loans(issued_at);
    create index if not exists employee_loan_payments_loan_id_idx on employee_loan_payments(loan_id);
    create index if not exists employee_loan_payments_payment_date_idx on employee_loan_payments(payment_date);
    create index if not exists employee_loan_payments_status_idx on employee_loan_payments(status);

    create index if not exists maintenance_start_date_idx on maintenance_records(start_date);
    create index if not exists maintenance_vehicle_id_idx on maintenance_records(vehicle_id);

    create index if not exists vehicle_mileage_events_vehicle_id_idx on vehicle_mileage_events(vehicle_id);
    create index if not exists vehicle_mileage_events_rental_id_idx on vehicle_mileage_events(rental_id);
    create index if not exists vehicle_mileage_events_event_datetime_idx on vehicle_mileage_events(event_datetime);

    create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);
    create index if not exists attachments_is_archived_idx on attachments(is_archived);

    create index if not exists app_events_event_type_idx on app_events(event_type);
    create index if not exists app_events_entity_idx on app_events(entity_type, entity_id);
    create index if not exists app_events_created_at_idx on app_events(created_at);

    create index if not exists audit_events_occurred_at_idx on audit_events(occurred_at);
    create index if not exists audit_events_actor_user_id_idx on audit_events(actor_user_id);
    create index if not exists audit_events_action_idx on audit_events(action);
    create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id);

    create index if not exists maintenance_reminders_vehicle_id_idx on maintenance_reminders(vehicle_id);
    create index if not exists maintenance_reminders_status_idx on maintenance_reminders(status);
    create index if not exists maintenance_reminders_due_date_idx on maintenance_reminders(due_date);
    create index if not exists maintenance_reminders_due_mileage_idx on maintenance_reminders(due_mileage);
  `);

  try {
    database.exec("alter table customers add column is_active integer not null default 1;");
  } catch {
    // Ignore if column already exists
  }

  try {
    database.exec("alter table maintenance_records add column is_archived integer not null default 0;");
  } catch {
    // Ignore if column already exists
  }

  try {
    database.exec("alter table maintenance_records add column updated_at text;");
  } catch {
    // Ignore if column already exists
  }

  database.exec("update maintenance_records set updated_at = created_at where updated_at is null;");
  runMigrations(database);
  createPostMigrationIndexes(database);
}

function runMigrations(database: Database.Database): void {
  const now = new Date().toISOString();

  database.exec("insert into app_settings (key, value) values ('schema_version', '1') on conflict(key) do nothing;");

  const versionRow = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;
  const schemaVersion = Number(versionRow?.value) || 1;

  if (schemaVersion < 2) {
    database.transaction(() => {
      addColumnIfMissing(database, "rentals", "cancelled_at", "text");
      addColumnIfMissing(database, "rentals", "cancel_reason", "text");

      addColumnIfMissing(database, "payments", "receipt_no", "text");
      addColumnIfMissing(
        database,
        "payments",
        "status",
        "text not null default 'posted'",
      );
      addColumnIfMissing(database, "payments", "voided_at", "text");
      addColumnIfMissing(database, "payments", "void_reason", "text");
      addColumnIfMissing(database, "payments", "corrected_by_payment_id", "integer");
      addColumnIfMissing(
        database,
        "payments",
        "updated_at",
        `text not null default '${now}'`,
      );
      database.exec("update payments set updated_at = created_at where updated_at = '' or updated_at is null;");
      seedNumberSequences(database, now);
      database
        .prepare("update app_settings set value = '2' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 3) {
    database.transaction(() => {
      addAuthAuditColumns(database);
      database
        .prepare("update app_settings set value = '3' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 4) {
    database.transaction(() => {
      addAttachmentDocumentColumns(database, now);
      database
        .prepare("update app_settings set value = '4' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 5) {
    database.transaction(() => {
      createAccountingTables(database);
      seedMoneyLocations(database, now);
      database
        .prepare("update app_settings set value = '5' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 6) {
    database.transaction(() => {
      createAccountingAdjustmentTable(database);
      database
        .prepare("update app_settings set value = '6' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 7) {
    database.transaction(() => {
      addVehicleDocumentAndOilColumns(database);
      database
        .prepare("update app_settings set value = '7' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 8) {
    database.transaction(() => {
      createVehicleSalesTable(database);
      seedNumberSequences(database, now);
      database
        .prepare("update app_settings set value = '8' where key = 'schema_version'")
        .run();
    })();
  }

  if (schemaVersion < 9) {
    database.transaction(() => {
      createEmployeeLoanTables(database);
      createAccessoryRentalTables(database);
      addColumnIfMissing(
        database,
        "rentals",
        "accessory_charges",
        "real not null default 0",
      );
      seedNumberSequences(database, now);
      database
        .prepare("update app_settings set value = '9' where key = 'schema_version'")
        .run();
    })();
  }

  seedSystemRoles(database, now);
  seedNumberSequences(database, now);
  seedMoneyLocations(database, now);
}

function createPostMigrationIndexes(database: Database.Database): void {
  ensureNoDuplicateOpenRentals(database);

  database.exec(`
    create index if not exists users_role_key_idx on users(role_key);
    create index if not exists users_is_active_idx on users(is_active);
    create index if not exists customers_is_active_idx on customers(is_active);
    create index if not exists customers_is_active_full_name_idx on customers(is_active, full_name);
    create index if not exists customers_driver_license_no_idx on customers(driver_license_no);
    create index if not exists vehicles_status_plate_number_idx on vehicles(status, plate_number);
    create unique index if not exists vehicle_sales_sale_no_idx on vehicle_sales(sale_no);
    create index if not exists vehicle_sales_vehicle_id_idx on vehicle_sales(vehicle_id);
    create index if not exists vehicle_sales_sale_date_idx on vehicle_sales(sale_date);
    create index if not exists vehicle_sales_status_idx on vehicle_sales(status);
    create index if not exists vehicle_sales_buyer_name_idx on vehicle_sales(buyer_name);
    create unique index if not exists vehicle_sales_one_posted_vehicle_idx
      on vehicle_sales(vehicle_id)
      where status = 'posted';
    create index if not exists rentals_cancelled_at_idx on rentals(cancelled_at);
    create index if not exists rentals_status_created_at_idx on rentals(status, created_at);
    create index if not exists rentals_status_expected_return_idx on rentals(status, expected_return_datetime);
    create index if not exists rentals_status_actual_return_idx on rentals(status, actual_return_datetime, created_at);
    create index if not exists rentals_status_remaining_amount_idx on rentals(status, remaining_amount);
    create index if not exists accessories_is_active_idx on accessories(is_active);
    create index if not exists rental_accessories_rental_id_idx on rental_accessories(rental_id);
    create index if not exists rental_accessories_accessory_id_idx on rental_accessories(accessory_id);
    create index if not exists rental_collateral_items_rental_id_idx on rental_collateral_items(rental_id);
    create index if not exists rental_collateral_items_status_idx on rental_collateral_items(status);
    create unique index if not exists rentals_one_open_vehicle_idx
      on rentals(vehicle_id)
      where status in ('active', 'overdue');
    create unique index if not exists payments_receipt_no_idx on payments(receipt_no);
    create index if not exists payments_status_idx on payments(status);
    create index if not exists payments_status_type_rental_id_idx on payments(status, type, rental_id);
    create index if not exists payments_status_type_rental_amount_idx on payments(status, type, rental_id, amount);
    create unique index if not exists employee_loans_loan_no_idx on employee_loans(loan_no);
    create index if not exists employee_loans_employee_user_id_idx on employee_loans(employee_user_id);
    create index if not exists employee_loans_status_idx on employee_loans(status);
    create index if not exists employee_loans_issued_at_idx on employee_loans(issued_at);
    create index if not exists employee_loan_payments_loan_id_idx on employee_loan_payments(loan_id);
    create index if not exists employee_loan_payments_payment_date_idx on employee_loan_payments(payment_date);
    create index if not exists employee_loan_payments_status_idx on employee_loan_payments(status);
    create index if not exists expenses_expense_date_idx on expenses(expense_date);
    create index if not exists expenses_status_idx on expenses(status);
    create index if not exists expenses_location_idx on expenses(location);
    create index if not exists expenses_category_idx on expenses(category);
    create index if not exists expenses_vehicle_id_idx on expenses(vehicle_id);
    create index if not exists cash_movements_date_idx on cash_movements(movement_date);
    create index if not exists cash_movements_status_idx on cash_movements(status);
    create index if not exists cash_movements_type_idx on cash_movements(type);
    create index if not exists cash_movements_from_location_idx on cash_movements(from_location);
    create index if not exists cash_movements_to_location_idx on cash_movements(to_location);
    create index if not exists accounting_adjustments_date_idx on accounting_adjustments(adjustment_date);
    create index if not exists accounting_adjustments_status_idx on accounting_adjustments(status);
    create index if not exists accounting_adjustments_location_idx on accounting_adjustments(location);
    create index if not exists accounting_adjustments_direction_idx on accounting_adjustments(direction);
    create index if not exists maintenance_is_archived_idx on maintenance_records(is_archived);
    create index if not exists audit_events_occurred_at_idx on audit_events(occurred_at);
    create index if not exists audit_events_actor_user_id_idx on audit_events(actor_user_id);
    create index if not exists audit_events_action_idx on audit_events(action);
    create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id);
    create index if not exists attachments_document_idx on attachments(entity_type, entity_id, document_type);
    create index if not exists attachments_primary_idx on attachments(entity_type, entity_id, document_type, is_primary);
  `);
}

function ensureNoDuplicateOpenRentals(database: Database.Database): void {
  const duplicates = database
    .prepare(
      `select vehicle_id as vehicleId, count(*) as count
       from rentals
       where status in ('active', 'overdue')
       group by vehicle_id
       having count(*) > 1`,
    )
    .all() as Array<{ vehicleId: number; count: number }>;

  if (duplicates.length === 0) {
    return;
  }

  const vehicleIds = duplicates.map((row) => row.vehicleId).join(", ");
  throw new Error(
    `Cannot initialize database: duplicate active rentals exist for vehicle(s): ${vehicleIds}.`,
  );
}

function addAuthAuditColumns(database: Database.Database): void {
  addColumnIfMissing(database, "rentals", "created_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "rentals", "activated_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "rentals", "returned_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "rentals", "cancelled_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "rentals", "last_updated_by_user_id", "integer references users(id)");

  addColumnIfMissing(database, "payments", "voided_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "payments", "created_by_user_id", "integer references users(id)");

  addColumnIfMissing(database, "maintenance_records", "created_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "maintenance_records", "completed_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "maintenance_records", "archived_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "maintenance_records", "last_updated_by_user_id", "integer references users(id)");
}

function addAttachmentDocumentColumns(database: Database.Database, now: string): void {
  addColumnIfMissing(database, "attachments", "document_type", "text not null default 'other'");
  addColumnIfMissing(database, "attachments", "title", "text");
  addColumnIfMissing(database, "attachments", "original_file_name", "text not null default ''");
  addColumnIfMissing(database, "attachments", "stored_file_name", "text not null default ''");
  addColumnIfMissing(database, "attachments", "relative_path", "text not null default ''");
  addColumnIfMissing(database, "attachments", "thumbnail_relative_path", "text");
  addColumnIfMissing(database, "attachments", "file_size", "integer not null default 0");
  addColumnIfMissing(database, "attachments", "sha256", "text not null default ''");
  addColumnIfMissing(database, "attachments", "document_number", "text");
  addColumnIfMissing(database, "attachments", "issue_date", "text");
  addColumnIfMissing(database, "attachments", "expiry_date", "text");
  addColumnIfMissing(database, "attachments", "captured_by_camera", "integer not null default 0");
  addColumnIfMissing(database, "attachments", "camera_device_label_snapshot", "text");
  addColumnIfMissing(database, "attachments", "is_primary", "integer not null default 0");
  addColumnIfMissing(database, "attachments", "created_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "attachments", "updated_at", `text not null default '${now}'`);
  addColumnIfMissing(database, "attachments", "archived_by_user_id", "integer references users(id)");
  addColumnIfMissing(database, "attachments", "archive_reason", "text");

  database.exec(`
    update attachments
    set
      document_type = case
        when document_type = '' then attachment_type
        else document_type
      end,
      original_file_name = case
        when original_file_name = '' then original_name
        else original_file_name
      end,
      stored_file_name = case
        when stored_file_name = '' then original_name
        else stored_file_name
      end,
      relative_path = case
        when relative_path = '' then 'uploads/' || stored_relative_path
        else relative_path
      end,
      file_size = case
        when file_size = 0 then size_bytes
        else file_size
      end,
      updated_at = case
        when updated_at = '' or updated_at is null then created_at
        else updated_at
      end
  `);
}

function addVehicleDocumentAndOilColumns(database: Database.Database): void {
  addColumnIfMissing(database, "vehicles", "technical_inspection_expiry_date", "text");
  addColumnIfMissing(database, "vehicles", "last_oil_change_date", "text");
  addColumnIfMissing(database, "vehicles", "last_oil_change_mileage", "integer");
}

function createVehicleSalesTable(database: Database.Database): void {
  database.exec(`
    create table if not exists vehicle_sales (
      id integer primary key autoincrement,
      sale_no text not null unique,
      vehicle_id integer not null references vehicles(id),
      buyer_name text not null,
      buyer_phone text,
      buyer_id_number text,
      sale_date text not null,
      sale_price real not null,
      payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
      status text not null default 'posted' check (status in ('posted', 'voided')),
      previous_vehicle_status text not null check (previous_vehicle_status in ('available', 'inactive')),
      notes text,
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create unique index if not exists vehicle_sales_sale_no_idx on vehicle_sales(sale_no);
    create index if not exists vehicle_sales_vehicle_id_idx on vehicle_sales(vehicle_id);
    create index if not exists vehicle_sales_sale_date_idx on vehicle_sales(sale_date);
    create index if not exists vehicle_sales_status_idx on vehicle_sales(status);
    create index if not exists vehicle_sales_buyer_name_idx on vehicle_sales(buyer_name);
    create unique index if not exists vehicle_sales_one_posted_vehicle_idx
      on vehicle_sales(vehicle_id)
      where status = 'posted';
  `);
}

function createAccountingTables(database: Database.Database): void {
  database.exec(`
    create table if not exists money_locations (
      key text primary key check (key in ('cash_drawer', 'shop_safe', 'bank')),
      name_ar text not null,
      name_en text not null,
      is_system integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists expenses (
      id integer primary key autoincrement,
      category text not null check (category in ('fuel', 'wash', 'parts', 'maintenance', 'insurance', 'registration', 'office', 'other')),
      location text not null references money_locations(key),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      amount real not null,
      expense_date text not null,
      vendor_name text,
      vehicle_id integer references vehicles(id),
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists cash_movements (
      id integer primary key autoincrement,
      type text not null check (type in ('transfer', 'owner_withdrawal')),
      from_location text not null references money_locations(key),
      to_location text references money_locations(key),
      amount real not null,
      movement_date text not null,
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );
  `);

  createAccountingAdjustmentTable(database);
}

function createAccountingAdjustmentTable(database: Database.Database): void {
  database.exec(`
    create table if not exists accounting_adjustments (
      id integer primary key autoincrement,
      location text not null references money_locations(key),
      direction text not null check (direction in ('increase', 'decrease')),
      amount real not null,
      adjustment_date text not null,
      reason text not null,
      notes text,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );
  `);
}

function createEmployeeLoanTables(database: Database.Database): void {
  database.exec(`
    create table if not exists employee_loans (
      id integer primary key autoincrement,
      loan_no text not null unique,
      employee_user_id integer not null references users(id),
      amount real not null,
      issued_at text not null,
      source_location text not null check (source_location in ('cash_drawer', 'shop_safe', 'bank')),
      remaining_amount real not null,
      status text not null default 'open' check (status in ('open', 'paid', 'voided')),
      notes text,
      voided_at text,
      voided_by_user_id integer references users(id),
      void_reason text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists employee_loan_payments (
      id integer primary key autoincrement,
      loan_id integer not null references employee_loans(id),
      amount real not null,
      payment_date text not null,
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      location text not null check (location in ('cash_drawer', 'shop_safe', 'bank')),
      status text not null default 'posted' check (status in ('posted', 'voided')),
      notes text,
      created_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );
  `);
}

function createAccessoryRentalTables(database: Database.Database): void {
  database.exec(`
    create table if not exists accessories (
      id integer primary key autoincrement,
      name text not null unique,
      quantity_owned integer not null default 0,
      default_charge real not null default 0,
      is_active integer not null default 1,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rental_accessories (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      accessory_id integer not null references accessories(id),
      quantity integer not null,
      unit_charge real not null default 0,
      returned_quantity integer not null default 0,
      missing_quantity integer not null default 0,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists rental_collateral_items (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      type text not null check (type in ('passport', 'id_card', 'driver_license', 'cash', 'other_document', 'other_item')),
      description text not null,
      reference_number text,
      estimated_value real,
      currency text,
      status text not null default 'held' check (status in ('held', 'returned')),
      received_at text not null,
      returned_at text,
      notes text,
      created_at text not null,
      updated_at text not null
    );
  `);
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const rows = database.prepare(`pragma table_info(${tableName})`).all() as Array<{
    name: string;
  }>;

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  database.exec(`alter table ${tableName} add column ${columnName} ${definition};`);
}

function seedNumberSequences(database: Database.Database, now: string): void {
  const sequences = [
    { name: "contract", prefix: "ARAK", nextNumber: 1, padding: 6 },
    { name: "receipt", prefix: "RCP", nextNumber: 1, padding: 6 },
    { name: "vehicle_sale", prefix: "SALE", nextNumber: 1, padding: 6 },
    { name: "employee_loan", prefix: "LOAN", nextNumber: 1, padding: 6 },
  ];

  for (const sequence of sequences) {
    database
      .prepare(
        `insert into number_sequences (name, prefix, next_number, padding, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(name) do nothing`,
      )
      .run(
        sequence.name,
        sequence.prefix,
        sequence.nextNumber,
        sequence.padding,
        now,
      );
  }
}

function seedMoneyLocations(database: Database.Database, now: string): void {
  const locations = [
    {
      key: "cash_drawer",
      nameAr: "درج النقد",
      nameEn: "Cash Drawer",
    },
    {
      key: "shop_safe",
      nameAr: "خزنة المحل",
      nameEn: "Shop Safe",
    },
    {
      key: "bank",
      nameAr: "البنك",
      nameEn: "Bank",
    },
  ];

  for (const location of locations) {
    database
      .prepare(
        `insert into money_locations (
          key,
          name_ar,
          name_en,
          is_system,
          created_at,
          updated_at
        )
        values (?, ?, ?, 1, ?, ?)
        on conflict(key) do update set
          name_ar = excluded.name_ar,
          name_en = excluded.name_en,
          is_system = 1,
          updated_at = excluded.updated_at`,
      )
      .run(location.key, location.nameAr, location.nameEn, now, now);
  }
}

function seedSystemRoles(database: Database.Database, now: string): void {
  const roleKeys = Object.keys(rolePermissionMap) as RoleKey[];

  for (const roleKey of roleKeys) {
    database
      .prepare(
        `insert into roles (
          key,
          name_ar,
          name_en,
          description_ar,
          description_en,
          is_system,
          created_at,
          updated_at
        )
        values (?, ?, ?, ?, ?, 1, ?, ?)
        on conflict(key) do update set
          name_ar = excluded.name_ar,
          name_en = excluded.name_en,
          description_ar = excluded.description_ar,
          description_en = excluded.description_en,
          is_system = 1,
          updated_at = excluded.updated_at`,
      )
      .run(
        roleKey,
        roleLabels[roleKey].ar,
        roleLabels[roleKey].en,
        roleDescriptions[roleKey].ar,
        roleDescriptions[roleKey].en,
        now,
        now,
      );

    database.prepare("delete from role_permissions where role_key = ?").run(roleKey);

    for (const permission of rolePermissionMap[roleKey]) {
      database
        .prepare(
          `insert into role_permissions (role_key, permission)
           values (?, ?)
           on conflict(role_key, permission) do nothing`,
        )
        .run(roleKey, permission);
    }
  }
}
