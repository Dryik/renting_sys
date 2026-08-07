import { z } from "zod";
import {
  moneyLocationValues,
  type MoneyLocation,
} from "./accounting";
import {
  MONEY_MINOR_ZERO,
  fromMinorUnits,
  maxMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "./money";
import type { PageRequest } from "./pagination";
import { paymentMethodValues, type PaymentMethod } from "./payments";
import { approvalTokenSchema } from "./security";

export const employeeLoanStatusValues = ["open", "paid", "voided"] as const;
export type EmployeeLoanStatus = (typeof employeeLoanStatusValues)[number];

export type EmployeeLoanListRequest = PageRequest & {
  status?: "all" | EmployeeLoanStatus;
};

export type EmployeeLoanEmployeeOption = {
  id: number;
  fullName: string;
  username: string;
};

export type EmployeeLoanRecord = {
  id: number;
  loanNo: string;
  employeeUserId: number;
  employeeName: string;
  employeeUsername: string;
  amount: number;
  issuedAt: string;
  sourceLocation: MoneyLocation;
  remainingAmount: number;
  status: EmployeeLoanStatus;
  notes: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeLoanPaymentRecord = {
  id: number;
  loanId: number;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  location: MoneyLocation;
  status: "posted" | "voided";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const employeeLoanInputSchema = z.object({
  employeeUserId: z.number().int().positive("Employee is required."),
  amount: z.number().finite().positive("Amount must be more than zero."),
  issuedAt: z.string().datetime(),
  sourceLocation: z.enum(moneyLocationValues),
  notes: z.string().trim().max(500).nullable(),
  approvalToken: approvalTokenSchema.optional(),
});

export type EmployeeLoanInput = z.infer<typeof employeeLoanInputSchema>;

export const employeeLoanRepaymentInputSchema = z.object({
  loanId: z.number().int().positive("Loan is required."),
  amount: z.number().finite().positive("Amount must be more than zero."),
  paymentDate: z.string().datetime(),
  method: z.enum(paymentMethodValues),
  location: z.enum(moneyLocationValues),
  notes: z.string().trim().max(500).nullable(),
});

export type EmployeeLoanRepaymentInput = z.infer<
  typeof employeeLoanRepaymentInputSchema
>;

export const employeeLoanVoidInputSchema = z.object({
  loanId: z.number().int().positive("Loan is required."),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export type EmployeeLoanVoidInput = z.infer<typeof employeeLoanVoidInputSchema>;

export type EmployeeLoanFormValues = {
  employeeUserId: string;
  amount: string;
  issuedAt: string;
  sourceLocation: MoneyLocation;
  notes: string;
};

export type EmployeeLoanRepaymentFormValues = {
  amount: string;
  paymentDate: string;
  method: PaymentMethod;
  location: MoneyLocation;
  notes: string;
};

const requiredMoneyString = (label: string) =>
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

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

export const employeeLoanFormSchema = z
  .object({
    employeeUserId: z
      .string()
      .trim()
      .min(1, "Employee is required.")
      .transform((value, context): number => {
        const numberValue = Number(value);

        if (!Number.isInteger(numberValue) || numberValue <= 0) {
          context.addIssue({
            code: "custom",
            message: "Employee is required.",
          });

          return z.NEVER;
        }

        return numberValue;
      }),
    amount: requiredMoneyString("Amount"),
    issuedAt: datetimeField("Loan date"),
    sourceLocation: z.enum(moneyLocationValues),
    notes: optionalTextField(500),
  })
  .transform((values) => employeeLoanInputSchema.parse(values));

export const employeeLoanRepaymentFormSchema = z
  .object({
    amount: requiredMoneyString("Amount"),
    paymentDate: datetimeField("Payment date"),
    method: z.enum(paymentMethodValues),
    location: z.enum(moneyLocationValues),
    notes: optionalTextField(500),
  })
  .transform((values) => values);

export function getDefaultEmployeeLoanFormValues(): EmployeeLoanFormValues {
  return {
    employeeUserId: "",
    amount: "",
    issuedAt: toDatetimeLocalValue(new Date()),
    sourceLocation: "cash_drawer",
    notes: "",
  };
}

export function getDefaultEmployeeLoanRepaymentFormValues():
  EmployeeLoanRepaymentFormValues {
  return {
    amount: "",
    paymentDate: toDatetimeLocalValue(new Date()),
    method: "cash",
    location: "cash_drawer",
    notes: "",
  };
}

export type EmployeeLoanRepaymentMinor = {
  amountMinor: MoneyMinor;
  status?: "posted" | "voided";
};

/** Never below zero: an overpaid loan is settled, not owed backwards. */
export function calculateEmployeeLoanRemainingMinor(
  amountMinor: MoneyMinor,
  repayments: readonly EmployeeLoanRepaymentMinor[],
): MoneyMinor {
  const paidMinor = sumMoney(
    repayments.flatMap((repayment) =>
      repayment.status === "voided" ? [] : [repayment.amountMinor],
    ),
    "the loan repayments",
  );

  return maxMoney(subtractMoney(amountMinor, paidMinor), MONEY_MINOR_ZERO);
}

export function calculateEmployeeLoanRemaining(
  amount: number,
  repayments: Array<{ amount: number; status?: "posted" | "voided" }>,
): number {
  return fromMinorUnits(
    calculateEmployeeLoanRemainingMinor(
      toMinorUnits(amount),
      repayments.map((repayment) => ({
        amountMinor: toMinorUnits(repayment.amount),
        status: repayment.status,
      })),
    ),
  );
}

export function getEmployeeLoanStatusMinor(
  amountMinor: MoneyMinor,
  repayments: readonly EmployeeLoanRepaymentMinor[],
): EmployeeLoanStatus {
  return calculateEmployeeLoanRemainingMinor(amountMinor, repayments) === 0
    ? "paid"
    : "open";
}

export function getEmployeeLoanStatus(
  amount: number,
  repayments: Array<{ amount: number; status?: "posted" | "voided" }>,
): EmployeeLoanStatus {
  return calculateEmployeeLoanRemaining(amount, repayments) === 0 ? "paid" : "open";
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
