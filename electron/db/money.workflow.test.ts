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
const { activateRental, returnRental } = await import("./rentals.service");
const { createPayment, listPaymentsForRental, voidPayment } = await import(
  "./payments.service"
);
const { createAccessory } = await import("./accessories.service");
const { createEmployeeLoan, recordEmployeeLoanRepayment, listEmployeeLoans } =
  await import("./employee-loans.service");
const {
  createExpense,
  getAccountingSummary,
  getAccountingDailyClosing,
  saveAccountingDailyClosing,
  getWeeklyIncome,
} = await import("./accounting.service");
const { getOutstandingBalances, getDeposits, getCommissionReport } = await import(
  "./reports.service"
);
const { createUser } = await import("./auth.service");
const { saveShopSettings: saveSettings } = await import("./settings.service");

/** The service reads an audit reason off the same object; the type does not
 * declare it, so this wrapper keeps the cast in one place. */
const saveShopSettings = (
  settings: Parameters<typeof saveSettings>[0] & { reason: string },
): void => {
  saveSettings(settings as Parameters<typeof saveSettings>[0]);
};

type TestDatabase = ReturnType<typeof startTestDatabase>;

let database: TestDatabase;

/**
 * The accounting service groups a day's takings by local date, which is what a
 * shop means by "today". Deriving the date from `toISOString()` instead would
 * name yesterday between local midnight and the UTC offset, and the closing
 * would look at a day with no payments in it.
 */
function todayLocalDate(): string {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function money(table: string, column: string, id: number): number {
  const row = getSqliteDatabase()
    .prepare(`select ${column} as value from ${table} where id = ?`)
    .get(id) as { value: number } | undefined;

  return row?.value ?? Number.NaN;
}

beforeEach(() => {
  database = startTestDatabase();
});

afterEach(() => {
  stopTestDatabase(database);
});

describe("rental totals in minor units", () => {
  it("stores the total as an exact integer and reports it in major units", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 1.005 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 1.005,
        ...rentalWindow(-1, 2),
      }),
    );

    // Three days at 1.005 is 3.0149999999999997 added as floats; as integers
    // it is 101 x 3 = 303 exactly.
    expect(money("rentals", "total_amount_minor", rental.id)).toBe(303);
    expect(rental.totalAmount).toBe(3.03);
    expect(rental.dailyPrice).toBe(1.01);
  });

  it("keeps the REAL mirror in step with the integer it was derived from", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 1.005 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 1.005 }),
    );

    expect(money("rentals", "total_amount", rental.id)).toBe(3.03);
    expect(money("rentals", "daily_price", rental.id)).toBe(1.01);
  });

  it("settles a rental paid off in awkward instalments to exactly zero", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 0.1 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 0.1,
        ...rentalWindow(-1, 2),
      }),
    );

    expect(rental.totalAmount).toBe(0.3);

    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 0.1,
      paymentDate: new Date().toISOString(),
      notes: null,
    });
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 0.2,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    expect(money("rentals", "paid_amount_minor", rental.id)).toBe(30);
    expect(money("rentals", "remaining_amount_minor", rental.id)).toBe(0);
    expect(getOutstandingBalances()).toHaveLength(0);
  });

  it("multiplies an accessory line by its whole quantity", () => {
    const accessory = createAccessory({
      name: "Child seat",
      quantityOwned: 10,
      defaultCharge: 2.675,
      isActive: true,
      notes: null,
    });
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 10 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 10,
        ...rentalWindow(-1, 0),
        accessories: [
          {
            accessoryId: accessory.id,
            quantity: 3,
            unitCharge: 2.675,
            notes: null,
          },
        ],
      }),
    );

    // 268 x 3 = 804, not 3 x 2.675 = 8.025 rounded some other way.
    expect(money("rentals", "accessory_charges_minor", rental.id)).toBe(804);
    expect(rental.accessoryCharges).toBe(8.04);
    expect(rental.totalAmount).toBe(18.04);
  });
});

describe("payments, refunds and deposits", () => {
  it("counts a refund as money out without storing a negative amount", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );

    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 50,
      paymentDate: new Date().toISOString(),
      notes: null,
    });
    const refund = createPayment({
      rentalId: rental.id,
      type: "refund",
      method: "cash",
      amount: 20,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    expect(refund.amount).toBe(20);
    expect(money("payments", "amount_minor", refund.id)).toBe(2000);
    expect(money("rentals", "paid_amount_minor", rental.id)).toBe(3000);
  });

  it("removes a voided payment from the balance", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    const payment = createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 75.5,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    expect(money("rentals", "paid_amount_minor", rental.id)).toBe(7550);

    voidPayment({ paymentId: payment.id, reason: "Entered twice" });

    expect(money("rentals", "paid_amount_minor", rental.id)).toBe(0);
  });

  it("tracks a deposit and its partial refund as held", () => {
    saveShopSettings({ enableClientDeposit: true, reason: "Deposit test" });
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 100,
        depositRequired: 50,
        depositPaid: 50,
      }),
    );

    expect(money("rentals", "deposit_paid_minor", rental.id)).toBe(5000);

    createPayment({
      rentalId: rental.id,
      type: "refund",
      method: "cash",
      amount: 12.34,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const deposit = getDeposits().find((row) => row.rentalId === rental.id);
    expect(deposit?.depositPaid).toBe(50);
    expect(deposit?.depositRefunded).toBe(12.34);
    expect(deposit?.depositHeld).toBe(37.66);
  });

  it("hands the renderer major-unit numbers on every payment DTO", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 1.005,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const listed = listPaymentsForRental(rental.id);
    expect(listed.map((payment) => payment.amount)).toEqual([1.01]);
    // One amount, in major units, and no storage column beside it. The full
    // sweep across every service lives in money-dto.test.ts.
    expect(
      Object.keys(listed[0]!).filter(
        (key) => key.endsWith("Minor") || key.endsWith("Legacy"),
      ),
    ).toEqual([]);
  });
});

describe("returning a rental", () => {
  it("computes the late fee, extra charges and balance as integers", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 10 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 10,
        ...rentalWindow(-5, -2),
      }),
    );

    returnRental(
      buildReturnInput(rental.id, {
        lateFeePerDay: 1.005,
        damageCharge: 0.005,
        discount: 0.01,
        mileageIn: 1500,
      }),
    );

    // Two days late at 101 minor units, plus a 1-cent damage charge, less a
    // 1-cent discount.
    expect(money("rentals", "extra_charges_minor", rental.id)).toBe(203);
    expect(money("rentals", "discount_minor", rental.id)).toBe(1);
    // Three booked days at 10, plus 2.03 of extras, less a 1-cent discount.
    expect(money("rentals", "total_amount_minor", rental.id)).toBe(3000 + 203 - 1);
  });

  it("refuses a discount larger than the charges", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 10 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 10 }),
    );

    expect(() =>
      returnRental(buildReturnInput(rental.id, { discount: 10_000 })),
    ).toThrow("Discount cannot be more than the total charges.");
  });
});

describe("commission", () => {
  it("multiplies the stored rate by whole rented days", () => {
    saveShopSettings({
      enableSalesCommission: true,
      defaultDailyCommissionRate: 0.07,
      reason: "Commission test",
    });
    const salesUser = createUser({
      fullName: "Sales Person",
      username: "sales",
      password: "1234",
      confirmPassword: "1234",
      roleKey: "staff",
      earnsCommission: true,
    });
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 10 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, {
        dailyPrice: 10,
        salesUserId: salesUser.id,
        ...rentalWindow(-1, 29),
      }),
    );

    // 7 minor units a day for 30 days is 210, where 0.07 x 30 as floats is
    // 2.0999999999999996.
    expect(money("rentals", "commission_rate_per_day_minor", rental.id)).toBe(7);
    expect(money("rentals", "commission_amount_minor", rental.id)).toBe(210);

    const report = getCommissionReport();
    expect(report.totalCommission).toBe(2.1);
    expect(report.records[0]?.commissionRatePerDay).toBe(0.07);
  });
});

describe("employee loans", () => {
  it("reduces the remaining balance to exactly zero across repayments", () => {
    const employee = createUser({
      fullName: "Loan Taker",
      username: "loantaker",
      password: "1234",
      confirmPassword: "1234",
      roleKey: "staff",
      earnsCommission: false,
    });
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    // Put cash in the drawer so the loan does not overdraw it.
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 500,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const loan = createEmployeeLoan({
      employeeUserId: employee.id,
      amount: 0.3,
      issuedAt: new Date().toISOString(),
      sourceLocation: "cash_drawer",
      notes: null,
    });

    expect(money("employee_loans", "remaining_amount_minor", loan.id)).toBe(30);

    recordEmployeeLoanRepayment({
      loanId: loan.id,
      amount: 0.1,
      paymentDate: new Date().toISOString(),
      method: "cash",
      location: "cash_drawer",
      notes: null,
    });
    recordEmployeeLoanRepayment({
      loanId: loan.id,
      amount: 0.2,
      paymentDate: new Date().toISOString(),
      method: "cash",
      location: "cash_drawer",
      notes: null,
    });

    expect(money("employee_loans", "remaining_amount_minor", loan.id)).toBe(0);
    const listed = listEmployeeLoans().rows.find((row) => row.id === loan.id);
    expect(listed?.remainingAmount).toBe(0);
    expect(listed?.status).toBe("paid");
  });
});

describe("accounting totals", () => {
  it("adds many fractional rows without drift", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 1000 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 1000 }),
    );

    for (let index = 0; index < 100; index += 1) {
      createPayment({
        rentalId: rental.id,
        type: "rent",
        method: "cash",
        amount: 0.07,
        paymentDate: new Date().toISOString(),
        notes: null,
      });
    }

    // 100 x 0.07 accumulates to 7.000000000000005 as floats.
    expect(money("rentals", "paid_amount_minor", rental.id)).toBe(700);
    expect(getAccountingSummary().moneyIn).toBe(7);
  });

  it("nets an expense out of the drawer balance", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 100,
      paymentDate: new Date().toISOString(),
      notes: null,
    });
    createExpense({
      category: "fuel",
      location: "cash_drawer",
      method: "cash",
      amount: 12.345,
      expenseDate: new Date().toISOString(),
      vendorName: null,
      vehicleId: null,
      notes: null,
    });

    // 12.345 rounds away from zero to 12.35, where the old Math.round rule
    // answered 12.34 because 12.345 * 100 is 1234.4999999999998.
    const summary = getAccountingSummary();
    expect(summary.expenses).toBe(12.35);
    expect(summary.cashDrawer).toBe(87.65);
  });

  it("records a negative daily closing difference", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 100,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const closingDate = todayLocalDate();
    saveAccountingDailyClosing({
      closingDate,
      countedCash: 87.55,
      notes: null,
    });

    const closing = getAccountingDailyClosing(closingDate);
    expect(closing.expectedCash).toBe(100);
    expect(closing.countedCash).toBe(87.55);
    expect(closing.difference).toBe(-12.45);

    const row = getSqliteDatabase()
      .prepare(
        "select difference, difference_minor from daily_closings where closing_date = ?",
      )
      .get(closingDate) as { difference: number; difference_minor: number };
    expect(row).toEqual({ difference: -12.45, difference_minor: -1245 });
  });

  it("shows refunds as a negative line in the weekly income", () => {
    const customerId = createTestCustomer();
    const vehicleId = createTestVehicle({ dailyPrice: 100 });
    const rental = activateRental(
      buildActivationInput(customerId, vehicleId, { dailyPrice: 100 }),
    );
    createPayment({
      rentalId: rental.id,
      type: "rent",
      method: "cash",
      amount: 10.1,
      paymentDate: new Date().toISOString(),
      notes: null,
    });
    createPayment({
      rentalId: rental.id,
      type: "refund",
      method: "cash",
      amount: 0.2,
      paymentDate: new Date().toISOString(),
      notes: null,
    });

    const today = getWeeklyIncome().at(-1);
    expect(today?.rent).toBe(10.1);
    expect(today?.refunds).toBe(-0.2);
    expect(today?.netIncome).toBe(9.9);
  });
});
