const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { performance } = require("node:perf_hooks");
const { app } = require("electron");
const Database = require("better-sqlite3");

const args = parseArgs(process.argv.slice(2));
const scale = Math.max(1, Number(args.scale ?? 1));
const iterations = Math.max(3, Number(args.iterations ?? 7));
const strict = Boolean(args.strict);
const keep = Boolean(args.keep);
const reuse = Boolean(args.reuse);
const dbPath = path.resolve(
  args.db ?? path.join(os.tmpdir(), `arak-perf-stress-${Date.now()}`, "stress.db"),
);
const sizes = {
  vehicles: Math.round(Number(args.vehicles ?? 1000) * scale),
  customers: Math.round(Number(args.customers ?? 5000) * scale),
  rentals: Math.round(Number(args.rentals ?? 80000) * scale),
  payments: Math.round(Number(args.payments ?? 160000) * scale),
  expenses: Math.round(Number(args.expenses ?? 40000) * scale),
  cashMovements: Math.round(Number(args.cashMovements ?? 20000) * scale),
  adjustments: Math.round(Number(args.adjustments ?? 20000) * scale),
};

let db;

try {
  prepareDatabaseFile();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (!reuse || isDatabaseEmpty(db)) {
    seedStressDatabase(db, sizes);
  } else {
    console.log(`Reusing existing benchmark database: ${dbPath}`);
  }

  const results = runBenchmarks(db);
  printSummary(results);

  if (strict && results.some((result) => result.budgetMs && result.p50 > result.budgetMs)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
} finally {
  db?.close();

  if (!keep && !args.db) {
    fs.rmSync(path.dirname(dbPath), { force: true, recursive: true });
  }

  app.exit(process.exitCode ?? 0);
}

function prepareDatabaseFile() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (!reuse && fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
}

function isDatabaseEmpty(database) {
  const row = database
    .prepare("select name from sqlite_master where type = 'table' and name = 'rentals'")
    .get();

  return !row;
}

function seedStressDatabase(database, inputSizes) {
  console.log(`Creating stress database: ${dbPath}`);
  console.log(
    `Seeding ${inputSizes.vehicles} vehicles, ${inputSizes.customers} customers, ` +
      `${inputSizes.rentals} rentals, ${inputSizes.payments} payments, ` +
      `${inputSizes.expenses} expenses, ${inputSizes.cashMovements} cash movements, ` +
      `${inputSizes.adjustments} adjustments.`,
  );

  database.exec(`
    drop table if exists accounting_adjustments;
    drop table if exists cash_movements;
    drop table if exists expenses;
    drop table if exists payments;
    drop table if exists rentals;
    drop table if exists vehicles;
    drop table if exists customers;

    create table customers (
      id integer primary key,
      full_name text not null,
      phone text not null,
      national_id text,
      driver_license_no text,
      is_active integer not null
    );

    create table vehicles (
      id integer primary key,
      plate_number text not null,
      brand text not null,
      model text not null,
      daily_price real not null,
      deposit_amount real not null,
      mileage integer,
      status text not null
    );

    create table rentals (
      id integer primary key,
      contract_no text not null,
      customer_id integer not null references customers(id),
      vehicle_id integer not null references vehicles(id),
      status text not null,
      start_datetime text not null,
      expected_return_datetime text not null,
      actual_return_datetime text,
      deposit_required real not null,
      deposit_paid real not null,
      total_amount real not null,
      paid_amount real not null,
      remaining_amount real not null,
      created_at text not null
    );

    create table payments (
      id integer primary key,
      rental_id integer not null references rentals(id),
      type text not null,
      method text not null,
      receipt_no text,
      status text not null,
      amount real not null,
      payment_date text not null,
      notes text
    );

    create table expenses (
      id integer primary key,
      category text not null,
      location text not null,
      method text not null,
      amount real not null,
      expense_date text not null,
      vendor_name text,
      vehicle_id integer references vehicles(id),
      notes text,
      status text not null
    );

    create table cash_movements (
      id integer primary key,
      type text not null,
      from_location text not null,
      to_location text,
      amount real not null,
      movement_date text not null,
      notes text,
      status text not null
    );

    create table accounting_adjustments (
      id integer primary key,
      location text not null,
      direction text not null,
      amount real not null,
      adjustment_date text not null,
      reason text not null,
      notes text,
      status text not null
    );
  `);

  const insertCustomer = database.prepare(
    "insert into customers (id, full_name, phone, national_id, driver_license_no, is_active) values (?, ?, ?, ?, ?, ?)",
  );
  const insertVehicle = database.prepare(
    "insert into vehicles (id, plate_number, brand, model, daily_price, deposit_amount, mileage, status) values (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertRental = database.prepare(`
    insert into rentals (
      id, contract_no, customer_id, vehicle_id, status, start_datetime,
      expected_return_datetime, actual_return_datetime, deposit_required,
      deposit_paid, total_amount, paid_amount, remaining_amount, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = database.prepare(`
    insert into payments (
      id, rental_id, type, method, receipt_no, status, amount, payment_date, notes
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertExpense = database.prepare(`
    insert into expenses (
      id, category, location, method, amount, expense_date, vendor_name,
      vehicle_id, notes, status
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCashMovement = database.prepare(`
    insert into cash_movements (
      id, type, from_location, to_location, amount, movement_date, notes, status
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAdjustment = database.prepare(`
    insert into accounting_adjustments (
      id, location, direction, amount, adjustment_date, reason, notes, status
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = database.transaction(() => {
    for (let id = 1; id <= inputSizes.customers; id += 1) {
      insertCustomer.run(
        id,
        `Customer ${id}`,
        `091${String(id).padStart(7, "0")}`,
        `NID${String(id).padStart(8, "0")}`,
        `LIC${String(id).padStart(8, "0")}`,
        id % 29 === 0 ? 0 : 1,
      );
    }

    for (let id = 1; id <= inputSizes.vehicles; id += 1) {
      insertVehicle.run(
        id,
        `TR-${String(id).padStart(5, "0")}`,
        brandFor(id),
        modelFor(id),
        85 + (id % 9) * 15,
        id % 4 === 0 ? 150 : 100,
        12000 + id * 37,
        vehicleStatusFor(id),
      );
    }

    for (let id = 1; id <= inputSizes.rentals; id += 1) {
      const status = rentalStatusFor(id);
      const start = isoMinutes(id * 90);
      const expected = isoMinutes(id * 90 + 4320);
      const returned = status === "returned" ? isoMinutes(id * 90 + 3600) : null;
      const total = 120 + (id % 14) * 18;
      const remaining = status === "cancelled" ? 0 : id % 7 === 0 ? (id % 9) * 25 + 25 : 0;
      const paid = Math.max(0, total - remaining);

      insertRental.run(
        id,
        `R-${String(id).padStart(7, "0")}`,
        ((id - 1) % inputSizes.customers) + 1,
        ((id - 1) % inputSizes.vehicles) + 1,
        status,
        start,
        expected,
        returned,
        100,
        100 + (id % 4) * 25,
        total,
        paid,
        remaining,
        isoMinutes(id * 90 - 30),
      );
    }

    for (let id = 1; id <= inputSizes.payments; id += 1) {
      insertPayment.run(
        id,
        ((id - 1) % inputSizes.rentals) + 1,
        paymentTypeFor(id),
        paymentMethodFor(id),
        `RCPT-${String(id).padStart(8, "0")}`,
        id % 41 === 0 ? "voided" : "posted",
        30 + (id % 17) * 7,
        isoMinutes(id * 45),
        id % 8 === 0 ? "cash desk note" : null,
      );
    }

    for (let id = 1; id <= inputSizes.expenses; id += 1) {
      insertExpense.run(
        id,
        expenseCategoryFor(id),
        moneyLocationFor(id),
        paymentMethodFor(id),
        20 + (id % 13) * 9,
        isoMinutes(id * 110),
        id % 3 === 0 ? `Vendor ${id % 200}` : null,
        id % 2 === 0 ? ((id - 1) % inputSizes.vehicles) + 1 : null,
        id % 10 === 0 ? "cash expense note" : null,
        id % 37 === 0 ? "voided" : "posted",
      );
    }

    for (let id = 1; id <= inputSizes.cashMovements; id += 1) {
      const type = id % 8 === 0 ? "owner_withdrawal" : "transfer";

      insertCashMovement.run(
        id,
        type,
        moneyLocationFor(id),
        type === "transfer" ? moneyLocationFor(id + 1) : null,
        50 + (id % 11) * 10,
        isoMinutes(id * 170),
        id % 5 === 0 ? "cash movement note" : null,
        id % 43 === 0 ? "voided" : "posted",
      );
    }

    for (let id = 1; id <= inputSizes.adjustments; id += 1) {
      insertAdjustment.run(
        id,
        moneyLocationFor(id),
        id % 2 === 0 ? "increase" : "decrease",
        10 + (id % 19) * 4,
        isoMinutes(id * 210),
        `Balance adjustment ${id}`,
        id % 6 === 0 ? "adjustment note" : null,
        id % 47 === 0 ? "voided" : "posted",
      );
    }
  });

  const start = performance.now();
  seed();
  createIndexes(database);
  console.log(`Seed completed in ${formatMs(performance.now() - start)}.`);
}

function createIndexes(database) {
  database.exec(`
    create index if not exists customers_full_name_idx on customers(full_name);
    create index if not exists customers_phone_idx on customers(phone);
    create index if not exists customers_national_id_idx on customers(national_id);
    create index if not exists customers_driver_license_no_idx on customers(driver_license_no);
    create index if not exists customers_is_active_full_name_idx on customers(is_active, full_name);
    create index if not exists vehicles_plate_number_idx on vehicles(plate_number);
    create index if not exists vehicles_status_plate_number_idx on vehicles(status, plate_number);
    create index if not exists rentals_status_idx on rentals(status);
    create index if not exists rentals_created_at_idx on rentals(created_at);
    create index if not exists rentals_status_created_at_idx on rentals(status, created_at);
    create index if not exists rentals_status_expected_return_idx on rentals(status, expected_return_datetime);
    create index if not exists rentals_status_actual_return_idx on rentals(status, actual_return_datetime, created_at);
    create index if not exists rentals_status_remaining_amount_idx on rentals(status, remaining_amount);
    create index if not exists rentals_vehicle_id_idx on rentals(vehicle_id);
    create index if not exists rentals_customer_id_idx on rentals(customer_id);
    create index if not exists payments_payment_date_idx on payments(payment_date);
    create index if not exists payments_rental_id_idx on payments(rental_id);
    create index if not exists payments_status_type_rental_id_idx on payments(status, type, rental_id);
    create index if not exists payments_status_type_rental_amount_idx on payments(status, type, rental_id, amount);
    create index if not exists expenses_expense_date_idx on expenses(expense_date);
    create index if not exists cash_movements_date_idx on cash_movements(movement_date);
    create index if not exists accounting_adjustments_date_idx on accounting_adjustments(adjustment_date);
  `);
}

function runBenchmarks(database) {
  const date = "2026-03-15";

  return [
    measure("startup rentals list", () => startupRentalsList(database), 120),
    measure("rental form options", () => rentalFormOptions(database), 120),
    measure("daily closing summary", () => dailyClosingSummary(database, date), 80),
    measure("outstanding balances page", () => outstandingBalancesPage(database, true), 100),
    measure("outstanding balances preview", () => outstandingBalancesPage(database, false), 80),
    measure("deposits page", () => depositsPage(database), 120),
    measure("held deposits preview", () => heldDepositsPreview(database), 25),
    measure("held deposits total", () => heldDepositsTotal(database), 80),
    measure("accounting transactions page", () => accountingTransactionsPage(database, { page: 1 }), 120),
    measure(
      "accounting transactions search",
      () => accountingTransactionsPage(database, { page: 1, search: "cash" }),
      200,
    ),
    measure("global search customer", () => globalSearch(database, "Customer 12"), 120),
    measure("global search plate", () => globalSearch(database, "00012"), 120),
    measure("vehicle utilization", () => vehicleUtilization(database), 650),
  ];
}

function measure(name, fn, budgetMs) {
  for (let count = 0; count < 2; count += 1) {
    fn();
  }

  const timings = [];
  let result;

  for (let count = 0; count < iterations; count += 1) {
    const start = performance.now();
    result = fn();
    timings.push(performance.now() - start);
  }

  timings.sort((left, right) => left - right);

  const summary = {
    budgetMs,
    max: timings[timings.length - 1],
    min: timings[0],
    name,
    p50: timings[Math.floor(timings.length / 2)],
    result,
  };
  const status = budgetMs && summary.p50 > budgetMs ? "WARN" : "OK";

  console.log(
    `${status} ${name}: p50=${formatMs(summary.p50)} min=${formatMs(summary.min)} ` +
      `max=${formatMs(summary.max)} result=${result}`,
  );

  return summary;
}

function startupRentalsList(database) {
  const now = new Date().toISOString();
  const total = database
    .prepare(`
      select count(*) as count
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where rentals.status in ('active', 'overdue')
    `)
    .get().count;
  const summary = database
    .prepare(`
      select count(*) as total,
        sum(case when case when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue' else rentals.status end = 'active' then 1 else 0 end) as active,
        sum(case when case when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue' else rentals.status end = 'overdue' then 1 else 0 end) as overdue,
        sum(case when rentals.status = 'returned' then 1 else 0 end) as returned,
        coalesce(sum(rentals.total_amount), 0) as amount
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where rentals.status in ('active', 'overdue')
    `)
    .get(now, now);
  const rows = database
    .prepare(`
      select rentals.id,
        rentals.contract_no as contractNo,
        customers.full_name as customerName,
        customers.phone as customerPhone,
        vehicles.plate_number as vehiclePlateNumber,
        vehicles.brand as vehicleBrand,
        vehicles.model as vehicleModel,
        case when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue' else rentals.status end as status,
        rentals.expected_return_datetime as expectedReturnDatetime,
        rentals.total_amount as totalAmount,
        rentals.remaining_amount as remainingAmount
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where rentals.status in ('active', 'overdue')
      order by
        case
          when rentals.status = 'active' and rentals.expected_return_datetime < ? then 0
          when rentals.status = 'overdue' then 0
          when rentals.status = 'active' then 1
          when rentals.status = 'draft' then 2
          when rentals.status = 'returned' then 3
          else 4
        end,
        rentals.created_at desc
      limit 25
    `)
    .all(now, now);

  return `${rows.length}/${total}/${summary.active ?? 0}+${summary.overdue ?? 0}`;
}

function rentalFormOptions(database) {
  const customers = database
    .prepare(`
      select id, full_name as fullName, phone
      from customers
      where is_active = 1
      order by full_name
    `)
    .all();
  const vehicles = database
    .prepare(`
      select id,
        plate_number as plateNumber,
        brand,
        model,
        daily_price as dailyPrice,
        deposit_amount as depositAmount,
        mileage
      from vehicles
      where status = 'available'
      order by plate_number
    `)
    .all();

  return `${customers.length}/${vehicles.length}`;
}

function dailyClosingSummary(database, date) {
  const range = localDateRange(date);
  const paymentsRow = database
    .prepare(`
      select
        coalesce(sum(case when type != 'refund' and method = 'cash' then amount else 0 end), 0) as cashPayments,
        coalesce(sum(case when type != 'refund' and method = 'card' then amount else 0 end), 0) as cardPayments,
        coalesce(sum(case when type != 'refund' and method = 'bank_transfer' then amount else 0 end), 0) as bankTransfers,
        coalesce(sum(case when type != 'refund' and method = 'other' then amount else 0 end), 0) as otherPayments,
        coalesce(sum(case when type = 'refund' then amount else 0 end), 0) as refunds
      from payments
      where status = 'posted' and payment_date >= ? and payment_date < ?
    `)
    .get(range.start, range.end);
  const openBalances = database
    .prepare(`
      select count(*) as count
      from rentals
      where status in ('active', 'overdue', 'returned')
        and expected_return_datetime >= ?
        and expected_return_datetime < ?
        and remaining_amount > 0
    `)
    .get(range.start, range.end).count;

  return `${Math.round(paymentsRow.cashPayments + paymentsRow.cardPayments)} collected/${openBalances} open`;
}

function outstandingBalancesPage(database, includeTotal) {
  const pageSize = includeTotal ? 25 : 8;
  const total = includeTotal
    ? database
        .prepare(`
          select count(*) as count
          from rentals
          where status in ('active', 'overdue', 'returned') and remaining_amount > 0
        `)
        .get().count
    : 0;
  const rows = database
    .prepare(`
      select rentals.id as rentalId,
        rentals.contract_no as contractNo,
        customers.full_name as customerName,
        customers.phone as customerPhone,
        vehicles.plate_number as vehiclePlateNumber,
        rentals.status as status,
        rentals.total_amount as totalAmount,
        rentals.paid_amount as paidAmount,
        rentals.remaining_amount as remainingAmount,
        rentals.expected_return_datetime as expectedReturnDatetime
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where rentals.status in ('active', 'overdue', 'returned') and rentals.remaining_amount > 0
      order by rentals.remaining_amount desc
      limit ?
    `)
    .all(pageSize);

  return `${rows.length}/${includeTotal ? total : "preview"}`;
}

function depositsPage(database) {
  const total = database
    .prepare("select count(*) as count from rentals where status in ('active', 'overdue', 'returned')")
    .get().count;
  const rows = database
    .prepare(`
      select rentals.id as rentalId,
        rentals.contract_no as contractNo,
        customers.full_name as customerName,
        vehicles.plate_number as vehiclePlateNumber,
        rentals.status as status,
        rentals.deposit_required as depositRequired,
        rentals.deposit_paid as depositPaid
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where rentals.status in ('active', 'overdue', 'returned')
      order by rentals.created_at desc
      limit 25
    `)
    .all();
  const ids = rows.map((row) => row.rentalId);

  if (ids.length) {
    database
      .prepare(`
        select rental_id as rentalId, coalesce(sum(amount), 0) as refunded
        from payments
        where rental_id in (${ids.map(() => "?").join(",")})
          and status = 'posted'
          and type = 'refund'
        group by rental_id
      `)
      .all(...ids);
  }

  return `${rows.length}/${total}`;
}

function heldDepositsPreview(database) {
  const rows = [];
  const pageSize = 8;
  const chunkSize = 32;
  let scanOffset = 0;

  while (rows.length < pageSize) {
    const candidates = database
      .prepare(`
        select rentals.id as rentalId,
          rentals.contract_no as contractNo,
          customers.full_name as customerName,
          vehicles.plate_number as vehiclePlateNumber,
          case
            when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue'
            else rentals.status
          end as status,
          rentals.deposit_required as depositRequired,
          rentals.deposit_paid as depositPaid
        from rentals indexed by rentals_created_at_idx
        inner join customers on rentals.customer_id = customers.id
        inner join vehicles on rentals.vehicle_id = vehicles.id
        where rentals.status in ('active', 'overdue', 'returned')
          and rentals.deposit_paid > 0
        order by rentals.created_at desc
        limit ? offset ?
      `)
      .all(new Date().toISOString(), chunkSize, scanOffset);

    if (candidates.length === 0) {
      break;
    }

    const ids = candidates.map((row) => row.rentalId);
    const refunds = database
      .prepare(`
        select rental_id as rentalId, coalesce(sum(amount), 0) as refunded
        from payments
        where rental_id in (${ids.map(() => "?").join(",")})
          and status = 'posted'
          and type = 'refund'
        group by rental_id
      `)
      .all(...ids);
    const refundMap = new Map(refunds.map((row) => [row.rentalId, row.refunded]));

    for (const candidate of candidates) {
      const depositRefunded = refundMap.get(candidate.rentalId) ?? 0;
      const depositHeld = Math.max(0, candidate.depositPaid - depositRefunded);

      if (depositHeld <= 0) {
        continue;
      }

      rows.push({
        ...candidate,
        depositRefunded,
        depositHeld,
      });

      if (rows.length >= pageSize) {
        break;
      }
    }

    scanOffset += candidates.length;
  }

  return rows.length;
}

function heldDepositsTotal(database) {
  const row = database
    .prepare(`
      ${heldDepositsCte()}
      select coalesce(sum(max(0, rentals.deposit_paid - coalesce(refund_by_rental.refunded, 0))), 0) as total
      from rentals
      left join refund_by_rental on refund_by_rental.rentalId = rentals.id
      where rentals.status in ('active', 'overdue', 'returned')
        and rentals.deposit_paid > 0
    `)
    .get();

  return Math.round(row.total);
}

function accountingTransactionsPage(database, request) {
  const pageSize = 25;
  const offset = ((request.page ?? 1) - 1) * pageSize;
  const candidateLimit = offset + pageSize;
  const sourceQueries = accountingTransactionSourceQueries(request.search ?? "");
  let total = 0;
  const candidates = [];

  for (const query of sourceQueries) {
    total += database
      .prepare(`select count(*) as count from (${query.sql}) transactions`)
      .get(...query.params).count;
    candidates.push(
      ...database
        .prepare(`
          select *
          from (${query.sql}) transactions
          order by occurredAt desc, sourceId desc
          limit ?
        `)
        .all(...query.params, candidateLimit),
    );
  }

  candidates.sort((left, right) => {
    const dateCompare = right.occurredAt.localeCompare(left.occurredAt);
    if (dateCompare !== 0) return dateCompare;

    return right.sourceId - left.sourceId;
  });

  return `${candidates.slice(offset, offset + pageSize).length}/${total}`;
}

function globalSearch(database, query) {
  const search = normalizeSearch(query);
  const compact = search.replace(/[\s-]+/g, "");

  if (!search || compact.length < 2) {
    return 0;
  }

  const likeTerm = `%${search}%`;
  const compactLikeTerm = `%${compact}%`;
  const customerMatches = database
    .prepare(`
      select id, full_name as fullName, phone
      from customers
      where full_name like ?
        or phone like ?
        or national_id like ?
        or driver_license_no like ?
      limit 12
    `)
    .all(likeTerm, compactLikeTerm, compactLikeTerm, compactLikeTerm);
  const customerIds = customerMatches.map((customer) => customer.id);
  const vehicleMatches = database
    .prepare(`
      select id, plate_number as plateNumber, brand, model, status
      from vehicles
      where plate_number like ? or brand like ? or model like ?
      limit 5
    `)
    .all(compactLikeTerm, likeTerm, likeTerm);
  const vehicleIds = database
    .prepare(`
      select id
      from vehicles
      where plate_number like ?
      limit 12
    `)
    .all(compactLikeTerm)
    .map((vehicle) => vehicle.id);
  const rentalQuery = buildGlobalRentalQuery(customerIds, vehicleIds);
  const rentalMatches = database
    .prepare(rentalQuery.sql)
    .all(compactLikeTerm, ...rentalQuery.params);
  const paymentQuery = buildGlobalPaymentQuery(customerIds);
  const paymentMatches = database
    .prepare(paymentQuery.sql)
    .all(compactLikeTerm, compactLikeTerm, ...paymentQuery.params);

  return (
    vehicleMatches.length +
    Math.min(5, customerMatches.length) +
    rentalMatches.length +
    paymentMatches.length
  );
}

function buildGlobalRentalQuery(customerIds, vehicleIds) {
  const conditions = ["rentals.contract_no like ?"];
  const params = [];

  if (customerIds.length > 0) {
    conditions.push(`rentals.customer_id in (${customerIds.map(() => "?").join(",")})`);
    params.push(...customerIds);
  }

  if (vehicleIds.length > 0) {
    conditions.push(`rentals.vehicle_id in (${vehicleIds.map(() => "?").join(",")})`);
    params.push(...vehicleIds);
  }

  return {
    params,
    sql: `
      select rentals.id,
        rentals.contract_no as contractNo,
        customers.full_name as customerName,
        vehicles.plate_number as plateNumber
      from rentals
      inner join customers on rentals.customer_id = customers.id
      inner join vehicles on rentals.vehicle_id = vehicles.id
      where ${conditions.join(" or ")}
      order by rentals.created_at desc
      limit 8
    `,
  };
}

function buildGlobalPaymentQuery(customerIds) {
  const conditions = ["payments.receipt_no like ?", "rentals.contract_no like ?"];
  const params = [];

  if (customerIds.length > 0) {
    conditions.push(`rentals.customer_id in (${customerIds.map(() => "?").join(",")})`);
    params.push(...customerIds);
  }

  return {
    params,
    sql: `
      select payments.id,
        payments.receipt_no as receiptNo,
        rentals.contract_no as contractNo,
        customers.full_name as customerName
      from payments
      inner join rentals on payments.rental_id = rentals.id
      inner join customers on rentals.customer_id = customers.id
      where ${conditions.join(" or ")}
      order by payments.payment_date desc
      limit 5
    `,
  };
}

function accountingTransactionSourceQueries(search) {
  return [
    buildAccountingTransactionSourceQuery(paymentTransactionsSql, "payment", search),
    buildAccountingTransactionSourceQuery(expenseTransactionsSql, "expense", search),
    buildAccountingTransactionSourceQuery(
      cashMovementTransactionsSql,
      "cash_movement",
      search,
    ),
    buildAccountingTransactionSourceQuery(
      adjustmentTransactionsSql,
      "adjustment",
      search,
    ),
  ];
}

function buildAccountingTransactionSourceQuery(sourceSql, source, search) {
  const params = [];
  const searchSql = accountingSourceSearchSql(source, search, params);

  return {
    params,
    sql: sourceSql(searchSql ? `where ${searchSql}` : ""),
  };
}

function accountingSourceSearchSql(source, search, params) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return null;
  }

  const conditions = accountingSourceSearchConditions(source, normalizedSearch, params);

  return conditions.length ? `(${conditions.join(" or ")})` : null;
}

function accountingSourceSearchConditions(source, search, params) {
  if (source === "payment") return paymentSearchConditions(search, params);
  if (source === "expense") return expenseSearchConditions(search, params);
  if (source === "cash_movement") return cashMovementSearchConditions(search, params);

  return adjustmentSearchConditions(search, params);
}

function paymentSearchConditions(search, params) {
  const conditions = [];

  addStaticSearchCondition(conditions, search, ["payment"]);
  addStaticSearchCondition(conditions, search, ["refund"], "payments.type = 'refund'");
  addPaymentLocationSearchConditions(conditions, search);
  addLowerLikeCondition(conditions, params, "rentals.contract_no", search);
  addLowerLikeCondition(conditions, params, "customers.full_name", search);
  addLowerLikeCondition(conditions, params, "vehicles.plate_number", search);
  addLowerLikeCondition(conditions, params, "coalesce(payments.notes, payments.receipt_no)", search);

  return conditions;
}

function expenseSearchConditions(search, params) {
  const conditions = [];

  addStaticSearchCondition(conditions, search, ["expense"]);
  addLocationSearchConditions(conditions, search, "expenses.location");
  addLowerLikeCondition(conditions, params, "expenses.category", search);
  addLowerLikeCondition(conditions, params, "expenses.vendor_name", search);
  addLowerLikeCondition(conditions, params, "vehicles.plate_number", search);
  addLowerLikeCondition(conditions, params, "expenses.notes", search);

  return conditions;
}

function cashMovementSearchConditions(search, params) {
  const conditions = [];

  addStaticSearchCondition(conditions, search, ["cash_movement", "cash movement"]);
  addStaticSearchCondition(
    conditions,
    search,
    ["owner withdrawal"],
    "cash_movements.type = 'owner_withdrawal'",
  );
  addStaticSearchCondition(
    conditions,
    search,
    ["move cash"],
    "cash_movements.type = 'transfer'",
  );
  addLocationSearchConditions(conditions, search, "cash_movements.from_location");
  addLocationSearchConditions(conditions, search, "cash_movements.to_location");
  addLowerLikeCondition(conditions, params, "cash_movements.notes", search);

  return conditions;
}

function adjustmentSearchConditions(search, params) {
  const conditions = [];

  addStaticSearchCondition(conditions, search, ["adjustment", "balance adjustment"]);
  addLocationSearchConditions(conditions, search, "accounting_adjustments.location");
  addLowerLikeCondition(conditions, params, "accounting_adjustments.reason", search);
  addLowerLikeCondition(conditions, params, "accounting_adjustments.notes", search);

  return conditions;
}

function addLowerLikeCondition(conditions, params, expression, search) {
  conditions.push(`lower(coalesce(${expression}, '')) like ?`);
  params.push(`%${search}%`);
}

function addStaticSearchCondition(conditions, search, labels, condition = "1 = 1") {
  if (labels.some((label) => label.includes(search))) {
    conditions.push(condition);
  }
}

function addPaymentLocationSearchConditions(conditions, search) {
  if (matchesLocationSearch(search, "cash_drawer")) {
    conditions.push("payments.method in ('cash', 'other')");
  }

  if (matchesLocationSearch(search, "bank")) {
    conditions.push("payments.method in ('card', 'bank_transfer')");
  }
}

function addLocationSearchConditions(conditions, search, column) {
  for (const location of ["cash_drawer", "shop_safe", "bank"]) {
    if (matchesLocationSearch(search, location)) {
      conditions.push(`${column} = '${location}'`);
    }
  }
}

function matchesLocationSearch(search, location) {
  return [location, location.replace("_", " ")].some((label) => label.includes(search));
}

function paymentTransactionsSql(whereSql = "") {
  return `
    select
      'payment-' || payments.id as id,
      'payment' as source,
      payments.id as sourceId,
      payments.payment_date as occurredAt,
      case when payments.type = 'refund' then 'money_out' else 'money_in' end as kind,
      case when payments.type = 'refund' then 'Refund' else 'Payment' end as title,
      rentals.contract_no || ' - ' || customers.full_name || ' - ' || vehicles.plate_number as detail,
      payments.amount as amount,
      payments.status as status,
      case when payments.method in ('card', 'bank_transfer') then 'bank' else 'cash_drawer' end as location,
      case when payments.type = 'refund'
        then case when payments.method in ('card', 'bank_transfer') then 'bank' else 'cash_drawer' end
        else null
      end as fromLocation,
      case when payments.type = 'refund'
        then null
        else case when payments.method in ('card', 'bank_transfer') then 'bank' else 'cash_drawer' end
      end as toLocation,
      coalesce(payments.notes, payments.receipt_no) as notes
    from payments
    inner join rentals on payments.rental_id = rentals.id
    inner join customers on rentals.customer_id = customers.id
    inner join vehicles on rentals.vehicle_id = vehicles.id
    ${whereSql}
  `;
}

function expenseTransactionsSql(whereSql = "") {
  return `
    select
      'expense-' || expenses.id as id,
      'expense' as source,
      expenses.id as sourceId,
      expenses.expense_date as occurredAt,
      'money_out' as kind,
      expenses.category as title,
      case
        when expenses.vendor_name is not null and vehicles.plate_number is not null
          then expenses.vendor_name || ' - ' || vehicles.plate_number
        when expenses.vendor_name is not null then expenses.vendor_name
        when vehicles.plate_number is not null then vehicles.plate_number
        else ''
      end as detail,
      expenses.amount as amount,
      expenses.status as status,
      expenses.location as location,
      expenses.location as fromLocation,
      null as toLocation,
      expenses.notes as notes
    from expenses
    left join vehicles on expenses.vehicle_id = vehicles.id
    ${whereSql}
  `;
}

function cashMovementTransactionsSql(whereSql = "") {
  return `
    select
      'cash-movement-' || cash_movements.id as id,
      'cash_movement' as source,
      cash_movements.id as sourceId,
      cash_movements.movement_date as occurredAt,
      case when cash_movements.type = 'owner_withdrawal' then 'money_out' else 'transfer' end as kind,
      case when cash_movements.type = 'owner_withdrawal' then 'Owner Withdrawal' else 'Move Cash' end as title,
      '' as detail,
      cash_movements.amount as amount,
      cash_movements.status as status,
      case when cash_movements.type = 'owner_withdrawal' then cash_movements.from_location else null end as location,
      cash_movements.from_location as fromLocation,
      cash_movements.to_location as toLocation,
      cash_movements.notes as notes
    from cash_movements
    ${whereSql}
  `;
}

function adjustmentTransactionsSql(whereSql = "") {
  return `
    select
      'adjustment-' || accounting_adjustments.id as id,
      'adjustment' as source,
      accounting_adjustments.id as sourceId,
      accounting_adjustments.adjustment_date as occurredAt,
      'adjustment' as kind,
      'Balance Adjustment' as title,
      accounting_adjustments.reason as detail,
      accounting_adjustments.amount as amount,
      accounting_adjustments.status as status,
      accounting_adjustments.location as location,
      case when accounting_adjustments.direction = 'decrease' then accounting_adjustments.location else null end as fromLocation,
      case when accounting_adjustments.direction = 'increase' then accounting_adjustments.location else null end as toLocation,
      accounting_adjustments.notes as notes
    from accounting_adjustments
    ${whereSql}
  `;
}

function vehicleUtilization(database) {
  const range = {
    end: new Date("2026-06-01T00:00:00").toISOString(),
    start: new Date("2026-01-01T00:00:00").toISOString(),
  };
  const rows = database
    .prepare(`
      select vehicles.id as vehicleId,
        vehicles.plate_number as plateNumber,
        coalesce(sum(case when overlapDays > 0 then 1 else 0 end), 0) as rentalCount,
        coalesce(sum(case when overlapDays <= 0 then 0 else cast(overlapDays as integer) + case when overlapDays > cast(overlapDays as integer) then 1 else 0 end end), 0) as rentedDays
      from vehicles
      left join (
        select rentals.vehicle_id,
          rentals.id,
          (
            min(julianday(coalesce(rentals.actual_return_datetime, rentals.expected_return_datetime, ?)), julianday(?)) -
            max(julianday(rentals.start_datetime), julianday(?))
          ) as overlapDays
        from rentals
        where rentals.status != 'cancelled'
          and rentals.start_datetime < ?
          and coalesce(rentals.actual_return_datetime, rentals.expected_return_datetime, ?) > ?
      ) rental_overlap on rental_overlap.vehicle_id = vehicles.id
      group by vehicles.id, vehicles.plate_number
      order by rentedDays desc
    `)
    .all(range.end, range.end, range.start, range.end, range.end, range.start);

  return rows.length;
}

function heldDepositsCte() {
  return `
    with refund_by_rental as (
      select rental_id as rentalId, coalesce(sum(amount), 0) as refunded
      from payments
      where status = 'posted' and type = 'refund'
      group by rental_id
    )
  `;
}

function printSummary(results) {
  const warnings = results.filter((result) => result.budgetMs && result.p50 > result.budgetMs);

  console.log("");
  console.log(`Database: ${dbPath}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Budgets: ${warnings.length === 0 ? "all within budget" : `${warnings.length} warning(s)`}`);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(`  ${warning.name}: p50 ${formatMs(warning.p50)} over budget ${formatMs(warning.budgetMs)}`);
    }
  }

  if (!keep && !args.db) {
    console.log("Temporary database will be removed. Pass --keep to inspect it.");
  }
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function localDateRange(date) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  };
}

function isoMinutes(offset) {
  return new Date(Date.UTC(2026, 0, 1, 8, 0) + offset * 60 * 1000).toISOString();
}

function rentalStatusFor(id) {
  if (id % 23 === 0) return "cancelled";
  if (id % 11 === 0) return "overdue";
  if (id % 5 === 0) return "active";

  return "returned";
}

function vehicleStatusFor(id) {
  if (id % 19 === 0) return "maintenance";
  if (id % 17 === 0) return "inactive";
  if (id % 5 === 0) return "rented";

  return "available";
}

function paymentTypeFor(id) {
  if (id % 8 === 0) return "refund";
  if (id % 5 === 0) return "deposit";
  if (id % 3 === 0) return "extra_charge";

  return "rent";
}

function paymentMethodFor(id) {
  const methods = ["cash", "card", "bank_transfer", "other"];

  return methods[id % methods.length];
}

function moneyLocationFor(id) {
  const locations = ["cash_drawer", "shop_safe", "bank"];

  return locations[id % locations.length];
}

function expenseCategoryFor(id) {
  const categories = ["fuel", "wash", "parts", "maintenance", "insurance", "registration", "office", "other"];

  return categories[id % categories.length];
}

function brandFor(id) {
  const brands = ["Toyota", "Hyundai", "Kia", "Honda", "Yamaha"];

  return brands[id % brands.length];
}

function modelFor(id) {
  const models = ["Corolla", "Elantra", "Rio", "Civic", "NMAX"];

  return models[id % models.length];
}

function normalizeSearch(value) {
  return String(value)
    .replace(/[\s-]+/g, " ")
    .trim()
    .toLowerCase();
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}
