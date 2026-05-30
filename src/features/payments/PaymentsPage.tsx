import {
  Ban,
  CalendarDays,
  CreditCard,
  FileDown,
  Info,
  Pencil,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MetricStrip } from "@/components/ui/metric-strip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { SidePanel } from "@/components/ui/side-panel";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import {
  formatPaymentMethod,
  formatPaymentType,
  type PaymentListRecord,
  type PaymentTypeFilter,
} from "@/shared/payments";

const emptyPaymentPage: PageResult<PaymentListRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const typeFilters: { value: PaymentTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "rent", label: "Rent" },
  { value: "deposit", label: "Deposit" },
  { value: "extra_charge", label: "Extra Charge" },
  { value: "refund", label: "Refund" },
];

const filterGroupClassName =
  "flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-xs";
const filterLabelClassName =
  "inline-flex items-center gap-1 px-1 text-xs font-semibold text-muted-foreground";
const rowClassName =
  "group transition-colors hover:bg-muted/40 focus-within:bg-muted/40";

type PendingPaymentAction = {
  payment: PaymentListRecord;
  type: "correct" | "void";
} | null;

export function PaymentsPage() {
  const { can } = useAuth();
  const { formatCurrency, formatDateTime, language, settings, t } = useI18n();
  const [paymentPage, setPaymentPage] = useState(emptyPaymentPage);
  const [selectedPayment, setSelectedPayment] = useState<PaymentListRecord | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PaymentTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPaymentAction, setPendingPaymentAction] =
    useState<PendingPaymentAction>(null);
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [actionDialogError, setActionDialogError] = useState<string | null>(null);

  const loadPayments = useCallback(async (nextPage = page) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.rentalApp.payments.list({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: nextPage,
        search,
        type,
      });
      setPaymentPage(result);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Payments could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, page, search, t, type]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPayments(page);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadPayments, page]);

  function resetToFirstPage() {
    setPage(1);
  }

  function getSignedAmount(payment: PaymentListRecord): string {
    return `${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`;
  }

  const pageSummary = getPaymentPageSummary(paymentPage.rows);

  async function performPaymentAction(values: {
    approvalToken?: string;
    reason?: string;
  }) {
    if (!pendingPaymentAction || !values.reason) {
      return;
    }

    const { payment, type: actionType } = pendingPaymentAction;
    setIsMutating(true);
    setError(null);
    setActionDialogError(null);

    try {
      if (actionType === "void") {
        await window.rentalApp.payments.void({
          approvalToken: values.approvalToken,
          paymentId: payment.id,
          reason: values.reason,
        });
      } else {
        const amount = Number(correctionAmount);

        if (!Number.isFinite(amount) || amount <= 0) {
          setActionDialogError(t("Amount must be more than zero."));
          return;
        }

        await window.rentalApp.payments.correct({
          approvalToken: values.approvalToken,
          paymentId: payment.id,
          reason: values.reason,
          replacement: {
            rentalId: payment.rentalId,
            type: payment.type,
            method: payment.method,
            amount,
            paymentDate: new Date().toISOString(),
            notes: payment.notes
              ? `${payment.notes} (${t("Corrected payment")})`
              : t("Corrected payment"),
          },
        });
      }

      setSelectedPayment(null);
      setPendingPaymentAction(null);
      setCorrectionAmount("");
      await loadPayments(page);
    } catch (err) {
      setError(
        err instanceof Error
          ? t(err.message)
          : actionType === "void"
            ? t("Payment could not be voided.")
            : t("Payment could not be corrected."),
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCorrectPayment(payment: PaymentListRecord) {
    setCorrectionAmount(String(payment.amount));
    setActionDialogError(null);
    setPendingPaymentAction({ type: "correct", payment });
  }

  function handleVoidPayment(payment: PaymentListRecord) {
    setActionDialogError(null);
    setPendingPaymentAction({ type: "void", payment });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3 md:flex md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{t("Payment History")}</CardTitle>
            <CardDescription>
              {t("Recorded rent, deposits, charges, and refunds.")}
            </CardDescription>
          </div>
          <Button
            className="w-full md:w-auto"
            size="lg"
            variant="outline"
            disabled={isLoading}
            onClick={() => void loadPayments(page)}
          >
            <RefreshCw
              className={isLoading ? "animate-spin" : undefined}
              data-icon="inline-start"
            />
            {t("Refresh")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SearchInput
            containerClassName="max-w-2xl"
            className="h-11"
            placeholder={t("Search contract, customer, plate, or notes")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />

          <div className="flex flex-wrap gap-3">
            <div className={filterGroupClassName}>
              <span className={filterLabelClassName}>
                <CreditCard data-icon="inline-start" />
                {t("Type")}
              </span>
              {typeFilters.map((filter) => (
                <Button
                  key={filter.value}
                  aria-pressed={type === filter.value}
                  type="button"
                  size="sm"
                  variant={type === filter.value ? "secondary" : "outline"}
                  onClick={() => {
                    setType(filter.value);
                    resetToFirstPage();
                  }}
                >
                  {t(filter.label)}
                </Button>
              ))}
            </div>

            <div className={filterGroupClassName}>
              <span className={filterLabelClassName}>
                <CalendarDays data-icon="inline-start" />
                {t("Date")}
              </span>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="payment-date-from">
                {t("From")}
              </label>
              <Input
                id="payment-date-from"
                type="date"
                value={dateFrom}
                className="h-9 w-36"
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  resetToFirstPage();
                }}
              />
              <label className="text-xs font-medium text-muted-foreground" htmlFor="payment-date-to">
                {t("To")}
              </label>
              <Input
                id="payment-date-to"
                type="date"
                value={dateTo}
                className="h-9 w-36"
                onChange={(event) => {
                  setDateTo(event.target.value);
                  resetToFirstPage();
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <SidePanel
        open={Boolean(selectedPayment)}
        title={t("Payment Details")}
        description={
          selectedPayment
            ? (
                <>
                  <BidiValue value={selectedPayment.contractNo} /> ·{" "}
                  <span dir="auto">{selectedPayment.customerName}</span> ·{" "}
                  <BidiValue value={selectedPayment.vehiclePlateNumber} />
                </>
              )
            : undefined
        }
        width="md"
        onClose={() => setSelectedPayment(null)}
      >
        {selectedPayment ? (
          <PaymentDetailPanel
            formatCurrency={formatCurrency}
            formatDateTime={formatDateTime}
            language={language}
            payment={selectedPayment}
            t={t}
            isMutating={isMutating}
            onPrintReceipt={(printToPDF) =>
              void window.rentalApp.payments.printReceipt(selectedPayment.id, printToPDF)
            }
            onCorrectPayment={can("payments.void") ? () => void handleCorrectPayment(selectedPayment) : undefined}
            onVoidPayment={can("payments.void") ? () => void handleVoidPayment(selectedPayment) : undefined}
          />
        ) : null}
      </SidePanel>

      <MetricStrip
        columns={5}
        items={[
          { label: t("Collected shown"), value: <BidiValue value={formatCurrency(pageSummary.collected)} /> },
          { label: t("Cash"), value: <BidiValue value={formatCurrency(pageSummary.cash)} /> },
          { label: t("Card"), value: <BidiValue value={formatCurrency(pageSummary.card)} /> },
          { label: t("Bank Transfer"), value: <BidiValue value={formatCurrency(pageSummary.bankTransfer)} /> },
          { label: t("Refunds"), tone: "warning", value: <BidiValue value={formatCurrency(pageSummary.refunds)} /> },
        ]}
      />

      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t("Payments")}</CardTitle>
            <CardDescription>
              {t("A list of all recorded payments, deposits, extra charges, and refunds.")}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {t("{{count}} shown", { count: paymentPage.total })}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DataTable className="min-w-[900px]" containerClassName="min-h-[22rem]">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              <Th>{t("Date & Time")}</Th>
              <Th>{t("Contract")}</Th>
              <Th>{t("Customer")}</Th>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Type")}</Th>
              <Th>{t("Status")}</Th>
              <Th className="text-end">{t("Amount")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={8} message={t("Loading payments...")} state="loading" />
            ) : paymentPage.rows.length === 0 ? (
              <PaymentEmptyRow
                colSpan={8}
                hasSearch={Boolean(search.trim() || dateFrom || dateTo || type !== "all")}
                t={t}
              />
            ) : (
              paymentPage.rows.map((payment) => (
                <tr
                  key={payment.id}
                  className={`${rowClassName} ${payment.status === "voided" ? "opacity-65" : ""}`}
                >
                  <Td className="whitespace-nowrap tabular-nums">
                    <BidiValue value={formatDateTime(payment.paymentDate)} />
                  </Td>
                  <Td className="font-medium">
                    <BidiValue value={payment.contractNo} />
                  </Td>
                  <Td className="font-medium">{payment.customerName}</Td>
                  <Td>
                    <BidiValue value={payment.vehiclePlateNumber} />
                  </Td>
                  <Td>
                    <Badge variant="outline">
                      {formatPaymentType(payment.type, language)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={payment.status === "voided" ? "destructive" : "secondary"}>
                      {t(payment.status === "voided" ? "Voided" : "Posted")}
                    </Badge>
                  </Td>
                  <Td
                    className={`text-end font-semibold ${
                      payment.status === "voided"
                        ? "text-muted-foreground line-through"
                        : payment.type === "refund"
                          ? "text-warning"
                          : ""
                    }`}
                  >
                    <BidiValue value={getSignedAmount(payment)} />
                  </Td>
                  <Td className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedPayment(payment)}
                    >
                      <Info data-icon="inline-start" />
                      {t("Details")}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={paymentPage} t={t} onPageChange={setPage} />
        </CardContent>
      </Card>
      <SensitiveActionDialog
        action={pendingPaymentAction?.type === "correct" ? "payments.correct" : "payments.void"}
        open={Boolean(pendingPaymentAction)}
        title={t(
          pendingPaymentAction?.type === "correct"
            ? "Correct Payment"
            : "Void Payment",
        )}
        description={t(
          pendingPaymentAction?.type === "correct"
            ? "Enter the correction reason and owner PIN if required."
            : "Enter the void reason and owner PIN if required.",
        )}
        ownerPinRequired={settings.ownerPinEnabled}
        reasonLabel={t(
          pendingPaymentAction?.type === "correct"
            ? "Correction reason"
            : "Void reason",
        )}
        cancelLabel={t("Cancel")}
        confirmLabel={t(
          pendingPaymentAction?.type === "correct"
            ? "Correct Payment"
            : "Void Payment",
        )}
        confirmDisabled={
          pendingPaymentAction?.type === "correct" &&
          (!Number.isFinite(Number(correctionAmount)) || Number(correctionAmount) <= 0)
        }
        variant="destructive"
        isBusy={isMutating}
        onCancel={() => {
          setPendingPaymentAction(null);
          setCorrectionAmount("");
          setActionDialogError(null);
        }}
        onConfirm={(values) => void performPaymentAction(values)}
      >
        {pendingPaymentAction?.type === "correct" ? (
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Replacement amount")}</span>
            <Input
              data-ltr="true"
              inputMode="decimal"
              value={correctionAmount}
              onChange={(event) => {
                setCorrectionAmount(event.target.value);
                setActionDialogError(null);
              }}
            />
          </label>
        ) : null}
        {actionDialogError ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(actionDialogError)}
          </p>
        ) : null}
      </SensitiveActionDialog>
    </div>
  );
}

function PaymentEmptyRow({
  colSpan,
  hasSearch,
  t,
}: {
  colSpan: number;
  hasSearch: boolean;
  t: (key: string) => string;
}) {
  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
          <div className="font-medium text-foreground">
            {hasSearch ? t("No payments match this search.") : t("No payments yet")}
          </div>
          <p className="text-sm text-muted-foreground">
            {hasSearch
              ? t("Search contract, customer, plate, or notes")
              : t("Payments appear here after they are recorded from a rental.")}
          </p>
        </div>
      </td>
    </tr>
  );
}

function getPaymentPageSummary(rows: PaymentListRecord[]) {
  return rows.reduce(
    (summary, payment) => {
      if (payment.status === "voided") {
        return summary;
      }

      if (payment.type === "refund") {
        summary.refunds += payment.amount;
        return summary;
      }

      summary.collected += payment.amount;

      if (payment.method === "cash") summary.cash += payment.amount;
      if (payment.method === "card") summary.card += payment.amount;
      if (payment.method === "bank_transfer") summary.bankTransfer += payment.amount;

      return summary;
    },
    {
      bankTransfer: 0,
      card: 0,
      cash: 0,
      collected: 0,
      refunds: 0,
    },
  );
}

function PaymentDetailPanel({
  formatCurrency,
  formatDateTime,
  isMutating,
  language,
  onCorrectPayment,
  onPrintReceipt,
  onVoidPayment,
  payment,
  t,
}: {
  formatCurrency: (amount: number) => string;
  formatDateTime: (value: string | Date) => string;
  isMutating: boolean;
  language: "ar" | "en";
  onCorrectPayment?: () => void;
  onPrintReceipt: (printToPDF: boolean) => void;
  onVoidPayment?: () => void;
  payment: PaymentListRecord;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label={t("Contract")} value={<BidiValue value={payment.contractNo} />} />
        <DetailItem label={t("Customer")} value={payment.customerName} />
        <DetailItem label={t("Vehicle")} value={<BidiValue value={payment.vehiclePlateNumber} />} />
        <DetailItem label={t("Date & Time")} value={<BidiValue value={formatDateTime(payment.paymentDate)} />} />
        <DetailItem label={t("Type")} value={formatPaymentType(payment.type, language)} />
        <DetailItem label={t("Method")} value={formatPaymentMethod(payment.method, language)} />
        <DetailItem label={t("Receipt No.")} value={payment.receiptNo ?? t("Not available")} />
        <DetailItem label={t("Status")} value={t(payment.status === "voided" ? "Voided" : "Posted")} />
        <DetailItem
          alignEnd
          label={t("Amount")}
          value={(
            <BidiValue
              className={payment.type === "refund" ? "text-warning" : undefined}
              value={`${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`}
            />
          )}
        />
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
        <div className="text-xs font-medium text-muted-foreground">{t("Notes")}</div>
        <p className="mt-1 text-sm">{payment.notes || t("No notes")}</p>
      </div>

      {payment.status === "voided" ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">{t("Voided")}</div>
          <p className="mt-1">{payment.voidReason ?? t("No reason provided.")}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {payment.status === "posted" && (onCorrectPayment || onVoidPayment) ? (
          <>
            {onCorrectPayment ? (
              <Button variant="outline" disabled={isMutating} onClick={onCorrectPayment}>
                <Pencil data-icon="inline-start" />
                {t("Correct Payment")}
              </Button>
            ) : null}
            {onVoidPayment ? (
              <Button variant="destructive" disabled={isMutating} onClick={onVoidPayment}>
                <Ban data-icon="inline-start" />
                {t("Void Payment")}
              </Button>
            ) : null}
          </>
        ) : null}
        <Button variant="outline" onClick={() => onPrintReceipt(false)}>
          <Printer data-icon="inline-start" />
          {t("Print Receipt")}
        </Button>
        <Button variant="outline" onClick={() => onPrintReceipt(true)}>
          <FileDown data-icon="inline-start" />
          {t("PDF")}
        </Button>
      </div>
    </div>
  );
}

function DetailItem({
  alignEnd = false,
  label,
  value,
}: {
  alignEnd?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={alignEnd ? "text-end" : undefined}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 text-sm font-medium">{value}</div>
    </div>
  );
}
