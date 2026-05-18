import { and, asc, eq, like, or } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type CustomerRecord,
  customerInputSchema,
} from "../../src/shared/customers";
import { customers } from "./schema";
import { getDatabase } from "./database";

export function listCustomers(search = ""): CustomerRecord[] {
  const db = getDatabase();
  const trimmedSearch = search.trim();

  if (trimmedSearch === "") {
    return db
      .select()
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.fullName))
      .all();
  }

  const term = `%${trimmedSearch}%`;

  return db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.isActive, true),
        or(
          like(customers.fullName, term),
          like(customers.phone, term),
          like(customers.nationalId, term),
          like(customers.driverLicenseNo, term),
        ),
      ),
    )
    .orderBy(asc(customers.fullName))
    .all();
}

export function createCustomer(input: unknown): CustomerRecord {
  const values = customerInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    return getDatabase()
      .insert(customers)
      .values({
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  } catch (error) {
    throw normalizeCustomerServiceError(error);
  }
}

export function updateCustomer(id: unknown, input: unknown): CustomerRecord {
  const customerId = parseCustomerId(id);
  const values = customerInputSchema.parse(input);

  try {
    const updatedCustomer = getDatabase()
      .update(customers)
      .set({
        ...values,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, customerId))
      .returning()
      .get();

    if (!updatedCustomer) {
      throw new Error("Customer was not found.");
    }

    return updatedCustomer;
  } catch (error) {
    throw normalizeCustomerServiceError(error);
  }
}

export function deactivateCustomer(id: unknown): void {
  const customerId = parseCustomerId(id);

  try {
    getDatabase()
      .update(customers)
      .set({
        isActive: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, customerId))
      .run();
  } catch {
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
