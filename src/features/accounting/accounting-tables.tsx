import {
  formatExpenseCategory,
  formatMoneyLocation,
  moneyLocationValues,
  type AccountingDailyClosingRecord,
  type AccountingSummary,
  type AccountingTransactionRecord,
  type ExpenseListRecord,
  type LocationBalances,
} from "@/shared/accounting";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
} from "lucide-react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import type {
  DepositReportRecord,
  OutstandingBalanceRecord,
} from "@/shared/reports";
import { Input } from "@/components/ui/input";
import type { PageResult } from "@/shared/pagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { type ReactNode } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { useI18n } from "@/hooks/useI18n";
import { formatExpenseMethodLabel, formatTransactionDetail, formatTransactionLocation, formatTransactionTitle, getSignedTransactionAmount, rowClassName } from "./accounting-shared";

/**
 * Tables and summary panels. Each is handed its rows and its formatters;
 * none of them fetch, and none decide a permission.
 */
export function LocationBalanceGrid({
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

export function TodaySection({
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

export function ListFilters({
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

export function CompactMetric({
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

export function DailyItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 font-bold">
        {typeof value === "string" ? <BidiValue value={value} /> : value}
      </div>
    </div>
  );
}

export function TransactionsTable({
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

export function ExpensesTable({
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

export function BalancesSection({
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
