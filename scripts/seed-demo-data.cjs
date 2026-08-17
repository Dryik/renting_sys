/**
 * Fills a development database with demo customers, vehicles and rentals.
 *
 * This writes into the **installed application's** database, in the Electron
 * userData directory — the same file a real shop's records live in. It inserts
 * at fixed primary keys, so on a machine that has been used for real work it
 * would replace customer 1, vehicle 1 and so on with invented data. There is no
 * undo.
 *
 * It therefore does nothing by default. Run it once to see what it found, then
 * again with the confirmation to write:
 *
 *   electron scripts/seed-demo-data.cjs
 *   electron scripts/seed-demo-data.cjs --confirm OVERWRITE-MY-DATABASE
 *
 * Run it through `electron`, not `node`: this repository rebuilds better-sqlite3
 * for Electron's ABI in postinstall, so plain node cannot open the database.
 *
 * Even confirmed, it refuses any database that already holds records at the ids
 * it would take, or that looks like a real shop. Overriding that needs --force
 * as well, which is deliberately awkward: on a shop machine it is the wrong
 * command whatever the flags say. Take a backup from the app first.
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const CONFIRMATION = "OVERWRITE-MY-DATABASE";

/** Exactly what this script writes, and therefore exactly what it can destroy. */
const DEMO_IDS = {
  customers: [1, 2, 3, 4, 5],
  vehicles: [1, 2, 3, 4, 5, 6],
  accessories: [1, 2, 3],
  rentals: [101, 102, 103],
};

const args = process.argv.slice(2);
const confirmIndex = args.indexOf("--confirm");
const confirmed =
  confirmIndex !== -1 && args[confirmIndex + 1] === CONFIRMATION;
const forced = args.includes("--force");

const appData =
  process.env.APPDATA ||
  path.join(process.env.USERPROFILE, "AppData", "Roaming");
const targets = [
  path.join(appData, "ARAK Rental Desk"),
  path.join(appData, "arak-rental-desk"),
  path.join(appData, "Electron"),
];

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const inThreeDays = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

function countRows(db, table, ids) {
  try {
    const sql = ids
      ? `select count(*) as n from ${table} where id in (${ids.join(",")})`
      : `select count(*) as n from ${table}`;
    return db.prepare(sql).get()?.n ?? 0;
  } catch {
    // A table this build does not have cannot be overwritten by this script.
    return 0;
  }
}

/** What is already there, so the operator decides with the numbers in front of them. */
function inspect(db) {
  const collisions = {};
  let collisionTotal = 0;

  for (const [table, ids] of Object.entries(DEMO_IDS)) {
    const hits = countRows(db, table, ids);
    if (hits > 0) {
      collisions[table] = hits;
      collisionTotal += hits;
    }
  }

  return {
    collisions,
    collisionTotal,
    totals: {
      customers: countRows(db, "customers"),
      vehicles: countRows(db, "vehicles"),
      rentals: countRows(db, "rentals"),
      payments: countRows(db, "payments"),
    },
  };
}

function seed(db) {
  const insertCustomer = db.prepare(`
    INSERT OR REPLACE INTO customers (
      id, full_name, phone, secondary_phone, national_id, driver_license_no, address, notes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  insertCustomer.run(1, "محمد علي المنصوري", "0501234567", "0509876543", "1092837465", "DL-998811", "الرياض - حي النخيل", "عميل دائم وموثوق", now, now);
  insertCustomer.run(2, "سارة أحمد الخالدي", "0559876543", null, "1029384756", "DL-554433", "جدة - حي الروضة", null, now, now);
  insertCustomer.run(3, "يوسف ابراهيم الهاشمي", "0567891234", null, "1084739201", "DL-112233", "دبي - وسط المدينة", null, now, now);
  insertCustomer.run(4, "عبد الرحمن بن فهد", "0543219876", "0541122334", "1039485721", "DL-667788", "الدمام - حي الشاطئ", null, now, now);
  insertCustomer.run(5, "فاطمة محمود الزهراني", "0598765432", null, "1058493021", "DL-334455", "الخبر - حي العليا", null, now, now);

  const insertVehicle = db.prepare(`
    INSERT OR REPLACE INTO vehicles (
      id, type, brand, model, year, color, plate_number, chassis_number,
      daily_price, daily_price_minor, deposit_amount, deposit_amount_minor,
      mileage, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertVehicle.run(1, "car", "Toyota", "Camry GLX", 2024, "أبيض لؤلؤي", "16253", "CH-CAMRY-2024-01", 150, 15000, 500, 50000, 14200, "available", now, now);
  insertVehicle.run(2, "car", "Hyundai", "Elantra Smart", 2023, "فضي", "16258", "CH-ELANT-2023-02", 120, 12000, 300, 30000, 28500, "available", now, now);
  insertVehicle.run(3, "car", "Nissan", "Patrol Titanium", 2024, "أسود ملكي", "9999", "CH-PATROL-2024-03", 350, 35000, 1000, 100000, 9800, "available", now, now);
  insertVehicle.run(4, "motorcycle", "Aprilia", "SR GT 200", 2024, "أحمر رياضي", "4321", "CH-APRIL-2024-04", 80, 8000, 200, 20000, 3400, "available", now, now);
  insertVehicle.run(5, "motorcycle", "Yamaha", "TMAX 560", 2023, "رمادي غير لامع", "7777", "CH-TMAX-2023-05", 130, 13000, 400, 40000, 5200, "rented", now, now);
  insertVehicle.run(6, "car", "Kia", "K5 GT-Line", 2023, "أزرق محيطي", "3344", "CH-KIAK5-2023-06", 140, 14000, 400, 40000, 19100, "available", now, now);

  const insertAccessory = db.prepare(`
    INSERT OR REPLACE INTO accessories (
      id, name, quantity_owned, default_charge, default_charge_minor, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  insertAccessory.run(1, "خوذة قيادة رياضية فاخرة", 8, 15, 1500, now, now);
  insertAccessory.run(2, "مقعد أطفال معتمد للسلامة", 4, 25, 2500, now, now);
  insertAccessory.run(3, "حامل هاتف ذكي وشاحن سريع", 12, 10, 1000, now, now);

  const insertRental = db.prepare(`
    INSERT OR REPLACE INTO rentals (
      id, contract_no, customer_id, vehicle_id, status,
      start_datetime, expected_return_datetime,
      daily_price, daily_price_minor,
      total_amount, total_amount_minor,
      deposit_required, deposit_required_minor,
      deposit_paid, deposit_paid_minor,
      mileage_out, fuel_out, notes_out, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Draft 1 (past start date, to exercise the warning banner)
  insertRental.run(
    101, "CNT-000101", 1, 1, "draft",
    yesterday, inThreeDays,
    150, 15000,
    600, 60000,
    500, 50000,
    0, 0,
    14200, "فل كامل", "عقد مسودة تجريبي مع تاريخ بدء سابق", now, now
  );

  // Draft 2 (fresh future draft)
  insertRental.run(
    102, "CNT-000102", 4, 2, "draft",
    now, inThreeDays,
    120, 12000,
    360, 36000,
    300, 30000,
    0, 0,
    28500, "نصف تانكي", "مسودة عقد إيجار النترا", now, now
  );

  // Active rental
  insertRental.run(
    103, "CNT-000103", 2, 5, "active",
    threeDaysAgo, tomorrow,
    130, 13000,
    520, 52000,
    400, 40000,
    400, 40000,
    5200, "فل", "تأجير نشط لدراجة TMAX", threeDaysAgo, now
  );
}

if (forced && !confirmed) {
  console.error(
    `--force does nothing without --confirm ${CONFIRMATION}. Nothing was written.`,
  );
  process.exit(1);
}

let found = 0;
let written = 0;
let refused = 0;

for (const dir of targets) {
  const dbPath = path.join(dir, "rental_app.db");
  if (!fs.existsSync(dbPath)) {
    continue;
  }

  found += 1;
  console.log(`\nFound a database at: ${dbPath}`);

  let db;
  try {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
  } catch (error) {
    console.error("  Could not open it:", error.message);
    continue;
  }

  try {
    const { collisions, collisionTotal, totals } = inspect(db);

    console.log(
      `  It currently holds ${totals.customers} customer(s), ${totals.vehicles} vehicle(s), ` +
        `${totals.rentals} rental(s) and ${totals.payments} payment(s).`,
    );

    if (collisionTotal > 0) {
      const detail = Object.entries(collisions)
        .map(([table, n]) => `${n} ${table}`)
        .join(", ");
      console.log(`  Seeding would REPLACE existing records: ${detail}.`);
    }

    if (!confirmed) {
      console.log(
        `  Nothing written. Re-run with --confirm ${CONFIRMATION} to seed this database.`,
      );
      db.close();
      continue;
    }

    if (collisionTotal > 0 && !forced) {
      console.error(
        "  REFUSING: this database already has records at the ids the demo data uses.\n" +
          "  Those rows would be replaced and cannot be recovered without a backup.\n" +
          "  If this really is a development machine, add --force. Back up first.",
      );
      refused += 1;
      db.close();
      continue;
    }

    seed(db);
    written += 1;
    console.log("  Seeded demo data.");
  } catch (error) {
    console.error("  Error while seeding:", error.message);
    refused += 1;
  } finally {
    db.close();
  }
}

if (found === 0) {
  console.log(
    "No installed database found. Run the application once so it creates one.",
  );
}

if (refused > 0) {
  process.exit(1);
}

console.log(
  `\nDone. ${found} database(s) found, ${written} seeded.` +
    (confirmed ? "" : " Run with --confirm to write."),
);

// Explicit: run through Electron the app module keeps the loop alive on its own.
process.exit(0);
