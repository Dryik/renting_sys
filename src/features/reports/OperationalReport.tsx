import { FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import type { DailyClosingRecord, ReportExportType } from "@/shared/reports";
import { cn } from "@/lib/utils";


type OperationalReportProps = {
  type: ReportExportType;
};

type PageInfo = Pick<PageResult<unknown>, "page" | "pageSize" | "total" | "totalPages">;

export function OperationalReport({ type }: OperationalReportProps) {
  const { can } = useAuth();
  const { formatCurrency, locale, t } = useI18n();
  const today = toDateInputValue(new Date());
  const [date, setDate] = useState(today);
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setLoading(true);
      loadRows(type, date, startDate, endDate, page, search)
        .then((result) => {
          if (!cancelled) {
            setRows(result.rows);
            setPageInfo(result.pageInfo ?? null);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : "Report could not be loaded.");
            setRows([]);
            setPageInfo(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [date, endDate, page, search, startDate, type]);

  const headers = getHeaders(type);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dailyClosingRow = type === "dailyClosing"
    ? rows[0] as DailyClosingRecord | undefined
    : undefined;

  async function handleExport(format: "csv" | "xlsx") {
    const result = await window.rentalApp.reports.export({
      type,
      format,
      date,
      startDate,
      endDate,
      search: search.trim() || undefined,
    });

    setMessage(
      result.success
        ? t("Report exported successfully.")
        : t(result.error ?? "Report export failed."),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {usesSearch(type) ? (
            <Input
              className="w-64"
              placeholder={t("Search sale, buyer, or plate")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          ) : null}
          {usesSingleDate(type) ? (
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span>{t("Date")}</span>
              <Input type="date" value={date} className="w-40" onChange={(event) => setDate(event.target.value)} />
            </label>
          ) : usesRange(type) ? (
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{t("From")}</span>
                <Input type="date" value={startDate} className="w-40" onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{t("To")}</span>
                <Input type="date" value={endDate} className="w-40" onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
        {can("reports.export") ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleExport("csv")}>
              <FileText data-icon="inline-start" />
              {t("CSV")}
            </Button>
            <Button variant="outline" onClick={() => void handleExport("xlsx")}>
              <FileSpreadsheet data-icon="inline-start" />
              {t("Excel")}
            </Button>
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      {type === "dailyClosing" ? (
        <DailyClosingSummary
          formatCurrency={formatCurrency}
          loading={loading}
          numberFormatter={numberFormatter}
          row={dailyClosingRow}
          t={t}
        />
      ) : (
        <>
          <DataTable
            className={cn("table-auto", headers.length > 5 ? "min-w-[960px]" : "min-w-full")}
            containerClassName="[&_td]:px-2 [&_th]:px-2 overflow-x-auto"
          >
            <thead>
              <tr>{headers.map((header) => <Th key={header}>{t(formatHeader(header))}</Th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyTableRow colSpan={Math.max(1, headers.length)} message={t("Loading...")} state="loading" />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={Math.max(1, headers.length)} message={t(getEmptyMessage(type))} />
              ) : (
                rows.map((row, index) => (
                  <tr key={index}>
                    {headers.map((header) => (
                      <Td
                        key={header}
                        className={cn(
                          isEndAlignedHeader(header) ? "text-end" : undefined,
                          isNowrapHeader(header) ? "whitespace-nowrap" : undefined,
                        )}
                      >
                        {formatCell(header, row[header], {
                          formatCurrency,
                          numberFormatter,
                          t,
                        })}
                      </Td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
          {isPagedOperationalReport(type) && pageInfo ? (
            <PaginationControls page={pageInfo} t={t} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}

function DailyClosingSummary({
  formatCurrency,
  loading,
  numberFormatter,
  row,
  t,
}: {
  formatCurrency: (value: number) => string;
  loading: boolean;
  numberFormatter: Intl.NumberFormat;
  row: DailyClosingRecord | undefined;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-10 text-center text-sm text-muted-foreground">
        {t("Loading...")}
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-2xl border border-border/80 bg-muted/35 px-4 py-10 text-center text-sm text-muted-foreground">
        {t("No records found.")}
      </div>
    );
  }

  const primaryItems = [
    { label: "Cash payments", value: formatCurrency(row.cashPayments) },
    { label: "Card payments", value: formatCurrency(row.cardPayments) },
    { label: "Bank transfers", value: formatCurrency(row.bankTransfers) },
    { label: "Vehicle Sales", value: formatCurrency(row.vehicleSales) },
    { label: "Refunds", tone: "warning" as const, value: formatCurrency(row.refunds) },
    { label: "Expenses", tone: "warning" as const, value: formatCurrency(row.expenses) },
    { label: "Total collected", tone: "primary" as const, value: formatCurrency(row.totalCollected) },
  ];

  const secondaryItems = [
    { label: "Other Payments", value: formatCurrency(row.otherPayments) },
    { label: "Owner Withdrawals", value: formatCurrency(row.ownerWithdrawals) },
    { label: "Expected Cash", value: formatCurrency(row.expectedCash) },
    {
      label: "Counted Cash",
      value: row.countedCash === null ? t("Not available") : formatCurrency(row.countedCash),
    },
    {
      label: "Difference",
      value: row.difference === null ? t("Not available") : formatCurrency(row.difference),
    },
    {
      label: "Open balances created today",
      value: numberFormatter.format(row.openBalancesCreatedToday),
    },
    {
      label: "Returned rentals unpaid today",
      value: numberFormatter.format(row.returnedRentalsUnpaidToday),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {primaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs"
          >
            <div className="text-xs font-semibold text-muted-foreground">
              {t(item.label)}
            </div>
            <BidiValue
              className={`mt-2 text-lg font-bold ${
                item.tone === "warning"
                  ? "text-warning"
                  : item.tone === "primary"
                    ? "text-primary"
                    : "text-foreground"
              }`}
              value={item.value}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/80 bg-muted/25 p-3 md:grid-cols-3">
        {secondaryItems.map((item) => (
          <div key={item.label} className="min-w-0 rounded-xl bg-card px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t(item.label)}
            </div>
            <BidiValue className="mt-1 font-semibold" value={item.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

async function loadRows(
  type: ReportExportType,
  date: string,
  startDate: string,
  endDate: string,
  page: number,
  search: string,
): Promise<{
  rows: Record<string, unknown>[];
  pageInfo?: PageInfo;
}> {
  if (type === "deposits") {
    const depositPage = await window.rentalApp.reports.listDeposits({ page });

    return {
      rows: depositPage.rows,
      pageInfo: depositPage,
    };
  }

  if (type === "outstandingBalances") {
    const outstandingPage = await window.rentalApp.reports.listOutstandingBalances({ page });

    return {
      rows: outstandingPage.rows,
      pageInfo: outstandingPage,
    };
  }
  if (type === "dailyClosing") {
    return { rows: [await window.rentalApp.reports.getDailyClosing(date)] };
  }
  if (type === "vehicleUtilization") {
    return { rows: await window.rentalApp.reports.getVehicleUtilization(startDate, endDate) };
  }
  if (type === "vehicleNetSummary") {
    return { rows: await window.rentalApp.reports.getVehicleNetSummary(startDate, endDate) };
  }
  if (type === "expiringDocuments") {
    return { rows: await window.rentalApp.reports.getExpiringDocuments() };
  }
  if (type === "cancelledRentals") {
    return { rows: await window.rentalApp.reports.getCancelledRentals() };
  }
  if (type === "paymentVoids") {
    return { rows: await window.rentalApp.reports.getPaymentVoids() };
  }
  if (type === "vehicleSales") {
    const salePage = await window.rentalApp.reports.getVehicleSales({
      dateFrom: startDate,
      dateTo: endDate,
      page,
      search,
    });

    return {
      rows: salePage.rows,
      pageInfo: salePage,
    };
  }

  return { rows: [] };
}

function usesSingleDate(type: ReportExportType): boolean {
  return type === "dailyClosing";
}

function usesRange(type: ReportExportType): boolean {
  return type === "vehicleUtilization" || type === "vehicleNetSummary" || type === "vehicleSales";
}

function isPagedOperationalReport(type: ReportExportType): boolean {
  return type === "deposits" || type === "outstandingBalances" || type === "vehicleSales";
}

function usesSearch(type: ReportExportType): boolean {
  return type === "vehicleSales";
}

function formatHeader(value: string): string {
  const labels: Record<string, string> = {
    bankTransfers: "Bank Transfers",
    buyerIdNumber: "Buyer ID Number",
    buyerName: "Buyer Name",
    buyerPhone: "Buyer Phone",
    cancelledAt: "Cancelled At",
    cancelReason: "Cancel Reason",
    cardPayments: "Card Payments",
    cashPayments: "Cash Payments",
    contractNo: "Contract No",
    customerName: "Customer",
    customerPhone: "Phone",
    daysRemaining: "Days Remaining",
    depositHeld: "Deposit Held",
    depositPaid: "Deposit Paid",
    depositRefunded: "Deposit Refunded",
    depositRequired: "Deposit Required",
    documentType: "Document Type",
    entityType: "Entity",
    expectedReturnDatetime: "Expected Return",
    expiryDate: "Expiry",
    maintenanceCost: "Maintenance Cost",
    method: "Method",
    openBalancesCreatedToday: "Open Balances Created Today",
    otherPayments: "Other Payments",
    ownerWithdrawals: "Owner Withdrawals",
    paidAmount: "Paid",
    paymentId: "Payment Id",
    periodDays: "Period Days",
    plateNumber: "Plate",
    receiptNo: "Receipt No.",
    refund: "Refund",
    refunds: "Refunds",
    expenses: "Expenses",
    expectedCash: "Expected Cash",
    countedCash: "Counted Cash",
    difference: "Difference",
    remainingAmount: "Balance due",
    rentalCount: "Rentals",
    rentalId: "Rental Id",
    rentalIncome: "Rental Income",
    returnedRentalsUnpaidToday: "Returned Rentals Unpaid Today",
    saleDate: "Sale Date",
    saleNo: "Sale No.",
    salePrice: "Sale Price",
    simpleNet: "Simple Net",
    status: "Status",
    totalAmount: "Total Amount",
    totalCollected: "Total Collected",
    type: "Type",
    utilizationPercent: "Utilization Percent",
    vehicleId: "Vehicle Id",
    vehicleBrand: "Brand",
    vehicleModel: "Model",
    vehiclePlateNumber: "Plate",
    vehicleSales: "Vehicle Sales",
    vehicleType: "Vehicle Type",
    voidedAt: "Voided At",
    voidReason: "Void Reason",
  };

  return labels[value] ?? value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function getEmptyMessage(type: ReportExportType): string {
  if (type === "cancelledRentals") {
    return "No cancelled rentals found. Cancelled contracts will appear here after a manager cancels a rental.";
  }

  if (type === "paymentVoids") {
    return "No payment voids found. Voided payments will appear here for review.";
  }

  if (type === "expiringDocuments") {
    return "No expiring documents found.";
  }

  return "No records found.";
}

function getHeaders(
  type: ReportExportType,
): string[] {
  if (type === "dailyClosing") {
    return [
      "cashPayments",
      "cardPayments",
      "bankTransfers",
      "otherPayments",
      "vehicleSales",
      "refunds",
      "expenses",
      "ownerWithdrawals",
      "totalCollected",
      "expectedCash",
      "countedCash",
      "difference",
      "openBalancesCreatedToday",
      "returnedRentalsUnpaidToday",
    ];
  }

  // Return predefined headers to avoid displaying internal database keys
  return getFallbackHeaders(type);
}

function getFallbackHeaders(type: ReportExportType): string[] {
  const headers: Partial<Record<ReportExportType, string[]>> = {
    outstandingBalances: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "status",
      "remainingAmount",
    ],
    dailyClosing: [
      "date",
      "cashPayments",
      "cardPayments",
      "bankTransfers",
      "vehicleSales",
      "refunds",
      "expenses",
      "totalCollected",
    ],
    deposits: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "depositPaid",
      "depositHeld",
    ],
    vehicleUtilization: [
      "plateNumber",
      "rentalCount",
      "rentedDays",
      "periodDays",
      "utilizationPercent",
    ],
    vehicleNetSummary: [
      "plateNumber",
      "rentalIncome",
      "maintenanceCost",
      "simpleNet",
    ],
    expiringDocuments: [
      "entityType",
      "name",
      "documentType",
      "expiryDate",
      "daysRemaining",
    ],
    cancelledRentals: [
      "contractNo",
      "customerName",
      "vehiclePlateNumber",
      "cancelledAt",
      "cancelReason",
    ],
    paymentVoids: [
      "receiptNo",
      "contractNo",
      "customerName",
      "type",
      "voidedAt",
      "voidReason",
    ],
    vehicleSales: [
      "saleNo",
      "saleDate",
      "vehiclePlateNumber",
      "vehicleBrand",
      "vehicleModel",
      "buyerName",
      "buyerPhone",
      "paymentMethod",
      "salePrice",
      "status",
    ],
  };

  return headers[type] ?? [];
}

type CellFormatOptions = {
  formatCurrency: (value: number) => string;
  numberFormatter: Intl.NumberFormat;
  t: (key: string) => string;
};

function formatCell(
  header: string,
  value: unknown,
  { formatCurrency, numberFormatter, t }: CellFormatOptions,
): ReactNode {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    if (isPercentHeader(header)) {
      return <BidiValue value={`${numberFormatter.format(value)}%`} />;
    }

    if (isCountHeader(header)) {
      return <BidiValue value={numberFormatter.format(value)} />;
    }

    if (isMoneyHeader(header)) {
      return (
        <BidiValue
          className={isRefundHeader(header) && value !== 0 ? "text-warning" : undefined}
          value={formatCurrency(value)}
        />
      );
    }

    return <BidiValue value={numberFormatter.format(value)} />;
  }

  const text = String(value);

  if (isEnumHeader(header)) {
    return <span dir="auto">{t(text)}</span>;
  }

  if (isLtrCell(header, text)) {
    return <BidiValue value={text} />;
  }

  return <span dir="auto">{text}</span>;
}

function isEndAlignedHeader(header: string): boolean {
  return isMoneyHeader(header) || isPercentHeader(header) || isCountHeader(header);
}

function isNowrapHeader(header: string): boolean {
  return /phone|plate|contract|date|datetime|status|amount|paid|remaining|held|refund|cost|income|net|type|method/i.test(header);
}

function isMoneyHeader(header: string): boolean {
  return /amount|payment|payments|transfer|refund|collected|deposit|required|paid|held|income|cost|net|expense|withdrawal|cash|difference|price|sales/i.test(header);
}

function isRefundHeader(header: string): boolean {
  return /refund/i.test(header);
}

function isCountHeader(header: string): boolean {
  return /count|days|id$|createdToday|unpaidToday/i.test(header);
}

function isPercentHeader(header: string): boolean {
  return /percent/i.test(header);
}

function isEnumHeader(header: string): boolean {
  return /status|type|method/i.test(header);
}

function isLtrCell(header: string, value: string): boolean {
  return (
    /date|datetime|at$|expiry|return|phone|plate|contract|receipt|path|version|id$/i.test(header) ||
    /^[\d\s.,:;+\-/\\()[\]#A-Z_a-z]+$/.test(value)
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
