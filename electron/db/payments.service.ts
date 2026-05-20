import { and, asc, count, desc, eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculatePaidAmount,
  calculateRemainingAmount,
  type PaymentListRecord,
  type PaymentListRequest,
  type PaymentRecord,
  type PaymentType,
  paymentInputSchema,
} from "../../src/shared/payments";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { payments, rentals, customers, vehicles } from "./schema";
import { getShopSettings } from "./settings.service";

export function listPaymentsForRental(rentalId: unknown): PaymentRecord[] {
  const parsedRentalId = parseRentalId(rentalId);

  return getDatabase()
    .select()
    .from(payments)
    .where(eq(payments.rentalId, parsedRentalId))
    .orderBy(asc(payments.paymentDate), asc(payments.id))
    .all();
}

export function createPayment(input: unknown): PaymentRecord {
  const values = paymentInputSchema.parse(input);
  const now = new Date().toISOString();
  const settings = getShopSettings();

  if (!settings.enableClientDeposit && values.type === "deposit") {
    throw new Error("Client deposit is disabled in settings.");
  }

  try {
    return getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          status: rentals.status,
          totalAmount: rentals.totalAmount,
        })
        .from(rentals)
        .where(eq(rentals.id, values.rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status === "cancelled") {
        throw new Error("Cannot record payment for a cancelled rental.");
      }

      const payment = tx
        .insert(payments)
        .values({
          ...values,
          createdAt: now,
        })
        .returning()
        .get();

      const rentalPayments = tx
        .select()
        .from(payments)
        .where(eq(payments.rentalId, values.rentalId))
        .orderBy(desc(payments.createdAt))
        .all();
      const paidAmount = calculatePaidAmount(rentalPayments);
      const remainingAmount = calculateRemainingAmount(
        rental.totalAmount,
        paidAmount,
      );

      tx.update(rentals)
        .set({
          paidAmount,
          remainingAmount,
          updatedAt: now,
        })
        .where(eq(rentals.id, values.rentalId))
        .run();

      return payment;
    });
  } catch (error) {
    throw normalizePaymentServiceError(error);
  }
}

function parseRentalId(rentalId: unknown): number {
  const parsedRentalId = Number(rentalId);

  if (!Number.isInteger(parsedRentalId) || parsedRentalId <= 0) {
    throw new Error("Rental ID is invalid.");
  }

  return parsedRentalId;
}

export function listPayments(request?: PaymentListRequest): PageResult<PaymentListRecord> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const type = isPaymentType(request?.type) ? request.type : "all";
  const conditions: SQL[] = [];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);

    const searchFilter = or(
      like(rentals.contractNo, term),
      like(customers.fullName, term),
      like(vehicles.plateNumber, term),
      like(payments.notes, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (type !== "all") {
    conditions.push(eq(payments.type, type));
  }

  if (request?.dateFrom) {
    conditions.push(gte(payments.paymentDate, getLocalDateStart(request.dateFrom)));
  }

  if (request?.dateTo) {
    conditions.push(lt(payments.paymentDate, getLocalDateEnd(request.dateTo)));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total = db
    .select({ count: count() })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select({
      id: payments.id,
      rentalId: payments.rentalId,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
      type: payments.type,
      method: payments.method,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      notes: payments.notes,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(payments.paymentDate), desc(payments.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

function getLocalDateStart(date: string): string {
  return parseDateInput(date).toISOString();
}

function getLocalDateEnd(date: string): string {
  const end = parseDateInput(date);
  end.setDate(end.getDate() + 1);

  return end.toISOString();
}

function parseDateInput(value: string): Date {
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

  return date;
}

function isPaymentType(value: unknown): value is PaymentType {
  return (
    value === "rent" ||
    value === "deposit" ||
    value === "extra_charge" ||
    value === "refund"
  );
}

function normalizePaymentServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the payment details.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Payment could not be saved.");
}
