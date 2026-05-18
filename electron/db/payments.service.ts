import { asc, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculatePaidAmount,
  calculateRemainingAmount,
  type PaymentRecord,
  paymentInputSchema,
} from "../../src/shared/payments";
import { getDatabase } from "./database";
import { payments, rentals } from "./schema";

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

function normalizePaymentServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the payment details.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Payment could not be saved.");
}
