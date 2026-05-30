import { and, asc, count, eq, like, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type CustomerListRequest,
  type CustomerRecord,
  customerInputSchema,
} from "../../src/shared/customers";
import type { PageResult } from "../../src/shared/pagination";
import { customers } from "./schema";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";

export function listCustomers(request?: CustomerListRequest | string): PageResult<CustomerRecord> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const conditions: SQL[] = [eq(customers.isActive, true)];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);

    const searchFilter = or(
      like(customers.fullName, term),
      like(customers.phone, term),
      like(customers.nationalId, term),
      like(customers.driverLicenseNo, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  const whereFilter = and(...conditions);
  const total = db
    .select({ count: count() })
    .from(customers)
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select()
    .from(customers)
    .where(whereFilter)
    .orderBy(asc(customers.fullName))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function createCustomer(input: unknown): CustomerRecord {
  requirePermissionForCurrentSession("customers.create");
  const values = customerInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    return getDatabase().transaction((tx) => {
      const customer = tx
        .insert(customers)
        .values({
          ...values,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "customer.created",
        entityType: "customer",
        entityId: customer.id,
        entityLabel: customer.fullName,
        summaryAr: `تمت إضافة عميل ${customer.fullName}`,
        summaryEn: `Customer ${customer.fullName} was created.`,
        after: customer,
      });

      return customer;
    });
  } catch (error) {
    throw normalizeCustomerServiceError(error);
  }
}

export function updateCustomer(id: unknown, input: unknown): CustomerRecord {
  requirePermissionForCurrentSession("customers.edit");
  const customerId = parseCustomerId(id);
  const values = customerInputSchema.parse(input);

  try {
    const updatedCustomer = getDatabase().transaction((tx) => {
      const existing = tx.select().from(customers).where(eq(customers.id, customerId)).get();

      if (!existing) {
        throw new Error("Customer was not found.");
      }

      const updated = tx
        .update(customers)
        .set({
          ...values,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customers.id, customerId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "customer.updated",
        entityType: "customer",
        entityId: updated.id,
        entityLabel: updated.fullName,
        summaryAr: `تم تحديث عميل ${updated.fullName}`,
        summaryEn: `Customer ${updated.fullName} was updated.`,
        before: existing,
        after: updated,
      });

      return updated;
    });

    if (!updatedCustomer) {
      throw new Error("Customer was not found.");
    }

    return updatedCustomer;
  } catch (error) {
    throw normalizeCustomerServiceError(error);
  }
}

export function deactivateCustomer(id: unknown): void {
  requirePermissionForCurrentSession("customers.deactivate");
  const customerId =
    typeof id === "object" && id !== null
      ? parseCustomerId((id as { customerId?: unknown }).customerId)
      : parseCustomerId(id);
  const reason =
    typeof id === "object" &&
    id !== null &&
    typeof (id as { reason?: unknown }).reason === "string"
      ? (id as { reason: string }).reason.trim()
      : "";

  if (!reason) {
    throw new Error("Reason is required.");
  }

  try {
    getDatabase().transaction((tx) => {
      const existing = tx.select().from(customers).where(eq(customers.id, customerId)).get();

      if (!existing) {
        throw new Error("Customer was not found.");
      }

      tx.update(customers)
        .set({
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customers.id, customerId))
        .run();

      logAuditEvent(tx, {
        action: "customer.deactivated",
        entityType: "customer",
        entityId: customerId,
        entityLabel: existing.fullName,
        summaryAr: `تم تعطيل عميل ${existing.fullName}`,
        summaryEn: `Customer ${existing.fullName} was deactivated.`,
        before: existing,
        after: { ...existing, isActive: false },
        reason,
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Customer could not be deactivated.");
  }
}

function parseCustomerId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Customer ID is invalid.");
  }

  return parsedId;
}

function normalizeCustomerServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the customer details.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Customer could not be saved.");
}
