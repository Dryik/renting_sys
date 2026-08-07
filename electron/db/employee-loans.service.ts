import { and, asc, count, desc, eq, like, ne, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateEmployeeLoanRemainingMinor,
  employeeLoanInputSchema,
  employeeLoanRepaymentInputSchema,
  employeeLoanVoidInputSchema,
  getEmployeeLoanStatusMinor,
  type EmployeeLoanEmployeeOption,
  type EmployeeLoanListRequest,
  type EmployeeLoanPaymentRecord,
  type EmployeeLoanRecord,
} from "../../src/shared/employee-loans";
import {
  MONEY_MINOR_ZERO,
  fromMinorUnits,
  negateMoney,
  toMinorUnits,
} from "../../src/shared/money";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { columnToMinor, moneyColumns } from "./money-write";
import { employeeLoanPayments, employeeLoans, users } from "./schema";
import { getCurrentUserForService, requirePermissionForCurrentSession } from "./auth.service";
import { getNextSequenceValue } from "./numbering.service";
import { logAuditEvent } from "./audit.service";
import { assertAccountingBalanceDeltasAllowed } from "./accounting.service";

export function listEmployeeLoanEmployees(): EmployeeLoanEmployeeOption[] {
  requirePermissionForCurrentSession("employeeLoans.view");

  return getDatabase()
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
    })
    .from(users)
    .where(and(eq(users.isActive, true), ne(users.roleKey, "owner_admin")))
    .orderBy(asc(users.fullName))
    .all();
}

export function listEmployeeLoans(
  request?: EmployeeLoanListRequest,
): PageResult<EmployeeLoanRecord> {
  requirePermissionForCurrentSession("employeeLoans.view");
  const pageRequest = normalizePageRequest(request);
  const status = isEmployeeLoanStatusFilter(request?.status) ? request.status : "all";
  const conditions: SQL[] = [];

  if (status !== "all") {
    conditions.push(eq(employeeLoans.status, status));
  }

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);
    const searchFilter = or(
      like(employeeLoans.loanNo, term),
      like(users.fullName, term),
      like(users.username, term),
      like(employeeLoans.notes, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total =
    getDatabase()
      .select({ count: count() })
      .from(employeeLoans)
      .innerJoin(users, eq(employeeLoans.employeeUserId, users.id))
      .where(whereFilter)
      .get()?.count ?? 0;
  const rows = getDatabase()
    .select({
      loan: employeeLoans,
      employeeName: users.fullName,
      employeeUsername: users.username,
    })
    .from(employeeLoans)
    .innerJoin(users, eq(employeeLoans.employeeUserId, users.id))
    .where(whereFilter)
    .orderBy(desc(employeeLoans.issuedAt), desc(employeeLoans.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all()
    .map(toEmployeeLoanRecord);

  return createPageResult(rows, total, pageRequest);
}

export function listEmployeeLoanPayments(
  loanId: unknown,
): EmployeeLoanPaymentRecord[] {
  requirePermissionForCurrentSession("employeeLoans.view");
  const id = parseLoanId(loanId);

  return getDatabase()
    .select()
    .from(employeeLoanPayments)
    .where(eq(employeeLoanPayments.loanId, id))
    .orderBy(desc(employeeLoanPayments.paymentDate), desc(employeeLoanPayments.id))
    .all()
    .map(toEmployeeLoanPaymentRecord);
}

/** Named fields only, so the storage pair stops at the service boundary. */
function toEmployeeLoanPaymentRecord(
  row: typeof employeeLoanPayments.$inferSelect,
): EmployeeLoanPaymentRecord {
  return {
    id: row.id,
    loanId: row.loanId,
    amount: fromMinorUnits(
      columnToMinor(row.amountMinor, "employee_loan_payments.amount_minor"),
    ),
    paymentDate: row.paymentDate,
    method: row.method,
    location: row.location,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createEmployeeLoan(input: unknown): EmployeeLoanRecord {
  requirePermissionForCurrentSession("employeeLoans.create");
  const values = employeeLoanInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();
  const amountMinor = toMinorUnits(values.amount, "Loan amount");
  assertAccountingBalanceDeltasAllowed([
    { location: values.sourceLocation, amountMinor: negateMoney(amountMinor) },
  ]);

  try {
    const loanId = getDatabase().transaction((tx) => {
      const employee = tx
        .select({
          id: users.id,
          isActive: users.isActive,
          roleKey: users.roleKey,
        })
        .from(users)
        .where(eq(users.id, values.employeeUserId))
        .get();

      if (!employee || !employee.isActive || employee.roleKey === "owner_admin") {
        throw new Error("Employee was not found.");
      }

      const loanNo = getNextSequenceValue(tx, "employee_loan", "LOAN");
      const loan = tx
        .insert(employeeLoans)
        .values({
          loanNo,
          employeeUserId: values.employeeUserId,
          ...moneyColumns("amount", amountMinor),
          issuedAt: values.issuedAt,
          sourceLocation: values.sourceLocation,
          // Nothing is repaid yet, so the whole loan is still outstanding.
          ...moneyColumns("remainingAmount", amountMinor),
          status: "open",
          notes: values.notes,
          voidedAt: null,
          voidedByUserId: null,
          voidReason: null,
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "employeeLoan.created",
        entityType: "employee_loan",
        entityId: loan.id,
        entityLabel: loan.loanNo,
        summaryAr: `تم تسجيل سلفة موظف ${loan.loanNo}`,
        summaryEn: `Employee loan ${loan.loanNo} was recorded.`,
        after: loan,
      });

      return loan.id;
    });

    const loan = getEmployeeLoanById(loanId);
    if (!loan) {
      throw new Error("Employee loan was saved but could not be loaded.");
    }

    return loan;
  } catch (error) {
    throw normalizeEmployeeLoanError(error);
  }
}

export function recordEmployeeLoanRepayment(input: unknown): EmployeeLoanRecord {
  requirePermissionForCurrentSession("employeeLoans.repay");
  const values = employeeLoanRepaymentInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    const loanId = getDatabase().transaction((tx) => {
      const loan = tx
        .select()
        .from(employeeLoans)
        .where(eq(employeeLoans.id, values.loanId))
        .get();

      if (!loan) {
        throw new Error("Employee loan was not found.");
      }

      if (loan.status !== "open") {
        throw new Error("Only open employee loans can receive repayments.");
      }

      const loanAmountMinor = columnToMinor(
        loan.amountMinor,
        "employee_loans.amount_minor",
      );
      const repaymentMinor = toMinorUnits(values.amount, "Repayment amount");

      if (
        repaymentMinor >
        columnToMinor(loan.remainingAmountMinor, "employee_loans.remaining_amount_minor")
      ) {
        throw new Error("Repayment cannot be more than the remaining loan balance.");
      }

      const payment = tx
        .insert(employeeLoanPayments)
        .values({
          loanId: values.loanId,
          ...moneyColumns("amount", repaymentMinor),
          paymentDate: values.paymentDate,
          method: values.method,
          location: values.location,
          status: "posted",
          notes: values.notes,
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      const repayments = tx
        .select({
          amountMinor: employeeLoanPayments.amountMinor,
          status: employeeLoanPayments.status,
        })
        .from(employeeLoanPayments)
        .where(eq(employeeLoanPayments.loanId, values.loanId))
        .all()
        .map((row) => ({
          amountMinor: columnToMinor(
            row.amountMinor,
            "employee_loan_payments.amount_minor",
          ),
          status: row.status,
        }));

      tx.update(employeeLoans)
        .set({
          ...moneyColumns(
            "remainingAmount",
            calculateEmployeeLoanRemainingMinor(loanAmountMinor, repayments),
          ),
          status: getEmployeeLoanStatusMinor(loanAmountMinor, repayments),
          updatedAt: now,
        })
        .where(eq(employeeLoans.id, values.loanId))
        .run();

      logAuditEvent(tx, {
        action: "employeeLoan.repayment",
        entityType: "employee_loan",
        entityId: loan.id,
        entityLabel: loan.loanNo,
        summaryAr: `تم تسجيل سداد سلفة ${loan.loanNo}`,
        summaryEn: `Employee loan repayment was recorded for ${loan.loanNo}.`,
        after: payment,
      });

      return values.loanId;
    });

    const loan = getEmployeeLoanById(loanId);
    if (!loan) {
      throw new Error("Employee loan repayment was saved but could not be loaded.");
    }

    return loan;
  } catch (error) {
    throw normalizeEmployeeLoanError(error);
  }
}

export function voidEmployeeLoan(input: unknown): EmployeeLoanRecord {
  requirePermissionForCurrentSession("employeeLoans.void");
  const values = employeeLoanVoidInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    const loanId = getDatabase().transaction((tx) => {
      const loan = tx
        .select()
        .from(employeeLoans)
        .where(eq(employeeLoans.id, values.loanId))
        .get();

      if (!loan) {
        throw new Error("Employee loan was not found.");
      }

      if (loan.status === "voided") {
        throw new Error("Employee loan is already voided.");
      }

      const repaymentCount =
        tx
          .select({ count: count() })
          .from(employeeLoanPayments)
          .where(
            and(
              eq(employeeLoanPayments.loanId, values.loanId),
              eq(employeeLoanPayments.status, "posted"),
            ),
          )
          .get()?.count ?? 0;

      if (repaymentCount > 0) {
        throw new Error("Employee loan cannot be voided after repayments are recorded.");
      }

      const updated = tx
        .update(employeeLoans)
        .set({
          ...moneyColumns("remainingAmount", MONEY_MINOR_ZERO),
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(employeeLoans.id, values.loanId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "employeeLoan.voided",
        entityType: "employee_loan",
        entityId: updated.id,
        entityLabel: updated.loanNo,
        summaryAr: `تم إلغاء سلفة ${updated.loanNo}`,
        summaryEn: `Employee loan ${updated.loanNo} was voided.`,
        before: loan,
        after: updated,
        reason: values.reason,
      });

      return updated.id;
    });

    const loan = getEmployeeLoanById(loanId);
    if (!loan) {
      throw new Error("Employee loan was voided but could not be loaded.");
    }

    return loan;
  } catch (error) {
    throw normalizeEmployeeLoanError(error);
  }
}

function getEmployeeLoanById(id: number): EmployeeLoanRecord | undefined {
  const row = getDatabase()
    .select({
      loan: employeeLoans,
      employeeName: users.fullName,
      employeeUsername: users.username,
    })
    .from(employeeLoans)
    .innerJoin(users, eq(employeeLoans.employeeUserId, users.id))
    .where(eq(employeeLoans.id, id))
    .get();

  return row ? toEmployeeLoanRecord(row) : undefined;
}

function toEmployeeLoanRecord(row: {
  loan: typeof employeeLoans.$inferSelect;
  employeeName: string;
  employeeUsername: string;
}): EmployeeLoanRecord {
  return {
    id: row.loan.id,
    loanNo: row.loan.loanNo,
    employeeUserId: row.loan.employeeUserId,
    issuedAt: row.loan.issuedAt,
    sourceLocation: row.loan.sourceLocation,
    status: row.loan.status,
    notes: row.loan.notes,
    voidedAt: row.loan.voidedAt,
    voidReason: row.loan.voidReason,
    createdAt: row.loan.createdAt,
    updatedAt: row.loan.updatedAt,
    amount: fromMinorUnits(
      columnToMinor(row.loan.amountMinor, "employee_loans.amount_minor"),
    ),
    remainingAmount: fromMinorUnits(
      columnToMinor(
        row.loan.remainingAmountMinor,
        "employee_loans.remaining_amount_minor",
      ),
    ),
    employeeName: row.employeeName,
    employeeUsername: row.employeeUsername,
  };
}

function parseLoanId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Employee loan ID is invalid.");
  }

  return parsedId;
}

function isEmployeeLoanStatusFilter(
  status: unknown,
): status is NonNullable<EmployeeLoanListRequest["status"]> {
  return (
    status === "all" ||
    status === "open" ||
    status === "paid" ||
    status === "voided"
  );
}

function normalizeEmployeeLoanError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the employee loan details.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Employee loan could not be saved.");
}
