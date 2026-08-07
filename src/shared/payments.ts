import { z } from "zod";
import { translate } from "./i18n";
import type { LanguageCode } from "./language";
import {
  MONEY_MINOR_ZERO,
  fromMinorUnits,
  maxMoney,
  negateMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "./money";
import type { PageRequest } from "./pagination";
import { approvalTokenSchema } from "./security";

export const paymentTypeValues = [
  "rent",
  "deposit",
  "extra_charge",
  "refund",
] as const;

export const paymentMethodValues = [
  "cash",
  "card",
  "bank_transfer",
  "other",
] as const;

export type PaymentType = (typeof paymentTypeValues)[number];
export type PaymentMethod = (typeof paymentMethodValues)[number];
export type PaymentStatus = "posted" | "voided";

export type PaymentTypeFilter = "all" | PaymentType;

export type PaymentListRequest = PageRequest & {
  type?: PaymentTypeFilter;
  dateFrom?: string;
  dateTo?: string;
};

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

const requiredMoneyField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue) || numberValue <= 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be more than zero.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });

const datetimeField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): string => {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        context.addIssue({
          code: "custom",
          message: `${label} must be a valid date and time.`,
        });

        return z.NEVER;
      }

      return date.toISOString();
    });

export const paymentInputSchema = z.object({
  rentalId: z.number().int().positive("Rental is required."),
  type: z.enum(paymentTypeValues),
  method: z.enum(paymentMethodValues),
  amount: z.number().finite().positive("Amount must be more than zero."),
  paymentDate: z.string().datetime(),
  notes: z.string().trim().max(500).nullable(),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;

export type PaymentRecord = PaymentInput & {
  id: number;
  receiptNo: string | null;
  status: "posted" | "voided";
  voidedAt: string | null;
  voidReason: string | null;
  correctedByPaymentId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentListRecord = {
  id: number;
  rentalId: number;
  contractNo: string;
  customerName: string;
  vehiclePlateNumber: string;
  type: PaymentType;
  method: PaymentMethod;
  receiptNo: string | null;
  status: "posted" | "voided";
  amount: number;
  paymentDate: string;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

export type PaymentFormValues = {
  type: PaymentType;
  method: PaymentMethod;
  amount: string;
  paymentDate: string;
  notes: string;
};

export const paymentFormSchema = z
  .object({
    type: z.enum(paymentTypeValues),
    method: z.enum(paymentMethodValues),
    amount: requiredMoneyField("Amount"),
    paymentDate: datetimeField("Payment date"),
    notes: optionalTextField(500),
  })
  .transform((values) => values);

export type PaymentFormInput = z.infer<typeof paymentFormSchema>;

export const paymentVoidInputSchema = z.object({
  paymentId: z.number().int().positive("Payment is required."),
  reason: z.string().trim().min(1, "Void reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export type PaymentVoidInput = z.infer<typeof paymentVoidInputSchema>;

export const paymentCorrectionInputSchema = z.object({
  paymentId: z.number().int().positive("Payment is required."),
  reason: z.string().trim().min(1, "Correction reason is required.").max(500),
  replacement: paymentInputSchema,
  approvalToken: approvalTokenSchema.optional(),
});

export type PaymentCorrectionInput = z.infer<typeof paymentCorrectionInputSchema>;

export function getDefaultPaymentFormValues(): PaymentFormValues {
  return {
    type: "rent",
    method: "cash",
    amount: "",
    paymentDate: toDatetimeLocalValue(roundToNearestMinutes(new Date(), 15)),
    notes: "",
  };
}

/** A payment as the balance rules see it: a stored positive amount plus the
 * type and status that decide its sign and whether it counts at all. */
export type PaymentAmountMinor = {
  type: PaymentType;
  amountMinor: MoneyMinor;
  status?: PaymentStatus;
};

/**
 * Posted payments minus posted refunds.
 *
 * Refunds are stored as positive amounts — a shop reads "refund 50", not
 * "payment -50" — so the type, not the sign, decides the direction.
 */
export function calculatePaidAmountMinor(
  payments: readonly PaymentAmountMinor[],
): MoneyMinor {
  return sumMoney(
    payments.flatMap((payment) => {
      if (payment.status === "voided") {
        return [];
      }

      return [
        payment.type === "refund"
          ? negateMoney(payment.amountMinor)
          : payment.amountMinor,
      ];
    }),
    "the paid total",
  );
}

/** Major-unit view for the renderer; the shop never sees minor units. */
export function calculatePaidAmount(
  payments: (Pick<PaymentRecord, "type" | "amount"> &
    Partial<Pick<PaymentRecord, "status">>)[],
): number {
  return fromMinorUnits(
    calculatePaidAmountMinor(
      payments.map((payment) => ({
        type: payment.type,
        status: payment.status,
        amountMinor: toMinorUnits(payment.amount),
      })),
    ),
  );
}

export function assertRefundWithinPaidAmountMinor(
  refundAmountMinor: MoneyMinor,
  totalPaidForRentalMinor: MoneyMinor,
): void {
  if (refundAmountMinor > maxMoney(totalPaidForRentalMinor, MONEY_MINOR_ZERO)) {
    throw new Error(
      "Refund amount cannot exceed total posted payments for this rental.",
    );
  }
}

export function assertRefundWithinPaidAmount(
  refundAmount: number,
  totalPaidForRental: number,
): void {
  assertRefundWithinPaidAmountMinor(
    toMinorUnits(refundAmount),
    toMinorUnits(totalPaidForRental),
  );
}

export function calculateRemainingAmountMinor(
  totalAmountMinor: MoneyMinor,
  paidAmountMinor: MoneyMinor,
): MoneyMinor {
  return subtractMoney(totalAmountMinor, paidAmountMinor);
}

export function calculateRemainingAmount(
  totalAmount: number,
  paidAmount: number,
): number {
  return fromMinorUnits(
    calculateRemainingAmountMinor(
      toMinorUnits(totalAmount),
      toMinorUnits(paidAmount),
    ),
  );
}

export function formatPaymentType(
  type: PaymentType,
  language: LanguageCode = "en",
): string {
  const labels: Record<PaymentType, string> = {
    rent: "Rent",
    deposit: "Deposit",
    extra_charge: "Extra Charge",
    refund: "Refund",
  };

  return translate(language, labels[type]);
}

export function formatPaymentMethod(
  method: PaymentMethod,
  language: LanguageCode = "en",
): string {
  const labels: Record<PaymentMethod, string> = {
    cash: "Cash",
    card: "Card",
    bank_transfer: "Bank Transfer",
    other: "Other",
  };

  return translate(language, labels[method]);
}

function roundToNearestMinutes(date: Date, minutes: number): Date {
  const interval = minutes * 60 * 1000;

  return new Date(Math.ceil(date.getTime() / interval) * interval);
}

function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
