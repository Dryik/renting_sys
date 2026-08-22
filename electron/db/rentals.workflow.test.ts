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
  replaceRentalVehicle,
  returnRental,
  returnRentalWithPayment,
  updateDraftRental,
} = await import("./rentals.service");
const { createVehicleSale } = await import("./vehicle-sales.service");
const { createPayment } = await import("./payments.service");
const { getVehicleIncome } = await import("./reports.service");
const { calculateVehicleReplacementSummary } = await import(
  "../../src/shared/rentals"
);
type RentalVehicleReplaceInput =
  import("../../src/shared/rentals").RentalVehicleReplaceInput;

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
  start_datetime: string;
  expected_return_datetime: string;
  actual_return_datetime: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
} {
  return getSqliteDatabase()
    .prepare(
      `select status, start_datetime, expected_return_datetime,
              actual_return_datetime, total_amount, paid_amount, remaining_amount
       from rentals where id = ?`,
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

/**
 * Replacing the vehicle on a live contract.
 *
 * The shape of the day: a bike breaks, the customer is put on another, and the
 * contract carries on under its own number. What must hold is that the shop
 * bills the days the customer actually had — each at the rate of the bike they
 * had it on — and that a breakdown never adds a day to the bill.
 */
describe("replacing the vehicle on an open contract", () => {
  function segmentRows(rentalId: number): Array<{
    sequence: number;
    vehicle_id: number;
    start_datetime: string;
    end_datetime: string | null;
    daily_price_minor: number;
    mileage_out: number | null;
    mileage_in: number | null;
    reason: string | null;
  }> {
    return getSqliteDatabase()
      .prepare(
        `select sequence, vehicle_id, start_datetime, end_datetime, daily_price_minor,
                mileage_out, mileage_in, reason
         from rental_vehicle_segments where rental_id = ? order by sequence`,
      )
      .all(rentalId) as never;
  }

  function buildReplaceInput(
    rentalId: number,
    replacementVehicleId: number,
    overrides: Partial<RentalVehicleReplaceInput> = {},
  ): RentalVehicleReplaceInput {
    return {
      rentalId,
      replacementVehicleId,
      replacedAtDatetime: new Date(Date.now() - 1000).toISOString(),
      newDailyPrice: 100,
      reason: "Engine failure on the original bike.",
      outgoingMileageIn: 1200,
      outgoingFuelIn: "half",
      outgoingVehicleStatus: "maintenance",
      maintenanceTitle: "Engine failure",
      maintenanceDescription: null,
      // Matches the test vehicle's own reading; mileage may never go backwards.
      incomingMileageOut: 1000,
      incomingFuelOut: "full",
      notes: null,
      originalVehicleNotHandedOver: false,
      ...overrides,
    };
  }

  it("moves the contract onto the new vehicle without ending it", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle({ mileage: 1000 });
    const replacementVehicleId = createTestVehicle({ mileage: 500 });
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );

    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId),
    );

    // The contract itself is untouched: same row, same number, still open.
    expect(updated.id).toBe(rental.id);
    expect(updated.contractNo).toBe(rental.contractNo);
    expect(updated.status).toBe("active");
    expect(updated.vehicleId).toBe(replacementVehicleId);
    expect(vehicleStatus(brokenVehicleId)).toBe("maintenance");
    expect(vehicleStatus(replacementVehicleId)).toBe("rented");
  });

  it("opens a maintenance record for a vehicle that could not be flagged while rented", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );

    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        maintenanceTitle: "Engine failure",
      }),
    );

    expect(
      countRows(
        "maintenance_records",
        "vehicle_id = ? and end_date is null",
        brokenVehicleId,
      ),
    ).toBe(1);
  });

  it("hands the broken vehicle back to the yard when nothing is wrong with it", () => {
    const customerId = createTestCustomer();
    const originalVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, originalVehicleId),
    );

    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        outgoingVehicleStatus: "available",
        maintenanceTitle: null,
        reason: "Customer asked for a larger bike.",
      }),
    );

    expect(vehicleStatus(originalVehicleId)).toBe("available");
    expect(countRows("maintenance_records", "vehicle_id = ?", originalVehicleId)).toBe(0);
  });

  it("records one closed period and one open period", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle({ mileage: 1000 });
    const replacementVehicleId = createTestVehicle({ mileage: 500 });
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );
    const replacedAt = new Date(Date.now() - 1000).toISOString();

    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: replacedAt,
        incomingMileageOut: 500,
      }),
    );

    const segments = segmentRows(rental.id);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      sequence: 1,
      vehicle_id: brokenVehicleId,
      end_datetime: replacedAt,
      mileage_in: 1200,
      reason: null,
    });
    expect(segments[1]).toMatchObject({
      sequence: 2,
      vehicle_id: replacementVehicleId,
      start_datetime: replacedAt,
      end_datetime: null,
      mileage_out: 500,
      reason: "Engine failure on the original bike.",
    });
  });

  /**
   * The money question the whole feature turns on. A three-day contract that
   * changes bikes on day two is still a three-day contract; what changes is
   * which bike earns which day.
   */
  it("charges each vehicle its own rate for its own days, without adding a day", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-3, 0);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );

    expect(rental.totalAmount).toBe(300);

    // Swapped one day in: one day on the old bike, two on the replacement.
    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: new Date(Date.parse(window.startDatetime) + 24 * 60 * 60 * 1000).toISOString(),
        newDailyPrice: 200,
      }),
    );

    expect(updated.totalAmount).toBe(100 + 400);
    expect(updated.dailyPrice).toBe(200);

    const days = (updated.vehicleSegments ?? []).map((segment) => segment.days);
    expect(days).toEqual([1, 2]);
    expect(days.reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  it("charges nothing for a vehicle that failed on the day it went out", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(0, 3);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );

    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: new Date(Date.parse(window.startDatetime) + 60 * 60 * 1000).toISOString(),
        newDailyPrice: 100,
      }),
    );

    // Three days billed, all of them on the bike the customer actually rode.
    expect(updated.totalAmount).toBe(300);
    expect((updated.vehicleSegments ?? []).map((segment) => segment.days)).toEqual([0, 3]);
  });

  it("moves the contract window when the original vehicle was never handed over", () => {
    const customerId = createTestCustomer();
    const unavailableVehicleId = createTestVehicle({ mileage: 1000 });
    const replacementVehicleId = createTestVehicle({ mileage: 500 });
    const window = rentalWindow(-6, 4);
    const rental = activateRental(
      buildActivationInput(customerId, unavailableVehicleId, {
        ...window,
        dailyPrice: 100,
        mileageOut: 1000,
      }),
    );
    const handoverAt = new Date(
      Date.parse(window.startDatetime) + 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000,
    ).toISOString();
    const promisedDuration =
      Date.parse(window.expectedReturnDatetime) - Date.parse(window.startDatetime);

    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: handoverAt,
        newDailyPrice: 100,
        originalVehicleNotHandedOver: true,
        // These are deliberately populated to prove the correction ignores a
        // return reading for a vehicle the customer never received.
        outgoingMileageIn: 1200,
        outgoingFuelIn: "half",
      }),
    );

    const stored = rentalRow(rental.id);
    expect(updated.startDatetime).toBe(handoverAt);
    expect(stored.start_datetime).toBe(handoverAt);
    expect(Date.parse(updated.expectedReturnDatetime) - Date.parse(handoverAt)).toBe(
      promisedDuration,
    );
    expect(stored.expected_return_datetime).toBe(updated.expectedReturnDatetime);
    expect(updated.totalAmount).toBe(rental.totalAmount);
    expect((updated.vehicleSegments ?? []).map((segment) => segment.days)).toEqual([0, 10]);

    const segments = segmentRows(rental.id);
    expect(segments[0]).toMatchObject({
      start_datetime: handoverAt,
      end_datetime: handoverAt,
      mileage_out: null,
      mileage_in: null,
    });
    expect(
      countRows(
        "vehicle_mileage_events",
        "rental_id = ? and vehicle_id = ? and event_type = 'rental_return'",
        rental.id,
        unavailableVehicleId,
      ),
    ).toBe(0);
    expect(
      countRows(
        "vehicle_mileage_events",
        "rental_id = ? and vehicle_id = ? and event_type = 'manual_adjustment'",
        rental.id,
        unavailableVehicleId,
      ),
    ).toBe(1);
  });

  it("refuses a no-handover correction after vehicle history already exists", () => {
    const customerId = createTestCustomer();
    const firstVehicleId = createTestVehicle();
    const secondVehicleId = createTestVehicle();
    const thirdVehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, firstVehicleId));

    const onceReplaced = replaceRentalVehicle(
      buildReplaceInput(rental.id, secondVehicleId, {
        outgoingVehicleStatus: "available",
        maintenanceTitle: null,
      }),
    );

    expect(() =>
      replaceRentalVehicle(
        buildReplaceInput(onceReplaced.id, thirdVehicleId, {
          originalVehicleNotHandedOver: true,
        }),
      ),
    ).toThrow(/before any earlier vehicle replacement/i);
    expect(segmentRows(rental.id)).toHaveLength(2);
    expect(vehicleStatus(secondVehicleId)).toBe("rented");
    expect(vehicleStatus(thirdVehicleId)).toBe("available");
  });

  it("leaves the deposit, the payments and the balance where they were", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        depositRequired: 50,
        depositPaid: 50,
      }),
    );
    const paymentsBefore = countRows("payments", "rental_id = ?", rental.id);

    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, { newDailyPrice: 100 }),
    );

    expect(updated.depositPaid).toBe(rental.depositPaid);
    expect(updated.paidAmount).toBe(rental.paidAmount);
    expect(countRows("payments", "rental_id = ?", rental.id)).toBe(paymentsBefore);
    expect(updated.remainingAmount).toBe(updated.totalAmount - updated.paidAmount);
  });

  it("refuses a replacement vehicle that is not available", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const busyVehicleId = createTestVehicle({ status: "maintenance" });
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );

    expect(() =>
      replaceRentalVehicle(buildReplaceInput(rental.id, busyVehicleId)),
    ).toThrow(/not available/i);

    expect(segmentRows(rental.id)).toHaveLength(1);
    expect(vehicleStatus(brokenVehicleId)).toBe("rented");
  });

  it("refuses to replace a vehicle with itself", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));

    expect(() =>
      replaceRentalVehicle(buildReplaceInput(rental.id, vehicleId)),
    ).toThrow(/different vehicle/i);
  });

  it("refuses to touch a contract that is already closed", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(buildActivationInput(customerId, vehicleId));
    returnRental(buildReturnInput(rental.id));

    expect(() =>
      replaceRentalVehicle(buildReplaceInput(rental.id, replacementVehicleId)),
    ).toThrow(/active or overdue/i);
  });

  it("rolls everything back when the replacement is rejected partway", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle({ mileage: 1000 });
    const replacementVehicleId = createTestVehicle({ mileage: 5000 });
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );

    // Mileage out below the vehicle's own reading is refused, after the
    // periods and the vehicle rows would otherwise have been written.
    expect(() =>
      replaceRentalVehicle(
        buildReplaceInput(rental.id, replacementVehicleId, {
          incomingMileageOut: 10,
        }),
      ),
    ).toThrow(/mileage/i);

    expect(segmentRows(rental.id)).toHaveLength(1);
    expect(segmentRows(rental.id)[0].end_datetime).toBeNull();
    expect(vehicleStatus(brokenVehicleId)).toBe("rented");
    expect(vehicleStatus(replacementVehicleId)).toBe("available");
  });

  it("closes the replacement's period, not the broken vehicle's, on return", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );
    replaceRentalVehicle(buildReplaceInput(rental.id, replacementVehicleId));

    returnRental(buildReturnInput(rental.id, { mileageIn: 1100 }));

    const segments = segmentRows(rental.id);
    expect(segments.every((segment) => segment.end_datetime !== null)).toBe(true);
    expect(segments[1].mileage_in).toBe(1100);
    expect(vehicleStatus(replacementVehicleId)).toBe("available");
    // The broken bike stays where the replacement put it.
    expect(vehicleStatus(brokenVehicleId)).toBe("maintenance");
  });

  it("reprices an early return over the days ridden on each vehicle", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-4, 4);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );
    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: new Date(
          Date.parse(window.startDatetime) + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        newDailyPrice: 200,
      }),
    );

    // Brought back four days in: two on the old bike, two on the replacement.
    const returned = returnRental(
      buildReturnInput(rental.id, { recalculateForActualDays: true }),
    );

    expect(returned.totalAmount).toBe(2 * 100 + 2 * 200);
  });

  it("charges extension days at the replacement's rate", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-2, 1);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );
    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: new Date(
          Date.parse(window.startDatetime) + 24 * 60 * 60 * 1000,
        ).toISOString(),
        newDailyPrice: 300,
      }),
    );

    const { rental: extended } = extendRental({
      rentalId: rental.id,
      newExpectedReturnDatetime: new Date(
        Date.parse(window.expectedReturnDatetime) + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      recordPayment: false,
    });

    // One day at 100, then four at 300 — the two added days go to the bike the
    // customer is holding, not to the rate the contract started on.
    expect(extended.totalAmount).toBe(100 + 4 * 300);
  });

  /**
   * The counter agrees a price with the customer from what the dialog shows.
   * If that number and the one the service writes could drift apart, the shop
   * would be quoting one figure and billing another.
   */
  it("bills exactly what the dialog previewed", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-3, 4);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 90,
      }),
    );
    const replacedAt = new Date(
      Date.parse(window.startDatetime) + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Exactly what the dialog computes before the counter presses Replace.
    const preview = calculateVehicleReplacementSummary({
      startDatetime: rental.startDatetime,
      expectedReturnDatetime: rental.expectedReturnDatetime,
      segments: rental.vehicleSegments,
      replacedAtDatetime: replacedAt,
      newDailyPrice: 145,
      accessoryCharges: rental.accessoryCharges,
      currentTotalAmount: rental.totalAmount,
      paidAmount: rental.paidAmount,
    });

    const updated = replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        replacedAtDatetime: replacedAt,
        newDailyPrice: 145,
      }),
    );

    expect(preview).not.toBeNull();
    expect(preview?.newTotalAmount).toBe(updated.totalAmount);
    expect(preview?.newRemainingAmount).toBe(updated.remainingAmount);
    expect([preview?.outgoingDays, preview?.incomingDays]).toEqual(
      (updated.vehicleSegments ?? []).map((segment) => segment.days),
    );
  });

  it("writes an audit entry naming both vehicles and the reason", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId),
    );

    replaceRentalVehicle(
      buildReplaceInput(rental.id, replacementVehicleId, {
        reason: "Engine seized on the highway.",
      }),
    );

    const entry = getSqliteDatabase()
      .prepare(
        `select reason, metadata_json from audit_events
         where action = 'rental.vehicle.replaced' and entity_id = ?`,
      )
      .get(rental.id) as { reason: string; metadata_json: string } | undefined;

    expect(entry?.reason).toBe("Engine seized on the highway.");
    expect(JSON.parse(entry?.metadata_json ?? "{}")).toMatchObject({
      previousVehicleId: brokenVehicleId,
      replacementVehicleId,
    });
  });
});

/**
 * A contract that ran on two vehicles took money for both of them. The vehicle
 * income report has to say which vehicle earned what, or a shop deciding
 * whether a bike pays for itself is reading another bike's takings.
 */
describe("vehicle income after a replacement", () => {
  const today = () => new Date().toISOString().slice(0, 10);

  function incomeFor(vehicleId: number): {
    totalIncome: number;
    rentalCount: number;
  } {
    const row = getVehicleIncome(today(), today()).find(
      (record) => record.vehicleId === vehicleId,
    );

    return {
      totalIncome: row?.totalIncome ?? 0,
      rentalCount: row?.rentalCount ?? 0,
    };
  }

  it("credits an unswapped contract entirely to its one vehicle", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle();
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        ...rentalWindow(-3, 0),
        dailyPrice: 100,
      }),
    );
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 300,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    expect(incomeFor(vehicleId)).toEqual({ totalIncome: 300, rentalCount: 1 });
  });

  it("splits one contract's takings across the vehicles that earned them", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-3, 0);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );
    replaceRentalVehicle({
      rentalId: rental.id,
      replacementVehicleId,
      replacedAtDatetime: new Date(
        Date.parse(window.startDatetime) + 24 * 60 * 60 * 1000,
      ).toISOString(),
      newDailyPrice: 200,
      reason: "Engine failure on the original bike.",
      outgoingMileageIn: 1200,
      outgoingFuelIn: "half",
      outgoingVehicleStatus: "maintenance",
      maintenanceTitle: "Engine failure",
      maintenanceDescription: null,
      incomingMileageOut: 1000,
      incomingFuelOut: "full",
      notes: null,
    });

    // One day at 100 on the broken bike, two at 200 on the replacement.
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 500,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    expect(incomeFor(brokenVehicleId)).toEqual({
      totalIncome: 100,
      rentalCount: 1,
    });
    expect(incomeFor(replacementVehicleId)).toEqual({
      totalIncome: 400,
      rentalCount: 1,
    });
  });

  it("loses nothing in the split when the shares do not divide evenly", () => {
    const customerId = createTestCustomer();
    const brokenVehicleId = createTestVehicle();
    const replacementVehicleId = createTestVehicle();
    const window = rentalWindow(-3, 0);
    const rental = activateRental(
      buildActivationInput(customerId, brokenVehicleId, {
        ...window,
        dailyPrice: 100,
      }),
    );
    replaceRentalVehicle({
      rentalId: rental.id,
      replacementVehicleId,
      replacedAtDatetime: new Date(
        Date.parse(window.startDatetime) + 24 * 60 * 60 * 1000,
      ).toISOString(),
      newDailyPrice: 100,
      reason: "Engine failure on the original bike.",
      outgoingMileageIn: 1200,
      outgoingFuelIn: "half",
      outgoingVehicleStatus: "available",
      maintenanceTitle: null,
      maintenanceDescription: null,
      incomingMileageOut: 1000,
      incomingFuelOut: "full",
      notes: null,
    });

    // A part payment that splits one third to two thirds and cannot divide
    // into whole cents.
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 100,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const broken = incomeFor(brokenVehicleId).totalIncome;
    const replacement = incomeFor(replacementVehicleId).totalIncome;

    expect(broken + replacement).toBe(100);
    // The odd cent follows the larger share rather than being dropped.
    expect(broken).toBe(33.33);
    expect(replacement).toBe(66.67);
  });
});
