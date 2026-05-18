import { z } from "zod";

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
  createdAt: string;
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

export function getDefaultPaymentFormValues(): PaymentFormValues {
  return {
    type: "rent",
    method: "cash",
    amount: "",
    paymentDate: toDatetimeLocalValue(roundToNearestMinutes(new Date(), 15)),
    notes: "",
  };
}

export function calculatePaidAmount(
  payments: Pick<PaymentRecord, "type" | "amount">[],
): number {
  return roundMoney(
    payments.reduce((total, payment) => {
      if (payment.type === "refund") {
        return total - payment.amount;
      }

      return total + payment.amount;
    }, 0),
  );
}

export function calculateRemainingAmount(
  totalAmount: number,
  paidAmount: number,
): number {
  return roundMoney(totalAmount - paidAmount);
}

export function formatPaymentType(type: PaymentType): string {
  const labels: Record<PaymentType, string> = {
    rent: "Rent",
    deposit: "Deposit",
    extra_charge: "Extra Charge",
    refund: "Refund",
  };

  return labels[type];
}

export function formatPaymentMethod(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    cash: "Cash",
    card: "Card",
    bank_transfer: "Bank Transfer",
    other: "Other",
  };

  return labels[method];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
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
