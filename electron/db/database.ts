import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
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
     values ('schema_version', '1')
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

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
}

function runInitialSchema(database: Database.Database): void {
  database.exec(`
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
      discount real not null default 0,
      total_amount real not null default 0,
      paid_amount real not null default 0,
      remaining_amount real not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists payments (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      type text not null check (type in ('rent', 'deposit', 'extra_charge', 'refund')),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      amount real not null,
      payment_date text not null,
      notes text,
      created_at text not null
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
      created_at text not null,
      updated_at text not null
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null
    );

    create index if not exists vehicles_status_idx on vehicles(status);
    create index if not exists vehicles_type_idx on vehicles(type);

    create index if not exists customers_is_active_idx on customers(is_active);
    create index if not exists customers_full_name_idx on customers(full_name);
    create index if not exists customers_phone_idx on customers(phone);
    create index if not exists customers_national_id_idx on customers(national_id);

    create index if not exists rentals_status_idx on rentals(status);
    create index if not exists rentals_created_at_idx on rentals(created_at);
    create index if not exists rentals_expected_return_datetime_idx on rentals(expected_return_datetime);
    create index if not exists rentals_actual_return_datetime_idx on rentals(actual_return_datetime);
    create index if not exists rentals_customer_id_idx on rentals(customer_id);
    create index if not exists rentals_vehicle_id_idx on rentals(vehicle_id);

    create index if not exists payments_payment_date_idx on payments(payment_date);
    create index if not exists payments_type_idx on payments(type);
    create index if not exists payments_rental_id_idx on payments(rental_id);

    create index if not exists maintenance_is_archived_idx on maintenance_records(is_archived);
    create index if not exists maintenance_start_date_idx on maintenance_records(start_date);
    create index if not exists maintenance_vehicle_id_idx on maintenance_records(vehicle_id);
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
}
