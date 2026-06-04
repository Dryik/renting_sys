import { and, asc, count, desc, eq, like, ne, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateEmployeeLoanRemaining,
  employeeLoanInputSchema,
  employeeLoanRepaymentInputSchema,
  employeeLoanVoidInputSchema,
  getEmployeeLoanStatus,
  type EmployeeLoanEmployeeOption,
  type EmployeeLoanListRequest,
  type EmployeeLoanPaymentRecord,
  type EmployeeLoanRecord,
} from "../../src/shared/employee-loans";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
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
    .all();
}

export function createEmployeeLoan(input: unknown): EmployeeLoanRecord {
  requirePermissionForCurrentSession("employeeLoans.create");
  const values = employeeLoanInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();
  assertAccountingBalanceDeltasAllowed([
    { location: values.sourceLocation, amount: -values.amount },
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
          amount: values.amount,
          issuedAt: values.issuedAt,
          sourceLocation: values.sourceLocation,
          remainingAmount: values.amount,
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

      if (values.amount > loan.remainingAmount) {
        throw new Error("Repayment cannot be more than the remaining loan balance.");
      }

      const payment = tx
        .insert(employeeLoanPayments)
        .values({
          loanId: values.loanId,
          amount: values.amount,
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

      const payments = tx
        .select({
          amount: employeeLoanPayments.amount,
          status: employeeLoanPayments.status,
        })
        .from(employeeLoanPayments)
        .where(eq(employeeLoanPayments.loanId, values.loanId))
        .all();
      const remainingAmount = calculateEmployeeLoanRemaining(loan.amount, payments);
      const status = getEmployeeLoanStatus(loan.amount, payments);

      tx.update(employeeLoans)
        .set({
          remainingAmount,
          status,
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
          remainingAmount: 0,
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
    ...row.loan,
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
