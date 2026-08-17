import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the Electron platform surface and the licensing gate are mocked; the
// database, Drizzle queries, and every service below are real.
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.RENTAL_APP_USER_DATA_DIR ?? ""),
    getVersion: vi.fn(() => "0.4.0-test"),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
}));

vi.mock("../licensing/service", () => ({
  isWriteAccessAllowed: vi.fn(() => true),
  getLicenseStatus: vi.fn(() => ({ canWrite: true })),
}));

const {
  buildActivationInput,
  buildReturnInput,
  createTestCustomer,
  createTestVehicle,
  rentalWindow,
  startTestDatabase,
  stopTestDatabase,
} = await import("./database-test-harness");
const { getSqliteDatabase } = await import("./database");
const {
  activateDraftRental,
  activateRental,
  cancelRental,
  createDraftRental,
  extendRental,
  listRentals,
  returnRental,
  returnRentalWithPayment,
  updateDraftRental,
} = await import("./rentals.service");
const { createVehicleSale } = await import("./vehicle-sales.service");

type TestDatabase = ReturnType<typeof startTestDatabase>;

let database: TestDatabase;

function vehicleStatus(vehicleId: number): string {
  const row = getSqliteDatabase()
    .prepare("select status from vehicles where id = ?")
    .get(vehicleId) as { status: string } | undefined;

  return row?.status ?? "missing";
}

function rentalRow(rentalId: number): {
  status: string;
  actual_return_datetime: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
} {
  return getSqliteDatabase()
    .prepare(
      "select status, actual_return_datetime, total_amount, paid_amount, remaining_amount from rentals where id = ?",
    )
    .get(rentalId) as never;
}

function countRows(table: string, whereSql = "1=1", ...params: unknown[]): number {
  const row = getSqliteDatabase()
    .prepare(`select count(*) as count from ${table} where ${whereSql}`)
    .get(...params) as { count: number };

  return row.count;
}

beforeEach(() => {
  database = startTestDatabase();
});

afterEach(() => {
  stopTestDatabase(database);
});

describe("activating a rental", () => {
  it("creates an active rental and marks the vehicle rented", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    expect(rental.status).toBe("active");
    expect(rental.contractNo).toMatch(/^CNT/);
    expect(vehicleStatus(vehicleId)).toBe("rented");
    expect(rentalRow(rental.id).status).toBe("active");
  });

  it("rejects a vehicle in maintenance without writing a rental", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ status: "maintenance" });

    expect(() =>
      activateRental(buildActivationInput(customerId, vehicleId)),
    ).toThrow("Vehicle is not available.");

    expect(countRows("rentals")).toBe(0);
    expect(vehicleStatus(vehicleId)).toBe("maintenance");
  });

  it("rejects an inactive vehicle without writing a rental", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ status: "inactive" });

    expect(() =>
      activateRental(buildActivationInput(customerId, vehicleId)),
    ).toThrow("Vehicle is not available.");

    expect(countRows("rentals")).toBe(0);
    expect(vehicleStatus(vehicleId)).toBe("inactive");
  });

  it("rejects a sold vehicle without writing a rental", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    createVehicleSale({
      vehicleId,
      buyerName: "Buyer",
      buyerPhone: null,
      buyerIdNumber: null,
      saleDate: new Date(Date.now() - 1000).toISOString(),
      salePrice: 5000,
      paymentMethod: "cash",
      notes: null,
    });

    expect(() =>
      activateRental(buildActivationInput(customerId, vehicleId)),
    ).toThrow();

    expect(countRows("rentals")).toBe(0);
  });

  it("rejects a second rental for an already rented vehicle", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    activateRental(buildActivationInput(customerId, vehicleId));

    expect(() =>
      activateRental(buildActivationInput(customerId, vehicleId)),
    ).toThrow("Vehicle is not available.");

    expect(countRows("rentals")).toBe(1);
    expect(vehicleStatus(vehicleId)).toBe("rented");
  });
});

describe("the one-open-rental guarantee", () => {
  it("is enforced by the service check", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    // Put the vehicle back to available so the status check cannot fire, which
    // isolates the duplicate-open-rental check itself.
    getSqliteDatabase()
      .prepare("update vehicles set status = 'available' where id = ?")
      .run(vehicleId);

    expect(() =>
      activateRental(buildActivationInput(customerId, vehicleId)),
    ).toThrow("This vehicle already has an active rental.");

    expect(countRows("rentals")).toBe(1);
    expect(rentalRow(rental.id).status).toBe("active");
  });

  it("is enforced independently by the partial unique index", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    activateRental(buildActivationInput(customerId, vehicleId));

    // Bypass the service entirely: the database must still refuse a second
    // open rental for the same vehicle. The price is written to both columns of
    // the pair, so the mirror trigger passes and the unique index is what fails.
    const insertDuplicate = () =>
      getSqliteDatabase()
        .prepare(
          `insert into rentals (
             contract_no, customer_id, vehicle_id, status,
             start_datetime, expected_return_datetime,
             daily_price, daily_price_minor,
             created_at, updated_at
           ) values (?, ?, ?, 'active', ?, ?, 100, 10000, ?, ?)`,
        )
        .run(
          "CNT-DUPLICATE",
          customerId,
          vehicleId,
          new Date("2026-08-05T09:00:00.000Z").toISOString(),
          new Date("2026-08-06T09:00:00.000Z").toISOString(),
          new Date().toISOString(),
          new Date().toISOString(),
        );

    expect(insertDuplicate).toThrow(/UNIQUE constraint failed/i);
    expect(countRows("rentals")).toBe(1);
  });
});

describe("draft rentals", () => {
  it("applies the same availability rules when a draft is activated", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const draft = createDraftRental(buildActivationInput(customerId, vehicleId));
    expect(draft.status).toBe("draft");
    expect(vehicleStatus(vehicleId)).toBe("available");

    // The vehicle goes into maintenance after the draft was written.
    getSqliteDatabase()
      .prepare("update vehicles set status = 'maintenance' where id = ?")
      .run(vehicleId);

    expect(() => activateDraftRental(draft.id)).toThrow("Vehicle is not available.");
    expect(rentalRow(draft.id).status).toBe("draft");

    getSqliteDatabase()
      .prepare("update vehicles set status = 'available' where id = ?")
      .run(vehicleId);

    const activated = activateDraftRental(draft.id);

    expect(activated.status).toBe("active");
    expect(vehicleStatus(vehicleId)).toBe("rented");
  });

  it("allows updating a draft rental details before activation", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const input = buildActivationInput(customerId, vehicleId);
    const draft = createDraftRental(input);
    expect(draft.status).toBe("draft");

    const updated = updateDraftRental(draft.id, {
      ...input,
      dailyPrice: 120,
      notesOut: "Updated draft notes",
    });

    expect(updated.status).toBe("draft");
    expect(updated.dailyPrice).toBe(120);
    expect(updated.notesOut).toBe("Updated draft notes");
    const row = getSqliteDatabase()
      .prepare("select notes_out from rentals where id = ?")
      .get(draft.id) as { notes_out: string | null };
    expect(row.notes_out).toBe("Updated draft notes");
  });

  it("rejects updating non-draft rentals", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const input = buildActivationInput(customerId, vehicleId);
    const rental = activateRental(input);

    expect(() =>
      updateDraftRental(rental.id, {
        ...input,
        dailyPrice: 150,
      }),
    ).toThrow("Only draft rentals can be updated here.");
  });

  it("filters and counts draft rentals in listRentals queue='draft'", () => {
    const customerId = createTestCustomer();
    const vehicleId1 = createTestVehicle();
    const vehicleId2 = createTestVehicle();

    const draft = createDraftRental(buildActivationInput(customerId, vehicleId1));
    const active = activateRental(buildActivationInput(customerId, vehicleId2));

    const draftQueue = listRentals({ queue: "draft" });
    expect(draftQueue.rows.some((r) => r.id === draft.id)).toBe(true);
    expect(draftQueue.rows.some((r) => r.id === active.id)).toBe(false);
    expect(draftQueue.summary?.draft).toBeGreaterThanOrEqual(1);

    const activeQueue = listRentals({ queue: "active" });
    expect(activeQueue.rows.some((r) => r.id === draft.id)).toBe(false);
    expect(activeQueue.rows.some((r) => r.id === active.id)).toBe(true);
  });
});

describe("cancellation", () => {
  it("releases the vehicle and does not block a later rental", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    cancelRental({ rentalId: rental.id, reason: "Customer changed plans." });

    expect(rentalRow(rental.id).status).toBe("cancelled");
    expect(vehicleStatus(vehicleId)).toBe("available");

    const nextRental = activateRental(buildActivationInput(customerId, vehicleId));

    expect(nextRental.status).toBe("active");
    expect(vehicleStatus(vehicleId)).toBe("rented");
  });
});

describe("returning a rental", () => {
  it("marks the rental returned and the vehicle available", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    returnRental(buildReturnInput(rental.id));

    const row = rentalRow(rental.id);
    expect(row.status).toBe("returned");
    expect(row.actual_return_datetime).not.toBeNull();
    expect(vehicleStatus(vehicleId)).toBe("available");
  });

  it("creates a maintenance record and leaves the vehicle in maintenance", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    returnRental(
      buildReturnInput(rental.id, {
        vehicleStatus: "maintenance",
        maintenanceTitle: "Brake inspection",
        maintenanceDescription: "Reported noise on braking.",
      }),
    );

    expect(rentalRow(rental.id).status).toBe("returned");
    expect(vehicleStatus(vehicleId)).toBe("maintenance");
    expect(countRows("maintenance_records", "vehicle_id = ?", vehicleId)).toBe(1);
  });

  it("recalculates total amount and remaining balance for actual days on early return", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const start = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const expected = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 30 days total
    const actual = new Date(Date.now() - 1000).toISOString(); // 28 days

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        startDatetime: start,
        expectedReturnDatetime: expected,
        dailyPrice: 100,
      }),
    );

    expect(rental.totalAmount).toBe(3000);

    const returned = returnRental(
      buildReturnInput(rental.id, {
        actualReturnDatetime: actual,
        recalculateForActualDays: true,
      }),
    );

    expect(returned.status).toBe("returned");
    expect(returned.totalAmount).toBe(2800);
    expect(returned.remainingAmount).toBe(2800);

    const row = rentalRow(rental.id);
    expect(row.total_amount).toBe(2800);
    expect(row.remaining_amount).toBe(2800);
    expect(vehicleStatus(vehicleId)).toBe("available");
  });
});

describe("return with payment", () => {
  it("updates rental, payment, balances, vehicle, audit and mileage together", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    const auditCountBefore = countRows("audit_events");

    const result = returnRentalWithPayment({
      returnInput: buildReturnInput(rental.id),
      paymentInput: {
        rentalId: rental.id,
        type: "rent",
        method: "cash",
        amount: 300,
        paymentDate: new Date(Date.now() - 1000).toISOString(),
        notes: null,
      },
    });

    expect(result.payment).not.toBeNull();
    expect(result.payment?.amount).toBe(300);

    const row = rentalRow(rental.id);
    expect(row.status).toBe("returned");
    expect(row.paid_amount).toBe(300);
    expect(row.remaining_amount).toBe(row.total_amount - 300);

    expect(vehicleStatus(vehicleId)).toBe("available");
    expect(countRows("payments", "rental_id = ?", rental.id)).toBe(1);
    expect(countRows("audit_events")).toBeGreaterThan(auditCountBefore);
    expect(
      countRows("vehicle_mileage_events", "rental_id = ? and event_type = 'rental_return'", rental.id),
    ).toBe(1);
  });

  it("rolls the whole transaction back when a write fails after the return", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    const mileageEventsBefore = countRows("vehicle_mileage_events");

    // Fail at the database level rather than through service validation: the
    // atomicity of the return is the required behaviour, and it must hold no
    // matter where inside the transaction the failure comes from.
    //
    // The WHEN clause makes this test self-proving. It only fires once the
    // rental is already marked returned, so reaching the abort at all is
    // evidence the return writes landed inside the transaction. If they had
    // not, the trigger would stay silent, the payment would insert, and the
    // toThrow below would fail.
    getSqliteDatabase().exec(`
      create trigger test_abort_payment_insert
      before insert on payments
      when (select status from rentals where id = new.rental_id) = 'returned'
      begin
        select raise(abort, 'forced test failure after return writes');
      end;
    `);

    try {
      expect(() =>
        returnRentalWithPayment({
          returnInput: buildReturnInput(rental.id, {
            vehicleStatus: "maintenance",
            maintenanceTitle: "Brake inspection",
            maintenanceDescription: null,
          }),
          // A fully valid payment: only the trigger makes this fail.
          paymentInput: {
            rentalId: rental.id,
            type: "rent",
            method: "cash",
            amount: 300,
            paymentDate: new Date(Date.now() - 1000).toISOString(),
            notes: null,
          },
        }),
      ).toThrow(/forced test failure after return writes/);
    } finally {
      getSqliteDatabase().exec("drop trigger test_abort_payment_insert;");
    }

    const row = rentalRow(rental.id);
    expect(row.status).toBe("active");
    expect(row.actual_return_datetime).toBeNull();
    expect(row.paid_amount).toBe(0);
    expect(vehicleStatus(vehicleId)).toBe("rented");
    expect(countRows("payments")).toBe(0);
    expect(countRows("maintenance_records")).toBe(0);
    expect(countRows("vehicle_mileage_events")).toBe(mileageEventsBefore);
  });
});

describe("stored status versus effective status", () => {
  // An open rental can remain stored as 'active' until a refresh path persists
  // 'overdue'. Public reads and aggregates must therefore derive the effective
  // status from the stored status and expected-return time, while remaining
  // compatible with rows already stored as 'overdue'.
  it("reports a stored active rental as effectively overdue before refresh", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(-5, -1),
      }),
    );

    expect(rental.status).toBe("overdue");
    expect(rentalRow(rental.id).status).toBe("active");
    expect(vehicleStatus(vehicleId)).toBe("rented");
  });

  it("reports a rental as active while its expected return is still ahead", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(-1, 2),
      }),
    );

    expect(rental.status).toBe("active");
    expect(rentalRow(rental.id).status).toBe("active");
  });
});

describe("extending active and overdue rentals", () => {
  it("extends an active rental, updates totals and remaining balance", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(0, 7), // 7 days @ 100 = 700
        dailyPrice: 100,
      }),
    );

    expect(rental.totalAmount).toBe(700);
    expect(rental.remainingAmount).toBe(700);

    // Anchored to the rental's own start, not a fresh Date.now(): a whole-day
    // rate charges a part day in full, so a span of "14 days and two
    // milliseconds" is fifteen days. See rentalWindow in the test harness.
    const futureDate = new Date(
      new Date(rental.startDatetime).getTime() + 14 * 24 * 3600 * 1000,
    ).toISOString();

    const result = extendRental({
      rentalId: rental.id,
      newExpectedReturnDatetime: futureDate, // 14 days total
      recordPayment: false,
    });

    expect(result.rental.expectedReturnDatetime).toBe(futureDate);
    expect(result.rental.totalAmount).toBe(1400); // 14 * 100
    expect(result.rental.remainingAmount).toBe(1400);
    expect(result.payment).toBeNull();

    const dbRow = rentalRow(rental.id);
    expect(dbRow.total_amount).toBe(1400);
    expect(dbRow.remaining_amount).toBe(1400);
  });

  it("extends an overdue rental, records extension payment, and sets status back to active", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    // Rental started 5 days ago, expected return yesterday (4 days @ 100 = 400)
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(-5, -1),
        dailyPrice: 100,
      }),
    );

    expect(rental.status).toBe("overdue");

    // Twelve whole days from the start, which is seven days from now: the
    // rental leaves overdue and the span stays exact.
    const newReturnDate = new Date(
      new Date(rental.startDatetime).getTime() + 12 * 24 * 3600 * 1000,
    ).toISOString(); // 12 days total = 1200

    const result = extendRental({
      rentalId: rental.id,
      newExpectedReturnDatetime: newReturnDate,
      recordPayment: true,
      paymentAmount: 800,
      paymentMethod: "cash",
      paymentNotes: "Extension payment for 8 more days",
    });

    expect(result.rental.status).toBe("active");
    expect(result.rental.totalAmount).toBe(1200);
    expect(result.payment).not.toBeNull();
    expect(result.payment?.amount).toBe(800);
    expect(result.payment?.receiptNo).toMatch(/^RCP/);

    const dbRow = rentalRow(rental.id);
    expect(dbRow.status).toBe("active");
    expect(dbRow.total_amount).toBe(1200);
    expect(dbRow.paid_amount).toBe(800);
    expect(dbRow.remaining_amount).toBe(400);
  });

  it("refuses to move the return date earlier, leaving the money untouched", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(0, 7),
        dailyPrice: 100,
      }),
    );

    const earlier = new Date(
      new Date(rental.expectedReturnDatetime).getTime() - 2 * 24 * 3600 * 1000,
    ).toISOString();

    expect(() =>
      extendRental({
        rentalId: rental.id,
        newExpectedReturnDatetime: earlier,
        recordPayment: false,
      }),
    ).toThrow("New return date must be after the current return date");

    // The whole transaction rolls back: shortening must not reprice anything
    // and must not move the date it refused to move.
    const dbRow = rentalRow(rental.id);
    expect(dbRow.total_amount).toBe(700);

    const stored = getSqliteDatabase()
      .prepare("select expected_return_datetime from rentals where id = ?")
      .get(rental.id) as { expected_return_datetime: string };

    expect(stored.expected_return_datetime).toBe(rental.expectedReturnDatetime);
  });

  it("refuses a payment it was asked to record but given no amount for", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();

    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(0, 7),
        dailyPrice: 100,
      }),
    );

    const later = new Date(
      new Date(rental.startDatetime).getTime() + 14 * 24 * 3600 * 1000,
    ).toISOString();

    // Previously accepted, then silently ignored: the caller got success back
    // with no payment attached and no way to tell.
    expect(() =>
      extendRental({
        rentalId: rental.id,
        newExpectedReturnDatetime: later,
        recordPayment: true,
      }),
    ).toThrow();

    const dbRow = rentalRow(rental.id);
    expect(dbRow.total_amount).toBe(700);
  });
});
