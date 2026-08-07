import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MigrationFailedError,
  migrateDatabase,
  migrationBackupsDirectoryName,
  retainedMigrationBackups,
  writeMigrationSafetyBackup,
} from "./migration-runner";
import { assertWalFullyCheckpointed } from "./wal-checkpoint";
import { LATEST_SCHEMA_VERSION, migrations, type Migration } from "./migrations";
import { openBackupArchive } from "./backup-archive";

const fixturesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
);

/** Frozen schemas captured from the tagged releases, never regenerated. */
const releasedV8Sql = fs.readFileSync(
  path.join(fixturesPath, "released-v0.1.0-schema-v8.sql"),
  "utf8",
);
const releasedV11Sql = fs.readFileSync(
  path.join(fixturesPath, "released-v0.3.9-schema-v11.sql"),
  "utf8",
);

let workspacePath = "";

/**
 * The version 1 core schema, written out by hand exactly as it shipped: none of
 * the columns later migrations add. Fixtures must never come from the current
 * initializer, or an upgrade test would only ever re-check today's shape.
 */
const version1Sql = `
  create table app_settings (
    key text primary key,
    value text not null
  );

  create table vehicles (
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

  create table customers (
    id integer primary key autoincrement,
    full_name text not null,
    phone text not null,
    secondary_phone text,
    national_id text,
    driver_license_no text,
    license_expiry_date text,
    address text,
    notes text,
    created_at text not null,
    updated_at text not null
  );

  create table rentals (
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

  create table payments (
    id integer primary key autoincrement,
    rental_id integer not null references rentals(id),
    type text not null check (type in ('rent', 'deposit', 'extra_charge', 'refund')),
    method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
    amount real not null,
    payment_date text not null,
    notes text,
    created_at text not null
  );

  create table maintenance_records (
    id integer primary key autoincrement,
    vehicle_id integer not null references vehicles(id),
    title text not null,
    description text,
    cost real not null default 0,
    start_date text not null,
    end_date text,
    created_at text not null
  );
`;

function databaseFilePath(name = "rental_app.db"): string {
  return path.join(workspacePath, name);
}

function migrateOptions(
  overrides: Partial<Parameters<typeof migrateDatabase>[1]> = {},
) {
  return {
    userDataPath: workspacePath,
    databasePath: databaseFilePath(),
    uploadsPath: path.join(workspacePath, "uploads"),
    appVersion: "0.4.0-test",
    ...overrides,
  };
}

function openDatabaseFile(name = "rental_app.db"): Database.Database {
  const database = new Database(databaseFilePath(name));
  database.pragma("foreign_keys = ON");

  return database;
}

function backupsDirectory(): string {
  return path.join(workspacePath, migrationBackupsDirectoryName);
}

function listBackups(): string[] {
  if (!fs.existsSync(backupsDirectory())) {
    return [];
  }

  return fs.readdirSync(backupsDirectory()).sort();
}

/** Builds a fixture at a historical version without touching initializeDatabase. */
function buildFixtureAtVersion(database: Database.Database, version: number): void {
  database.exec(version1Sql);
  database
    .prepare("insert into app_settings (key, value) values ('schema_version', '1')")
    .run();

  const now = new Date().toISOString();

  for (const migration of migrations.filter((entry) => entry.version <= version)) {
    migration.up(database, now);
    database
      .prepare("update app_settings set value = ? where key = 'schema_version'")
      .run(String(migration.version));
  }
}

function seedVersion1Business(database: Database.Database): void {
  const now = "2026-01-01T00:00:00.000Z";
  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
       values ('car', 'Toyota', 'Corolla', 'OLD-1', 90, 0, 'available', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into customers (full_name, phone, created_at, updated_at)
       values ('Historic Customer', '0910000000', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into rentals (contract_no, customer_id, vehicle_id, status, start_datetime,
         expected_return_datetime, daily_price, total_amount, paid_amount, remaining_amount, created_at, updated_at)
       values ('CNT-OLD-1', 1, 1, 'returned', ?, ?, 90, 270, 270, 0, ?, ?)`,
    )
    .run(now, now, now, now);
  database
    .prepare(
      `insert into payments (rental_id, type, method, amount, payment_date, created_at)
       values (1, 'rent', 'cash', 270, ?, ?)`,
    )
    .run(now, now);
}

/** Business rows valid for the released v8 and v11 shapes. */
function seedReleasedBusiness(database: Database.Database): void {
  const now = "2026-02-02T00:00:00.000Z";
  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
       values ('motorcycle', 'Honda', 'CG', 'REL-1', 55.5, 20, 'available', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into customers (full_name, phone, created_at, updated_at)
       values ('Released Customer', '0921111111', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into rentals (contract_no, customer_id, vehicle_id, status, start_datetime,
         expected_return_datetime, daily_price, total_amount, paid_amount, remaining_amount, created_at, updated_at)
       values ('CNT-REL-1', 1, 1, 'returned', ?, ?, 55.5, 166.5, 100, 66.5, ?, ?)`,
    )
    .run(now, now, now, now);
  database
    .prepare(
      `insert into payments (rental_id, type, method, amount, payment_date, status, created_at, updated_at)
       values (1, 'rent', 'cash', 100, ?, 'posted', ?, ?)`,
    )
    .run(now, now, now);
}

function tableNames(database: Database.Database): string[] {
  return (
    database
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function columnNames(database: Database.Database, table: string): string[] {
  return (
    database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>
  )
    .map((row) => row.name)
    .sort();
}

/**
 * A comparable description of a table's shape.
 *
 * Columns are sorted by name on purpose: ALTER TABLE can only append, so an
 * upgraded database legitimately orders columns differently from a freshly
 * created one. Everything else — declared type, nullability, default and
 * primary-key membership — must match exactly.
 *
 * Only explicit indexes are compared. SQLite also creates automatic indexes for
 * inline UNIQUE constraints; those carry a null `sql` and generated names
 * (`sqlite_autoindex_*`), so they are compared through `index_list` origin
 * instead of by name.
 */
function tableFingerprint(database: Database.Database, table: string) {
  const columns = (
    database.prepare(`pragma table_info(${table})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>
  )
    .map((column) => ({
      name: column.name,
      type: column.type.toLowerCase(),
      notNull: column.notnull === 1,
      default: column.dflt_value,
      primaryKey: column.pk,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const foreignKeys = (
    database.prepare(`pragma foreign_key_list(${table})`).all() as Array<{
      table: string;
      from: string;
      to: string | null;
    }>
  )
    .map((key) => `${key.from} -> ${key.table}.${key.to ?? "rowid"}`)
    .sort();

  const explicitIndexes = (
    database
      .prepare(
        "select name, sql from sqlite_master where type = 'index' and tbl_name = ? and sql is not null order by name",
      )
      .all(table) as Array<{ name: string; sql: string }>
  ).map((index) => ({
    name: index.name,
    // Normalize whitespace so formatting differences are not treated as drift.
    definition: index.sql.replace(/\s+/g, " ").trim().toLowerCase(),
  }));

  const uniqueConstraintCount = (
    database.prepare(`pragma index_list(${table})`).all() as Array<{ origin: string }>
  ).filter((index) => index.origin === "u").length;

  return { table, columns, foreignKeys, explicitIndexes, uniqueConstraintCount };
}

function schemaFingerprint(database: Database.Database) {
  return tableNames(database).map((table) => tableFingerprint(database, table));
}

function schemaVersion(database: Database.Database): string | undefined {
  const row = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;

  return row?.value;
}

function permissionCount(database: Database.Database): number {
  const row = database
    .prepare("select count(*) as count from role_permissions")
    .get() as { count: number };

  return row.count;
}

beforeEach(() => {
  workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "migration-runner-test-"));
  fs.mkdirSync(path.join(workspacePath, "uploads"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(workspacePath, { recursive: true, force: true });
});

describe("the migration registry", () => {
  it("has unique, strictly ordered, contiguous versions up to the latest", () => {
    const versions = migrations.map((migration) => migration.version);

    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((left, right) => left - right)).toEqual(versions);
    expect(versions[0]).toBe(2);
    expect(versions[versions.length - 1]).toBe(LATEST_SCHEMA_VERSION);
    expect(versions).toEqual(
      Array.from({ length: LATEST_SCHEMA_VERSION - 1 }, (_, index) => index + 2),
    );
  });

  it("names every migration", () => {
    for (const migration of migrations) {
      expect(migration.name.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("creating a fresh database", () => {
  it("creates the latest schema directly and records the current version", () => {
    const database = openDatabaseFile();

    try {
      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toEqual({ kind: "created", version: LATEST_SCHEMA_VERSION });
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
      expect(tableNames(database)).toHaveLength(26);
      expect(database.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("does not write a safety backup for a database that did not exist", () => {
    const database = openDatabaseFile();

    try {
      migrateDatabase(database, migrateOptions());
    } finally {
      database.close();
    }

    expect(fs.existsSync(backupsDirectory())).toBe(false);
  });
});

describe("upgrading from the released schemas", () => {
  it("upgrades a released v0.1.0 (schema 8) database and preserves business data", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);
      seedReleasedBusiness(database);
      expect(schemaVersion(database)).toBe("8");

      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toMatchObject({ kind: "upgraded", fromVersion: 8 });
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
      expect(tableNames(database)).toHaveLength(26);

      const rental = database
        .prepare("select contract_no, total_amount, remaining_amount from rentals where id = 1")
        .get() as { contract_no: string; total_amount: number; remaining_amount: number };
      expect(rental).toEqual({
        contract_no: "CNT-REL-1",
        total_amount: 166.5,
        remaining_amount: 66.5,
      });

      expect(database.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("upgrades a released v0.3.9 (schema 11) database and preserves its amounts", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedReleasedBusiness(database);
      expect(schemaVersion(database)).toBe("11");

      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toMatchObject({ kind: "upgraded", fromVersion: 11 });
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));

      // The REAL columns keep the shop's original values untouched; the minor
      // columns beside them are what the app now calculates with.
      const rental = database
        .prepare(
          `select total_amount, total_amount_minor, remaining_amount, remaining_amount_minor
           from rentals where id = 1`,
        )
        .get() as Record<string, number>;
      expect(rental).toEqual({
        total_amount: 166.5,
        total_amount_minor: 16650,
        remaining_amount: 66.5,
        remaining_amount_minor: 6650,
      });

      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("gives a released v11 upgrade the same schema as a fresh database", () => {
    const upgraded = openDatabaseFile();
    const fresh = openDatabaseFile("fresh.db");

    try {
      upgraded.exec(releasedV11Sql);
      migrateDatabase(upgraded, migrateOptions());
      migrateDatabase(
        fresh,
        migrateOptions({ databasePath: databaseFilePath("fresh.db") }),
      );

      expect(tableNames(upgraded)).toEqual(tableNames(fresh));
      expect(schemaFingerprint(upgraded)).toEqual(schemaFingerprint(fresh));
    } finally {
      upgraded.close();
      fresh.close();
    }
  });

  it("writes a verified safety backup for a released upgrade", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);
      seedReleasedBusiness(database);
      fs.writeFileSync(path.join(workspacePath, "uploads", "contract.pdf"), "bytes");

      const outcome = migrateDatabase(database, migrateOptions());
      const backupPath = (outcome as { safetyBackupPath: string }).safetyBackupPath;

      expect(backupPath.endsWith(".zip")).toBe(true);
      const archive = openBackupArchive(backupPath);
      expect(archive.readMetadata()).toMatchObject({
        backupType: "safety_before_migration",
        sourceSchemaVersion: 8,
        targetSchemaVersion: LATEST_SCHEMA_VERSION,
      });
      expect(archive.entryNames).toContain("uploads/contract.pdf");
      // No .partial should survive a successful run.
      expect(listBackups().filter((name) => name.includes("partial"))).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("gives a released v8 upgrade the same schema as a fresh database", () => {
    const upgraded = openDatabaseFile();
    const fresh = openDatabaseFile("fresh.db");

    try {
      upgraded.exec(releasedV8Sql);
      migrateDatabase(upgraded, migrateOptions());
      migrateDatabase(
        fresh,
        migrateOptions({ databasePath: databaseFilePath("fresh.db") }),
      );

      expect(tableNames(upgraded)).toEqual(tableNames(fresh));
      expect(schemaFingerprint(upgraded)).toEqual(schemaFingerprint(fresh));
    } finally {
      upgraded.close();
      fresh.close();
    }
  });
});

describe("upgrading synthetic fixtures", () => {
  it("upgrades a hand-written version 1 database and preserves its rows", () => {
    const database = openDatabaseFile();

    try {
      database.exec(version1Sql);
      database
        .prepare("insert into app_settings (key, value) values ('schema_version', '1')")
        .run();
      seedVersion1Business(database);

      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome.kind).toBe("upgraded");
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));

      const rental = database
        .prepare("select contract_no, total_amount from rentals where id = 1")
        .get() as { contract_no: string; total_amount: number };
      expect(rental.contract_no).toBe("CNT-OLD-1");
      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("gives a version 1 upgrade the same schema as a fresh database, bar one documented difference", () => {
    // The guard that catches the latest-schema DDL drifting from the migration
    // chain: before the runner split, the fresh path was missing the commission
    // columns and only worked because migrations always re-ran.
    const upgraded = openDatabaseFile();
    const fresh = openDatabaseFile("fresh.db");

    try {
      upgraded.exec(version1Sql);
      upgraded
        .prepare("insert into app_settings (key, value) values ('schema_version', '1')")
        .run();
      migrateDatabase(upgraded, migrateOptions());
      migrateDatabase(
        fresh,
        migrateOptions({ databasePath: databaseFilePath("fresh.db") }),
      );

      // This is the complete set of differences, and all three are consequences
      // of what ALTER TABLE can express: it cannot add an inline UNIQUE, and it
      // cannot add a NOT NULL column without supplying a default. Each is
      // asserted by value rather than ignored, so any *other* drift in columns,
      // types, defaults, nullability, foreign keys or indexes still fails the
      // exact comparison below.
      const upgradedShape = schemaFingerprint(upgraded);
      const freshShape = schemaFingerprint(fresh);
      const columnOf = (
        shape: ReturnType<typeof schemaFingerprint>,
        table: string,
        column: string,
      ) => shape.find((entry) => entry.table === table)!.columns.find((c) => c.name === column)!;
      const tableOf = (shape: ReturnType<typeof schemaFingerprint>, table: string) =>
        shape.find((entry) => entry.table === table)!;

      // 1. maintenance_records.updated_at is added by migration 2 as a plain
      //    nullable column, because ALTER TABLE cannot add NOT NULL without a
      //    default. Every service writes it, and migration 2 backfills it from
      //    created_at, so no row is ever left null in practice.
      expect(columnOf(upgradedShape, "maintenance_records", "updated_at").notNull).toBe(false);
      expect(columnOf(freshShape, "maintenance_records", "updated_at").notNull).toBe(true);

      // 2. payments.updated_at is added NOT NULL, which forces a default, so the
      //    upgraded column carries a baked-in migration timestamp. Every insert
      //    supplies updated_at explicitly, so the default is never reached.
      expect(columnOf(upgradedShape, "payments", "updated_at").default).toMatch(
        /^'\d{4}-\d{2}-\d{2}T/,
      );
      expect(columnOf(freshShape, "payments", "updated_at").default).toBeNull();

      // 3. payments.receipt_no cannot gain an inline UNIQUE through ALTER TABLE,
      //    so the upgraded database has no sqlite_autoindex where a fresh one
      //    does. Uniqueness is enforced identically on both by the explicit
      //    payments_receipt_no_idx, asserted here.
      expect(tableOf(upgradedShape, "payments").uniqueConstraintCount).toBe(0);
      expect(tableOf(freshShape, "payments").uniqueConstraintCount).toBe(1);

      for (const shape of [upgradedShape, freshShape]) {
        const receiptIndex = tableOf(shape, "payments").explicitIndexes.find(
          (index) => index.name === "payments_receipt_no_idx",
        );
        expect(receiptIndex?.definition).toContain("unique index");
      }

      const normalize = (shape: ReturnType<typeof schemaFingerprint>) =>
        shape.map((entry) => ({
          ...entry,
          uniqueConstraintCount:
            entry.table === "payments" ? "documented" : entry.uniqueConstraintCount,
          columns: entry.columns.map((column) => {
            if (entry.table === "payments" && column.name === "updated_at") {
              return { ...column, default: "documented" };
            }

            if (entry.table === "maintenance_records" && column.name === "updated_at") {
              return { ...column, notNull: "documented" };
            }

            return column;
          }),
        }));

      expect(normalize(upgradedShape)).toEqual(normalize(freshShape));
    } finally {
      upgraded.close();
      fresh.close();
    }
  });

  it("upgrades a synthetic version 9 database", () => {
    const database = openDatabaseFile();

    try {
      buildFixtureAtVersion(database, 9);

      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toMatchObject({ kind: "upgraded", fromVersion: 9 });
      expect(columnNames(database, "vehicles")).toContain("chassis_number");
      expect(columnNames(database, "users")).toContain("earns_commission");
    } finally {
      database.close();
    }
  });

  it("is idempotent when the database is reopened", () => {
    const first = openDatabaseFile();
    try {
      migrateDatabase(first, migrateOptions());
    } finally {
      first.close();
    }

    const second = openDatabaseFile();
    try {
      const outcome = migrateDatabase(second, migrateOptions());

      expect(outcome).toEqual({ kind: "current", version: LATEST_SCHEMA_VERSION });
      expect(tableNames(second)).toHaveLength(26);
    } finally {
      second.close();
    }
  });
});

describe("rejecting databases it must not touch", () => {
  it("refuses a database recorded at a future schema version", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      database
        .prepare("update app_settings set value = '99' where key = 'schema_version'")
        .run();

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /newer version of the app/,
      );
      expect(schemaVersion(database)).toBe("99");
    } finally {
      database.close();
    }
  });

  it("refuses a populated database with no app_settings table", () => {
    const database = openDatabaseFile();

    try {
      database.exec("create table vehicles (id integer primary key);");

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /not a Rental Desk data file/,
      );
    } finally {
      database.close();
    }
  });

  it("refuses a populated database whose schema version row is missing", () => {
    const database = openDatabaseFile();

    try {
      database.exec(version1Sql);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /missing its schema version/,
      );
      expect(listBackups()).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("refuses a database that already fails its foreign key check", () => {
    const database = new Database(databaseFilePath());

    try {
      database.exec(releasedV8Sql);
      // Written with enforcement off so the violation is already present, as it
      // would be in a damaged file arriving from the field.
      database.pragma("foreign_keys = OFF");
      database
        .prepare(
          `insert into payments (rental_id, type, method, amount, payment_date, status, created_at, updated_at)
           values (999, 'rent', 'cash', 10, '2026-01-01', 'posted', '2026-01-01', '2026-01-01')`,
        )
        .run();

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /foreign key check/,
      );
      expect(listBackups()).toHaveLength(0);
      expect(schemaVersion(database)).toBe("8");
    } finally {
      database.close();
    }
  });
});

describe("the WAL checkpoint gate", () => {
  it("accepts a fully incorporated WAL", () => {
    const stub = {
      pragma: () => [{ busy: 0, log: 0, checkpointed: 0 }],
    } as unknown as Database.Database;

    expect(() => assertWalFullyCheckpointed(stub)).not.toThrow();
  });

  it("aborts when the checkpoint reports the file is busy", () => {
    const stub = {
      pragma: () => [{ busy: 1, log: 4, checkpointed: 4 }],
    } as unknown as Database.Database;

    expect(() => assertWalFullyCheckpointed(stub)).toThrow(/Another process/);
  });

  it("aborts when only part of the WAL was incorporated", () => {
    const stub = {
      pragma: () => [{ busy: 0, log: 10, checkpointed: 4 }],
    } as unknown as Database.Database;

    expect(() => assertWalFullyCheckpointed(stub)).toThrow(/4 of 10 pending writes/);
  });

  it("aborts when the checkpoint throws", () => {
    const stub = {
      pragma: () => {
        throw new Error("disk I/O error");
      },
    } as unknown as Database.Database;

    expect(() => assertWalFullyCheckpointed(stub)).toThrow(/disk I\/O error/);
  });

  it("aborts when the checkpoint result is malformed", () => {
    const stub = { pragma: () => undefined } as unknown as Database.Database;

    expect(() => assertWalFullyCheckpointed(stub)).toThrow(
      /Could not confirm pending writes/,
    );
  });
});

describe("safety backup verification", () => {
  function backupContext(overrides: Record<string, unknown> = {}) {
    return {
      userDataPath: workspacePath,
      databasePath: databaseFilePath(),
      uploadsPath: path.join(workspacePath, "uploads"),
      appVersion: "0.4.0-test",
      fromVersion: 8,
      toVersion: LATEST_SCHEMA_VERSION,
      ...overrides,
    } as Parameters<typeof writeMigrationSafetyBackup>[0];
  }

  function writeReleasedV8File(): void {
    const database = new Database(databaseFilePath());
    database.exec(releasedV8Sql);
    database.close();
  }

  it("renames the archive into place only after verification succeeds", () => {
    writeReleasedV8File();

    const backupPath = writeMigrationSafetyBackup(backupContext());

    expect(backupPath.endsWith(".zip")).toBe(true);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(listBackups().filter((name) => name.includes("partial"))).toHaveLength(0);
  });

  it("rejects an archive whose database is corrupt", () => {
    fs.writeFileSync(databaseFilePath(), "this is not a database");

    expect(() => writeMigrationSafetyBackup(backupContext())).toThrow(
      MigrationFailedError,
    );
    expect(listBackups().filter((name) => name.endsWith(".zip"))).toHaveLength(0);
  });

  it("rejects an archive missing the database entirely", () => {
    // No rental_app.db on disk at all, so the archive cannot be restorable.
    expect(() => writeMigrationSafetyBackup(backupContext())).toThrow(
      /missing metadata.json or rental_app.db/,
    );
    expect(listBackups().filter((name) => name.endsWith(".zip"))).toHaveLength(0);
  });

  it("rejects an archive whose schema version does not match the source", () => {
    writeReleasedV8File();

    expect(() =>
      writeMigrationSafetyBackup(backupContext({ fromVersion: 9 })),
    ).toThrow(/records schema version 8 but the data file is at version 9/);
    expect(listBackups().filter((name) => name.endsWith(".zip"))).toHaveLength(0);
  });

  it("leaves older backups untouched when the new backup fails verification", () => {
    fs.mkdirSync(backupsDirectory(), { recursive: true });
    const existing = ["a", "b", "c", "d", "e"].map((suffix) => {
      const stalePath = path.join(
        backupsDirectory(),
        `migration_backup_v1_to_v2_old-${suffix}.zip`,
      );
      fs.writeFileSync(stalePath, "stale");
      return stalePath;
    });

    fs.writeFileSync(databaseFilePath(), "this is not a database");

    expect(() => writeMigrationSafetyBackup(backupContext())).toThrow();

    for (const stalePath of existing) {
      expect(fs.existsSync(stalePath)).toBe(true);
    }
  });

  it("removes the temporary staging directory afterwards", () => {
    writeReleasedV8File();
    writeMigrationSafetyBackup(backupContext());

    const leftovers = listBackups().filter((name) => name.startsWith(".verify-"));
    expect(leftovers).toHaveLength(0);
  });

  it("retains only the most recent archives after a verified backup", () => {
    fs.mkdirSync(backupsDirectory(), { recursive: true });

    for (let index = 0; index < 5; index += 1) {
      const stalePath = path.join(
        backupsDirectory(),
        `migration_backup_v1_to_v2_old-${index}.zip`,
      );
      fs.writeFileSync(stalePath, "stale");
      const aged = new Date(Date.now() - (index + 1) * 60_000);
      fs.utimesSync(stalePath, aged, aged);
    }

    writeReleasedV8File();
    writeMigrationSafetyBackup(backupContext());

    expect(listBackups().filter((name) => name.endsWith(".zip"))).toHaveLength(
      retainedMigrationBackups,
    );
  });
});

describe("failure handling", () => {
  it("does not migrate when the safety backup step fails", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);

      expect(() =>
        migrateDatabase(
          database,
          migrateOptions({
            createSafetyBackup: () => {
              throw new MigrationFailedError("backup refused");
            },
          }),
        ),
      ).toThrow(/backup refused/);

      // Untouched: still the released shape at its released version.
      expect(schemaVersion(database)).toBe("8");
      expect(tableNames(database)).toHaveLength(21);
    } finally {
      database.close();
    }
  });

  it("rolls a failing migration back without recording its version", () => {
    const failing: Migration = {
      version: LATEST_SCHEMA_VERSION + 1,
      name: "failing test migration",
      up: (database) => {
        database.exec("create table migration_probe (id integer primary key);");
        throw new Error("forced migration failure");
      },
    };

    const database = openDatabaseFile();
    migrations.push(failing);

    try {
      database.exec(releasedV11Sql);

      let thrown: MigrationFailedError | undefined;
      try {
        migrateDatabase(database, migrateOptions());
      } catch (error) {
        thrown = error as MigrationFailedError;
      }

      expect(thrown).toBeInstanceOf(MigrationFailedError);
      expect(thrown?.message).toMatch(/forced migration failure/);
      expect(thrown?.safetyBackupPath).toBeTruthy();
      expect(thrown?.fromVersion).toBe(11);
      expect(fs.existsSync(thrown!.safetyBackupPath!)).toBe(true);
      // Each migration commits with its own version bump, so the steps that
      // succeeded before the failure stay applied and recorded. Only the
      // failing step is rolled back, and its version is never written.
      expect(tableNames(database)).not.toContain("migration_probe");
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
    } finally {
      migrations.pop();
      database.close();
    }
  });

  it("rolls back role permission reseeding so existing permissions survive", () => {
    const database = openDatabaseFile();

    try {
      migrateDatabase(database, migrateOptions());
      const before = permissionCount(database);
      expect(before).toBeGreaterThan(0);

      // Abort partway through reseeding, after the delete has already run.
      database.exec(`
        create trigger test_abort_permission_reseed
        before insert on role_permissions
        when new.permission = 'audit.view'
        begin
          select raise(abort, 'forced reseed failure');
        end;
      `);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /forced reseed failure/,
      );

      database.exec("drop trigger test_abort_permission_reseed;");
      expect(permissionCount(database)).toBe(before);
    } finally {
      database.close();
    }
  });

  it("keeps the safety backup path when schema finishing fails after an upgrade", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);
      // Occupy an index name with a table, so index creation inside
      // finishSchema fails after the migrations have already run. This name is
      // introduced with the version 9 accessories table, so it is absent from
      // the released v8 schema and free to squat on.
      database.exec("create table accessories_is_active_idx (id integer);");

      let thrown: MigrationFailedError | undefined;
      try {
        migrateDatabase(database, migrateOptions());
      } catch (error) {
        thrown = error as MigrationFailedError;
      }

      expect(thrown).toBeInstanceOf(MigrationFailedError);
      expect(thrown?.safetyBackupPath).toBeTruthy();
      expect(fs.existsSync(thrown!.safetyBackupPath!)).toBe(true);
      expect(thrown?.fromVersion).toBe(8);
    } finally {
      database.close();
    }
  });
});

/**
 * A database that records version 12 has told every future reader that its
 * amounts live in the `*_minor` columns. If it could ever reach that state
 * without the mirror triggers, an older installed build could open it and write
 * REAL-only amounts that nothing would catch. These tests break the upgrade at
 * each point where that gap could open and show the guards are already there.
 */
describe("money mirror triggers arriving with the version stamp", () => {
  function assertGuarded(database: Database.Database): void {
    expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
    expect(mirrorTriggerCount(database)).toBe(58);

    // The guards are not merely present, they bite: this is what an old build's
    // write looks like.
    expect(() =>
      database.prepare("update payments set amount = 999 where id = 1").run(),
    ).toThrow(/payments\.amount and payments\.amount_minor disagree/);
  }

  it("has all 58 triggers when a later migration fails after version 12 commits", () => {
    const failing: Migration = {
      version: LATEST_SCHEMA_VERSION + 1,
      name: "failing test migration",
      up: () => {
        throw new Error("forced migration failure");
      },
    };

    const database = openDatabaseFile();
    migrations.push(failing);

    try {
      database.exec(releasedV11Sql);
      seedPayment(database);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /forced migration failure/,
      );

      // Version 12 legitimately stays committed — its own step succeeded — so
      // its triggers must have committed with it.
      assertGuarded(database);
    } finally {
      migrations.pop();
      database.close();
    }
  });

  it("has all 58 triggers when schema finishing fails after a v11 upgrade", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedPayment(database);
      breakSchemaFinishing(database);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /forced schema finishing failure/,
      );

      assertGuarded(database);
    } finally {
      database.close();
    }
  });

  it("has all 58 triggers when schema finishing fails after a v8 upgrade", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);
      seedPayment(database);
      breakSchemaFinishing(database);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /forced schema finishing failure/,
      );

      assertGuarded(database);
    } finally {
      database.close();
    }
  });

  it("creates a fresh database's triggers in the same transaction as its tables", () => {
    const database = openDatabaseFile();

    try {
      // A view keeps the file looking fresh — the check counts tables — while
      // occupying an index name, so schema finishing fails right after the
      // table-creation transaction commits.
      database.exec("create view accessories_is_active_idx as select 1 as x;");

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /accessories_is_active_idx/,
      );

      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
      expect(mirrorTriggerCount(database)).toBe(58);
    } finally {
      database.close();
    }
  });

  it("creates a fresh database at version 12 with its guards live", () => {
    const database = openDatabaseFile();

    try {
      migrateDatabase(database, migrateOptions());

      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
      expect(mirrorTriggerCount(database)).toBe(58);
      expect(() =>
        database
          .prepare(
            `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
             values ('car', 'Old', 'Build', 'OLD-1', 42, 0, 'available', '', '')`,
          )
          .run(),
      ).toThrow(/vehicles\.daily_price and vehicles\.daily_price_minor disagree/);
    } finally {
      database.close();
    }
  });
});

function mirrorTriggerCount(database: Database.Database): number {
  return (
    database
      .prepare(
        "select count(*) as count from sqlite_master where type = 'trigger' and name like '%\\_ck' escape '\\'",
      )
      .get() as { count: number }
  ).count;
}

/** Gives the old-style-write assertions a payment row to aim at. */
function seedPayment(database: Database.Database): void {
  const now = "2026-02-02T00:00:00.000Z";

  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
       values ('car', 'Toyota', 'Corolla', 'GUARD-1', 50, 0, 'available', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into customers (full_name, phone, created_at, updated_at)
       values ('Guard Customer', '0921111111', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into rentals (contract_no, customer_id, vehicle_id, status, start_datetime,
         expected_return_datetime, daily_price, total_amount, paid_amount, remaining_amount, created_at, updated_at)
       values ('CNT-GUARD-1', 1, 1, 'returned', ?, ?, 50, 50, 50, 0, ?, ?)`,
    )
    .run(now, now, now, now);
  database
    .prepare(
      `insert into payments (rental_id, type, method, amount, payment_date, status, created_at, updated_at)
       values (1, 'rent', 'cash', 50, ?, 'posted', ?, ?)`,
    )
    .run(now, now, now);
}

/**
 * Aborts permission reseeding, which is the first thing schema finishing does.
 * That puts the failure after every migration has committed but before any of
 * finishSchema's own repair work runs — the exact window in which a version 12
 * file could otherwise exist without its triggers.
 */
function breakSchemaFinishing(database: Database.Database): void {
  database.exec(`
    create trigger test_abort_schema_finishing
    before insert on role_permissions
    begin
      select raise(abort, 'forced schema finishing failure');
    end;
  `);
}
