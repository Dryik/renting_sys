import { z } from "zod";
import {
  paymentMethodValues,
  type PaymentMethod,
} from "./payments";
import type { LanguageCode } from "./language";
import {
  MONEY_MINOR_ZERO,
  addMoney,
  fromMinorUnits,
  negateMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "./money";
import type { PageRequest } from "./pagination";
import { approvalTokenSchema } from "./security";
import { translate } from "./i18n";

export const moneyLocationValues = [
  "cash_drawer",
  "shop_safe",
  "bank",
] as const;

export const expenseCategoryValues = [
  "fuel",
  "wash",
  "parts",
  "maintenance",
  "insurance",
  "registration",
  "office",
  "other",
] as const;

export const cashMovementTypeValues = [
  "transfer",
  "owner_withdrawal",
] as const;

export const accountingAdjustmentDirectionValues = [
  "increase",
  "decrease",
] as const;

export const accountingStatusValues = ["posted", "voided"] as const;

export const accountingTransactionKindValues = [
  "all",
  "money_in",
  "money_out",
  "transfer",
  "adjustment",
] as const;

export type MoneyLocation = (typeof moneyLocationValues)[number];
export type ExpenseCategory = (typeof expenseCategoryValues)[number];
export type CashMovementType = (typeof cashMovementTypeValues)[number];
export type AccountingAdjustmentDirection =
  (typeof accountingAdjustmentDirectionValues)[number];
export type AccountingStatus = (typeof accountingStatusValues)[number];
export type AccountingTransactionKind =
  (typeof accountingTransactionKindValues)[number];

export type AccountingListRequest = PageRequest & {
  dateFrom?: string;
  dateTo?: string;
  kind?: AccountingTransactionKind;
};

export type AccountingSummaryRequest = {
  dateFrom?: string;
  dateTo?: string;
};

export type ExpenseInput = {
  category: ExpenseCategory;
  location: MoneyLocation;
  method: PaymentMethod;
  amount: number;
  expenseDate: string;
  vendorName: string | null;
  vehicleId: number | null;
  notes: string | null;
};

export type ExpenseRecord = ExpenseInput & {
  id: number;
  status: AccountingStatus;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseListRecord = ExpenseRecord & {
  vehiclePlateNumber: string | null;
};

export type CashMovementInput = {
  type: CashMovementType;
  fromLocation: MoneyLocation;
  toLocation: MoneyLocation | null;
  amount: number;
  movementDate: string;
  notes: string | null;
};

export type CashMovementRecord = CashMovementInput & {
  id: number;
  status: AccountingStatus;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingAdjustmentInput = {
  location: MoneyLocation;
  direction: AccountingAdjustmentDirection;
  amount: number;
  adjustmentDate: string;
  reason: string;
  notes: string | null;
};

export type AccountingAdjustmentRecord = AccountingAdjustmentInput & {
  id: number;
  status: AccountingStatus;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingVoidInput = {
  id: number;
  reason: string;
  approvalToken?: string;
};

export type AccountingDailyClosingInput = {
  closingDate: string;
  countedCash: number;
  notes: string | null;
  reason?: string;
};

export type AccountingDailyClosingSaveInput = AccountingDailyClosingInput & {
  approvalToken?: string;
};

export type AccountingDailyClosingRecord = {
  closingDate: string;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  notes: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  isClosed: boolean;
};

export type StaffDailyClosingInput = {
  closingDate: string;
  countedCash: number;
  notes: string | null;
};

export type StaffDailyClosingRecord = {
  closingDate: string;
  countedCash: number;
  notes: string | null;
  closedAt: string;
  isClosed: true;
};

export type WeeklyIncomeDayRecord = {
  date: string;
  rent: number;
  deposit: number;
  extraCharge: number;
  refunds: number;
  netIncome: number;
};

export type AccountingTransactionRecord = {
  id: string;
  source:
    | "payment"
    | "vehicle_sale"
    | "expense"
    | "cash_movement"
    | "adjustment"
    | "employee_loan";
  sourceId: number;
  occurredAt: string;
  kind: Exclude<AccountingTransactionKind, "all">;
  title: string;
  detail: string;
  amount: number;
  status: AccountingStatus;
  location: MoneyLocation | null;
  fromLocation: MoneyLocation | null;
  toLocation: MoneyLocation | null;
  notes: string | null;
};

export type LocationBalances = Record<MoneyLocation, number>;
export type LocationBalancesMinor = Record<MoneyLocation, MoneyMinor>;

export type AccountingBalanceInput = {
  kind: Exclude<AccountingTransactionKind, "all">;
  amount: number;
  status?: AccountingStatus;
  location?: MoneyLocation | null;
  fromLocation?: MoneyLocation | null;
  toLocation?: MoneyLocation | null;
  outflowType?: "refund" | "expense" | "owner_withdrawal";
  adjustmentDirection?: AccountingAdjustmentDirection;
};

export type AccountingBalanceInputMinor = Omit<AccountingBalanceInput, "amount"> & {
  amountMinor: MoneyMinor;
};

export type AccountingBalanceDelta = {
  location: MoneyLocation;
  amount: number;
};

export type AccountingBalanceDeltaMinor = {
  location: MoneyLocation;
  amountMinor: MoneyMinor;
};

export type AccountingTotals = {
  moneyIn: number;
  refunds: number;
  expenses: number;
  ownerWithdrawals: number;
  netAfterExpenses: number;
};

export type AccountingTotalsMinor = {
  moneyInMinor: MoneyMinor;
  refundsMinor: MoneyMinor;
  expensesMinor: MoneyMinor;
  ownerWithdrawalsMinor: MoneyMinor;
  netAfterExpensesMinor: MoneyMinor;
};

export type AccountingSummary = AccountingTotals & {
  cashDrawer: number;
  shopSafe: number;
  bank: number;
  expectedCash: number;
  outstandingBalances: number;
  depositsHeld: number;
};

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

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

const optionalVehicleId = z
  .string()
  .trim()
  .transform((value, context): number | null => {
    if (value === "") {
      return null;
    }

    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      context.addIssue({
        code: "custom",
        message: "Vehicle is invalid.",
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

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date.`);

export const expenseInputSchema = z.object({
  category: z.enum(expenseCategoryValues),
  location: z.enum(moneyLocationValues),
  method: z.enum(paymentMethodValues).optional(),
  amount: z.number().finite().positive("Amount must be more than zero."),
  expenseDate: z.string().datetime(),
  vendorName: z.string().trim().max(120).nullable(),
  vehicleId: z.number().int().positive().nullable(),
  notes: z.string().trim().max(500).nullable(),
}).transform((values): ExpenseInput => ({
  ...values,
  method: getExpensePaymentMethodForLocation(values.location),
}));

export const expenseFormSchema = z
  .object({
    category: z.enum(expenseCategoryValues),
    location: z.enum(moneyLocationValues),
    amount: requiredMoneyString("Amount"),
    expenseDate: datetimeField("Expense date"),
    vendorName: optionalTextField(120),
    vehicleId: optionalVehicleId,
    notes: optionalTextField(500),
  })
  .transform((values): ExpenseInput => ({
    ...values,
    method: getExpensePaymentMethodForLocation(values.location),
  }));

export type ExpenseFormValues = z.input<typeof expenseFormSchema>;

export const cashMovementInputSchema = z
  .object({
    type: z.enum(cashMovementTypeValues),
    fromLocation: z.enum(moneyLocationValues),
    toLocation: z.enum(moneyLocationValues).nullable(),
    amount: z.number().finite().positive("Amount must be more than zero."),
    movementDate: z.string().datetime(),
    notes: z.string().trim().max(500).nullable(),
  })
  .superRefine((values, context) => {
    if (values.type === "transfer") {
      if (!values.toLocation) {
        context.addIssue({
          code: "custom",
          message: "Destination is required.",
          path: ["toLocation"],
        });
      } else if (values.fromLocation === values.toLocation) {
        context.addIssue({
          code: "custom",
          message: "Choose two different money locations.",
          path: ["toLocation"],
        });
      }
    }

    if (values.type === "owner_withdrawal" && values.toLocation) {
      context.addIssue({
        code: "custom",
        message: "Owner withdrawals cannot have a destination.",
        path: ["toLocation"],
      });
    }
  });

export const cashMovementFormSchema = z
  .object({
    type: z.enum(cashMovementTypeValues),
    fromLocation: z.enum(moneyLocationValues),
    toLocation: z.enum(moneyLocationValues).or(z.literal("")),
    amount: requiredMoneyString("Amount"),
    movementDate: datetimeField("Movement date"),
    notes: optionalTextField(500),
  })
  .transform((values): CashMovementInput => ({
    ...values,
    toLocation: values.toLocation === "" ? null : values.toLocation,
  }))
  .pipe(cashMovementInputSchema);

export type CashMovementFormValues = z.input<typeof cashMovementFormSchema>;

export const accountingAdjustmentInputSchema = z.object({
  location: z.enum(moneyLocationValues),
  direction: z.enum(accountingAdjustmentDirectionValues),
  amount: z.number().finite().positive("Amount must be more than zero."),
  adjustmentDate: z.string().datetime(),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  notes: z.string().trim().max(500).nullable(),
});

export const accountingAdjustmentFormSchema = z.object({
  location: z.enum(moneyLocationValues),
  direction: z.enum(accountingAdjustmentDirectionValues),
  amount: requiredMoneyString("Amount"),
  adjustmentDate: datetimeField("Adjustment date"),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  notes: optionalTextField(500),
});

export type AccountingAdjustmentFormValues =
  z.input<typeof accountingAdjustmentFormSchema>;

export const accountingVoidInputSchema = z.object({
  id: z.number().int().positive("Record is required."),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export const accountingDailyClosingSaveInputSchema = z.object({
  closingDate: dateField("Closing date"),
  countedCash: z.number().finite().min(0, "Counted cash must be zero or more."),
  notes: z.string().trim().max(500).nullable(),
  reason: z.string().trim().max(500).optional(),
  approvalToken: approvalTokenSchema.optional(),
});

export const staffDailyClosingInputSchema = z.object({
  closingDate: dateField("Closing date"),
  countedCash: z.number().finite().min(0, "Counted cash must be zero or more."),
  notes: z.string().trim().max(500).nullable(),
});

export function getDefaultExpenseFormValues(): ExpenseFormValues {
  return {
    category: "fuel",
    location: "cash_drawer",
    amount: "",
    expenseDate: toDatetimeLocalValue(new Date()),
    vendorName: "",
    vehicleId: "",
    notes: "",
  };
}

export function getDefaultAccountingAdjustmentFormValues():
  AccountingAdjustmentFormValues {
  return {
    location: "cash_drawer",
    direction: "increase",
    amount: "",
    adjustmentDate: toDatetimeLocalValue(new Date()),
    reason: "",
    notes: "",
  };
}

export function getDefaultCashMovementFormValues(
  type: CashMovementType,
): CashMovementFormValues {
  return {
    type,
    fromLocation: type === "owner_withdrawal" ? "shop_safe" : "cash_drawer",
    toLocation: type === "owner_withdrawal" ? "" : "shop_safe",
    amount: "",
    movementDate: toDatetimeLocalValue(new Date()),
    notes: "",
  };
}

export function getExpensePaymentMethodForLocation(
  location: MoneyLocation,
): PaymentMethod {
  return location === "bank" ? "bank_transfer" : "cash";
}

export function getPaymentMoneyLocation(method: PaymentMethod): MoneyLocation {
  if (method === "card" || method === "bank_transfer") {
    return "bank";
  }

  return "cash_drawer";
}

export function calculateLocationBalancesMinor(
  transactions: readonly AccountingBalanceInputMinor[],
): LocationBalancesMinor {
  const balances: Record<MoneyLocation, MoneyMinor> = {
    bank: MONEY_MINOR_ZERO,
    cash_drawer: MONEY_MINOR_ZERO,
    shop_safe: MONEY_MINOR_ZERO,
  };
  const add = (location: MoneyLocation, amount: MoneyMinor): void => {
    balances[location] = addMoney(balances[location], amount);
  };

  for (const transaction of transactions) {
    if (transaction.status === "voided") {
      continue;
    }

    if (transaction.kind === "money_in" && transaction.location) {
      add(transaction.location, transaction.amountMinor);
    }

    if (transaction.kind === "money_out" && transaction.location) {
      add(transaction.location, negateMoney(transaction.amountMinor));
    }

    if (transaction.kind === "transfer") {
      if (transaction.fromLocation) {
        add(transaction.fromLocation, negateMoney(transaction.amountMinor));
      }

      if (transaction.toLocation) {
        add(transaction.toLocation, transaction.amountMinor);
      }
    }

    if (transaction.kind === "adjustment" && transaction.location) {
      add(
        transaction.location,
        transaction.adjustmentDirection === "decrease"
          ? negateMoney(transaction.amountMinor)
          : transaction.amountMinor,
      );
    }
  }

  return balances;
}

export function calculateLocationBalances(
  transactions: AccountingBalanceInput[],
): LocationBalances {
  return fromBalancesMinor(
    calculateLocationBalancesMinor(transactions.map(toBalanceInputMinor)),
  );
}

export function applyBalanceDeltasMinor(
  balances: LocationBalancesMinor,
  deltas: readonly AccountingBalanceDeltaMinor[],
): LocationBalancesMinor {
  const projected = { ...balances };

  for (const delta of deltas) {
    projected[delta.location] = addMoney(
      projected[delta.location],
      delta.amountMinor,
    );
  }

  return projected;
}

export function applyBalanceDeltas(
  balances: LocationBalances,
  deltas: AccountingBalanceDelta[],
): LocationBalances {
  return fromBalancesMinor(
    applyBalanceDeltasMinor(
      toBalancesMinor(balances),
      deltas.map((delta) => ({
        location: delta.location,
        amountMinor: toMinorUnits(delta.amount),
      })),
    ),
  );
}

export function getNegativeBalanceLocationsMinor(
  balances: LocationBalancesMinor,
): MoneyLocation[] {
  return moneyLocationValues.filter((location) => balances[location] < 0);
}

export function getNegativeBalanceLocations(
  balances: LocationBalances,
): MoneyLocation[] {
  return moneyLocationValues.filter((location) => balances[location] < 0);
}

export function calculateAccountingTotalsMinor(
  transactions: readonly AccountingBalanceInputMinor[],
): AccountingTotalsMinor {
  const moneyIn: MoneyMinor[] = [];
  const refunds: MoneyMinor[] = [];
  const expenses: MoneyMinor[] = [];
  const ownerWithdrawals: MoneyMinor[] = [];

  for (const transaction of transactions) {
    if (transaction.status === "voided") {
      continue;
    }

    if (transaction.kind === "money_in") {
      moneyIn.push(transaction.amountMinor);
    }

    if (transaction.kind === "money_out") {
      if (transaction.outflowType === "refund") {
        refunds.push(transaction.amountMinor);
      } else if (transaction.outflowType === "owner_withdrawal") {
        ownerWithdrawals.push(transaction.amountMinor);
      } else {
        expenses.push(transaction.amountMinor);
      }
    }
  }

  const moneyInMinor = sumMoney(moneyIn, "money in");
  const refundsMinor = sumMoney(refunds, "refunds");
  const expensesMinor = sumMoney(expenses, "expenses");

  return {
    moneyInMinor,
    refundsMinor,
    expensesMinor,
    ownerWithdrawalsMinor: sumMoney(ownerWithdrawals, "owner withdrawals"),
    netAfterExpensesMinor: subtractMoney(
      subtractMoney(moneyInMinor, refundsMinor),
      expensesMinor,
    ),
  };
}

export function calculateAccountingTotals(
  transactions: AccountingBalanceInput[],
): AccountingTotals {
  return fromTotalsMinor(
    calculateAccountingTotalsMinor(transactions.map(toBalanceInputMinor)),
  );
}

/** Counted minus expected, so a short drawer reads as a negative difference. */
export function calculateDailyClosingDifferenceMinor(
  expectedCashMinor: MoneyMinor,
  countedCashMinor: MoneyMinor,
): MoneyMinor {
  return subtractMoney(countedCashMinor, expectedCashMinor);
}

export function calculateDailyClosingDifference(
  expectedCash: number,
  countedCash: number,
): number {
  return fromMinorUnits(
    calculateDailyClosingDifferenceMinor(
      toMinorUnits(expectedCash),
      toMinorUnits(countedCash),
    ),
  );
}

export function toBalancesMinor(balances: LocationBalances): LocationBalancesMinor {
  return {
    bank: toMinorUnits(balances.bank),
    cash_drawer: toMinorUnits(balances.cash_drawer),
    shop_safe: toMinorUnits(balances.shop_safe),
  };
}

export function fromBalancesMinor(balances: LocationBalancesMinor): LocationBalances {
  return {
    bank: fromMinorUnits(balances.bank),
    cash_drawer: fromMinorUnits(balances.cash_drawer),
    shop_safe: fromMinorUnits(balances.shop_safe),
  };
}

export function fromTotalsMinor(totals: AccountingTotalsMinor): AccountingTotals {
  return {
    moneyIn: fromMinorUnits(totals.moneyInMinor),
    refunds: fromMinorUnits(totals.refundsMinor),
    expenses: fromMinorUnits(totals.expensesMinor),
    ownerWithdrawals: fromMinorUnits(totals.ownerWithdrawalsMinor),
    netAfterExpenses: fromMinorUnits(totals.netAfterExpensesMinor),
  };
}

function toBalanceInputMinor(
  transaction: AccountingBalanceInput,
): AccountingBalanceInputMinor {
  const { amount, ...rest } = transaction;

  return { ...rest, amountMinor: toMinorUnits(amount) };
}

export function formatMoneyLocation(
  location: MoneyLocation,
  language: LanguageCode = "en",
): string {
  const labels: Record<MoneyLocation, string> = {
    bank: "Bank",
    cash_drawer: "Cash Drawer",
    shop_safe: "Shop Safe",
  };

  return translate(language, labels[location]);
}

export function formatExpenseCategory(
  category: ExpenseCategory,
  language: LanguageCode = "en",
): string {
  const labels: Record<ExpenseCategory, string> = {
    fuel: "Fuel",
    insurance: "Insurance",
    maintenance: "Maintenance",
    office: "Office",
    other: "Other",
    parts: "Parts",
    registration: "Registration",
    wash: "Wash",
  };

  return translate(language, labels[category]);
}

export function formatCashMovementType(
  type: CashMovementType,
  language: LanguageCode = "en",
): string {
  const labels: Record<CashMovementType, string> = {
    owner_withdrawal: "Owner Withdrawal",
    transfer: "Move Cash",
  };

  return translate(language, labels[type]);
}

export function formatAccountingAdjustmentDirection(
  direction: AccountingAdjustmentDirection,
  language: LanguageCode = "en",
): string {
  const labels: Record<AccountingAdjustmentDirection, string> = {
    decrease: "Decrease Balance",
    increase: "Increase Balance",
  };

  return translate(language, labels[direction]);
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
