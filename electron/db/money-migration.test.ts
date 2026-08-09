import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toMinorUnits } from "../../src/shared/money";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import { migrateDatabase, type MigrateOptions } from "./migration-runner";
import { moneyColumnPairs, triggerName } from "./money-columns";
import { DB_INTEGRATION_TEST_TIMEOUT_MS } from "./test-timeouts";

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

beforeEach(() => {
  workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "money-migration-test-"));
  fs.mkdirSync(path.join(workspacePath, "uploads"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(workspacePath, { recursive: true, force: true });
});

function databaseFilePath(name = "rental_app.db"): string {
  return path.join(workspacePath, name);
}

function openDatabaseFile(name = "rental_app.db"): Database.Database {
  const database = new Database(databaseFilePath(name));
  database.pragma("foreign_keys = ON");

  return database;
}

function migrateOptions(overrides: Partial<MigrateOptions> = {}): MigrateOptions {
  return {
    userDataPath: workspacePath,
    databasePath: databaseFilePath(),
    uploadsPath: path.join(workspacePath, "uploads"),
    appVersion: "0.4.0",
    ...overrides,
  };
}

/**
 * Business rows covering the awkward values: a half cent that rounds away from
 * zero, the classic 0.1 + 0.2 result, a value that only reads correctly from
 * its shortest decimal text, and a null in each nullable column.
 */
function seedAwkwardMoney(database: Database.Database): void {
  const now = "2026-02-02T00:00:00.000Z";

  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
       values ('car', 'Toyota', 'Corolla', 'MONEY-1', 1.005, 2.675, 'available', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, deposit_amount, status, created_at, updated_at)
       values ('car', 'Kia', 'Rio', 'MONEY-2', ?, 0, 'available', ?, ?)`,
    )
    .run(0.1 + 0.2, now, now);
  database
    .prepare(
      `insert into customers (full_name, phone, created_at, updated_at)
       values ('Money Customer', '0921111111', ?, ?)`,
    )
    .run(now, now);
  database
    .prepare(
      `insert into rentals (contract_no, customer_id, vehicle_id, status, start_datetime,
         expected_return_datetime, daily_price, total_amount, paid_amount, remaining_amount, created_at, updated_at)
       values ('CNT-MONEY-1', 1, 1, 'returned', ?, ?, 1.005, 12.345, 0.1, 12.245, ?, ?)`,
    )
    .run(now, now, now, now);
  database
    .prepare(
      `insert into payments (rental_id, type, method, amount, payment_date, status, created_at, updated_at)
       values (1, 'rent', 'cash', 0.005, ?, 'posted', ?, ?)`,
    )
    .run(now, now, now);
  database
    .prepare(
      `insert into daily_closings (closing_date, expected_cash, counted_cash, difference, closed_at, updated_at)
       values ('2026-02-02', 100, 87.55, -12.45, ?, ?)`,
    )
    .run(now, now);
}

/** Only exists from version 11; the nullable pairs live in these two tables. */
function seedNullableMoney(database: Database.Database): void {
  const now = "2026-02-02T00:00:00.000Z";

  database
    .prepare(
      "update vehicles set commission_rate_override = 2.5 where plate_number = 'MONEY-1'",
    )
    .run();
  database
    .prepare(
      `insert into rental_collateral_items (rental_id, type, description, estimated_value, status, received_at, created_at, updated_at)
       values (1, 'passport', 'Passport held', null, 'held', ?, ?, ?)`,
    )
    .run(now, now, now);
  database
    .prepare(
      `insert into rental_collateral_items (rental_id, type, description, estimated_value, status, received_at, created_at, updated_at)
       values (1, 'cash', 'Cash amanat', 1.005, 'held', ?, ?, ?)`,
    )
    .run(now, now, now);
}

function columnValues(
  database: Database.Database,
  table: string,
  columns: string[],
  where = "1 = 1",
): Array<Record<string, unknown>> {
  return database
    .prepare(`select ${columns.join(", ")} from ${table} where ${where} order by id`)
    .all() as Array<Record<string, unknown>>;
}

/**
 * Writes a vehicle row with an explicit legacy/minor pair, so a trigger case can
 * be stated as the two numbers it is really about.
 */
function insertVehicle(
  database: Database.Database,
  plateNumber: string,
  legacy: number,
  minor: number,
): void {
  database
    .prepare(
      `insert into vehicles (type, brand, model, plate_number, daily_price, daily_price_minor,
         deposit_amount, deposit_amount_minor, status, created_at, updated_at)
       values ('car', 'Probe', 'Probe', ?, ?, ?, 0, 0, 'available', '', '')`,
    )
    .run(plateNumber, legacy, minor);
}

function triggerNames(database: Database.Database): string[] {
  return (
    database
      .prepare("select name from sqlite_master where type = 'trigger' order by name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe("migration 12 backfill", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("converts every one of the 29 columns on a released v11 upgrade", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);
      seedNullableMoney(database);

      migrateDatabase(database, migrateOptions());

      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));

      // Every pair, checked by re-deriving the conversion from the mirror that
      // is still sitting in the row.
      for (const pair of moneyColumnPairs) {
        const rows = columnValues(database, pair.table, [
          "id",
          `${pair.legacyColumn} as legacy`,
          `${pair.minorColumn} as minor`,
        ]);

        for (const row of rows) {
          if (row.legacy === null) {
            expect(pair.nullable).toBe(true);
            expect(row.minor).toBeNull();
            continue;
          }

          expect(row.minor).toBe(toMinorUnits(row.legacy as number));
        }
      }
    } finally {
      database.close();
    }
  });

  it("rounds half cents away from zero in both directions", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);

      migrateDatabase(database, migrateOptions());

      const vehicle = columnValues(
        database,
        "vehicles",
        ["daily_price_minor as dailyPrice", "deposit_amount_minor as deposit"],
        "plate_number = 'MONEY-1'",
      )[0];
      expect(vehicle).toEqual({ dailyPrice: 101, deposit: 268 });

      const closing = columnValues(database, "daily_closings", [
        "expected_cash_minor as expected",
        "counted_cash_minor as counted",
        "difference_minor as difference",
      ])[0];
      // A short drawer stays negative, and -12.45 does not drift.
      expect(closing).toEqual({ expected: 10000, counted: 8755, difference: -1245 });

      const payment = columnValues(database, "payments", [
        "amount_minor as amount",
      ])[0];
      expect(payment).toEqual({ amount: 1 });
    } finally {
      database.close();
    }
  });

  it("converts the 0.1 + 0.2 value to an exact 30 cents", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);

      migrateDatabase(database, migrateOptions());

      const vehicle = columnValues(
        database,
        "vehicles",
        ["daily_price_minor as dailyPrice"],
        "plate_number = 'MONEY-2'",
      )[0];

      expect(vehicle).toEqual({ dailyPrice: 30 });
    } finally {
      database.close();
    }
  });

  it("preserves null in both nullable pairs and converts the values beside them", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);
      seedNullableMoney(database);

      migrateDatabase(database, migrateOptions());

      const collateral = columnValues(database, "rental_collateral_items", [
        "estimated_value as legacy",
        "estimated_value_minor as minor",
      ]);
      expect(collateral).toEqual([
        { legacy: null, minor: null },
        { legacy: 1.005, minor: 101 },
      ]);

      const overrides = columnValues(database, "vehicles", [
        "commission_rate_override as legacy",
        "commission_rate_override_minor as minor",
      ]);
      expect(overrides).toEqual([
        { legacy: 2.5, minor: 250 },
        { legacy: null, minor: null },
      ]);
    } finally {
      database.close();
    }
  });

  it("upgrades a released v8 database through to version 12", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV8Sql);
      seedAwkwardMoney(database);

      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toMatchObject({ kind: "upgraded", fromVersion: 8 });
      expect(schemaVersion(database)).toBe(String(LATEST_SCHEMA_VERSION));
      expect(
        columnValues(
          database,
          "vehicles",
          ["daily_price_minor as dailyPrice"],
          "plate_number = 'MONEY-1'",
        )[0],
      ).toEqual({ dailyPrice: 101 });
      expect(database.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(database.pragma("foreign_key_check")).toHaveLength(0);
    } finally {
      database.close();
    }
  });

  it("stamps a fresh database at version 12 with every minor column present", () => {
    const database = openDatabaseFile();

    try {
      const outcome = migrateDatabase(database, migrateOptions());

      expect(outcome).toEqual({ kind: "created", version: LATEST_SCHEMA_VERSION });

      for (const pair of moneyColumnPairs) {
        const columns = (
          database.prepare(`pragma table_info(${pair.table})`).all() as Array<{
            name: string;
            type: string;
            notnull: number;
          }>
        ).filter((column) => column.name === pair.minorColumn);

        expect(columns).toHaveLength(1);
        expect(columns[0]!.type.toLowerCase()).toBe("integer");
        expect(columns[0]!.notnull === 1).toBe(!pair.nullable);
      }
    } finally {
      database.close();
    }
  });
});

describe("migration 12 refusing bad data", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("aborts on a value outside the safe range and leaves the file at version 11", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);
      database
        .prepare("update vehicles set daily_price = ? where plate_number = 'MONEY-1'")
        .run(1e18);

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /vehicles row 1 column daily_price/,
      );

      // Nothing was applied: the file is still exactly what it was.
      expect(schemaVersion(database)).toBe("11");
      expect(columnNames(database, "vehicles")).not.toContain("daily_price_minor");
      expect(
        columnValues(
          database,
          "vehicles",
          ["daily_price as price"],
          "plate_number = 'MONEY-1'",
        )[0],
      ).toEqual({ price: 1e18 });
    } finally {
      database.close();
    }
  });

  it("aborts on a non-numeric legacy value and names the row", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);
      // REAL affinity keeps text that cannot be coerced to a number.
      database
        .prepare("update payments set amount = 'not a number' where id = 1")
        .run();

      expect(() => migrateDatabase(database, migrateOptions())).toThrow(
        /payments row 1 column amount/,
      );
      expect(schemaVersion(database)).toBe("11");
    } finally {
      database.close();
    }
  });

  it("keeps the verified safety backup written before the failure", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      seedAwkwardMoney(database);
      database
        .prepare("update vehicles set daily_price = ? where plate_number = 'MONEY-1'")
        .run(1e18);

      let backupPath: string | null = null;
      try {
        migrateDatabase(database, migrateOptions());
      } catch (error) {
        backupPath = (error as { safetyBackupPath: string | null }).safetyBackupPath;
      }

      expect(backupPath).toBeTruthy();
      expect(fs.existsSync(backupPath!)).toBe(true);
    } finally {
      database.close();
    }
  });
});

describe("the mirror consistency triggers", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  function upgraded(): Database.Database {
    const database = openDatabaseFile();
    database.exec(releasedV11Sql);
    seedAwkwardMoney(database);
    // Carries a half-cent value into a nullable pair too, so the relaxed update
    // rule is exercised on both shapes of trigger.
    seedNullableMoney(database);
    migrateDatabase(database, migrateOptions());

    return database;
  }

  it("creates both triggers for every pair", () => {
    const database = upgraded();

    try {
      const names = triggerNames(database);

      for (const pair of moneyColumnPairs) {
        expect(names).toContain(triggerName(pair, "insert"));
        expect(names).toContain(triggerName(pair, "update"));
      }
    } finally {
      database.close();
    }
  });

  it("rejects an old-style insert that writes only the REAL column", () => {
    const database = upgraded();

    try {
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

  it("rejects an old-style update that changes only the REAL column", () => {
    const database = upgraded();

    try {
      expect(() =>
        database
          .prepare("update payments set amount = 999 where id = 1")
          .run(),
      ).toThrow(/payments\.amount and payments\.amount_minor disagree/);
    } finally {
      database.close();
    }
  });

  it("rejects an update that changes only the minor column", () => {
    const database = upgraded();

    try {
      expect(() =>
        database.prepare("update payments set amount_minor = 999 where id = 1").run(),
      ).toThrow(/payments\.amount and payments\.amount_minor disagree/);
    } finally {
      database.close();
    }
  });

  it("accepts a write that keeps the pair in step", () => {
    const database = upgraded();

    try {
      database
        .prepare("update payments set amount = 9.99, amount_minor = 999 where id = 1")
        .run();

      expect(
        columnValues(database, "payments", ["amount_minor as amount"])[0],
      ).toEqual({ amount: 999 });
    } finally {
      database.close();
    }
  });

  it("rejects a half-cent mirror on insert, at either adjacent minor value", () => {
    const database = upgraded();

    // 1.005 rounds to 101, so 101 is the only defensible partner — and even it
    // is refused, because a new row must carry the normalized mirror 1.01. An
    // approximate rule would have let both 100 and 101 through here.
    try {
      for (const [legacy, minor] of [
        [1.005, 100],
        [1.005, 101],
        [2.675, 267],
        [2.675, 268],
      ]) {
        expect(() =>
          insertVehicle(database, `HALF-${legacy}-${minor}`, legacy, minor),
        ).toThrow(/vehicles\.daily_price and vehicles\.daily_price_minor disagree/);
      }
    } finally {
      database.close();
    }
  });

  it("rejects a negative half-cent mirror at either adjacent minor value", () => {
    const database = upgraded();

    try {
      for (const [legacy, minor] of [
        [-1.005, -100],
        [-1.005, -101],
        [-2.675, -267],
        [-2.675, -268],
      ]) {
        expect(() =>
          insertVehicle(database, `NEG-${legacy}-${minor}`, legacy, minor),
        ).toThrow(/disagree/);
      }
    } finally {
      database.close();
    }
  });

  it("accepts the normalized pairs this app actually writes", () => {
    const database = upgraded();

    try {
      // What `fromMinorUnits` produces for each of the values above.
      for (const [legacy, minor] of [
        [1.01, 101],
        [2.68, 268],
        [-1.01, -101],
        [-2.68, -268],
        [0, 0],
        [100, 10000],
      ]) {
        expect(() =>
          insertVehicle(database, `OK-${legacy}-${minor}`, legacy, minor),
        ).not.toThrow();
      }
    } finally {
      database.close();
    }
  });

  it("accepts a pair at the safe-integer boundary", () => {
    const database = upgraded();

    try {
      // The exact rule has to survive the largest amount the app can store, in
      // both directions, or it would be quietly unusable at the extremes.
      for (const minor of [
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER - 1,
      ]) {
        expect(() =>
          insertVehicle(database, `EDGE-${minor}`, minor / 100, minor),
        ).not.toThrow();
      }

      // A one-cent desync is still caught this far out. The single exception is
      // MAX_SAFE_INTEGER itself, whose mirror is the same double as its
      // predecessor's — the REAL column simply has no room left to hold a cent
      // there. No mirror rule can see that, and no real shop reaches it.
      expect(() =>
        insertVehicle(
          database,
          "EDGE-OFF",
          (Number.MAX_SAFE_INTEGER - 1) / 100,
          Number.MAX_SAFE_INTEGER - 2,
        ),
      ).toThrow(/disagree/);
    } finally {
      database.close();
    }
  });

  it("allows an unrelated update to a migrated half-cent row", () => {
    const database = upgraded();

    try {
      // The row still holds the shop's original 1.005 beside 101. Editing the
      // model must not force the shop to accept a rewritten price.
      database
        .prepare("update vehicles set model = 'Corolla LE' where plate_number = 'MONEY-1'")
        .run();

      expect(
        columnValues(
          database,
          "vehicles",
          ["daily_price as legacy", "daily_price_minor as minor"],
          "plate_number = 'MONEY-1'",
        )[0],
      ).toEqual({ legacy: 1.005, minor: 101 });
    } finally {
      database.close();
    }
  });

  it("allows a migrated half-cent pair to be resubmitted unchanged", () => {
    const database = upgraded();

    try {
      // An update statement that names both columns but changes neither — what
      // a full-row write of an untouched record looks like.
      database
        .prepare(
          "update vehicles set daily_price = 1.005, daily_price_minor = 101, model = 'Corolla' where plate_number = 'MONEY-1'",
        )
        .run();

      expect(
        columnValues(
          database,
          "vehicles",
          ["daily_price as legacy", "daily_price_minor as minor"],
          "plate_number = 'MONEY-1'",
        )[0],
      ).toEqual({ legacy: 1.005, minor: 101 });
    } finally {
      database.close();
    }
  });

  it("rejects changing a migrated half-cent pair without normalizing it", () => {
    const database = upgraded();

    try {
      // Changing either member re-arms the exact rule, so the only way to edit
      // a historical row's amount is to write a correct pair.
      expect(() =>
        database
          .prepare(
            "update vehicles set daily_price = 1.005, daily_price_minor = 102 where plate_number = 'MONEY-1'",
          )
          .run(),
      ).toThrow(/disagree/);

      expect(() =>
        database
          .prepare(
            "update vehicles set daily_price = 3.005, daily_price_minor = 301 where plate_number = 'MONEY-1'",
          )
          .run(),
      ).toThrow(/disagree/);

      expect(() =>
        database
          .prepare(
            "update vehicles set daily_price = 3.01, daily_price_minor = 301 where plate_number = 'MONEY-1'",
          )
          .run(),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("rejects a fractional minor value", () => {
    const database = upgraded();

    try {
      expect(() =>
        database
          .prepare("update payments set amount = 9.99, amount_minor = 999.5 where id = 1")
          .run(),
      ).toThrow(/disagree/);
    } finally {
      database.close();
    }
  });

  it("requires both members of a nullable pair to agree about being empty", () => {
    const database = upgraded();
    const now = "2026-02-02T00:00:00.000Z";

    try {
      expect(() =>
        database
          .prepare(
            `insert into rental_collateral_items (rental_id, type, description, estimated_value, status, received_at, created_at, updated_at)
             values (1, 'cash', 'Half a pair', 5, 'held', ?, ?, ?)`,
          )
          .run(now, now, now),
      ).toThrow(/disagree/);

      expect(() =>
        database
          .prepare(
            `insert into rental_collateral_items (rental_id, type, description, estimated_value, estimated_value_minor, status, received_at, created_at, updated_at)
             values (1, 'cash', 'Matched pair', 5, 500, 'held', ?, ?, ?)`,
          )
          .run(now, now, now),
      ).not.toThrow();

      expect(() =>
        database
          .prepare(
            `insert into rental_collateral_items (rental_id, type, description, status, received_at, created_at, updated_at)
             values (1, 'passport', 'Both empty', 'held', ?, ?, ?)`,
          )
          .run(now, now, now),
      ).not.toThrow();

      // The exact rule applies to a nullable pair that does hold a value.
      expect(() =>
        database
          .prepare(
            `insert into rental_collateral_items (rental_id, type, description, estimated_value, estimated_value_minor, status, received_at, created_at, updated_at)
             values (1, 'cash', 'Half cent', 1.005, 101, 'held', ?, ?, ?)`,
          )
          .run(now, now, now),
      ).toThrow(/disagree/);
    } finally {
      database.close();
    }
  });

  it("leaves a migrated nullable pair editable without normalizing it", () => {
    const database = upgraded();

    try {
      // Seeded at 1.005 before the upgrade, so it carries the same half-cent
      // mirror the required pairs do.
      database
        .prepare(
          "update rental_collateral_items set description = 'Renamed' where description = 'Cash amanat'",
        )
        .run();

      expect(
        columnValues(
          database,
          "rental_collateral_items",
          ["estimated_value as legacy", "estimated_value_minor as minor"],
          "description = 'Renamed'",
        )[0],
      ).toEqual({ legacy: 1.005, minor: 101 });

      // Clearing both members together is a change, and a matched one.
      expect(() =>
        database
          .prepare(
            "update rental_collateral_items set estimated_value = null, estimated_value_minor = null where description = 'Renamed'",
          )
          .run(),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("does not fire for an update that touches neither member", () => {
    const database = upgraded();

    try {
      expect(() =>
        database.prepare("update payments set notes = 'touched' where id = 1").run(),
      ).not.toThrow();
    } finally {
      database.close();
    }
  });
});

describe("schema drift", { timeout: DB_INTEGRATION_TEST_TIMEOUT_MS }, () => {
  it("gives a v11 upgrade the same triggers as a fresh database", () => {
    const upgraded = openDatabaseFile();
    const fresh = openDatabaseFile("fresh.db");

    try {
      upgraded.exec(releasedV11Sql);
      migrateDatabase(upgraded, migrateOptions());
      migrateDatabase(
        fresh,
        migrateOptions({ databasePath: databaseFilePath("fresh.db") }),
      );

      expect(triggerDefinitions(upgraded)).toEqual(triggerDefinitions(fresh));
      expect(triggerDefinitions(fresh)).toHaveLength(58);
    } finally {
      upgraded.close();
      fresh.close();
    }
  });

  it("gives a v8 upgrade the same triggers as a fresh database", () => {
    const upgraded = openDatabaseFile();
    const fresh = openDatabaseFile("fresh.db");

    try {
      upgraded.exec(releasedV8Sql);
      migrateDatabase(upgraded, migrateOptions());
      migrateDatabase(
        fresh,
        migrateOptions({ databasePath: databaseFilePath("fresh.db") }),
      );

      expect(triggerDefinitions(upgraded)).toEqual(triggerDefinitions(fresh));
    } finally {
      upgraded.close();
      fresh.close();
    }
  });

  it("repoints the money indexes on an upgrade rather than leaving the old ones", () => {
    const database = openDatabaseFile();

    try {
      database.exec(releasedV11Sql);
      migrateDatabase(database, migrateOptions());

      const definitions = new Map(
        (
          database
            .prepare(
              "select name, sql from sqlite_master where type = 'index' and sql is not null",
            )
            .all() as Array<{ name: string; sql: string }>
        ).map((row) => [row.name, row.sql.toLowerCase()]),
      );

      expect(definitions.get("rentals_status_remaining_amount_idx")).toContain(
        "remaining_amount_minor",
      );
      expect(definitions.get("payments_status_type_rental_amount_idx")).toContain(
        "amount_minor",
      );
    } finally {
      database.close();
    }
  });
});

function triggerDefinitions(database: Database.Database) {
  return (
    database
      .prepare(
        "select name, sql from sqlite_master where type = 'trigger' order by name",
      )
      .all() as Array<{ name: string; sql: string }>
  ).map((row) => ({
    name: row.name,
    definition: row.sql.replace(/\s+/g, " ").trim().toLowerCase(),
  }));
}

function schemaVersion(database: Database.Database): string | undefined {
  const row = database
    .prepare("select value from app_settings where key = 'schema_version'")
    .get() as { value?: string } | undefined;

  return row?.value;
}

function columnNames(database: Database.Database, table: string): string[] {
  return (
    database.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}
