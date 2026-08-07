import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The declared DTO types say what crosses IPC, but TypeScript stops at the
 * boundary: a service that spreads a Drizzle row satisfies its return type and
 * still ships `amountLegacy` and `amountMinor` to the renderer, where nothing
 * warns anyone that two of the three amounts on the object are storage details.
 *
 * These tests inspect the objects the services actually return, at runtime,
 * rather than the shapes they claim to return.
 */
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
  createTestCustomer,
  createTestVehicle,
  daysFromNow,
  startTestDatabase,
  stopTestDatabase,
} = await import("./database-test-harness");
const {
  createPayment,
  correctPayment,
  listPayments,
  listPaymentsForRental,
  voidPayment,
} = await import("./payments.service");
const { activateRental } = await import("./rentals.service");
const { createVehicle, listVehicles, updateVehicle } = await import(
  "./vehicles.service"
);
const {
  createVehicleSale,
  listVehicleSales,
  getVehicleSaleForVehicle,
  voidVehicleSale,
} = await import("./vehicle-sales.service");
const {
  createExpense,
  voidExpense,
  listExpenses,
  createCashMovement,
  voidCashMovement,
  createAccountingAdjustment,
  voidAccountingAdjustment,
  listAccountingTransactions,
  getAccountingDailyClosing,
  saveAccountingDailyClosing,
} = await import("./accounting.service");
const {
  createEmployeeLoan,
  listEmployeeLoans,
  listEmployeeLoanPayments,
  recordEmployeeLoanRepayment,
  voidEmployeeLoan,
} = await import("./employee-loans.service");
const {
  createMaintenance,
  listMaintenance,
  updateMaintenance,
} = await import("./maintenance.service");
const { listAuditEvents } = await import("./audit.service");
const { createUser } = await import("./auth.service");

type TestDatabase = ReturnType<typeof startTestDatabase>;

let database: TestDatabase;
let plateCounter = 0;

beforeEach(() => {
  database = startTestDatabase();
  plateCounter = 0;
});

afterEach(() => {
  stopTestDatabase(database);
});

/**
 * Walks everything reachable from a returned value and collects the paths of
 * any key ending in `Legacy` or `Minor`. Recursive because a page result nests
 * its rows, and a leak one level down is exactly as visible to the renderer as
 * one at the top.
 */
function internalMoneyKeyPaths(value: unknown, trail = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      internalMoneyKeyPaths(item, `${trail}[${index}]`),
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const found: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("Legacy") || key.endsWith("Minor")) {
      found.push(`${trail}.${key}`);
    }

    found.push(...internalMoneyKeyPaths(child, `${trail}.${key}`));
  }

  return found;
}

function expectNoInternalMoneyKeys(label: string, value: unknown): void {
  expect(
    internalMoneyKeyPaths(value),
    `${label} exposes internal money fields`,
  ).toEqual([]);
}

function iso(): string {
  return new Date().toISOString();
}

/** Money has to exist somewhere before a spend can be recorded against it. */
function fundCashDrawer(amount = 10000): void {
  createAccountingAdjustment({
    location: "cash_drawer",
    direction: "increase",
    amount,
    adjustmentDate: iso(),
    reason: "Opening float",
    notes: null,
  });
}

function newVehicleInput(dailyPrice: number) {
  plateCounter += 1;

  return {
    type: "car" as const,
    brand: "Toyota",
    model: "Corolla",
    plateNumber: `DTO-${plateCounter}`,
    chassisNumber: null,
    color: "White",
    year: 2020,
    dailyPrice,
    depositAmount: 25,
    status: "available" as const,
    mileage: 1000,
    insuranceExpiryDate: null,
    registrationExpiryDate: null,
    technicalInspectionExpiryDate: null,
    lastOilChangeDate: null,
    lastOilChangeMileage: null,
    notes: null,
    commissionRateOverride: 0.5,
  };
}

describe("payment records crossing IPC", () => {
  function seedRentalWithPayment() {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    const payment = createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 1.005,
      paymentDate: iso(),
      notes: null,
    });

    return { rental, payment };
  }

  it("carries the amount in major units and nothing else", () => {
    const { rental, payment } = seedRentalWithPayment();

    // 1.005 rounds away from zero, so the renderer sees 1.01 — once.
    expect(payment.amount).toBe(1.01);
    expect(Object.keys(payment).sort()).toEqual([
      "amount",
      "correctedByPaymentId",
      "createdAt",
      "id",
      "method",
      "notes",
      "paymentDate",
      "receiptNo",
      "rentalId",
      "status",
      "type",
      "updatedAt",
      "voidReason",
      "voidedAt",
    ]);

    expectNoInternalMoneyKeys("createPayment", payment);
    expectNoInternalMoneyKeys(
      "listPaymentsForRental",
      listPaymentsForRental(rental.id),
    );
    expectNoInternalMoneyKeys("listPayments", listPayments({}));
  });

  it("keeps void and correction results clean", () => {
    const { rental, payment } = seedRentalWithPayment();
    const voided = voidPayment({ paymentId: payment.id, reason: "Wrong amount" });

    expect(voided.status).toBe("voided");
    expect(voided.amount).toBe(1.01);
    expectNoInternalMoneyKeys("voidPayment", voided);

    const replacement = createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 2.675,
      paymentDate: iso(),
      notes: null,
    });
    const corrected = correctPayment({
      paymentId: replacement.id,
      reason: "Recorded against the wrong method",
      replacement: {
        rentalId: rental.id,
        type: "rent",
        method: "bank_transfer",
        amount: 2.675,
        paymentDate: iso(),
        notes: null,
      },
    });

    expect(corrected.amount).toBe(2.68);
    expect(corrected.method).toBe("bank_transfer");
    expectNoInternalMoneyKeys("correctPayment", corrected);
  });
});

describe("vehicle records crossing IPC", () => {
  it("carries prices in major units and nothing else", () => {
    const created = createVehicle(newVehicleInput(1.005));

    expect(created.dailyPrice).toBe(1.01);
    expect(created.depositAmount).toBe(25);
    expect(created.commissionRateOverride).toBe(0.5);
    expect(Object.keys(created)).not.toContain("dailyPriceLegacy");
    expectNoInternalMoneyKeys("createVehicle", created);

    const updated = updateVehicle(created.id, {
      ...newVehicleInput(2.675),
      plateNumber: created.plateNumber,
    });

    expect(updated.dailyPrice).toBe(2.68);
    expectNoInternalMoneyKeys("updateVehicle", updated);
    expectNoInternalMoneyKeys("listVehicles", listVehicles({}));
  });

  it("keeps a null commission override null rather than exposing its column", () => {
    const created = createVehicle({
      ...newVehicleInput(50),
      commissionRateOverride: null,
    });

    expect(created.commissionRateOverride).toBeNull();
    expectNoInternalMoneyKeys("createVehicle with no override", created);
  });
});

describe("vehicle sale records crossing IPC", () => {
  it("carries the sale price in major units and nothing else", () => {
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const sale = createVehicleSale({
      vehicleId,
      buyerName: "Buyer",
      buyerPhone: null,
      buyerIdNumber: null,
      saleDate: iso(),
      salePrice: 12.345,
      paymentMethod: "cash",
      notes: null,
    });

    expect(sale.salePrice).toBe(12.35);
    expectNoInternalMoneyKeys("createVehicleSale", sale);
    expectNoInternalMoneyKeys("listVehicleSales", listVehicleSales({}));
    expectNoInternalMoneyKeys(
      "getVehicleSaleForVehicle",
      getVehicleSaleForVehicle(vehicleId),
    );

    const voided = voidVehicleSale({ saleId: sale.id, reason: "Buyer withdrew" });
    expect(voided.salePrice).toBe(12.35);
    expectNoInternalMoneyKeys("voidVehicleSale", voided);
  });
});

describe("accounting records crossing IPC", () => {
  it("keeps expenses, movements and adjustments in major units only", () => {
    fundCashDrawer();
    const expense = createExpense({
      category: "fuel",
      location: "cash_drawer",
      amount: 12.345,
      expenseDate: iso(),
      vendorName: null,
      vehicleId: null,
      notes: null,
    });

    expect(expense.amount).toBe(12.35);
    expectNoInternalMoneyKeys("createExpense", expense);
    expectNoInternalMoneyKeys("listExpenses", listExpenses({}));

    const movement = createCashMovement({
      type: "transfer",
      fromLocation: "cash_drawer",
      toLocation: "shop_safe",
      amount: 2.675,
      movementDate: iso(),
      notes: null,
    });

    expect(movement.amount).toBe(2.68);
    expectNoInternalMoneyKeys("createCashMovement", movement);

    const adjustment = createAccountingAdjustment({
      location: "shop_safe",
      direction: "increase",
      amount: 1.005,
      adjustmentDate: iso(),
      reason: "Counted extra",
      notes: null,
    });

    expect(adjustment.amount).toBe(1.01);
    expectNoInternalMoneyKeys("createAccountingAdjustment", adjustment);

    expectNoInternalMoneyKeys(
      "voidExpense",
      voidExpense({ id: expense.id, reason: "Recorded twice" }),
    );
    expectNoInternalMoneyKeys(
      "voidCashMovement",
      voidCashMovement({ id: movement.id, reason: "Recorded twice" }),
    );
    expectNoInternalMoneyKeys(
      "voidAccountingAdjustment",
      voidAccountingAdjustment({ id: adjustment.id, reason: "Recorded twice" }),
    );
    expectNoInternalMoneyKeys(
      "listAccountingTransactions",
      listAccountingTransactions({}),
    );
  });

  it("keeps the daily closing in major units only", () => {
    const closingDate = new Date().toISOString().slice(0, 10);
    const saved = saveAccountingDailyClosing({
      closingDate,
      countedCash: 87.65,
      notes: null,
      reason: "End of day",
    });

    expectNoInternalMoneyKeys("saveAccountingDailyClosing", saved);
    expectNoInternalMoneyKeys(
      "getAccountingDailyClosing",
      getAccountingDailyClosing(closingDate),
    );
  });
});

describe("employee loan records crossing IPC", () => {
  it("keeps loan and repayment results in major units only", () => {
    fundCashDrawer();
    const employee = createUser({
      fullName: "Loan Employee",
      username: "loanstaff",
      password: "1234",
      confirmPassword: "1234",
      roleKey: "staff",
      earnsCommission: true,
    });
    const loan = createEmployeeLoan({
      employeeUserId: employee.id,
      amount: 12.345,
      issuedAt: iso(),
      sourceLocation: "cash_drawer",
      notes: null,
    });

    expect(loan.amount).toBe(12.35);
    expect(loan.remainingAmount).toBe(12.35);
    expectNoInternalMoneyKeys("createEmployeeLoan", loan);
    expectNoInternalMoneyKeys("listEmployeeLoans", listEmployeeLoans({}));

    const repayment = recordEmployeeLoanRepayment({
      loanId: loan.id,
      amount: 2.675,
      paymentDate: iso(),
      method: "cash",
      location: "cash_drawer",
      notes: null,
    });

    expectNoInternalMoneyKeys("recordEmployeeLoanRepayment", repayment);
    expectNoInternalMoneyKeys(
      "listEmployeeLoanPayments",
      listEmployeeLoanPayments(loan.id),
    );
    expect(listEmployeeLoanPayments(loan.id)[0]?.amount).toBe(2.68);

    // A loan with a repayment against it cannot be voided, so the void path
    // needs an untouched one.
    const mistake = createEmployeeLoan({
      employeeUserId: employee.id,
      amount: 1.005,
      issuedAt: iso(),
      sourceLocation: "cash_drawer",
      notes: null,
    });

    expectNoInternalMoneyKeys(
      "voidEmployeeLoan",
      voidEmployeeLoan({ loanId: mistake.id, reason: "Issued in error" }),
    );
  });
});

describe("maintenance records crossing IPC", () => {
  it("keeps the cost in major units only", () => {
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const record = createMaintenance({
      vehicleId,
      title: "Oil change",
      description: null,
      cost: 1.005,
      startDate: daysFromNow(-1).slice(0, 10),
      endDate: null,
    });

    expect(record.cost).toBe(1.01);
    expectNoInternalMoneyKeys("createMaintenance", record);

    const updated = updateMaintenance(record.id, {
      vehicleId,
      title: "Oil change",
      description: null,
      cost: 2.675,
      startDate: daysFromNow(-1).slice(0, 10),
      endDate: null,
    });

    expect(updated.cost).toBe(2.68);
    expectNoInternalMoneyKeys("updateMaintenance", updated);
    expectNoInternalMoneyKeys("listMaintenance", listMaintenance({}));
  });
});

describe("audit snapshots shown on the activity screen", () => {
  it("stores amounts under their public names in major units", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 100,
        startDatetime: daysFromNow(-1),
        expectedReturnDatetime: daysFromNow(2),
      }),
    );
    const payment = createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 1.005,
      paymentDate: iso(),
      notes: null,
    });
    voidPayment({ paymentId: payment.id, reason: "Wrong amount" });

    const events = listAuditEvents({ pageSize: 100 }).rows;
    const created = events.find((event) => event.action === "payment.created");
    const voided = events.find((event) => event.action === "payment.voided");

    const createdAfter = JSON.parse(created?.afterJson ?? "null") as Record<
      string,
      unknown
    >;
    expect(createdAfter.amount).toBe(1.01);
    expect(createdAfter).not.toHaveProperty("amountMinor");
    expect(createdAfter).not.toHaveProperty("amountLegacy");

    const voidedBefore = JSON.parse(voided?.beforeJson ?? "null") as Record<
      string,
      unknown
    >;
    expect(voidedBefore.amount).toBe(1.01);

    // Nothing in any snapshot or metadata, on any event, names a storage column.
    for (const event of events) {
      expectNoInternalMoneyKeys(
        `audit ${event.action} beforeJson`,
        JSON.parse(event.beforeJson ?? "null"),
      );
      expectNoInternalMoneyKeys(
        `audit ${event.action} afterJson`,
        JSON.parse(event.afterJson ?? "null"),
      );
      expectNoInternalMoneyKeys(
        `audit ${event.action} metadataJson`,
        JSON.parse(event.metadataJson ?? "null"),
      );
    }
  });

  it("leaves the rest of a snapshot, and its redactions, untouched", () => {
    const vehicleId = createTestVehicle({ dailyPrice: 1.005 });
    const events = listAuditEvents({ pageSize: 100 }).rows;
    const created = events.find(
      (event) => event.action === "vehicle.created" && event.entityId === vehicleId,
    );
    const after = JSON.parse(created?.afterJson ?? "null") as Record<
      string,
      unknown
    >;

    expect(after.dailyPrice).toBe(1.01);
    expect(after.plateNumber).toEqual(expect.any(String));
    expect(after.status).toBe("available");
    expect(after).not.toHaveProperty("dailyPriceMinor");
    expect(after).not.toHaveProperty("dailyPriceLegacy");
  });
});
