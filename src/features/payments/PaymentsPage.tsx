import { FileDown, Info, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SidePanel } from "@/components/ui/side-panel";
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

export function PaymentsPage() {
  const { formatCurrency, formatDateTime, language, t } = useI18n();
  const [paymentPage, setPaymentPage] = useState(emptyPaymentPage);
  const [selectedPayment, setSelectedPayment] = useState<PaymentListRecord | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PaymentTypeFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={t("Search contract, customer, plate, or notes")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={dateFrom}
            className="w-40"
            aria-label={t("From")}
            onChange={(event) => {
              setDateFrom(event.target.value);
              resetToFirstPage();
            }}
          />
          <Input
            type="date"
            value={dateTo}
            className="w-40"
            aria-label={t("To")}
            onChange={(event) => {
              setDateTo(event.target.value);
              resetToFirstPage();
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {typeFilters.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={type === filter.value ? "default" : "outline"}
            onClick={() => {
              setType(filter.value);
              resetToFirstPage();
            }}
          >
            {t(filter.label)}
          </Button>
        ))}
      </div>

      <SidePanel
        open={Boolean(selectedPayment)}
        title={t("Payment Details")}
        description={
          selectedPayment
            ? `${selectedPayment.contractNo} · ${selectedPayment.customerName} · ${selectedPayment.vehiclePlateNumber}`
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
            onPrintReceipt={(printToPDF) =>
              void window.rentalApp.payments.printReceipt(selectedPayment.id, printToPDF)
            }
          />
        ) : null}
      </SidePanel>

      <section className="rounded-md border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("Payment History")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("A list of all recorded payments, deposits, extra charges, and refunds.")}
            </p>
          </div>
          <Badge variant="secondary">
            {t("{{count}} shown", { count: paymentPage.total })}
          </Badge>
        </div>
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DataTable className="min-w-[900px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <Th>{t("Date & Time")}</Th>
              <Th>{t("Contract")}</Th>
              <Th>{t("Customer")}</Th>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Type")}</Th>
              <Th className="text-end">{t("Amount")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={7} message={t("Loading payments...")} />
            ) : paymentPage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={7}
                message={
                  search.trim()
                    ? t("No payments match this search.")
                    : t("No payments recorded yet.")
                }
              />
            ) : (
              paymentPage.rows.map((payment) => (
                <tr key={payment.id} className="border-t hover:bg-muted/25">
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
                  <Td className="text-end font-semibold">
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
      </section>
    </div>
  );
}

function PaymentDetailPanel({
  formatCurrency,
  formatDateTime,
  language,
  onPrintReceipt,
  payment,
  t,
}: {
  formatCurrency: (amount: number) => string;
  formatDateTime: (value: string | Date) => string;
  language: "ar" | "en";
  onPrintReceipt: (printToPDF: boolean) => void;
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
        <DetailItem
          alignEnd
          label={t("Amount")}
          value={<BidiValue value={`${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`} />}
        />
      </div>

      <div className="rounded-md border p-4">
        <div className="text-xs font-medium text-muted-foreground">{t("Notes")}</div>
        <p className="mt-1 text-sm">{payment.notes || t("No notes")}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
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
