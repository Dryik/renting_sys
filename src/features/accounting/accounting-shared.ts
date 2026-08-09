import {
  expenseCategoryValues,
  formatCashMovementType,
  formatExpenseCategory,
  formatMoneyLocation,
  getExpensePaymentMethodForLocation,
  type AccountingSummary,
  type AccountingTransactionKind,
  type AccountingTransactionRecord,
  type CashMovementType,
  type ExpenseCategory,
  type ExpenseListRecord,
  type LocationBalances,
  type MoneyLocation,
} from "@/shared/accounting";
import {
  type EmployeeLoanRecord,
  type EmployeeLoanRepaymentInput,
} from "@/shared/employee-loans";
import type { PageResult } from "@/shared/pagination";
import type { SensitiveAction } from "@/shared/security";

/**
 * Types, empty page shapes and pure helpers shared by the accounting screens.
 *
 * None of it fetches or renders; it is the vocabulary the owner page, the staff
 * page and the loans section all speak.
 */
export type AccountingSection =
  | "today"
  | "transactions"
  | "expenses"
  | "loans"
  | "balances";

export type FormState =
  | { type: "expense" }
  | { type: "cash_movement"; movementType: CashMovementType }
  | { type: "adjustment" }
  | { type: "daily_closing" }
  | null;

export type PendingVoid =
  | { source: "expense"; id: number; title: string }
  | { source: "cash_movement"; id: number; title: string }
  | { source: "adjustment"; id: number; title: string }
  | null;

export type EmployeeLoanRepaymentFormInput = Omit<EmployeeLoanRepaymentInput, "loanId">;

export const emptyEmployeeLoanPage: PageResult<EmployeeLoanRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export const emptyTransactionPage: PageResult<AccountingTransactionRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export const emptyExpensePage: PageResult<ExpenseListRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export const emptySummary: AccountingSummary = {
  bank: 0,
  cashDrawer: 0,
  depositsHeld: 0,
  expectedCash: 0,
  expenses: 0,
  moneyIn: 0,
  netAfterExpenses: 0,
  outstandingBalances: 0,
  ownerWithdrawals: 0,
  refunds: 0,
  shopSafe: 0,
};

export const sectionFilters: { value: AccountingSection; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "transactions", label: "Transactions" },
  { value: "expenses", label: "Expenses" },
  { value: "loans", label: "Loans" },
  { value: "balances", label: "Balances" },
];

export const kindFilters: { value: AccountingTransactionKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "money_in", label: "Money In" },
  { value: "money_out", label: "Money Out" },
  { value: "transfer", label: "Transfers" },
  { value: "adjustment", label: "Adjustments" },
];

export const transferPresets: Array<{
  from: MoneyLocation;
  label: string;
  to: MoneyLocation;
}> = [
  { from: "cash_drawer", to: "shop_safe", label: "Drawer to Safe" },
  { from: "shop_safe", to: "cash_drawer", label: "Safe to Drawer" },
  { from: "shop_safe", to: "bank", label: "Safe to Bank" },
  { from: "bank", to: "shop_safe", label: "Bank to Safe" },
];

export const rowClassName =
  "group transition-colors hover:bg-muted/35 focus-within:bg-muted/40";


export function summaryToBalances(summary: AccountingSummary): LocationBalances {
  return {
    bank: summary.bank,
    cash_drawer: summary.cashDrawer,
    shop_safe: summary.shopSafe,
  };
}

export function getPendingVoidAction(pendingVoid: PendingVoid): SensitiveAction {
  if (pendingVoid?.source === "expense") return "expenses.void";
  if (pendingVoid?.source === "adjustment") return "accountingAdjustments.void";

  return "cashMovements.void";
}

export function formatTransactionLocation(
  row: AccountingTransactionRecord,
  language: "ar" | "en",
): string {
  if (row.kind === "transfer" && row.fromLocation && row.toLocation) {
    return `${formatMoneyLocation(row.fromLocation, language)} -> ${formatMoneyLocation(row.toLocation, language)}`;
  }

  if (row.kind === "adjustment" && row.location) {
    return formatMoneyLocation(row.location, language);
  }

  if (row.location) {
    return formatMoneyLocation(row.location, language);
  }

  return "";
}

export function formatTransactionTitle(
  row: AccountingTransactionRecord,
  language: "ar" | "en",
  t: (key: string) => string,
): string {
  if (row.source === "expense" && isExpenseCategory(row.title)) {
    return formatExpenseCategory(row.title, language);
  }

  return t(row.title);
}

export function formatTransactionDetail(
  row: AccountingTransactionRecord,
  language: "ar" | "en",
  t: (key: string) => string,
): string {
  if (row.source === "cash_movement" || row.source === "adjustment") {
    return formatTransactionLocation(row, language);
  }

  return row.detail || t("Not available");
}

export function getSignedTransactionAmount(row: AccountingTransactionRecord): number {
  if (row.kind === "money_out") {
    return -row.amount;
  }

  if (row.kind === "adjustment" && row.fromLocation) {
    return -row.amount;
  }

  return row.amount;
}

export function getFormTitle(
  formState: FormState,
  t: (key: string) => string,
): string {
  if (formState?.type === "expense") return t("Record Expense");
  if (formState?.type === "adjustment") return t("Balance Adjustment");
  if (formState?.type === "daily_closing") return t("Close Day");
  if (formState?.type === "cash_movement") {
    return t(formatCashMovementType(formState.movementType, "en"));
  }

  return "";
}

export function getFormDescription(
  formState: FormState,
  t: (key: string) => string,
): string {
  if (formState?.type === "expense") {
    return t("Record a real shop cost paid from drawer, safe, or bank.");
  }

  if (formState?.type === "adjustment") {
    return t("Owner-only correction for opening balances or cash count fixes.");
  }

  if (formState?.type === "daily_closing") {
    return t("Count the drawer cash and save the daily difference.");
  }

  if (formState?.type === "cash_movement") {
    return formState.movementType === "owner_withdrawal"
      ? t("Record money taken by the owner without counting it as a shop expense.")
      : t("Move money between the drawer, safe, and bank.");
  }

  return "";
}

export function formatExpenseMethodLabel(location: MoneyLocation): string {
  return getExpensePaymentMethodForLocation(location) === "bank_transfer"
    ? "Bank Transfer"
    : "Cash";
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategoryValues.includes(value as ExpenseCategory);
}

export function parseMoney(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export const selectClassName =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
