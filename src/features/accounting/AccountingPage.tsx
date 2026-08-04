import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftRight,
  Banknote,
  FileSpreadsheet,
  FileText,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import {
  accountingAdjustmentDirectionValues,
  accountingAdjustmentFormSchema,
  cashMovementFormSchema,
  expenseCategoryValues,
  expenseFormSchema,
  formatAccountingAdjustmentDirection,
  formatCashMovementType,
  formatExpenseCategory,
  formatMoneyLocation,
  getDefaultAccountingAdjustmentFormValues,
  getDefaultCashMovementFormValues,
  getDefaultExpenseFormValues,
  getExpensePaymentMethodForLocation,
  moneyLocationValues,
  type AccountingAdjustmentFormValues,
  type AccountingAdjustmentInput,
  type AccountingDailyClosingRecord,
  type AccountingSummary,
  type AccountingTransactionKind,
  type AccountingTransactionRecord,
  type CashMovementFormValues,
  type CashMovementInput,
  type CashMovementType,
  type ExpenseCategory,
  type ExpenseFormValues,
  type ExpenseInput,
  type ExpenseListRecord,
  type LocationBalances,
  type MoneyLocation,
  type StaffDailyClosingRecord,
  type WeeklyIncomeDayRecord,
} from "@/shared/accounting";
import {
  employeeLoanFormSchema,
  employeeLoanRepaymentFormSchema,
  getDefaultEmployeeLoanFormValues,
  getDefaultEmployeeLoanRepaymentFormValues,
  type EmployeeLoanEmployeeOption,
  type EmployeeLoanFormValues,
  type EmployeeLoanInput,
  type EmployeeLoanRecord,
  type EmployeeLoanRepaymentFormValues,
  type EmployeeLoanRepaymentInput,
} from "@/shared/employee-loans";
import type { PageResult } from "@/shared/pagination";
import type {
  DepositReportRecord,
  OutstandingBalanceRecord,
} from "@/shared/reports";
import type { SensitiveAction } from "@/shared/security";
import type { VehicleRecord } from "@/shared/vehicles";

type AccountingSection =
  | "today"
  | "transactions"
  | "expenses"
  | "loans"
  | "balances";

type FormState =
  | { type: "expense" }
  | { type: "cash_movement"; movementType: CashMovementType }
  | { type: "adjustment" }
  | { type: "daily_closing" }
  | null;

type PendingVoid =
  | { source: "expense"; id: number; title: string }
  | { source: "cash_movement"; id: number; title: string }
  | { source: "adjustment"; id: number; title: string }
  | null;

type EmployeeLoanRepaymentFormInput = Omit<EmployeeLoanRepaymentInput, "loanId">;

const emptyTransactionPage: PageResult<AccountingTransactionRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const emptyExpensePage: PageResult<ExpenseListRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const emptySummary: AccountingSummary = {
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

const sectionFilters: { value: AccountingSection; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "transactions", label: "Transactions" },
  { value: "expenses", label: "Expenses" },
  { value: "loans", label: "Loans" },
  { value: "balances", label: "Balances" },
];

const kindFilters: { value: AccountingTransactionKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "money_in", label: "Money In" },
  { value: "money_out", label: "Money Out" },
  { value: "transfer", label: "Transfers" },
  { value: "adjustment", label: "Adjustments" },
];

const transferPresets: Array<{
  from: MoneyLocation;
  label: string;
  to: MoneyLocation;
}> = [
  { from: "cash_drawer", to: "shop_safe", label: "Drawer to Safe" },
  { from: "shop_safe", to: "cash_drawer", label: "Safe to Drawer" },
  { from: "shop_safe", to: "bank", label: "Safe to Bank" },
  { from: "bank", to: "shop_safe", label: "Bank to Safe" },
];

const rowClassName =
  "group transition-colors hover:bg-muted/35 focus-within:bg-muted/40";

export function AccountingPage() {
  const { can } = useAuth();

  if (!can("accounting.view")) {
    return <StaffAccountingPage />;
  }

  return <FullAccountingPage />;
}

function FullAccountingPage() {
  const { can } = useAuth();
  const { formatCurrency, formatDateTime, language, settings, t } = useI18n();
  const today = toDateInputValue(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [listDateFrom, setListDateFrom] = useState(today);
  const [listDateTo, setListDateTo] = useState(today);
  const [section, setSection] = useState<AccountingSection>("transactions");
  const [kind, setKind] = useState<AccountingTransactionKind>("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [transactionPage, setTransactionPage] = useState(emptyTransactionPage);
  const [expensePage, setExpensePage] = useState(emptyExpensePage);
  const [transactionPageNumber, setTransactionPageNumber] = useState(1);
  const [expensePageNumber, setExpensePageNumber] = useState(1);
  const [summary, setSummary] = useState<AccountingSummary>(emptySummary);
  const [dailyClosing, setDailyClosing] =
    useState<AccountingDailyClosingRecord | null>(null);
  const [outstandingBalances, setOutstandingBalances] = useState<
    OutstandingBalanceRecord[]
  >([]);
  const [deposits, setDeposits] = useState<DepositReportRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingVoid, setPendingVoid] = useState<PendingVoid>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dailyClosingEnabled = settings.dailyClosingEnabled;
  const baseSectionFilters = can("employeeLoans.view")
    ? sectionFilters
    : sectionFilters.filter((filter) => filter.value !== "loans");
  const accountingSectionFilters = dailyClosingEnabled
    ? baseSectionFilters
    : baseSectionFilters.filter((filter) => filter.value !== "today");
  const visibleSection =
    !dailyClosingEnabled && section === "today" ? "transactions" : section;
  const visibleFormState =
    !dailyClosingEnabled && formState?.type === "daily_closing" ? null : formState;
  const balances = summaryToBalances(summary);

  const loadAccounting = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const selectedDateRequest = {
        dateFrom: selectedDate,
        dateTo: selectedDate,
      };
      const transactionRequest = {
        dateFrom: listDateFrom || undefined,
        dateTo: listDateTo || undefined,
        search: transactionSearch,
      };
      const expenseRequest = {
        dateFrom: listDateFrom || undefined,
        dateTo: listDateTo || undefined,
        search: expenseSearch,
      };
      const [
        nextSummary,
        nextTransactions,
        nextExpenses,
        nextClosing,
        nextOutstanding,
        nextDeposits,
      ] = await Promise.all([
        window.rentalApp.accounting.getSummary(selectedDateRequest),
        window.rentalApp.accounting.listTransactions({
          ...transactionRequest,
          kind,
          page: transactionPageNumber,
        }),
        window.rentalApp.accounting.listExpenses({
          ...expenseRequest,
          page: expensePageNumber,
        }),
        dailyClosingEnabled
          ? window.rentalApp.accounting.getDailyClosing(selectedDate)
          : Promise.resolve(null),
        window.rentalApp.reports.listOutstandingBalances({
          includeTotal: false,
          pageSize: 8,
        }),
        window.rentalApp.reports.listDeposits({
          heldOnly: true,
          includeTotal: false,
          pageSize: 8,
        }),
      ]);

      setSummary(nextSummary);
      setTransactionPage(nextTransactions);
      setExpensePage(nextExpenses);
      setDailyClosing(nextClosing);
      setOutstandingBalances(nextOutstanding.rows);
      setDeposits(nextDeposits.rows);
    } catch (err) {
      setError(getErrorMessage(err, t("Accounting could not be loaded.")));
    } finally {
      setIsLoading(false);
    }
  }, [
    expensePageNumber,
    expenseSearch,
    kind,
    dailyClosingEnabled,
    listDateFrom,
    listDateTo,
    selectedDate,
    t,
    transactionPageNumber,
    transactionSearch,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAccounting();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadAccounting]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.rentalApp.vehicles
        .list({ pageSize: 100 })
        .then((result) => setVehicles(result.rows))
        .catch(() => setVehicles([]));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  function resetListPages() {
    setTransactionPageNumber(1);
    setExpensePageNumber(1);
  }

  async function handleCreateExpense(input: ExpenseInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.accounting.createExpense(input);
      setFormState(null);
      await loadAccounting();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Expense could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateCashMovement(
    input: CashMovementInput,
    approvalToken?: string,
  ) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.accounting.createCashMovement({
        ...input,
        approvalToken,
      });
      setFormState(null);
      await loadAccounting();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Cash movement could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateAdjustment(
    input: AccountingAdjustmentInput,
    approvalToken?: string,
  ) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.accounting.createAdjustment({
        ...input,
        approvalToken,
      });
      setFormState(null);
      await loadAccounting();
    } catch (err) {
      setFormError(
        getErrorMessage(err, t("Balance adjustment could not be saved.")),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDailyClosing(input: {
    countedCash: number;
    notes: string | null;
    reason?: string;
  }) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.accounting.saveDailyClosing({
        closingDate: selectedDate,
        ...input,
      });
      setFormState(null);
      await loadAccounting();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Daily closing could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoid(values: { approvalToken?: string; reason?: string }) {
    if (!pendingVoid || !values.reason) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (pendingVoid.source === "expense") {
        await window.rentalApp.accounting.voidExpense({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      } else if (pendingVoid.source === "cash_movement") {
        await window.rentalApp.accounting.voidCashMovement({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      } else {
        await window.rentalApp.accounting.voidAdjustment({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      }

      setPendingVoid(null);
      await loadAccounting();
    } catch (err) {
      setError(getErrorMessage(err, t("Record could not be voided.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport(type: "accountingTransactions" | "expenses") {
    const result = await window.rentalApp.reports.export({
      type,
      format: "xlsx",
      startDate: listDateFrom,
      endDate: listDateTo,
    });

    setMessage(
      result.success
        ? t("Report exported successfully.")
        : t(result.error ?? "Report export failed."),
    );
  }

  const pendingVoidAction = getPendingVoidAction(pendingVoid);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-start gap-2 text-sm font-medium text-muted-foreground">
            <span>{t("Date")}</span>
            <LocalizedDateInput
              className="w-40"
              displayValue={selectedDate}
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || today)}
            />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              aria-label={t("Refresh")}
              title={t("Refresh")}
              size="icon"
              variant="outline"
              disabled={isLoading}
              onClick={() => void loadAccounting()}
            >
              <RefreshCw
                className={isLoading ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
            </Button>
            {can("expenses.create") ? (
              <Button onClick={() => setFormState({ type: "expense" })}>
                <Plus data-icon="inline-start" />
                {t("Record Expense")}
              </Button>
            ) : null}
            {can("cashMovements.create") ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setFormState({
                      type: "cash_movement",
                      movementType: "transfer",
                    })
                  }
                >
                  <ArrowLeftRight data-icon="inline-start" />
                  {t("Move Cash")}
                </Button>
            ) : null}
            {can("cashMovements.create") || can("accountingAdjustments.create") ? (
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
                <span className="px-2 text-xs font-semibold text-muted-foreground">{t("Owner actions")}</span>
                {can("cashMovements.create") ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setFormState({
                      type: "cash_movement",
                      movementType: "owner_withdrawal",
                    })
                  }
                >
                  <ShieldCheck data-icon="inline-start" />
                  {t("Owner Withdrawal")}
                </Button>
                ) : null}
                {can("accountingAdjustments.create") ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFormState({ type: "adjustment" })}
                  >
                    <PencilLine data-icon="inline-start" />
                    {t("Balance Adjustment")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <LocationBalanceGrid
          balances={balances}
          formatCurrency={formatCurrency}
        />
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <SegmentedFilter
        options={accountingSectionFilters}
        t={t}
        value={visibleSection}
        onChange={setSection}
      />

      {dailyClosingEnabled && visibleSection === "today" ? (
        <TodaySection
          closing={dailyClosing}
          formatCurrency={formatCurrency}
          summary={summary}
          t={t}
          onCloseDay={
            can("dailyClosing.save")
              ? () => setFormState({ type: "daily_closing" })
              : null
          }
        />
      ) : null}

      {visibleSection === "transactions" ? (
        <SectionPanel
          title={t("Transactions")}
          description={t("Payments, refunds, expenses, withdrawals, adjustments, and cash movements.")}
          badge={t("{{count}} shown", { count: transactionPage.total })}
        >
          <ListFilters
            dateFrom={listDateFrom}
            dateTo={listDateTo}
            search={transactionSearch}
            searchPlaceholder={t("Search accounting records")}
            t={t}
            onDateFromChange={(value) => {
              setListDateFrom(value);
              resetListPages();
            }}
            onDateToChange={(value) => {
              setListDateTo(value);
              resetListPages();
            }}
            onSearchChange={(value) => {
              setTransactionSearch(value);
              setTransactionPageNumber(1);
            }}
          >
            {can("reports.export") ? (
              <Button
                variant="outline"
                onClick={() => void handleExport("accountingTransactions")}
              >
                <FileSpreadsheet data-icon="inline-start" />
                {t("Export Transactions")}
              </Button>
            ) : null}
          </ListFilters>
          <div className="mb-4">
            <SegmentedFilter
              label="Type"
              options={kindFilters}
              t={t}
              value={kind}
              onChange={(value) => {
                setKind(value);
                setTransactionPageNumber(1);
              }}
            />
          </div>
          <TransactionsTable
            canVoidAdjustment={can("accountingAdjustments.void")}
            canVoidCashMovement={can("cashMovements.void")}
            canVoidExpense={can("expenses.void")}
            formatCurrency={formatCurrency}
            formatDateTime={formatDateTime}
            isLoading={isLoading}
            language={language}
            page={transactionPage}
            t={t}
            onPageChange={setTransactionPageNumber}
            onPrintPayment={(paymentId) =>
              void window.rentalApp.payments.printReceipt(paymentId, false)
            }
            onPrintVehicleSale={(saleId) =>
              void window.rentalApp.vehicleSales.printReceipt(saleId, false)
            }
            onVoid={(row) =>
              setPendingVoid({
                source: row.source,
                id: row.sourceId,
                title: formatTransactionTitle(row, language, t),
              } as PendingVoid)
            }
          />
        </SectionPanel>
      ) : null}

      {visibleSection === "expenses" ? (
        <SectionPanel
          title={t("Expenses")}
          description={t("Simple shop costs paid from drawer, safe, or bank.")}
          badge={t("{{count}} shown", { count: expensePage.total })}
        >
          <ListFilters
            dateFrom={listDateFrom}
            dateTo={listDateTo}
            search={expenseSearch}
            searchPlaceholder={t("Search expenses")}
            t={t}
            onDateFromChange={(value) => {
              setListDateFrom(value);
              resetListPages();
            }}
            onDateToChange={(value) => {
              setListDateTo(value);
              resetListPages();
            }}
            onSearchChange={(value) => {
              setExpenseSearch(value);
              setExpensePageNumber(1);
            }}
          >
            {can("reports.export") ? (
              <Button variant="outline" onClick={() => void handleExport("expenses")}>
                <FileText data-icon="inline-start" />
                {t("Export Expenses")}
              </Button>
            ) : null}
          </ListFilters>
          <ExpensesTable
            canVoidExpense={can("expenses.void")}
            formatCurrency={formatCurrency}
            formatDateTime={formatDateTime}
            isLoading={isLoading}
            language={language}
            page={expensePage}
            t={t}
            onPageChange={setExpensePageNumber}
            onVoid={(expense) =>
              setPendingVoid({
                source: "expense",
                id: expense.id,
                title: formatExpenseCategory(expense.category, language),
              })
            }
          />
        </SectionPanel>
      ) : null}

      {visibleSection === "loans" && can("employeeLoans.view") ? (
        <EmployeeLoansSection />
      ) : null}

      {visibleSection === "balances" ? (
        <BalancesSection
          deposits={deposits}
          formatCurrency={formatCurrency}
          isLoading={isLoading}
          outstandingBalances={outstandingBalances}
          summary={summary}
          t={t}
        />
      ) : null}

      <SidePanel
        open={Boolean(visibleFormState)}
        title={getFormTitle(visibleFormState, t)}
        description={getFormDescription(visibleFormState, t)}
        width="lg"
        onClose={() => {
          setFormState(null);
          setFormError(null);
        }}
      >
        {visibleFormState?.type === "expense" ? (
          <ExpenseForm
            balances={balances}
            error={formError}
            formatCurrency={formatCurrency}
            isSaving={isSaving}
            language={language}
            vehicles={vehicles}
            onCancel={() => setFormState(null)}
            onSave={handleCreateExpense}
          />
        ) : null}
        {visibleFormState?.type === "cash_movement" ? (
          <CashMovementForm
            balances={balances}
            error={formError}
            formatCurrency={formatCurrency}
            isSaving={isSaving}
            language={language}
            movementType={visibleFormState.movementType}
            ownerPinRequired={settings.ownerPinEnabled}
            onCancel={() => setFormState(null)}
            onSave={handleCreateCashMovement}
          />
        ) : null}
        {visibleFormState?.type === "adjustment" ? (
          <AdjustmentForm
            balances={balances}
            error={formError}
            formatCurrency={formatCurrency}
            isSaving={isSaving}
            language={language}
            ownerPinRequired={settings.ownerPinEnabled}
            onCancel={() => setFormState(null)}
            onSave={handleCreateAdjustment}
          />
        ) : null}
        {dailyClosingEnabled && visibleFormState?.type === "daily_closing" ? (
          <DailyClosingForm
            closing={dailyClosing}
            error={formError}
            formatCurrency={formatCurrency}
            isSaving={isSaving}
            onCancel={() => setFormState(null)}
            onSave={handleSaveDailyClosing}
          />
        ) : null}
      </SidePanel>

      <SensitiveActionDialog
        action={pendingVoidAction}
        open={Boolean(pendingVoid)}
        title={t("Void record?")}
        description={t("Voided accounting records stay in history but no longer affect balances.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Void")}
        reasonLabel={t("Reason")}
        ownerPinRequired={settings.ownerPinEnabled}
        isBusy={isSaving}
        variant="destructive"
        onCancel={() => setPendingVoid(null)}
        onConfirm={(values) => void handleVoid(values)}
      >
        {pendingVoid ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {pendingVoid.title}
          </p>
        ) : null}
      </SensitiveActionDialog>
    </div>
  );
}

function StaffAccountingPage() {
  const { can } = useAuth();
  const { formatCurrency, t } = useI18n();
  const today = toDateInputValue(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [weeklyIncome, setWeeklyIncome] = useState<WeeklyIncomeDayRecord[]>([]);
  const [closing, setClosing] = useState<StaffDailyClosingRecord | null>(null);
  const [panel, setPanel] = useState<"expense" | "close" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadWeeklyIncome = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setWeeklyIncome(await window.rentalApp.accounting.getWeeklyIncome(selectedDate));
    } catch (err) {
      setError(getErrorMessage(err, t("Weekly income could not be loaded.")));
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadWeeklyIncome();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadWeeklyIncome]);

  async function handleStaffExpense(input: ExpenseInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.accounting.createExpense({
        ...input,
        location: "cash_drawer",
        method: getExpensePaymentMethodForLocation("cash_drawer"),
      });
      setPanel(null);
      await loadWeeklyIncome();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Expense could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStaffClose(input: {
    countedCash: number;
    notes: string | null;
  }) {
    setIsSaving(true);
    setFormError(null);

    try {
      const saved = await window.rentalApp.accounting.saveStaffDailyClosing({
        closingDate: selectedDate,
        ...input,
      });
      setClosing(saved);
      setPanel(null);
    } catch (err) {
      setFormError(getErrorMessage(err, t("Daily closing could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  const netTotal = weeklyIncome.reduce((total, day) => total + day.netIncome, 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span>{t("Week Ending")}</span>
            <Input
              className="w-40"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || today)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => void loadWeeklyIncome()}
            >
              <RefreshCw
                className={isLoading ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
              {t("Refresh")}
            </Button>
            {can("expenses.create") ? (
              <Button type="button" onClick={() => setPanel("expense")}>
                <Plus data-icon="inline-start" />
                {t("Record Expense")}
              </Button>
            ) : null}
            {can("dailyClosing.staffClose") ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPanel("close")}
              >
                <Banknote data-icon="inline-start" />
                {t("Close Day")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <CompactMetric
            label={t("Weekly Income")}
            value={formatCurrency(netTotal)}
            tone="good"
          />
          <DailyItem
            label={t("Daily Close")}
            value={
              closing
                ? t("Saved")
                : t("Enter counted cash without viewing expected balance.")
            }
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <SectionPanel
        title={t("Weekly Income")}
        description={t("Posted rental payments for the last 7 days. Refunds are shown as negative amounts.")}
      >
        <DataTable className="min-w-[720px]" containerClassName="min-h-[18rem]">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              <Th>{t("Date")}</Th>
              <Th className="text-end">{t("Rent")}</Th>
              <Th className="text-end">{t("Deposit")}</Th>
              <Th className="text-end">{t("Extra Charges")}</Th>
              <Th className="text-end">{t("Refunds")}</Th>
              <Th className="text-end">{t("Net")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={6} message={t("Loading income...")} state="loading" />
            ) : weeklyIncome.length === 0 ? (
              <EmptyTableRow colSpan={6} message={t("No income found.")} />
            ) : (
              weeklyIncome.map((day) => (
                <tr key={day.date} className={rowClassName}>
                  <Td className="tabular-nums">{day.date}</Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.rent)} /></Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.deposit)} /></Td>
                  <Td className="text-end"><BidiValue value={formatCurrency(day.extraCharge)} /></Td>
                  <Td className="text-end text-warning"><BidiValue value={formatCurrency(day.refunds)} /></Td>
                  <Td className="text-end font-semibold"><BidiValue value={formatCurrency(day.netIncome)} /></Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      </SectionPanel>

      <SidePanel
        open={Boolean(panel)}
        title={panel === "close" ? t("Close Day") : t("Record Expense")}
        width="md"
        onClose={() => {
          setPanel(null);
          setFormError(null);
        }}
      >
        {panel === "expense" ? (
          <StaffExpenseForm
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleStaffExpense}
          />
        ) : null}
        {panel === "close" ? (
          <StaffDailyCloseForm
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleStaffClose}
          />
        ) : null}
      </SidePanel>
    </div>
  );
}

function EmployeeLoansSection() {
  const { can } = useAuth();
  const { formatCurrency, formatDateTime, language, t } = useI18n();
  const [loanPage, setLoanPage] = useState<PageResult<EmployeeLoanRecord>>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  });
  const [employees, setEmployees] = useState<EmployeeLoanEmployeeOption[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<
    | { type: "create" }
    | { type: "repay"; loan: EmployeeLoanRecord }
    | null
  >(null);
  const [pendingVoidLoan, setPendingVoidLoan] =
    useState<EmployeeLoanRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadLoans = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextLoans, nextEmployees] = await Promise.all([
        window.rentalApp.employeeLoans.list({ page, search }),
        window.rentalApp.employeeLoans.listEmployees(),
      ]);

      setLoanPage(nextLoans);
      setEmployees(nextEmployees);
    } catch (err) {
      setError(getErrorMessage(err, t("Employee loans could not be loaded.")));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLoans();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadLoans]);

  async function handleCreateLoan(input: EmployeeLoanInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.employeeLoans.create(input);
      setPanel(null);
      await loadLoans();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Employee loan could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRepayLoan(
    loan: EmployeeLoanRecord,
    input: EmployeeLoanRepaymentFormInput,
  ) {
    setIsSaving(true);
    setFormError(null);

    try {
      await window.rentalApp.employeeLoans.repay({
        ...input,
        loanId: loan.id,
      });
      setPanel(null);
      await loadLoans();
    } catch (err) {
      setFormError(getErrorMessage(err, t("Loan repayment could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVoidLoan(values: { approvalToken?: string; reason?: string }) {
    if (!pendingVoidLoan || !values.reason) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await window.rentalApp.employeeLoans.void({
        loanId: pendingVoidLoan.id,
        reason: values.reason,
        approvalToken: values.approvalToken,
      });
      setPendingVoidLoan(null);
      await loadLoans();
    } catch (err) {
      setError(getErrorMessage(err, t("Employee loan could not be voided.")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SectionPanel
      title={t("Employee Loans")}
      description={t("Track employee advances and repayments without counting them as rental income.")}
      badge={t("{{count}} shown", { count: loanPage.total })}
    >
      {error ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          className="w-full lg:max-w-sm"
          placeholder={t("Search loans")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {can("employeeLoans.create") ? (
          <Button type="button" onClick={() => setPanel({ type: "create" })}>
            <Plus data-icon="inline-start" />
            {t("New Loan")}
          </Button>
        ) : null}
      </div>

      <DataTable className="min-w-[860px]" containerClassName="min-h-[22rem]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Loan No.")}</Th>
            <Th>{t("Employee")}</Th>
            <Th>{t("Date")}</Th>
            <Th>{t("Source")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
            <Th className="text-end">{t("Remaining")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={8} message={t("Loading loans...")} state="loading" />
          ) : loanPage.rows.length === 0 ? (
            <EmptyTableRow colSpan={8} message={t("No employee loans found.")} />
          ) : (
            loanPage.rows.map((loan) => (
              <tr key={loan.id} className={rowClassName}>
                <Td className="font-medium">{loan.loanNo}</Td>
                <Td>{loan.employeeName}</Td>
                <Td className="tabular-nums">
                  <BidiValue value={formatDateTime(loan.issuedAt)} />
                </Td>
                <Td>{formatMoneyLocation(loan.sourceLocation, language)}</Td>
                <Td>
                  <Badge
                    variant={loan.status === "voided" ? "destructive" : "secondary"}
                  >
                    {t(formatEmployeeLoanStatus(loan.status))}
                  </Badge>
                </Td>
                <Td className="text-end">
                  <BidiValue value={formatCurrency(loan.amount)} />
                </Td>
                <Td className="text-end font-semibold">
                  <BidiValue value={formatCurrency(loan.remainingAmount)} />
                </Td>
                <Td className="text-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    {can("employeeLoans.repay") && loan.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPanel({ type: "repay", loan })}
                      >
                        {t("Record Repayment")}
                      </Button>
                    ) : null}
                    {can("employeeLoans.void") && loan.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPendingVoidLoan(loan)}
                      >
                        {t("Void")}
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={loanPage} t={t} onPageChange={setPage} />

      <SidePanel
        open={Boolean(panel)}
        title={
          panel?.type === "repay" ? t("Record Repayment") : t("New Employee Loan")
        }
        width="md"
        onClose={() => {
          setPanel(null);
          setFormError(null);
        }}
      >
        {panel?.type === "create" ? (
          <EmployeeLoanForm
            employees={employees}
            error={formError}
            isSaving={isSaving}
            onCancel={() => setPanel(null)}
            onSave={handleCreateLoan}
          />
        ) : null}
        {panel?.type === "repay" ? (
          <EmployeeLoanRepaymentForm
            error={formError}
            isSaving={isSaving}
            loan={panel.loan}
            onCancel={() => setPanel(null)}
            onSave={(input) => handleRepayLoan(panel.loan, input)}
          />
        ) : null}
      </SidePanel>

      <LoanVoidDialog
        open={Boolean(pendingVoidLoan)}
        loan={pendingVoidLoan}
        title={t("Void employee loan?")}
        description={t("A loan can only be voided before repayments are recorded.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Void")}
        isBusy={isSaving}
        onCancel={() => setPendingVoidLoan(null)}
        onConfirm={(reason) => void handleVoidLoan({ reason })}
      />
    </SectionPanel>
  );
}

function LoanVoidDialog({
  cancelLabel,
  confirmLabel,
  description,
  isBusy,
  loan,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isBusy: boolean;
  loan: EmployeeLoanRecord | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  open: boolean;
  title: string;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open: open && Boolean(loan),
  });

  useEffect(() => {
    if (open) {
      const timeout = window.setTimeout(() => setReason(""), 0);

      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [open]);

  if (!open || !loan) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]">
      <form
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-modal-layer="true"
        role="alertdialog"
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim()) {
            onConfirm(reason.trim());
          }
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {loan.loanNo} - {loan.employeeName}
        </p>
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("Why is this loan being voided?")}
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant="destructive" disabled={isBusy || !reason.trim()}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

function StaffExpenseForm({
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ExpenseFormValues, undefined, ExpenseInput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      ...getDefaultExpenseFormValues(),
      location: "cash_drawer",
      vehicleId: "",
    },
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Category" required error={errors.category?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("category")}
        >
          {expenseCategoryValues.map((category) => (
            <option key={category} value={category}>
              {formatExpenseCategory(category, language)}
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" value="cash_drawer" {...register("location")} />
      <input type="hidden" value="" {...register("vehicleId")} />
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Date" required error={errors.expenseDate?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("expenseDate")} />
      </Field>
      <Field label="Vendor" error={errors.vendorName?.message}>
        <Input placeholder={t("Optional vendor name")} {...register("vendorName")} />
      </Field>
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea placeholder={t("Optional notes")} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Expense")}
        </Button>
      </div>
    </form>
  );
}

function StaffDailyCloseForm({
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: { countedCash: number; notes: string | null }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(countedCash);

    if (!Number.isFinite(amount) || amount < 0) {
      return;
    }

    void onSave({
      countedCash: amount,
      notes: notes.trim() || null,
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmitForm}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Counted Cash" required>
        <Input
          data-ltr="true"
          inputMode="decimal"
          placeholder="0"
          value={countedCash}
          onChange={(event) => setCountedCash(event.target.value)}
        />
      </Field>
      <Field label="Notes">
        <Textarea
          placeholder={t("Optional closing notes")}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <div className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
        {t("Expected cash and differences are hidden for staff.")}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Close")}
        </Button>
      </div>
    </form>
  );
}

function EmployeeLoanForm({
  employees,
  error,
  isSaving,
  onCancel,
  onSave,
}: {
  employees: EmployeeLoanEmployeeOption[];
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: EmployeeLoanInput) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<EmployeeLoanFormValues, undefined, EmployeeLoanInput>({
    resolver: zodResolver(employeeLoanFormSchema),
    defaultValues: getDefaultEmployeeLoanFormValues(),
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <Field label="Employee" required error={errors.employeeUserId?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("employeeUserId")}
        >
          <option value="">{t("Select employee")}</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Loan Date" required error={errors.issuedAt?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("issuedAt")} />
      </Field>
      <Field label="Cash Location" required error={errors.sourceLocation?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("sourceLocation")}
        >
          {moneyLocationValues.map((location) => (
            <option key={location} value={location}>
              {formatMoneyLocation(location, language)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea placeholder={t("Optional notes")} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Loan")}
        </Button>
      </div>
    </form>
  );
}

function EmployeeLoanRepaymentForm({
  error,
  isSaving,
  loan,
  onCancel,
  onSave,
}: {
  error: string | null;
  isSaving: boolean;
  loan: EmployeeLoanRecord;
  onCancel: () => void;
  onSave: (input: EmployeeLoanRepaymentFormInput) => Promise<void>;
}) {
  const { formatCurrency, language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<
    EmployeeLoanRepaymentFormValues,
    undefined,
    EmployeeLoanRepaymentFormInput
  >({
    resolver: zodResolver(employeeLoanRepaymentFormSchema),
    defaultValues: getDefaultEmployeeLoanRepaymentFormValues(),
    mode: "onBlur",
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSave)}>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}
      <DailyItem label={t("Remaining")} value={formatCurrency(loan.remainingAmount)} />
      <Field label="Amount" required error={errors.amount?.message}>
        <Input data-ltr="true" inputMode="decimal" placeholder="0" {...register("amount")} />
      </Field>
      <Field label="Payment Date" required error={errors.paymentDate?.message}>
        <Input data-ltr="true" type="datetime-local" {...register("paymentDate")} />
      </Field>
      <Field label="Cash Location" required error={errors.location?.message}>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          {...register("location")}
        >
          {moneyLocationValues.map((location) => (
            <option key={location} value={location}>
              {formatMoneyLocation(location, language)}
            </option>
          ))}
        </select>
      </Field>
      <input type="hidden" value="cash" {...register("method")} />
      <Field label="Notes" error={errors.notes?.message}>
        <Textarea placeholder={t("Optional notes")} {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Save Repayment")}
        </Button>
      </div>
    </form>
  );
}

function formatEmployeeLoanStatus(status: EmployeeLoanRecord["status"]): string {
  if (status === "paid") return "Paid";
  if (status === "voided") return "Voided";

  return "Open";
}

function LocationBalanceGrid({
  balances,
  formatCurrency,
}: {
  balances: LocationBalances;
  formatCurrency: (value: number) => string;
}) {
  const { language } = useI18n();
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {moneyLocationValues.map((location) => (
        <div
          key={location}
          className="rounded-xl border border-border/70 bg-background px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            {formatMoneyLocation(location, language)}
          </p>
          <p className="mt-2 text-2xl font-bold leading-none">
            <BidiValue value={formatCurrency(balances[location])} />
          </p>
        </div>
      ))}
    </div>
  );
}

function TodaySection({
  closing,
  formatCurrency,
  onCloseDay,
  summary,
  t,
}: {
  closing: AccountingDailyClosingRecord | null;
  formatCurrency: (value: number) => string;
  onCloseDay: (() => void) | null;
  summary: AccountingSummary;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <SectionPanel
      title={t("Today")}
      description={t("Daily cash drawer check for the selected day.")}
      badge={closing?.isClosed ? t("Closed") : t("Open")}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <CompactMetric
          label={t("Money In")}
          value={formatCurrency(summary.moneyIn)}
          tone="good"
        />
        <CompactMetric
          label={t("Expenses")}
          value={formatCurrency(summary.expenses)}
          tone="warning"
        />
        <CompactMetric
          label={t("Owner Withdrawals")}
          value={formatCurrency(summary.ownerWithdrawals)}
          tone="warning"
        />
        <CompactMetric
          label={t("Net After Expenses")}
          value={formatCurrency(summary.netAfterExpenses)}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DailyItem
          label={t("Expected Cash")}
          value={formatCurrency(closing?.expectedCash ?? summary.expectedCash)}
        />
        <DailyItem
          label={t("Counted Cash")}
          value={
            closing?.countedCash === null || closing?.countedCash === undefined
              ? t("Not available")
              : formatCurrency(closing.countedCash)
          }
        />
        <DailyItem
          label={t("Difference")}
          value={
            closing?.difference === null || closing?.difference === undefined
              ? t("Not available")
              : formatCurrency(closing.difference)
          }
        />
      </div>
      {onCloseDay ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={onCloseDay}>
            <Banknote data-icon="inline-start" />
            {closing?.isClosed ? t("Close Day Again") : t("Close Day")}
          </Button>
        </div>
      ) : null}
    </SectionPanel>
  );
}

function ListFilters({
  children,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onSearchChange,
  search,
  searchPlaceholder,
  t,
}: {
  children?: ReactNode;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  search: string;
  searchPlaceholder: string;
  t: (key: string) => string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchInput
        className="w-full lg:max-w-sm"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{t("From")}</span>
          <Input
            className="w-40"
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>{t("To")}</span>
          <Input
            className="w-40"
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
        {children}
      </div>
    </div>
  );
}

function CompactMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "good" | "warning";
  value: string;
}) {
  const toneClass =
    tone === "good"
      ? "border-success/20 bg-success/5 text-success"
      : tone === "warning"
        ? "border-warning/25 bg-warning/5 text-warning"
        : "border-border/70 bg-background text-foreground";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold">
        <BidiValue value={value} />
      </p>
    </div>
  );
}

function DailyItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 font-bold">
        {typeof value === "string" ? <BidiValue value={value} /> : value}
      </div>
    </div>
  );
}

function TransactionsTable({
  canVoidAdjustment,
  canVoidCashMovement,
  canVoidExpense,
  formatCurrency,
  formatDateTime,
  isLoading,
  language,
  onPageChange,
  onPrintPayment,
  onPrintVehicleSale,
  onVoid,
  page,
  t,
}: {
  canVoidAdjustment: boolean;
  canVoidCashMovement: boolean;
  canVoidExpense: boolean;
  formatCurrency: (value: number) => string;
  formatDateTime: (value: string | Date) => string;
  isLoading: boolean;
  language: "ar" | "en";
  onPageChange: (page: number) => void;
  onPrintPayment: (paymentId: number) => void;
  onPrintVehicleSale: (saleId: number) => void;
  onVoid: (row: AccountingTransactionRecord) => void;
  page: PageResult<AccountingTransactionRecord>;
  t: (key: string) => string;
}) {
  return (
    <>
      <DataTable className="min-w-[960px]" containerClassName="min-h-[22rem]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Date & Time")}</Th>
            <Th>{t("Type")}</Th>
            <Th>{t("Details")}</Th>
            <Th>{t("Location")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={7} message={t("Loading transactions...")} state="loading" />
          ) : page.rows.length === 0 ? (
            <EmptyTableRow
              colSpan={7}
              message={t("No accounting records found.")}
            />
          ) : (
            page.rows.map((row) => {
              const signedAmount = getSignedTransactionAmount(row);
              const canVoid =
                row.source === "expense"
                  ? canVoidExpense
                  : row.source === "cash_movement"
                    ? canVoidCashMovement
                    : row.source === "adjustment"
                      ? canVoidAdjustment
                      : false;

              return (
                <tr
                  key={row.id}
                  className={`${rowClassName} ${row.status === "voided" ? "opacity-65" : ""}`}
                >
                  <Td className="whitespace-nowrap tabular-nums">
                    <BidiValue value={formatDateTime(row.occurredAt)} />
                  </Td>
                  <Td>
                    <Badge variant="secondary">
                      {formatTransactionTitle(row, language, t)}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="max-w-sm">
                      <div className="font-medium">
                        {formatTransactionDetail(row, language, t)}
                      </div>
                      {row.notes ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.notes}
                        </span>
                      ) : null}
                    </div>
                  </Td>
                  <Td>{formatTransactionLocation(row, language)}</Td>
                  <Td>
                    <Badge variant={row.status === "voided" ? "destructive" : "secondary"}>
                      {t(row.status === "voided" ? "Voided" : "Posted")}
                    </Badge>
                  </Td>
                  <Td
                    className={
                      signedAmount < 0
                        ? "text-end font-semibold text-warning"
                        : "text-end font-semibold"
                    }
                  >
                    <BidiValue value={formatCurrency(signedAmount)} />
                  </Td>
                  <Td className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.source === "payment" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onPrintPayment(row.sourceId)}
                        >
                          {t("Print Receipt")}
                        </Button>
                      ) : null}
                      {row.source === "vehicle_sale" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onPrintVehicleSale(row.sourceId)}
                        >
                          {t("Print Receipt")}
                        </Button>
                      ) : null}
                      {row.source !== "payment" && row.status === "posted" && canVoid ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onVoid(row)}
                        >
                          {t("Void")}
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={page} t={t} onPageChange={onPageChange} />
    </>
  );
}

function ExpensesTable({
  canVoidExpense,
  formatCurrency,
  formatDateTime,
  isLoading,
  language,
  onPageChange,
  onVoid,
  page,
  t,
}: {
  canVoidExpense: boolean;
  formatCurrency: (value: number) => string;
  formatDateTime: (value: string | Date) => string;
  isLoading: boolean;
  language: "ar" | "en";
  onPageChange: (page: number) => void;
  onVoid: (expense: ExpenseListRecord) => void;
  page: PageResult<ExpenseListRecord>;
  t: (key: string) => string;
}) {
  return (
    <>
      <DataTable className="min-w-[900px]" containerClassName="min-h-[22rem]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Date & Time")}</Th>
            <Th>{t("Category")}</Th>
            <Th>{t("Paid From")}</Th>
            <Th>{t("Method")}</Th>
            <Th>{t("Vendor")}</Th>
            <Th>{t("Vehicle")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
            <Th className="text-end">{t("Actions")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={9} message={t("Loading expenses...")} state="loading" />
          ) : page.rows.length === 0 ? (
            <EmptyTableRow colSpan={9} message={t("No expenses found.")} />
          ) : (
            page.rows.map((expense) => (
              <tr
                key={expense.id}
                className={`${rowClassName} ${expense.status === "voided" ? "opacity-65" : ""}`}
              >
                <Td className="whitespace-nowrap tabular-nums">
                  <BidiValue value={formatDateTime(expense.expenseDate)} />
                </Td>
                <Td>{formatExpenseCategory(expense.category, language)}</Td>
                <Td>{formatMoneyLocation(expense.location, language)}</Td>
                <Td>{t(formatExpenseMethodLabel(expense.location))}</Td>
                <Td>{expense.vendorName || t("Not available")}</Td>
                <Td>
                  {expense.vehiclePlateNumber ? (
                    <BidiValue value={expense.vehiclePlateNumber} />
                  ) : (
                    t("Not available")
                  )}
                </Td>
                <Td>
                  <Badge variant={expense.status === "voided" ? "destructive" : "secondary"}>
                    {t(expense.status === "voided" ? "Voided" : "Posted")}
                  </Badge>
                </Td>
                <Td className="text-end font-semibold text-warning">
                  <BidiValue value={formatCurrency(-expense.amount)} />
                </Td>
                <Td className="text-end">
                  {expense.status === "posted" && canVoidExpense ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onVoid(expense)}
                    >
                      {t("Void")}
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={page} t={t} onPageChange={onPageChange} />
    </>
  );
}

function BalancesSection({
  deposits,
  formatCurrency,
  isLoading,
  outstandingBalances,
  summary,
  t,
}: {
  deposits: DepositReportRecord[];
  formatCurrency: (value: number) => string;
  isLoading: boolean;
  outstandingBalances: OutstandingBalanceRecord[];
  summary: AccountingSummary;
  t: (key: string) => string;
}) {
  const rows: CombinedBalanceRow[] = [
    ...outstandingBalances.map((row) => ({
      amount: row.remainingAmount,
      contractNo: row.contractNo,
      customerName: row.customerName,
      kind: "outstanding" as const,
      rentalId: row.rentalId,
      vehiclePlateNumber: row.vehiclePlateNumber,
    })),
    ...deposits.map((row) => ({
      amount: row.depositHeld,
      contractNo: row.contractNo,
      customerName: row.customerName,
      kind: "deposit" as const,
      rentalId: row.rentalId,
      vehiclePlateNumber: row.vehiclePlateNumber,
    })),
  ].filter((row) => row.amount > 0);

  return (
    <SectionPanel
      title={t("Balances")}
      description={t("Customer balances and deposits held.")}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <CompactMetric
          label={t("Outstanding Balances")}
          value={formatCurrency(summary.outstandingBalances)}
          tone={summary.outstandingBalances > 0 ? "warning" : "good"}
        />
        <CompactMetric
          label={t("Deposits Held")}
          value={formatCurrency(summary.depositsHeld)}
        />
        <CompactMetric
          label={t("Expected Cash")}
          value={formatCurrency(summary.expectedCash)}
        />
      </div>

      <div className="mt-5">
      <DataTable className="min-w-[760px]">
        <thead className="bg-muted/70 text-muted-foreground">
          <tr>
            <Th>{t("Type")}</Th>
            <Th>{t("Contract")}</Th>
            <Th>{t("Customer")}</Th>
            <Th>{t("Plate")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <EmptyTableRow colSpan={5} message={t("Loading balances...")} state="loading" />
          ) : rows.length === 0 ? (
            <EmptyTableRow colSpan={5} message={t("No outstanding customer balances.")} />
          ) : (
            rows.map((row) => (
              <tr key={`${row.kind}-${row.rentalId}`} className={rowClassName}>
                <Td>
                  <Badge variant={row.kind === "outstanding" ? "outline" : "secondary"}>
                    {t(row.kind === "outstanding" ? "Open Customer Balance" : "Held Deposit")}
                  </Badge>
                </Td>
                <Td><BidiValue value={row.contractNo} /></Td>
                <Td>{row.customerName}</Td>
                <Td>
                  <BidiValue value={row.vehiclePlateNumber} />
                </Td>
                <Td className="text-end font-semibold">
                  <BidiValue value={formatCurrency(row.amount)} />
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      </div>
    </SectionPanel>
  );
}

type CombinedBalanceRow = {
  amount: number;
  contractNo: string;
  customerName: string;
  kind: "deposit" | "outstanding";
  rentalId: number;
  vehiclePlateNumber: string;
};

function ExpenseForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  onCancel,
  onSave,
  vehicles,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  onCancel: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
  vehicles: VehicleRecord[];
}) {
  const { t } = useI18n();
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ExpenseFormValues, unknown, ExpenseInput>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: getDefaultExpenseFormValues(),
    mode: "onBlur",
  });
  const location = useWatch({ control, name: "location" }) ?? "cash_drawer";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[location];
  const amount = parseMoney(amountValue);

  async function submit(values: ExpenseInput) {
    setLocalError(null);

    if (values.amount > balances[values.location]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    await onSave(values);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <BalanceHint
        amount={amount}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Category" required error={errors.category?.message}>
          <select className={selectClassName} {...register("category")}>
            {expenseCategoryValues.map((category) => (
              <option key={category} value={category}>
                {formatExpenseCategory(category, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid From" required error={errors.location?.message}>
          <select className={selectClassName} {...register("location")}>
            {moneyLocationValues.map((moneyLocation) => (
              <option key={moneyLocation} value={moneyLocation}>
                {formatMoneyLocation(moneyLocation, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Method">
          <Input
            disabled
            value={t(formatExpenseMethodLabel(location))}
            readOnly
          />
        </Field>
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Expense Date" required error={errors.expenseDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("expenseDate")} />
        </Field>
        <Field label="Vendor" error={errors.vendorName?.message}>
          <Input placeholder={t("Optional")} {...register("vendorName")} />
        </Field>
        <Field label="Vehicle" error={errors.vehicleId?.message}>
          <select className={selectClassName} {...register("vehicleId")}>
            <option value="">{t("Not linked")}</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} - {vehicle.brand} {vehicle.model}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2 lg:col-span-3">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={t("Record Expense")}
        onCancel={onCancel}
      />
    </form>
  );
}

function CashMovementForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  movementType,
  onCancel,
  onSave,
  ownerPinRequired,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  movementType: CashMovementType;
  onCancel: () => void;
  onSave: (input: CashMovementInput, approvalToken?: string) => Promise<void>;
  ownerPinRequired: boolean;
}) {
  const { t } = useI18n();
  const [ownerPin, setOwnerPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setValue,
  } = useForm<CashMovementFormValues, unknown, CashMovementInput>({
    resolver: zodResolver(cashMovementFormSchema),
    defaultValues: getDefaultCashMovementFormValues(movementType),
    mode: "onBlur",
  });
  const fromLocation = useWatch({ control, name: "fromLocation" }) ?? "cash_drawer";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[fromLocation];
  const amount = parseMoney(amountValue);

  async function submit(input: CashMovementInput) {
    setLocalError(null);
    let approvalToken: string | undefined;

    if (input.amount > balances[input.fromLocation]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    if (input.type === "owner_withdrawal" && ownerPinRequired) {
      if (!/^\d{4}$/.test(ownerPin)) {
        setLocalError(t("PIN must be exactly 4 digits."));
        return;
      }

      const approval = await window.rentalApp.security.approveSensitiveAction({
        action: "cashMovements.ownerWithdrawal",
        pin: ownerPin,
      });
      approvalToken = approval.token;
    }

    await onSave(input, approvalToken);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <input type="hidden" value={movementType} {...register("type")} />

      {movementType === "transfer" ? (
        <div className="flex flex-wrap gap-2">
          {transferPresets.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setValue("fromLocation", preset.from, { shouldValidate: true });
                setValue("toLocation", preset.to, { shouldValidate: true });
              }}
            >
              {t(preset.label)}
            </Button>
          ))}
        </div>
      ) : null}

      <BalanceHint
        amount={amount}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="From" required error={errors.fromLocation?.message}>
          <select className={selectClassName} {...register("fromLocation")}>
            {moneyLocationValues.map((location) => (
              <option key={location} value={location}>
                {formatMoneyLocation(location, language)}
              </option>
            ))}
          </select>
        </Field>
        {movementType === "transfer" ? (
          <Field label="To" required error={errors.toLocation?.message}>
            <select className={selectClassName} {...register("toLocation")}>
              <option value="">{t("Select destination")}</option>
              {moneyLocationValues
                .filter((location) => location !== fromLocation)
                .map((location) => (
                  <option key={location} value={location}>
                    {formatMoneyLocation(location, language)}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Date & Time" required error={errors.movementDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("movementDate")} />
        </Field>
        {movementType === "owner_withdrawal" && ownerPinRequired ? (
          <Field label="Owner PIN" required>
            <Input
              autoComplete="current-password"
              data-ltr="true"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              type="password"
              value={ownerPin}
              onChange={(event) =>
                setOwnerPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </Field>
        ) : null}
        <div className="md:col-span-2 lg:col-span-3">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={formatCashMovementType(movementType, language)}
        onCancel={onCancel}
      />
    </form>
  );
}

function AdjustmentForm({
  balances,
  error,
  formatCurrency,
  isSaving,
  language,
  onCancel,
  onSave,
  ownerPinRequired,
}: {
  balances: LocationBalances;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  language: "ar" | "en";
  onCancel: () => void;
  onSave: (input: AccountingAdjustmentInput, approvalToken?: string) => Promise<void>;
  ownerPinRequired: boolean;
}) {
  const { t } = useI18n();
  const [ownerPin, setOwnerPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<AccountingAdjustmentFormValues, unknown, AccountingAdjustmentInput>({
    resolver: zodResolver(accountingAdjustmentFormSchema),
    defaultValues: getDefaultAccountingAdjustmentFormValues(),
    mode: "onBlur",
  });
  const location = useWatch({ control, name: "location" }) ?? "cash_drawer";
  const direction = useWatch({ control, name: "direction" }) ?? "increase";
  const amountValue = useWatch({ control, name: "amount" });
  const available = balances[location];
  const amount = parseMoney(amountValue);

  async function submit(input: AccountingAdjustmentInput) {
    setLocalError(null);
    let approvalToken: string | undefined;

    if (input.direction === "decrease" && input.amount > balances[input.location]) {
      setLocalError(t("Amount is more than the available balance."));
      return;
    }

    if (ownerPinRequired) {
      if (!/^\d{4}$/.test(ownerPin)) {
        setLocalError(t("PIN must be exactly 4 digits."));
        return;
      }

      const approval = await window.rentalApp.security.approveSensitiveAction({
        action: "accountingAdjustments.create",
        pin: ownerPin,
      });
      approvalToken = approval.token;
    }

    await onSave(input, approvalToken);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => void submit(values))}>
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <BalanceHint
        amount={direction === "decrease" ? amount : 0}
        available={available}
        formatCurrency={formatCurrency}
        t={t}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Location" required error={errors.location?.message}>
          <select className={selectClassName} {...register("location")}>
            {moneyLocationValues.map((moneyLocation) => (
              <option key={moneyLocation} value={moneyLocation}>
                {formatMoneyLocation(moneyLocation, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Direction" required error={errors.direction?.message}>
          <select className={selectClassName} {...register("direction")}>
            {accountingAdjustmentDirectionValues.map((value) => (
              <option key={value} value={value}>
                {formatAccountingAdjustmentDirection(value, language)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required error={errors.amount?.message}>
          <Input data-ltr="true" inputMode="decimal" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Adjustment Date" required error={errors.adjustmentDate?.message}>
          <Input data-ltr="true" type="datetime-local" {...register("adjustmentDate")} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Reason" required error={errors.reason?.message}>
            <Input {...register("reason")} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea rows={3} {...register("notes")} />
          </Field>
        </div>
        {ownerPinRequired ? (
          <Field label="Owner PIN" required>
            <Input
              autoComplete="current-password"
              data-ltr="true"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              type="password"
              value={ownerPin}
              onChange={(event) =>
                setOwnerPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </Field>
        ) : null}
      </div>

      <FormActions
        cancelLabel={t("Cancel")}
        isSaving={isSaving}
        saveLabel={t("Save Adjustment")}
        onCancel={onCancel}
      />
    </form>
  );
}

function BalanceHint({
  amount,
  available,
  formatCurrency,
  t,
}: {
  amount: number;
  available: number;
  formatCurrency: (value: number) => string;
  t: (key: string) => string;
}) {
  const remaining = available - amount;
  const overdrawn = amount > available;

  return (
    <div
      className={
        overdrawn
          ? "rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          : "rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm"
      }
    >
      <div className="flex flex-wrap justify-between gap-3">
        <span>{t("Available Balance")}</span>
        <strong>
          <BidiValue value={formatCurrency(available)} />
        </strong>
      </div>
      {amount > 0 ? (
        <div className="mt-1 flex flex-wrap justify-between gap-3 text-muted-foreground">
          <span>{t("After Save")}</span>
          <strong className={overdrawn ? "text-destructive" : "text-foreground"}>
            <BidiValue value={formatCurrency(remaining)} />
          </strong>
        </div>
      ) : null}
      {overdrawn ? (
        <p className="mt-2 font-medium">
          {t("Amount is more than the available balance.")}
        </p>
      ) : null}
    </div>
  );
}

function DailyClosingForm({
  closing,
  error,
  formatCurrency,
  isSaving,
  onCancel,
  onSave,
}: {
  closing: AccountingDailyClosingRecord | null;
  error: string | null;
  formatCurrency: (value: number) => string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: {
    countedCash: number;
    notes: string | null;
    reason?: string;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const expectedCash = closing?.expectedCash ?? 0;
  const [countedCash, setCountedCash] = useState(
    closing?.countedCash === null || closing?.countedCash === undefined
      ? ""
      : String(closing.countedCash),
  );
  const [notes, setNotes] = useState(closing?.notes ?? "");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const parsedCountedCash = Number(countedCash);
  const difference =
    countedCash && Number.isFinite(parsedCountedCash)
      ? parsedCountedCash - expectedCash
      : null;

  async function submit() {
    setLocalError(null);

    if (!Number.isFinite(parsedCountedCash) || parsedCountedCash < 0) {
      setLocalError(t("Counted cash must be zero or more."));
      return;
    }

    if (closing?.isClosed && reason.trim().length === 0) {
      setLocalError(t("Reason is required when closing this day again."));
      return;
    }

    await onSave({
      countedCash: parsedCountedCash,
      notes: notes.trim() || null,
      reason: reason.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error || localError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ? t(error) : localError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <DailyItem label={t("Expected Cash")} value={formatCurrency(expectedCash)} />
        <DailyItem
          label={t("Counted Cash")}
          value={countedCash ? formatCurrency(parsedCountedCash) : t("Not available")}
        />
        <div
          className={
            difference === null
              ? "rounded-xl border border-border/70 bg-background px-4 py-3"
              : difference === 0
                ? "rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-success"
                : "rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-warning"
          }
        >
          <p className="text-xs font-medium text-muted-foreground">{t("Difference")}</p>
          <div className="mt-2 font-bold">
            {difference === null ? t("Not available") : formatCurrency(difference)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Counted Cash" required>
          <div className="flex gap-2">
            <Input
              data-ltr="true"
              inputMode="decimal"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setCountedCash(String(expectedCash))}
            >
              {t("Use Expected Cash")}
            </Button>
          </div>
        </Field>
        {closing?.isClosed ? (
          <Field label="Reason" required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        ) : null}
        <div className="md:col-span-2">
          <Field label="Notes">
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => {
            if (closing?.isClosed) {
              setConfirmOpen(true);
            } else {
              void submit();
            }
          }}
        >
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          {closing?.isClosed ? t("Close Day Again") : t("Close Day")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("Close day again?")}
        description={t("This will replace the saved daily closing for this date.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Close Day Again")}
        isBusy={isSaving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit();
        }}
      />
    </div>
  );
}

function FormActions({
  cancelLabel,
  isSaving,
  onCancel,
  saveLabel,
}: {
  cancelLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-3 border-t pt-4">
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <Loader2 data-icon="inline-start" /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}

type FieldProps = {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
};

function Field({ children, error, label, required = false }: FieldProps) {
  const { t } = useI18n();

  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {t(label)}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs font-normal text-destructive">{t(error)}</span> : null}
    </label>
  );
}

function summaryToBalances(summary: AccountingSummary): LocationBalances {
  return {
    bank: summary.bank,
    cash_drawer: summary.cashDrawer,
    shop_safe: summary.shopSafe,
  };
}

function getPendingVoidAction(pendingVoid: PendingVoid): SensitiveAction {
  if (pendingVoid?.source === "expense") return "expenses.void";
  if (pendingVoid?.source === "adjustment") return "accountingAdjustments.void";

  return "cashMovements.void";
}

function formatTransactionLocation(
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

function formatTransactionTitle(
  row: AccountingTransactionRecord,
  language: "ar" | "en",
  t: (key: string) => string,
): string {
  if (row.source === "expense" && isExpenseCategory(row.title)) {
    return formatExpenseCategory(row.title, language);
  }

  return t(row.title);
}

function formatTransactionDetail(
  row: AccountingTransactionRecord,
  language: "ar" | "en",
  t: (key: string) => string,
): string {
  if (row.source === "cash_movement" || row.source === "adjustment") {
    return formatTransactionLocation(row, language);
  }

  return row.detail || t("Not available");
}

function getSignedTransactionAmount(row: AccountingTransactionRecord): number {
  if (row.kind === "money_out") {
    return -row.amount;
  }

  if (row.kind === "adjustment" && row.fromLocation) {
    return -row.amount;
  }

  return row.amount;
}

function getFormTitle(
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

function getFormDescription(
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

function formatExpenseMethodLabel(location: MoneyLocation): string {
  return getExpensePaymentMethodForLocation(location) === "bank_transfer"
    ? "Bank Transfer"
    : "Cash";
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategoryValues.includes(value as ExpenseCategory);
}

function parseMoney(value: unknown): number {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

const selectClassName =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
