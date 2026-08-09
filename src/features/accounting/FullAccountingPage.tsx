import {
  formatExpenseCategory,
  type AccountingAdjustmentInput,
  type AccountingVoidInput,
  type AccountingTransactionKind,
  type CashMovementInput,
  type ExpenseInput,
} from "@/shared/accounting";
import {
  ArrowLeftRight,
  FileSpreadsheet,
  FileText,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { rentalAppApi } from "@/data/rental-app-api";
import { useAuth } from "@/hooks/useAuth";
import {
  useBusinessMutation,
  useBusinessQuery,
  useCommandMutation,
} from "@/data/hooks";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useI18n } from "@/hooks/useI18n";
import { useMemo, useState } from "react";
import { EmployeeLoansSection } from "./EmployeeLoansSection";
import { AdjustmentForm, CashMovementForm, DailyClosingForm, ExpenseForm } from "./accounting-forms";
import { emptyExpensePage, emptySummary, emptyTransactionPage, formatTransactionTitle, getErrorMessage, getFormDescription, getFormTitle, getPendingVoidAction, kindFilters, sectionFilters, summaryToBalances, toDateInputValue, type AccountingSection, type FormState, type PendingVoid } from "./accounting-shared";
import { BalancesSection, ExpensesTable, ListFilters, LocationBalanceGrid, TodaySection, TransactionsTable } from "./accounting-tables";

/**
 * The owner accounting screen. It keeps the composite read that fills every
 * panel at once, and every mutation those panels trigger.
 */
export function FullAccountingPage() {
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
  const [transactionPageNumber, setTransactionPageNumber] = useState(1);
  const [expensePageNumber, setExpensePageNumber] = useState(1);
  const [formState, setFormState] = useState<FormState>(null);
  const [pendingVoid, setPendingVoid] = useState<PendingVoid>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Failures raised by an action; a failed load is derived below.
  const [actionError, setActionError] = useState<string | null>(null);
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

  /**
   * One composite read for the whole page.
   *
   * Kept as a single `Promise.all` behind one key so the screen keeps its
   * all-or-nothing behaviour: every panel appears together, and one failing
   * call shows one error rather than six half-filled sections. Every filter,
   * page number and search term is part of the key.
   */
  // Memoised on the primitive fields. A fresh object literal here would change
  // identity on every render, and the debounce would restart its timer forever.
  const filterInput = useMemo(
    () => ({
      selectedDate,
      listDateFrom,
      listDateTo,
      transactionSearch,
      expenseSearch,
      kind,
      transactionPageNumber,
      expensePageNumber,
      dailyClosingEnabled,
    }),
    [
      dailyClosingEnabled,
      expensePageNumber,
      expenseSearch,
      kind,
      listDateFrom,
      listDateTo,
      selectedDate,
      transactionPageNumber,
      transactionSearch,
    ],
  );
  const filters = useDebouncedValue(filterInput, 150);
  const accountingQuery = useBusinessQuery(
    "accounting",
    "overview",
    filters,
    async () => {
      const selectedDateRequest = {
        dateFrom: filters.selectedDate,
        dateTo: filters.selectedDate,
      };
      const transactionRequest = {
        dateFrom: filters.listDateFrom || undefined,
        dateTo: filters.listDateTo || undefined,
        search: filters.transactionSearch,
      };
      const expenseRequest = {
        dateFrom: filters.listDateFrom || undefined,
        dateTo: filters.listDateTo || undefined,
        search: filters.expenseSearch,
      };
      const [
        nextSummary,
        nextTransactions,
        nextExpenses,
        nextClosing,
        nextOutstanding,
        nextDeposits,
      ] = await Promise.all([
        rentalAppApi.accounting.getSummary(selectedDateRequest),
        rentalAppApi.accounting.listTransactions({
          ...transactionRequest,
          kind: filters.kind,
          page: filters.transactionPageNumber,
        }),
        rentalAppApi.accounting.listExpenses({
          ...expenseRequest,
          page: filters.expensePageNumber,
        }),
        filters.dailyClosingEnabled
          ? rentalAppApi.accounting.getDailyClosing(filters.selectedDate)
          : Promise.resolve(null),
        rentalAppApi.reports.listOutstandingBalances({
          includeTotal: false,
          pageSize: 8,
        }),
        rentalAppApi.reports.listDeposits({
          heldOnly: true,
          includeTotal: false,
          pageSize: 8,
        }),
      ]);

      return {
        summary: nextSummary,
        transactionPage: nextTransactions,
        expensePage: nextExpenses,
        dailyClosing: nextClosing,
        outstandingBalances: nextOutstanding.rows,
        deposits: nextDeposits.rows,
      };
    },
  );
  const isLoading = accountingQuery.isPending;
  // The Refresh button tracks fetching, not first-load pending, so it keeps
  // behaving after the page has data.
  const isRefreshing = accountingQuery.isFetching;
  const summary = accountingQuery.data?.summary ?? emptySummary;
  const transactionPage = accountingQuery.data?.transactionPage ?? emptyTransactionPage;
  const expensePage = accountingQuery.data?.expensePage ?? emptyExpensePage;
  const dailyClosing = accountingQuery.data?.dailyClosing ?? null;
  const outstandingBalances = accountingQuery.data?.outstandingBalances ?? [];
  const deposits = accountingQuery.data?.deposits ?? [];
  const error = actionError ??
    (accountingQuery.isError
      ? getErrorMessage(accountingQuery.error, t("Accounting could not be loaded."))
      : null);

  // The vehicle picker used when tagging an expense to a vehicle.
  const vehicleRequest = { pageSize: 100 };
  const vehiclesQuery = useBusinessQuery(
    "vehicles",
    "list",
    vehicleRequest,
    () => rentalAppApi.vehicles.list(vehicleRequest),
  );
  const vehicles = vehiclesQuery.data?.rows ?? [];
  const balances = summaryToBalances(summary);

  async function refreshAccounting() {
    const result = await accountingQuery.refetch();

    if (!result.isError) {
      setActionError(null);
    }
  }

  const createExpense = useBusinessMutation((input: ExpenseInput) =>
    rentalAppApi.accounting.createExpense(input),
  );
  const createCashMovement = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.accounting.createCashMovement>[0]) =>
      rentalAppApi.accounting.createCashMovement(input),
  );
  const createAdjustment = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.accounting.createAdjustment>[0]) =>
      rentalAppApi.accounting.createAdjustment(input),
  );
  const saveDailyClosing = useBusinessMutation(
    (input: Parameters<typeof rentalAppApi.accounting.saveDailyClosing>[0]) =>
      rentalAppApi.accounting.saveDailyClosing(input),
  );
  const voidExpense = useBusinessMutation((input: AccountingVoidInput) =>
    rentalAppApi.accounting.voidExpense(input),
  );
  const voidCashMovement = useBusinessMutation((input: AccountingVoidInput) =>
    rentalAppApi.accounting.voidCashMovement(input),
  );
  const voidAdjustment = useBusinessMutation((input: AccountingVoidInput) =>
    rentalAppApi.accounting.voidAdjustment(input),
  );
  // Exporting and printing change nothing.
  const exportCommand = useCommandMutation(
    (input: Parameters<typeof rentalAppApi.reports.export>[0]) =>
      rentalAppApi.reports.export(input),
  );
  const printPaymentReceipt = useCommandMutation((paymentId: number) =>
    rentalAppApi.payments.printReceipt(paymentId, false),
  );
  const printSaleReceipt = useCommandMutation((saleId: number) =>
    rentalAppApi.vehicleSales.printReceipt(saleId, false),
  );

  function resetListPages() {
    setTransactionPageNumber(1);
    setExpensePageNumber(1);
  }

  async function handleCreateExpense(input: ExpenseInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      await createExpense.mutateAsync(input);
      setFormState(null);
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
      await createCashMovement.mutateAsync({
        ...input,
        approvalToken,
      });
      setFormState(null);
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
      await createAdjustment.mutateAsync({
        ...input,
        approvalToken,
      });
      setFormState(null);
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
      await saveDailyClosing.mutateAsync({
        closingDate: selectedDate,
        ...input,
      });
      setFormState(null);
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
    setActionError(null);

    try {
      if (pendingVoid.source === "expense") {
        await voidExpense.mutateAsync({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      } else if (pendingVoid.source === "cash_movement") {
        await voidCashMovement.mutateAsync({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      } else {
        await voidAdjustment.mutateAsync({
          id: pendingVoid.id,
          reason: values.reason,
          approvalToken: values.approvalToken,
        });
      }

      setPendingVoid(null);
    } catch (err) {
      setActionError(getErrorMessage(err, t("Record could not be voided.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport(type: "accountingTransactions" | "expenses") {
    const result = await exportCommand.mutateAsync({
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
              disabled={isRefreshing}
              onClick={() => void refreshAccounting()}
            >
              <RefreshCw
                className={isRefreshing ? "animate-spin" : undefined}
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
              void printPaymentReceipt.mutateAsync(paymentId)
            }
            onPrintVehicleSale={(saleId) =>
              void printSaleReceipt.mutateAsync(saleId)
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
