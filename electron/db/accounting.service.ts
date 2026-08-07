import { and, count, desc, eq, gte, like, lt, or, sql, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  accountingDailyClosingSaveInputSchema,
  accountingAdjustmentInputSchema,
  accountingTransactionKindValues,
  accountingVoidInputSchema,
  applyBalanceDeltasMinor,
  calculateAccountingTotalsMinor,
  calculateDailyClosingDifferenceMinor,
  calculateLocationBalancesMinor,
  cashMovementInputSchema,
  expenseInputSchema,
  formatMoneyLocation,
  fromTotalsMinor,
  getExpensePaymentMethodForLocation,
  getNegativeBalanceLocationsMinor,
  getPaymentMoneyLocation,
  staffDailyClosingInputSchema,
  type AccountingAdjustmentRecord,
  type AccountingBalanceInputMinor,
  type AccountingBalanceDeltaMinor,
  type AccountingDailyClosingRecord,
  type AccountingDailyClosingSaveInput,
  type AccountingListRequest,
  type AccountingSummary,
  type AccountingSummaryRequest,
  type AccountingTransactionKind,
  type AccountingTransactionRecord,
  type CashMovementRecord,
  type ExpenseListRecord,
  type ExpenseRecord,
  type LocationBalancesMinor,
  type MoneyLocation,
  type StaffDailyClosingRecord,
  type WeeklyIncomeDayRecord,
} from "../../src/shared/accounting";
import {
  addMoney,
  fromMinorUnits,
  negateMoney,
  toMinorUnits,
  type MoneyMinor,
} from "../../src/shared/money";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase, getSqliteDatabase } from "./database";
import { columnToMinor, moneyColumns, sumToMinor } from "./money-write";
import {
  cashMovements,
  accountingAdjustments,
  dailyClosings,
  employeeLoanPayments,
  employeeLoans,
  expenses,
  payments,
  rentals,
  vehicleSales,
  vehicles,
} from "./schema";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import {
  currentUserCan,
  getCurrentUserForService,
  requirePermissionForCurrentSession,
} from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { requireSensitiveApproval } from "./security.service";

export function getAccountingSummary(
  request: AccountingSummaryRequest = {},
): AccountingSummary {
  requirePermissionForCurrentSession("accounting.view");

  return buildAccountingSummary(request);
}

export function listAccountingTransactions(
  request?: AccountingListRequest,
): PageResult<AccountingTransactionRecord> {
  requirePermissionForCurrentSession("accounting.view");
  const pageRequest = normalizePageRequest(request);
  const kind = isAccountingTransactionKind(request?.kind) ? request.kind : "all";
  const database = getSqliteDatabase();
  const candidateLimit = pageRequest.offset + pageRequest.pageSize;
  const sourceQueries = buildAccountingTransactionSourceQueries(
    request,
    kind,
    pageRequest.search,
  );
  let total = 0;
  const candidates: AccountingTransactionRow[] = [];

  for (const query of sourceQueries) {
    const sourceTotal = database
      .prepare(`select count(*) as count from (${query.sql}) transactions`)
      .get(...query.params) as { count?: number } | undefined;
    const sourceRows = database
      .prepare(`
        select *
        from (${query.sql}) transactions
        order by occurredAt desc, sourceId desc
        limit ?
      `)
      .all(...query.params, candidateLimit) as AccountingTransactionRow[];

    total += Number(sourceTotal?.count ?? 0);
    candidates.push(...sourceRows);
  }

  candidates.sort((a, b) => {
    const dateCompare = b.occurredAt.localeCompare(a.occurredAt);
    if (dateCompare !== 0) return dateCompare;

    return b.sourceId - a.sourceId;
  });

  return createPageResult(
    candidates
      .slice(pageRequest.offset, pageRequest.offset + pageRequest.pageSize)
      .map(toAccountingTransactionRecord),
    total,
    pageRequest,
  );
}

/**
 * The union queries select `amountMinor`, so this is the one place the listing
 * turns stored integers back into the major-unit amounts the screen shows.
 */
function toAccountingTransactionRecord(
  row: AccountingTransactionRow,
): AccountingTransactionRecord {
  const { amountMinor, ...rest } = row;

  return {
    ...rest,
    amount: fromMinorUnits(
      columnToMinor(amountMinor, `${row.source} ${row.sourceId} amount`),
    ),
  };
}

type AccountingTransactionRow = Omit<AccountingTransactionRecord, "amount"> & {
  amountMinor: number;
};

export function listExpenses(request?: AccountingListRequest): PageResult<ExpenseListRecord> {
  requirePermissionForCurrentSession("accounting.view");
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const conditions = getDateConditions(expenses.expenseDate, request);

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);
    const searchFilter = or(
      like(expenses.category, term),
      like(expenses.vendorName, term),
      like(expenses.notes, term),
      like(vehicles.plateNumber, term),
      like(vehicles.brand, term),
      like(vehicles.model, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total = db
    .select({ count: count() })
    .from(expenses)
    .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select({
      id: expenses.id,
      category: expenses.category,
      location: expenses.location,
      method: expenses.method,
      amountMinor: expenses.amountMinor,
      expenseDate: expenses.expenseDate,
      vendorName: expenses.vendorName,
      vehicleId: expenses.vehicleId,
      notes: expenses.notes,
      status: expenses.status,
      voidedAt: expenses.voidedAt,
      voidReason: expenses.voidReason,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      vehiclePlateNumber: vehicles.plateNumber,
    })
    .from(expenses)
    .leftJoin(vehicles, eq(expenses.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(
    rows.map(({ amountMinor, ...row }) => ({
      ...row,
      amount: fromMinorUnits(columnToMinor(amountMinor, "expenses.amount_minor")),
    })),
    total,
    pageRequest,
  );
}

export function createExpense(input: unknown): ExpenseRecord {
  requirePermissionForCurrentSession("expenses.create");
  const parsedValues = expenseInputSchema.parse(input);
  const location = currentUserCan("accounting.view")
    ? parsedValues.location
    : "cash_drawer";
  const values = {
    ...parsedValues,
    location,
    method: getExpensePaymentMethodForLocation(location),
  };
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();
  const amountMinor = toMinorUnits(values.amount, "Expense amount");
  assertAccountingBalanceDeltasAllowed([
    { location: values.location, amountMinor: negateMoney(amountMinor) },
  ]);

  try {
    return getDatabase().transaction((tx) => {
      const record = tx
        .insert(expenses)
        .values({
          ...values,
          ...moneyColumns("amount", amountMinor),
          status: "posted",
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "expense.created",
        entityType: "expense",
        entityId: record.id,
        entityLabel: record.category,
        summaryAr: "تم تسجيل مصروف",
        summaryEn: "Expense was recorded.",
        after: record,
      });

      return toExpenseRecord(record);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Expense could not be saved.");
  }
}

// Each of these lists its fields rather than spreading the row, so the amount
// the renderer sees is the only amount it receives.
function toExpenseRecord(row: typeof expenses.$inferSelect): ExpenseRecord {
  return {
    id: row.id,
    category: row.category,
    location: row.location,
    method: row.method,
    amount: fromMinorUnits(columnToMinor(row.amountMinor, "expenses.amount_minor")),
    expenseDate: row.expenseDate,
    vendorName: row.vendorName,
    vehicleId: row.vehicleId,
    notes: row.notes,
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCashMovementRecord(
  row: typeof cashMovements.$inferSelect,
): CashMovementRecord {
  return {
    id: row.id,
    type: row.type,
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    amount: fromMinorUnits(
      columnToMinor(row.amountMinor, "cash_movements.amount_minor"),
    ),
    movementDate: row.movementDate,
    notes: row.notes,
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAccountingAdjustmentRecord(
  row: typeof accountingAdjustments.$inferSelect,
): AccountingAdjustmentRecord {
  return {
    id: row.id,
    location: row.location,
    direction: row.direction,
    amount: fromMinorUnits(
      columnToMinor(row.amountMinor, "accounting_adjustments.amount_minor"),
    ),
    adjustmentDate: row.adjustmentDate,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function voidExpense(input: unknown): ExpenseRecord {
  requirePermissionForCurrentSession("expenses.void");
  const values = accountingVoidInputSchema.parse(input);
  requireSensitiveApproval("expenses.void", values.approvalToken);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, values.id))
        .get();

      if (!existing) {
        throw new Error("Expense was not found.");
      }

      if (existing.status === "voided") {
        throw new Error("Expense is already voided.");
      }

      // Voiding an expense puts the money back where it was spent from.
      assertAccountingBalanceDeltasAllowed([
        {
          location: existing.location,
          amountMinor: columnToMinor(existing.amountMinor, "expenses.amount_minor"),
        },
      ]);

      const updated = tx
        .update(expenses)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(expenses.id, values.id))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "expense.voided",
        entityType: "expense",
        entityId: updated.id,
        entityLabel: updated.category,
        summaryAr: "تم إلغاء مصروف",
        summaryEn: "Expense was voided.",
        before: existing,
        after: updated,
        reason: values.reason,
      });

      return toExpenseRecord(updated);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Expense could not be voided.");
  }
}

export function createCashMovement(input: unknown): CashMovementRecord {
  requirePermissionForCurrentSession("cashMovements.create");
  const values = cashMovementInputSchema.parse(input);
  if (values.type === "owner_withdrawal") {
    requireSensitiveApproval("cashMovements.ownerWithdrawal", getApprovalToken(input));
  }
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();
  const amountMinor = toMinorUnits(values.amount, "Cash movement amount");
  assertAccountingBalanceDeltasAllowed(
    getCashMovementDeltas({ ...values, amountMinor }),
  );

  try {
    return getDatabase().transaction((tx) => {
      const record = tx
        .insert(cashMovements)
        .values({
          ...values,
          ...moneyColumns("amount", amountMinor),
          status: "posted",
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action:
          values.type === "owner_withdrawal"
            ? "cashMovement.ownerWithdrawal"
            : "cashMovement.created",
        entityType: "cash_movement",
        entityId: record.id,
        entityLabel: record.type,
        summaryAr:
          values.type === "owner_withdrawal"
            ? "تم تسجيل سحب للمالك"
            : "تم نقل مبلغ نقدي",
        summaryEn:
          values.type === "owner_withdrawal"
            ? "Owner withdrawal was recorded."
            : "Cash movement was recorded.",
        after: record,
      });

      return toCashMovementRecord(record);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Cash movement could not be saved.");
  }
}

export function voidCashMovement(input: unknown): CashMovementRecord {
  requirePermissionForCurrentSession("cashMovements.void");
  const values = accountingVoidInputSchema.parse(input);
  requireSensitiveApproval("cashMovements.void", values.approvalToken);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(cashMovements)
        .where(eq(cashMovements.id, values.id))
        .get();

      if (!existing) {
        throw new Error("Cash movement was not found.");
      }

      if (existing.status === "voided") {
        throw new Error("Cash movement is already voided.");
      }

      assertAccountingBalanceDeltasAllowed(
        getReversalDeltas(
          getCashMovementDeltas({
            ...existing,
            amountMinor: columnToMinor(
              existing.amountMinor,
              "cash_movements.amount_minor",
            ),
          }),
        ),
      );

      const updated = tx
        .update(cashMovements)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(cashMovements.id, values.id))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "cashMovement.voided",
        entityType: "cash_movement",
        entityId: updated.id,
        entityLabel: updated.type,
        summaryAr: "تم إلغاء حركة نقدية",
        summaryEn: "Cash movement was voided.",
        before: existing,
        after: updated,
        reason: values.reason,
      });

      return toCashMovementRecord(updated);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Cash movement could not be voided.");
  }
}

export function createAccountingAdjustment(
  input: unknown,
): AccountingAdjustmentRecord {
  requirePermissionForCurrentSession("accountingAdjustments.create");
  const values = accountingAdjustmentInputSchema.parse(input);
  requireSensitiveApproval("accountingAdjustments.create", getApprovalToken(input));
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();
  const amountMinor = toMinorUnits(values.amount, "Adjustment amount");
  assertAccountingBalanceDeltasAllowed([
    getAdjustmentDelta({ ...values, amountMinor }),
  ]);

  try {
    return getDatabase().transaction((tx) => {
      const record = tx
        .insert(accountingAdjustments)
        .values({
          ...values,
          ...moneyColumns("amount", amountMinor),
          status: "posted",
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "accountingAdjustment.created",
        entityType: "accounting_adjustment",
        entityId: record.id,
        entityLabel: record.reason,
        summaryAr: "تم تسجيل تعديل رصيد",
        summaryEn: "Balance adjustment was recorded.",
        after: record,
        reason: record.reason,
      });

      return toAccountingAdjustmentRecord(record);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Balance adjustment could not be saved.");
  }
}

export function voidAccountingAdjustment(
  input: unknown,
): AccountingAdjustmentRecord {
  requirePermissionForCurrentSession("accountingAdjustments.void");
  const values = accountingVoidInputSchema.parse(input);
  requireSensitiveApproval("accountingAdjustments.void", values.approvalToken);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(accountingAdjustments)
        .where(eq(accountingAdjustments.id, values.id))
        .get();

      if (!existing) {
        throw new Error("Balance adjustment was not found.");
      }

      if (existing.status === "voided") {
        throw new Error("Balance adjustment is already voided.");
      }

      assertAccountingBalanceDeltasAllowed([
        reverseDelta(
          getAdjustmentDelta({
            ...existing,
            amountMinor: columnToMinor(
              existing.amountMinor,
              "accounting_adjustments.amount_minor",
            ),
          }),
        ),
      ]);

      const updated = tx
        .update(accountingAdjustments)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(accountingAdjustments.id, values.id))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "accountingAdjustment.voided",
        entityType: "accounting_adjustment",
        entityId: updated.id,
        entityLabel: updated.reason,
        summaryAr: "تم إلغاء تعديل رصيد",
        summaryEn: "Balance adjustment was voided.",
        before: existing,
        after: updated,
        reason: values.reason,
      });

      return toAccountingAdjustmentRecord(updated);
    });
  } catch (error) {
    throw normalizeAccountingServiceError(error, "Balance adjustment could not be voided.");
  }
}

export function getAccountingDailyClosing(date: string): AccountingDailyClosingRecord {
  requirePermissionForCurrentSession("accounting.view");
  const closingDate = parseDateInput(date);
  const expectedCashMinor = getExpectedCashMinorForDate(closingDate);
  const row = getDatabase()
    .select()
    .from(dailyClosings)
    .where(eq(dailyClosings.closingDate, closingDate))
    .get();

  if (!row) {
    return {
      closingDate,
      countedCash: null,
      difference: null,
      expectedCash: fromMinorUnits(expectedCashMinor),
      isClosed: false,
      notes: null,
      closedAt: null,
      updatedAt: null,
    };
  }

  // A closed day reports the figures that were counted and stored on the day,
  // not today's recalculation of them.
  return {
    closingDate,
    countedCash: fromMinorUnits(
      columnToMinor(row.countedCashMinor, "daily_closings.counted_cash_minor"),
    ),
    difference: fromMinorUnits(
      columnToMinor(row.differenceMinor, "daily_closings.difference_minor"),
    ),
    expectedCash: fromMinorUnits(
      columnToMinor(row.expectedCashMinor, "daily_closings.expected_cash_minor"),
    ),
    isClosed: true,
    notes: row.notes,
    closedAt: row.closedAt,
    updatedAt: row.updatedAt,
  };
}

export function saveAccountingDailyClosing(
  input: unknown,
): AccountingDailyClosingRecord {
  requirePermissionForCurrentSession("dailyClosing.save");
  const values: AccountingDailyClosingSaveInput =
    accountingDailyClosingSaveInputSchema.parse(input);
  const now = new Date().toISOString();
  const existing = getDatabase()
    .select()
    .from(dailyClosings)
    .where(eq(dailyClosings.closingDate, values.closingDate))
    .get();

  if (existing && !values.reason?.trim()) {
    throw new Error("Reason is required when closing this day again.");
  }

  const closingColumns = buildDailyClosingColumns(
    values.closingDate,
    values.countedCash,
  );

  getDatabase().transaction((tx) => {
    tx.insert(dailyClosings)
      .values({
        closingDate: values.closingDate,
        ...closingColumns,
        notes: values.notes,
        closedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: dailyClosings.closingDate,
        set: {
          ...closingColumns,
          notes: values.notes,
          closedAt: now,
          updatedAt: now,
        },
      })
      .run();

    logAuditEvent(tx, {
      action: existing ? "dailyClosing.updated" : "dailyClosing.created",
      entityType: "daily_closing",
      entityLabel: values.closingDate,
      summaryAr: existing ? "تم تعديل إغلاق يومي" : "تم حفظ إغلاق يومي",
      summaryEn: existing ? "Daily closing was updated." : "Daily closing was saved.",
      before: existing ?? undefined,
      after: {
        closingDate: values.closingDate,
        ...closingColumns,
        notes: values.notes,
      },
      reason: values.reason,
    });
  });

  return getAccountingDailyClosing(values.closingDate);
}

export function saveStaffDailyClosing(input: unknown): StaffDailyClosingRecord {
  requirePermissionForCurrentSession("dailyClosing.staffClose");
  const values = staffDailyClosingInputSchema.parse(input);
  const now = new Date().toISOString();
  const existing = getDatabase()
    .select()
    .from(dailyClosings)
    .where(eq(dailyClosings.closingDate, values.closingDate))
    .get();

  if (existing) {
    throw new Error("This day is already closed. Ask a manager to update it.");
  }

  getDatabase().transaction((tx) => {
    tx.insert(dailyClosings)
      .values({
        closingDate: values.closingDate,
        ...buildDailyClosingColumns(values.closingDate, values.countedCash),
        notes: values.notes,
        closedAt: now,
        updatedAt: now,
      })
      .run();

    logAuditEvent(tx, {
      action: "dailyClosing.staffCreated",
      entityType: "daily_closing",
      entityLabel: values.closingDate,
      summaryAr: "تم حفظ إغلاق يومي للموظف",
      summaryEn: "Staff daily closing was saved.",
      after: {
        closingDate: values.closingDate,
        countedCash: values.countedCash,
        notes: values.notes,
      },
    });
  });

  return {
    closingDate: values.closingDate,
    countedCash: values.countedCash,
    notes: values.notes,
    closedAt: now,
    isClosed: true,
  };
}

/**
 * The three closing amounts, converted once and written to both columns.
 *
 * The difference is derived from the two integers rather than recomputed from
 * the mirrors, so a short drawer stays exactly as negative as it was counted.
 */
function buildDailyClosingColumns(closingDate: string, countedCash: number) {
  const expectedCashMinor = getExpectedCashMinorForDate(closingDate);
  const countedCashMinor = toMinorUnits(countedCash, "Counted cash");

  return {
    ...moneyColumns("expectedCash", expectedCashMinor),
    ...moneyColumns("countedCash", countedCashMinor),
    ...moneyColumns(
      "difference",
      calculateDailyClosingDifferenceMinor(expectedCashMinor, countedCashMinor),
    ),
  };
}

export function getWeeklyIncome(
  anchorDate = getCurrentLocalDate(),
): WeeklyIncomeDayRecord[] {
  requirePermissionForCurrentSession("weeklyIncome.view");
  const parsedAnchorDate = parseDateInput(anchorDate);
  const days: string[] = [];
  const anchor = new Date(`${parsedAnchorDate}T00:00:00`);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    days.push(toLocalDateValue(date));
  }

  return days.map(getWeeklyIncomeDay);
}

export function getDailyClosingAccountingTotals(date: string): {
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  expenses: number;
  ownerWithdrawals: number;
} {
  const closing = getAccountingDailyClosing(date);
  const totals = fromTotalsMinor(
    calculateAccountingTotalsMinor(
      loadAccountingBalanceInputs({ dateFrom: date, dateTo: date }),
    ),
  );

  return {
    expectedCash: closing.expectedCash,
    countedCash: closing.countedCash,
    difference: closing.difference,
    expenses: totals.expenses,
    ownerWithdrawals: totals.ownerWithdrawals,
  };
}

function buildAccountingSummary(request: AccountingSummaryRequest): AccountingSummary {
  const balances = buildLocationBalancesMinor({ dateTo: request.dateTo });
  const totals = calculateAccountingTotalsMinor(loadAccountingBalanceInputs(request));

  return {
    ...fromTotalsMinor(totals),
    cashDrawer: fromMinorUnits(balances.cash_drawer),
    shopSafe: fromMinorUnits(balances.shop_safe),
    bank: fromMinorUnits(balances.bank),
    expectedCash: fromMinorUnits(balances.cash_drawer),
    outstandingBalances: fromMinorUnits(getOutstandingBalanceTotalMinor()),
    depositsHeld: fromMinorUnits(getDepositHeldTotalMinor()),
  };
}

function buildLocationBalancesMinor(
  request: AccountingSummaryRequest,
): LocationBalancesMinor {
  return calculateLocationBalancesMinor(loadAccountingBalanceInputs(request));
}

function loadAccountingBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  return [
    ...loadPaymentBalanceInputs(request),
    ...loadVehicleSaleBalanceInputs(request),
    ...loadExpenseBalanceInputs(request),
    ...loadCashMovementBalanceInputs(request),
    ...loadAdjustmentBalanceInputs(request),
    ...loadEmployeeLoanBalanceInputs(request),
  ];
}

function loadPaymentBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const conditions = getDateConditions(payments.paymentDate, request);

  return getDatabase()
    .select({
      amountMinor: payments.amountMinor,
      method: payments.method,
      status: payments.status,
      type: payments.type,
    })
    .from(payments)
    .where(conditions.length ? and(...conditions) : undefined)
    .all()
    .map((payment): AccountingBalanceInputMinor => {
      const location = getPaymentMoneyLocation(payment.method);
      const amountMinor = columnToMinor(payment.amountMinor, "payments.amount_minor");

      // Refunds are stored positive; the kind is what makes them an outflow.
      if (payment.type === "refund") {
        return {
          amountMinor,
          kind: "money_out",
          location,
          outflowType: "refund",
          status: payment.status,
        };
      }

      return {
        amountMinor,
        kind: "money_in",
        location,
        status: payment.status,
      };
    });
}

function loadVehicleSaleBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const conditions = getDateConditions(vehicleSales.saleDate, request);

  return getDatabase()
    .select({
      amountMinor: vehicleSales.salePriceMinor,
      method: vehicleSales.paymentMethod,
      status: vehicleSales.status,
    })
    .from(vehicleSales)
    .where(conditions.length ? and(...conditions) : undefined)
    .all()
    .map((sale): AccountingBalanceInputMinor => ({
      amountMinor: columnToMinor(sale.amountMinor, "vehicle_sales.sale_price_minor"),
      kind: "money_in",
      location: getPaymentMoneyLocation(sale.method),
      status: sale.status,
    }));
}

function loadExpenseBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const conditions = getDateConditions(expenses.expenseDate, request);

  return getDatabase()
    .select({
      amountMinor: expenses.amountMinor,
      location: expenses.location,
      status: expenses.status,
    })
    .from(expenses)
    .where(conditions.length ? and(...conditions) : undefined)
    .all()
    .map((expense): AccountingBalanceInputMinor => ({
      amountMinor: columnToMinor(expense.amountMinor, "expenses.amount_minor"),
      kind: "money_out",
      location: expense.location,
      outflowType: "expense",
      status: expense.status,
    }));
}

function loadCashMovementBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const conditions = getDateConditions(cashMovements.movementDate, request);

  return getDatabase()
    .select({
      amountMinor: cashMovements.amountMinor,
      fromLocation: cashMovements.fromLocation,
      status: cashMovements.status,
      toLocation: cashMovements.toLocation,
      type: cashMovements.type,
    })
    .from(cashMovements)
    .where(conditions.length ? and(...conditions) : undefined)
    .all()
    .map((movement): AccountingBalanceInputMinor => {
      const amountMinor = columnToMinor(
        movement.amountMinor,
        "cash_movements.amount_minor",
      );

      if (movement.type === "owner_withdrawal") {
        return {
          amountMinor,
          kind: "money_out",
          location: movement.fromLocation,
          outflowType: "owner_withdrawal",
          status: movement.status,
        };
      }

      return {
        amountMinor,
        fromLocation: movement.fromLocation,
        kind: "transfer",
        status: movement.status,
        toLocation: movement.toLocation,
      };
    });
}

function loadAdjustmentBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const conditions = getDateConditions(accountingAdjustments.adjustmentDate, request);

  return getDatabase()
    .select({
      amountMinor: accountingAdjustments.amountMinor,
      direction: accountingAdjustments.direction,
      location: accountingAdjustments.location,
      status: accountingAdjustments.status,
    })
    .from(accountingAdjustments)
    .where(conditions.length ? and(...conditions) : undefined)
    .all()
    .map((adjustment): AccountingBalanceInputMinor => ({
      adjustmentDirection: adjustment.direction,
      amountMinor: columnToMinor(
        adjustment.amountMinor,
        "accounting_adjustments.amount_minor",
      ),
      kind: "adjustment",
      location: adjustment.location,
      status: adjustment.status,
    }));
}

function loadEmployeeLoanBalanceInputs(
  request: AccountingSummaryRequest,
): AccountingBalanceInputMinor[] {
  const loanConditions = getDateConditions(employeeLoans.issuedAt, request);
  const repaymentConditions = getDateConditions(
    employeeLoanPayments.paymentDate,
    request,
  );

  return [
    ...getDatabase()
      .select({
        amountMinor: employeeLoans.amountMinor,
        location: employeeLoans.sourceLocation,
        status: employeeLoans.status,
      })
      .from(employeeLoans)
      .where(loanConditions.length ? and(...loanConditions) : undefined)
      .all()
      .map((loan): AccountingBalanceInputMinor => ({
        adjustmentDirection: "decrease",
        amountMinor: columnToMinor(loan.amountMinor, "employee_loans.amount_minor"),
        kind: "adjustment",
        location: loan.location,
        status: loan.status === "voided" ? "voided" : "posted",
      })),
    ...getDatabase()
      .select({
        amountMinor: employeeLoanPayments.amountMinor,
        location: employeeLoanPayments.location,
        status: employeeLoanPayments.status,
      })
      .from(employeeLoanPayments)
      .where(repaymentConditions.length ? and(...repaymentConditions) : undefined)
      .all()
      .map((payment): AccountingBalanceInputMinor => ({
        adjustmentDirection: "increase",
        amountMinor: columnToMinor(
          payment.amountMinor,
          "employee_loan_payments.amount_minor",
        ),
        kind: "adjustment",
        location: payment.location,
        status: payment.status,
      })),
  ];
}

type SqlQuery = {
  params: unknown[];
  sql: string;
};

type AccountingSourceKey =
  | "payment"
  | "vehicle_sale"
  | "expense"
  | "cash_movement"
  | "adjustment"
  | "employee_loan";

function buildAccountingTransactionSourceQueries(
  request: AccountingListRequest | undefined,
  kind: AccountingTransactionKind,
  search: string,
): SqlQuery[] {
  return [
    sourceSupportsKind(kind, ["money_in", "money_out"])
      ? buildAccountingSourceQuery(
          paymentTransactionsSql,
          "payments.payment_date",
          request,
          kind,
          search,
          "payment",
        )
      : null,
    sourceSupportsKind(kind, ["money_in"])
      ? buildAccountingSourceQuery(
          vehicleSaleTransactionsSql,
          "vehicle_sales.sale_date",
          request,
          kind,
          search,
          "vehicle_sale",
        )
      : null,
    sourceSupportsKind(kind, ["money_out"])
      ? buildAccountingSourceQuery(
          expenseTransactionsSql,
          "expenses.expense_date",
          request,
          kind,
          search,
          "expense",
        )
      : null,
    sourceSupportsKind(kind, ["money_out", "transfer"])
      ? buildAccountingSourceQuery(
          cashMovementTransactionsSql,
          "cash_movements.movement_date",
          request,
          kind,
          search,
          "cash_movement",
        )
      : null,
    sourceSupportsKind(kind, ["adjustment"])
      ? buildAccountingSourceQuery(
          adjustmentTransactionsSql,
          "accounting_adjustments.adjustment_date",
          request,
          kind,
          search,
          "adjustment",
        )
      : null,
    sourceSupportsKind(kind, ["adjustment"])
      ? buildAccountingSourceQuery(
          employeeLoanTransactionsSql,
          "employee_loan_transactions.occurredAt",
          request,
          kind,
          search,
          "employee_loan",
        )
      : null,
  ].filter((query): query is SqlQuery => Boolean(query));
}

function vehicleSaleTransactionsSql(whereSql: string): string {
  return `
    select
      'vehicle-sale-' || vehicle_sales.id as id,
      'vehicle_sale' as source,
      vehicle_sales.id as sourceId,
      vehicle_sales.sale_date as occurredAt,
      'money_in' as kind,
      'Vehicle Sale' as title,
      vehicle_sales.sale_no || ' - ' || vehicle_sales.buyer_name || ' - ' || vehicles.plate_number as detail,
      vehicle_sales.sale_price_minor as amountMinor,
      vehicle_sales.status as status,
      case when vehicle_sales.payment_method in ('card', 'bank_transfer') then 'bank' else 'cash_drawer' end as location,
      null as fromLocation,
      case when vehicle_sales.payment_method in ('card', 'bank_transfer') then 'bank' else 'cash_drawer' end as toLocation,
      vehicle_sales.notes as notes
    from vehicle_sales
    inner join vehicles on vehicle_sales.vehicle_id = vehicles.id
    ${whereSql}
  `;
}

function buildAccountingSourceQuery(
  sourceSql: (whereSql: string) => string,
  dateColumn: string,
  request: AccountingListRequest | undefined,
  kind: AccountingTransactionKind,
  search: string,
  source: AccountingSourceKey,
): SqlQuery {
  const params: unknown[] = [];
  const searchParams: unknown[] = [];
  const searchSql = getAccountingSourceSearchSql(source, search, searchParams);
  const baseSql = sourceSql(
    getAccountingWhereSql(
      dateColumn,
      request,
      params,
      searchSql,
      searchParams,
    ),
  );
  const filters: string[] = [];

  if (kind !== "all") {
    filters.push("kind = ?");
    params.push(kind);
  }

  return {
    params,
    sql: `
      select *
      from (${baseSql}) source_transactions
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
    `,
  };
}

function sourceSupportsKind(
  requestedKind: AccountingTransactionKind,
  sourceKinds: Exclude<AccountingTransactionKind, "all">[],
): boolean {
  return requestedKind === "all" || sourceKinds.includes(requestedKind);
}

function paymentTransactionsSql(whereSql: string): string {
  return `
    select
      'payment-' || payments.id as id,
      'payment' as source,
      payments.id as sourceId,
      payments.payment_date as occurredAt,
      case when payments.type = 'refund' then 'money_out' else 'money_in' end as kind,
      case when payments.type = 'refund' then 'Refund' else 'Payment' end as title,
      rentals.contract_no || ' - ' || customers.full_name || ' - ' || vehicles.plate_number as detail,
      payments.amount_minor as amountMinor,
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

function expenseTransactionsSql(whereSql: string): string {
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
      expenses.amount_minor as amountMinor,
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

function cashMovementTransactionsSql(whereSql: string): string {
  return `
    select
      'cash-movement-' || cash_movements.id as id,
      'cash_movement' as source,
      cash_movements.id as sourceId,
      cash_movements.movement_date as occurredAt,
      case when cash_movements.type = 'owner_withdrawal' then 'money_out' else 'transfer' end as kind,
      case when cash_movements.type = 'owner_withdrawal' then 'Owner Withdrawal' else 'Move Cash' end as title,
      '' as detail,
      cash_movements.amount_minor as amountMinor,
      cash_movements.status as status,
      case when cash_movements.type = 'owner_withdrawal' then cash_movements.from_location else null end as location,
      cash_movements.from_location as fromLocation,
      cash_movements.to_location as toLocation,
      cash_movements.notes as notes
    from cash_movements
    ${whereSql}
  `;
}

function adjustmentTransactionsSql(whereSql: string): string {
  return `
    select
      'adjustment-' || accounting_adjustments.id as id,
      'adjustment' as source,
      accounting_adjustments.id as sourceId,
      accounting_adjustments.adjustment_date as occurredAt,
      'adjustment' as kind,
      'Balance Adjustment' as title,
      accounting_adjustments.reason as detail,
      accounting_adjustments.amount_minor as amountMinor,
      accounting_adjustments.status as status,
      accounting_adjustments.location as location,
      case when accounting_adjustments.direction = 'decrease' then accounting_adjustments.location else null end as fromLocation,
      case when accounting_adjustments.direction = 'increase' then accounting_adjustments.location else null end as toLocation,
      accounting_adjustments.notes as notes
    from accounting_adjustments
    ${whereSql}
  `;
}

function employeeLoanTransactionsSql(whereSql: string): string {
  return `
    select *
    from (
      select
        'employee-loan-' || employee_loans.id as id,
        'employee_loan' as source,
        employee_loans.id as sourceId,
        employee_loans.issued_at as occurredAt,
        'adjustment' as kind,
        'Employee Loan' as title,
        employee_loans.loan_no || ' - ' || users.full_name as detail,
        employee_loans.amount_minor as amountMinor,
        case when employee_loans.status = 'voided' then 'voided' else 'posted' end as status,
        employee_loans.source_location as location,
        employee_loans.source_location as fromLocation,
        null as toLocation,
        employee_loans.notes as notes
      from employee_loans
      inner join users on employee_loans.employee_user_id = users.id

      union all

      select
        'employee-loan-payment-' || employee_loan_payments.id as id,
        'employee_loan' as source,
        employee_loan_payments.id as sourceId,
        employee_loan_payments.payment_date as occurredAt,
        'adjustment' as kind,
        'Employee Loan Repayment' as title,
        employee_loans.loan_no || ' - ' || users.full_name as detail,
        employee_loan_payments.amount_minor as amountMinor,
        employee_loan_payments.status as status,
        employee_loan_payments.location as location,
        null as fromLocation,
        employee_loan_payments.location as toLocation,
        employee_loan_payments.notes as notes
      from employee_loan_payments
      inner join employee_loans on employee_loan_payments.loan_id = employee_loans.id
      inner join users on employee_loans.employee_user_id = users.id
    ) employee_loan_transactions
    ${whereSql}
  `;
}

function getAccountingWhereSql(
  dateColumn: string,
  request: AccountingListRequest | undefined,
  params: unknown[],
  searchSql: string | null,
  searchParams: unknown[],
): string {
  const conditions: string[] = [];

  if (request?.dateFrom) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(getLocalDateStart(request.dateFrom));
  }

  if (request?.dateTo) {
    conditions.push(`${dateColumn} < ?`);
    params.push(getLocalDateEnd(request.dateTo));
  }

  if (searchSql) {
    conditions.push(searchSql);
    params.push(...searchParams);
  }

  return conditions.length ? `where ${conditions.join(" and ")}` : "";
}

function getAccountingSourceSearchSql(
  source: AccountingSourceKey,
  search: string,
  params: unknown[],
): string | null {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return null;
  }

  const conditions = buildAccountingSourceSearchConditions(
    source,
    normalizedSearch,
    params,
  );

  return conditions.length ? `(${conditions.join(" or ")})` : null;
}

function buildAccountingSourceSearchConditions(
  source: AccountingSourceKey,
  search: string,
  params: unknown[],
): string[] {
  if (source === "payment") {
    return buildPaymentSearchConditions(search, params);
  }

  if (source === "vehicle_sale") {
    return buildVehicleSaleSearchConditions(search, params);
  }

  if (source === "expense") {
    return buildExpenseSearchConditions(search, params);
  }

  if (source === "cash_movement") {
    return buildCashMovementSearchConditions(search, params);
  }

  if (source === "employee_loan") {
    return buildEmployeeLoanSearchConditions(search, params);
  }

  return buildAdjustmentSearchConditions(search, params);
}

function buildVehicleSaleSearchConditions(search: string, params: unknown[]): string[] {
  const conditions: string[] = [];

  addStaticSearchCondition(conditions, search, ["vehicle sale", "sale"]);
  addPaymentLocationSearchConditions(conditions, search, "vehicle_sales.payment_method");
  addLowerLikeCondition(conditions, params, "vehicle_sales.sale_no", search);
  addLowerLikeCondition(conditions, params, "vehicle_sales.buyer_name", search);
  addLowerLikeCondition(conditions, params, "vehicle_sales.buyer_phone", search);
  addLowerLikeCondition(conditions, params, "vehicles.plate_number", search);
  addLowerLikeCondition(conditions, params, "vehicles.brand", search);
  addLowerLikeCondition(conditions, params, "vehicles.model", search);
  addLowerLikeCondition(conditions, params, "vehicle_sales.notes", search);

  return conditions;
}

function buildPaymentSearchConditions(search: string, params: unknown[]): string[] {
  const conditions: string[] = [];

  addStaticSearchCondition(conditions, search, ["payment"]);
  addStaticSearchCondition(conditions, search, ["refund"], "payments.type = 'refund'");
  addPaymentLocationSearchConditions(conditions, search);
  addLowerLikeCondition(conditions, params, "rentals.contract_no", search);
  addLowerLikeCondition(conditions, params, "customers.full_name", search);
  addLowerLikeCondition(conditions, params, "vehicles.plate_number", search);
  addLowerLikeCondition(
    conditions,
    params,
    "coalesce(payments.notes, payments.receipt_no)",
    search,
  );

  return conditions;
}

function buildExpenseSearchConditions(search: string, params: unknown[]): string[] {
  const conditions: string[] = [];

  addStaticSearchCondition(conditions, search, ["expense"]);
  addLocationSearchConditions(conditions, search, "expenses.location");
  addLowerLikeCondition(conditions, params, "expenses.category", search);
  addLowerLikeCondition(conditions, params, "expenses.vendor_name", search);
  addLowerLikeCondition(conditions, params, "vehicles.plate_number", search);
  addLowerLikeCondition(conditions, params, "expenses.notes", search);

  return conditions;
}

function buildCashMovementSearchConditions(
  search: string,
  params: unknown[],
): string[] {
  const conditions: string[] = [];

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
  addLocationSearchConditions(
    conditions,
    search,
    "cash_movements.from_location",
  );
  addLocationSearchConditions(conditions, search, "cash_movements.to_location");
  addLowerLikeCondition(conditions, params, "cash_movements.notes", search);

  return conditions;
}

function buildAdjustmentSearchConditions(
  search: string,
  params: unknown[],
): string[] {
  const conditions: string[] = [];

  addStaticSearchCondition(conditions, search, [
    "adjustment",
    "balance adjustment",
  ]);
  addLocationSearchConditions(conditions, search, "accounting_adjustments.location");
  addLowerLikeCondition(conditions, params, "accounting_adjustments.reason", search);
  addLowerLikeCondition(conditions, params, "accounting_adjustments.notes", search);

  return conditions;
}

function buildEmployeeLoanSearchConditions(
  search: string,
  params: unknown[],
): string[] {
  const conditions: string[] = [];

  addStaticSearchCondition(conditions, search, [
    "employee loan",
    "loan",
    "repayment",
  ]);
  addLocationSearchConditions(conditions, search, "employee_loan_transactions.location");
  addLowerLikeCondition(conditions, params, "employee_loan_transactions.title", search);
  addLowerLikeCondition(conditions, params, "employee_loan_transactions.detail", search);
  addLowerLikeCondition(conditions, params, "employee_loan_transactions.notes", search);

  return conditions;
}

function addLowerLikeCondition(
  conditions: string[],
  params: unknown[],
  expression: string,
  search: string,
): void {
  conditions.push(`lower(coalesce(${expression}, '')) like ?`);
  params.push(toLikeTerm(search));
}

function addStaticSearchCondition(
  conditions: string[],
  search: string,
  labels: string[],
  condition = "1 = 1",
): void {
  if (labels.some((label) => label.includes(search))) {
    conditions.push(condition);
  }
}

function addPaymentLocationSearchConditions(
  conditions: string[],
  search: string,
  methodColumn = "payments.method",
): void {
  if (matchesLocationSearch(search, "cash_drawer")) {
    conditions.push(`${methodColumn} in ('cash', 'other')`);
  }

  if (matchesLocationSearch(search, "bank")) {
    conditions.push(`${methodColumn} in ('card', 'bank_transfer')`);
  }
}

function addLocationSearchConditions(
  conditions: string[],
  search: string,
  column: string,
): void {
  for (const location of ["cash_drawer", "shop_safe", "bank"] as const) {
    if (matchesLocationSearch(search, location)) {
      conditions.push(`${column} = '${location}'`);
    }
  }
}

function matchesLocationSearch(
  search: string,
  location: "cash_drawer" | "shop_safe" | "bank",
): boolean {
  return [location, location.replace("_", " ")].some((label) =>
    label.includes(search),
  );
}

function getOutstandingBalanceTotalMinor(): MoneyMinor {
  const result = getDatabase()
    .select({
      total: sql<number>`coalesce(sum(${rentals.remainingAmountMinor}), 0)`,
    })
    .from(rentals)
    .where(
      and(
        sql`${rentals.status} in ('active', 'overdue', 'returned')`,
        sql`${rentals.remainingAmountMinor} > 0`,
      ),
    )
    .get();

  return sumToMinor(result?.total, "The outstanding balance");
}

function getDepositHeldTotalMinor(): MoneyMinor {
  const result = getSqliteDatabase()
    .prepare(`
      with refund_by_rental as (
        select
          rental_id as rentalId,
          coalesce(sum(amount_minor), 0) as refunded
        from payments
        where status = 'posted' and type = 'refund'
        group by rental_id
      )
      select coalesce(sum(max(0, rentals.deposit_paid_minor - coalesce(refund_by_rental.refunded, 0))), 0) as total
      from rentals
      left join refund_by_rental on refund_by_rental.rentalId = rentals.id
      where rentals.status in ('active', 'overdue', 'returned')
        and rentals.deposit_paid_minor > 0
    `)
    .get() as { total?: unknown } | undefined;

  return sumToMinor(result?.total, "The deposits held total");
}

function getWeeklyIncomeDay(date: string): WeeklyIncomeDayRecord {
  const row = getSqliteDatabase()
    .prepare(
      `
        select
          coalesce(sum(case when type = 'rent' then amount_minor else 0 end), 0) as rent,
          coalesce(sum(case when type = 'deposit' then amount_minor else 0 end), 0) as deposit,
          coalesce(sum(case when type = 'extra_charge' then amount_minor else 0 end), 0) as extraCharge,
          coalesce(sum(case when type = 'refund' then amount_minor else 0 end), 0) as refunds
        from payments
        where status = 'posted'
          and payment_date >= ?
          and payment_date < ?
      `,
    )
    .get(getLocalDateStart(date), getLocalDateEnd(date)) as
    | {
        deposit?: unknown;
        extraCharge?: unknown;
        refunds?: unknown;
        rent?: unknown;
      }
    | undefined;

  const rentMinor = sumToMinor(row?.rent, "Rent income");
  const depositMinor = sumToMinor(row?.deposit, "Deposit income");
  const extraChargeMinor = sumToMinor(row?.extraCharge, "Extra charge income");
  // Refunds are stored positive and shown as a negative line on the day.
  const refundsMinor = negateMoney(sumToMinor(row?.refunds, "Refunds"));

  return {
    date,
    rent: fromMinorUnits(rentMinor),
    deposit: fromMinorUnits(depositMinor),
    extraCharge: fromMinorUnits(extraChargeMinor),
    refunds: fromMinorUnits(refundsMinor),
    netIncome: fromMinorUnits(
      addMoney(rentMinor, depositMinor, extraChargeMinor, refundsMinor),
    ),
  };
}

function getExpectedCashMinorForDate(date: string): MoneyMinor {
  return buildLocationBalancesMinor({ dateTo: date }).cash_drawer;
}

type AccountingDateColumn =
  | typeof payments.paymentDate
  | typeof vehicleSales.saleDate
  | typeof expenses.expenseDate
  | typeof cashMovements.movementDate
  | typeof accountingAdjustments.adjustmentDate
  | typeof employeeLoans.issuedAt
  | typeof employeeLoanPayments.paymentDate;

function getDateConditions(
  dateColumn: AccountingDateColumn,
  request?: AccountingSummaryRequest,
): SQL[] {
  const conditions: SQL[] = [];

  if (request?.dateFrom) {
    conditions.push(gte(dateColumn, getLocalDateStart(request.dateFrom)));
  }

  if (request?.dateTo) {
    conditions.push(lt(dateColumn, getLocalDateEnd(request.dateTo)));
  }

  return conditions;
}

export function assertAccountingBalanceDeltasAllowed(
  deltas: AccountingBalanceDeltaMinor[],
): void {
  assertProjectedBalancesNonNegative(buildLocationBalancesMinor({}), deltas);
}

export function assertProjectedBalancesNonNegative(
  currentBalances: LocationBalancesMinor,
  deltas: AccountingBalanceDeltaMinor[],
): void {
  const projectedBalances = applyBalanceDeltasMinor(currentBalances, deltas);
  const negativeLocations = getNegativeBalanceLocationsMinor(projectedBalances);

  if (negativeLocations.length === 0) {
    return;
  }

  const labels = negativeLocations
    .map((location) => formatMoneyLocation(location, "en"))
    .join(", ");

  throw new Error(
    `Not enough balance in ${labels}. Add a balance adjustment first.`,
  );
}

export function getPaymentAccountingDeltas(input: {
  amountMinor: MoneyMinor;
  method: Parameters<typeof getPaymentMoneyLocation>[0];
  status?: "posted" | "voided";
  type: "rent" | "deposit" | "extra_charge" | "refund";
}): AccountingBalanceDeltaMinor[] {
  if (input.status === "voided") {
    return [];
  }

  return [
    {
      location: getPaymentMoneyLocation(input.method),
      amountMinor:
        input.type === "refund" ? negateMoney(input.amountMinor) : input.amountMinor,
    },
  ];
}

function getCashMovementDeltas(input: {
  amountMinor: MoneyMinor;
  fromLocation: MoneyLocation;
  toLocation: MoneyLocation | null;
  type: "transfer" | "owner_withdrawal";
}): AccountingBalanceDeltaMinor[] {
  const outgoing = {
    location: input.fromLocation,
    amountMinor: negateMoney(input.amountMinor),
  };

  if (input.type === "owner_withdrawal") {
    return [outgoing];
  }

  return [
    outgoing,
    ...(input.toLocation
      ? [{ location: input.toLocation, amountMinor: input.amountMinor }]
      : []),
  ];
}

function getAdjustmentDelta(input: {
  amountMinor: MoneyMinor;
  direction: "increase" | "decrease";
  location: MoneyLocation;
}): AccountingBalanceDeltaMinor {
  return {
    location: input.location,
    amountMinor:
      input.direction === "decrease"
        ? negateMoney(input.amountMinor)
        : input.amountMinor,
  };
}

function getReversalDeltas(
  deltas: AccountingBalanceDeltaMinor[],
): AccountingBalanceDeltaMinor[] {
  return deltas.map(reverseDelta);
}

function reverseDelta(
  delta: AccountingBalanceDeltaMinor,
): AccountingBalanceDeltaMinor {
  return {
    location: delta.location,
    amountMinor: negateMoney(delta.amountMinor),
  };
}

function getApprovalToken(input: unknown): string | undefined {
  if (input && typeof input === "object" && "approvalToken" in input) {
    const token = (input as { approvalToken?: unknown }).approvalToken;

    return typeof token === "string" ? token : undefined;
  }

  return undefined;
}

function isAccountingTransactionKind(
  value: unknown,
): value is AccountingTransactionKind {
  return accountingTransactionKindValues.includes(value as AccountingTransactionKind);
}

function getLocalDateStart(date: string): string {
  return new Date(`${parseDateInput(date)}T00:00:00`).toISOString();
}

function getLocalDateEnd(date: string): string {
  const end = new Date(`${parseDateInput(date)}T00:00:00`);
  end.setDate(end.getDate() + 1);

  return end.toISOString();
}

function getCurrentLocalDate(): string {
  return toLocalDateValue(new Date());
}

function toLocalDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Date is invalid.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Date is invalid.");
  }

  return value;
}

function normalizeAccountingServiceError(error: unknown, fallback: string): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? fallback);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(fallback);
}
