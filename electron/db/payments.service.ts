import { and, asc, count, desc, eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  assertRefundWithinPaidAmountMinor,
  calculatePaidAmountMinor,
  calculateRemainingAmountMinor,
  type PaymentListRecord,
  type PaymentListRequest,
  type PaymentRecord,
  type PaymentType,
  type PaymentVoidInput,
  type PaymentCorrectionInput,
  paymentInputSchema,
  paymentVoidInputSchema,
  paymentCorrectionInputSchema,
} from "../../src/shared/payments";
import {
  MONEY_MINOR_ZERO,
  fromMinorUnits,
  negateMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "../../src/shared/money";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { columnToMinor, moneyColumns } from "./money-write";
import { payments, rentals, customers, vehicles } from "./schema";
import { getShopSettings } from "./settings.service";
import { getNextSequenceValue } from "./numbering.service";
import { recordAppEvent } from "./events.service";
import { getCurrentUserForService, requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { requireSensitiveApproval } from "./security.service";
import {
  assertAccountingBalanceDeltasAllowed,
  getPaymentAccountingDeltas,
} from "./accounting.service";

export function listPaymentsForRental(rentalId: unknown): PaymentRecord[] {
  const parsedRentalId = parseRentalId(rentalId);

  return getDatabase()
    .select()
    .from(payments)
    .where(eq(payments.rentalId, parsedRentalId))
    .orderBy(asc(payments.paymentDate), asc(payments.id))
    .all()
    .map(toPaymentRecord);
}

/**
 * Stored integer in, major-unit record out.
 *
 * Built field by field rather than spread from the row: a spread would carry
 * both storage columns across the IPC boundary as invisible extras the declared
 * type never mentions, and the renderer would then have two more
 * plausible-looking amounts to pick the wrong one from.
 */
function toPaymentRecord(row: typeof payments.$inferSelect): PaymentRecord {
  return {
    id: row.id,
    rentalId: row.rentalId,
    type: row.type,
    method: row.method,
    amount: fromMinorUnits(paymentAmountMinor(row)),
    paymentDate: row.paymentDate,
    notes: row.notes,
    receiptNo: row.receiptNo,
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    correctedByPaymentId: row.correctedByPaymentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function paymentAmountMinor(row: { amountMinor: number }): MoneyMinor {
  return columnToMinor(row.amountMinor, "payments.amount_minor");
}

export function createPayment(input: unknown): PaymentRecord {
  requirePermissionForCurrentSession("payments.create");
  const values = paymentInputSchema.parse(input);
  if (values.type === "refund") {
    requirePermissionForCurrentSession("payments.refund");
  }
  const now = new Date().toISOString();
  const settings = getShopSettings();
  const actor = getCurrentUserForService();
  const amountMinor = toMinorUnits(values.amount, "Payment amount");

  if (!settings.enableClientDeposit && values.type === "deposit") {
    throw new Error("Client deposit is disabled in settings.");
  }

  try {
    return getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          status: rentals.status,
          totalAmountMinor: rentals.totalAmountMinor,
        })
        .from(rentals)
        .where(eq(rentals.id, values.rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status === "cancelled" || rental.status === "draft") {
        throw new Error("Cannot record payment for this rental.");
      }

      if (values.type === "refund") {
        const postedRentalPayments = tx
          .select({
            amountMinor: payments.amountMinor,
            status: payments.status,
            type: payments.type,
          })
          .from(payments)
          .where(
            and(
              eq(payments.rentalId, values.rentalId),
              eq(payments.status, "posted"),
            ),
          )
          .all()
          .map((payment) => ({
            ...payment,
            amountMinor: paymentAmountMinor(payment),
          }));

        assertRefundWithinPaidAmountMinor(
          amountMinor,
          calculatePaidAmountMinor(postedRentalPayments),
        );
        assertAccountingBalanceDeltasAllowed(
          getPaymentAccountingDeltas({ ...values, amountMinor }),
        );
      }

      const receiptNo = getNextSequenceValue(tx, "receipt", "RCP");
      const payment = tx
        .insert(payments)
        .values({
          ...values,
          ...moneyColumns("amount", amountMinor),
          receiptNo,
          status: "posted",
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      recalculateRentalPaymentState(
        tx,
        values.rentalId,
        rentalTotalMinor(rental),
        rental.status,
        now,
      );
      logAuditEvent(tx, {
        action: values.type === "refund" ? "payment.refunded" : "payment.created",
        entityType: "payment",
        entityId: payment.id,
        entityLabel: payment.receiptNo,
        summaryAr: `تم تسجيل دفعة ${payment.receiptNo ?? payment.id}`,
        summaryEn: `Payment ${payment.receiptNo ?? payment.id} was recorded.`,
        after: payment,
        metadata: { rentalId: values.rentalId },
      });

      return toPaymentRecord(payment);
    });
  } catch (error) {
    throw normalizePaymentServiceError(error);
  }
}

function rentalTotalMinor(rental: { totalAmountMinor: number }): MoneyMinor {
  return columnToMinor(rental.totalAmountMinor, "rentals.total_amount_minor");
}

export function voidPayment(input: unknown): PaymentRecord {
  requirePermissionForCurrentSession("payments.void");
  const values: PaymentVoidInput = paymentVoidInputSchema.parse(input);
  requireSensitiveApproval("payments.void", values.approvalToken);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const payment = tx
        .select()
        .from(payments)
        .where(eq(payments.id, values.paymentId))
        .get();

      if (!payment) {
        throw new Error("Payment was not found.");
      }

      if (payment.status === "voided") {
        throw new Error("Payment is already voided.");
      }

      // Voiding takes the payment back out of the location it landed in.
      assertAccountingBalanceDeltasAllowed(
        getPaymentAccountingDeltas({
          ...payment,
          amountMinor: paymentAmountMinor(payment),
        }).map((delta) => ({
          ...delta,
          amountMinor: negateMoney(delta.amountMinor),
        })),
      );

      const rental = tx
        .select({
          id: rentals.id,
          status: rentals.status,
          totalAmountMinor: rentals.totalAmountMinor,
        })
        .from(rentals)
        .where(eq(rentals.id, payment.rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      const updatedPayment = tx
        .update(payments)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(payments.id, values.paymentId))
        .returning()
        .get();

      recalculateRentalPaymentState(
        tx,
        rental.id,
        rentalTotalMinor(rental),
        rental.status,
        now,
      );
      recordAppEvent(tx, {
        eventType: "payment_voided",
        entityType: "payment",
        entityId: payment.id,
        severity: "warning",
        message: "Payment was voided.",
        details: { reason: values.reason, rentalId: rental.id },
      });
      logAuditEvent(tx, {
        action: "payment.voided",
        entityType: "payment",
        entityId: payment.id,
        entityLabel: updatedPayment.receiptNo,
        summaryAr: `تم إلغاء دفعة ${updatedPayment.receiptNo ?? updatedPayment.id}`,
        summaryEn: `Payment ${updatedPayment.receiptNo ?? updatedPayment.id} was voided.`,
        before: payment,
        after: updatedPayment,
        metadata: { rentalId: rental.id },
        reason: values.reason,
      });

      return toPaymentRecord(updatedPayment);
    });
  } catch (error) {
    throw normalizePaymentServiceError(error);
  }
}

export function correctPayment(input: unknown): PaymentRecord {
  requirePermissionForCurrentSession("payments.void");
  const values: PaymentCorrectionInput = paymentCorrectionInputSchema.parse(input);
  requireSensitiveApproval("payments.correct", values.approvalToken);
  if (values.replacement.type === "refund") {
    requirePermissionForCurrentSession("payments.refund");
  }
  const now = new Date().toISOString();
  const settings = getShopSettings();
  const actor = getCurrentUserForService();
  const replacementAmountMinor = toMinorUnits(
    values.replacement.amount,
    "Replacement payment amount",
  );

  if (!settings.enableClientDeposit && values.replacement.type === "deposit") {
    throw new Error("Client deposit is disabled in settings.");
  }

  try {
    return getDatabase().transaction((tx) => {
      const original = tx
        .select()
        .from(payments)
        .where(eq(payments.id, values.paymentId))
        .get();

      if (!original) {
        throw new Error("Payment was not found.");
      }

      if (original.status === "voided") {
        throw new Error("Payment is already voided.");
      }

      if (original.rentalId !== values.replacement.rentalId) {
        throw new Error("Replacement payment must belong to the same rental.");
      }

      const rental = tx
        .select({
          id: rentals.id,
          status: rentals.status,
          totalAmountMinor: rentals.totalAmountMinor,
        })
        .from(rentals)
        .where(eq(rentals.id, original.rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status === "cancelled" || rental.status === "draft") {
        throw new Error("Cannot correct payment for this rental.");
      }

      // The original is reversed and the replacement applied in one check, so a
      // correction that only moves money sideways is never refused.
      assertAccountingBalanceDeltasAllowed([
        ...getPaymentAccountingDeltas({
          ...original,
          amountMinor: paymentAmountMinor(original),
        }).map((delta) => ({
          ...delta,
          amountMinor: negateMoney(delta.amountMinor),
        })),
        ...getPaymentAccountingDeltas({
          ...values.replacement,
          amountMinor: replacementAmountMinor,
        }),
      ]);

      tx.update(payments)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(payments.id, values.paymentId))
        .run();

      const receiptNo = getNextSequenceValue(tx, "receipt", "RCP");
      const replacement = tx
        .insert(payments)
        .values({
          ...values.replacement,
          ...moneyColumns("amount", replacementAmountMinor),
          receiptNo,
          status: "posted",
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      tx.update(payments)
        .set({
          correctedByPaymentId: replacement.id,
          updatedAt: now,
        })
        .where(eq(payments.id, values.paymentId))
        .run();

      recalculateRentalPaymentState(
        tx,
        rental.id,
        rentalTotalMinor(rental),
        rental.status,
        now,
      );
      recordAppEvent(tx, {
        eventType: "payment_corrected",
        entityType: "payment",
        entityId: original.id,
        severity: "warning",
        message: "Payment was corrected.",
        details: {
          reason: values.reason,
          replacementPaymentId: replacement.id,
          rentalId: rental.id,
        },
      });
      logAuditEvent(tx, {
        action: "payment.corrected",
        entityType: "payment",
        entityId: original.id,
        entityLabel: replacement.receiptNo,
        summaryAr: "تم تصحيح دفعة",
        summaryEn: "Payment was corrected.",
        before: original,
        after: replacement,
        metadata: {
          reason: values.reason,
          replacementPaymentId: replacement.id,
          rentalId: rental.id,
        },
        reason: values.reason,
      });

      return toPaymentRecord(replacement);
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
      receiptNo: payments.receiptNo,
      status: payments.status,
      amountMinor: payments.amountMinor,
      paymentDate: payments.paymentDate,
      notes: payments.notes,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
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

  return createPageResult(
    rows.map(({ amountMinor, ...row }) => ({
      ...row,
      amount: fromMinorUnits(columnToMinor(amountMinor, "payments.amount_minor")),
    })),
    total,
    pageRequest,
  );
}

type PaymentTx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

/**
 * Rewrites the rental's balance from its payments.
 *
 * Paid is posted payments minus posted refunds; remaining is the rental total
 * minus paid, and a cancelled rental owes nothing regardless. All three are
 * integer arithmetic, so a rental settled by many part payments lands on
 * exactly zero rather than a fraction of a cent away from it.
 */
export function recalculateRentalPaymentState(
  tx: PaymentTx,
  rentalId: number,
  totalAmountMinor: MoneyMinor,
  rentalStatus: "draft" | "active" | "returned" | "cancelled" | "overdue",
  updatedAt: string,
): void {
  const rentalPayments = tx
    .select()
    .from(payments)
    .where(eq(payments.rentalId, rentalId))
    .orderBy(desc(payments.createdAt))
    .all()
    .map((payment) => ({
      ...payment,
      amountMinor: paymentAmountMinor(payment),
    }));
  const paidAmountMinor = calculatePaidAmountMinor(rentalPayments);
  const remainingAmountMinor =
    rentalStatus === "cancelled"
      ? MONEY_MINOR_ZERO
      : calculateRemainingAmountMinor(totalAmountMinor, paidAmountMinor);
  const depositPaidMinor = sumMoney(
    rentalPayments
      .filter((payment) => payment.status !== "voided" && payment.type === "deposit")
      .map((payment) => payment.amountMinor),
    "the deposit paid",
  );

  tx.update(rentals)
    .set({
      ...moneyColumns("depositPaid", depositPaidMinor),
      ...moneyColumns("paidAmount", paidAmountMinor),
      ...moneyColumns("remainingAmount", remainingAmountMinor),
      updatedAt,
    })
    .where(eq(rentals.id, rentalId))
    .run();
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
