import { FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessQuery, useCommandMutation } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import type { DailyClosingRecord, ReportExportType } from "@/shared/reports";
import { DailyClosingSummary } from "./DailyClosingSummary";
import { OperationalReportTable } from "./OperationalReportTable";
import {
  getEmptyMessage,
  getHeaders,
  isPagedOperationalReport,
  toDateInputValue,
  usesRange,
  usesSearch,
  usesSingleDate,
} from "./operational-report-config";

type OperationalReportProps = {
  type: ReportExportType;
};

type PageInfo = Pick<PageResult<unknown>, "page" | "pageSize" | "total" | "totalPages">;

/**
 * Owns the report's filters, its query and its export command; the two
 * components below it only render what they are handed. Every report type
 * shares this one orchestration, which is why the per-type decisions live in
 * `operational-report-config`.
 */
export function OperationalReport({ type }: OperationalReportProps) {
  const { can } = useAuth();
  const { formatCurrency, locale, t } = useI18n();
  const today = toDateInputValue(new Date());
  const [date, setDate] = useState(today);
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  // Every argument the report reads is in the key, so switching report type,
  // date range, page or search text asks its own question.
  const request = { type, date, startDate, endDate, page, search };
  const reportQuery = useBusinessQuery(
    "reports",
    "operational",
    request,
    () => loadRows(type, date, startDate, endDate, page, search),
  );
  const rows = reportQuery.data?.rows ?? [];
  const pageInfo = reportQuery.data?.pageInfo ?? null;
  const loading = reportQuery.isPending;
  const loadError = reportQuery.isError
    ? reportQuery.error instanceof Error
      ? reportQuery.error.message
      : "Report could not be loaded."
    : null;
  const message = exportMessage ?? loadError;

  // Exporting writes a file and changes nothing, so it invalidates nothing.
  const exportCommand = useCommandMutation(
    (format: "csv" | "xlsx") =>
      rentalAppApi.reports.export({
        type,
        format,
        date,
        startDate,
        endDate,
        search: search.trim() || undefined,
      }),
  );

  const headers = getHeaders(type);
  const numberFormatter = new Intl.NumberFormat(locale);
  const dailyClosingRow = type === "dailyClosing"
    ? rows[0] as DailyClosingRecord | undefined
    : undefined;

  async function handleExport(format: "csv" | "xlsx") {
    const result = await exportCommand.mutateAsync(format);

    setExportMessage(
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
              <LocalizedDateInput
                value={date}
                displayValue={date}
                className="w-40"
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          ) : usesRange(type) ? (
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{t("From")}</span>
                <LocalizedDateInput
                  value={startDate}
                  displayValue={startDate}
                  className="w-40"
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{t("To")}</span>
                <LocalizedDateInput
                  value={endDate}
                  displayValue={endDate}
                  className="w-40"
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
        {can("reports.export") ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={loading || rows.length === 0}
              title={loading || rows.length === 0 ? t("No data available to export.") : undefined}
              onClick={() => void handleExport("csv")}
            >
              <FileText data-icon="inline-start" />
              {t("Export CSV")}
            </Button>
            <Button
              variant="outline"
              disabled={loading || rows.length === 0}
              title={loading || rows.length === 0 ? t("No data available to export.") : undefined}
              onClick={() => void handleExport("xlsx")}
            >
              <FileSpreadsheet data-icon="inline-start" />
              {t("Export Excel")}
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
          <OperationalReportTable
            emptyMessage={t(getEmptyMessage(type))}
            formatCurrency={formatCurrency}
            headers={headers}
            loading={loading}
            numberFormatter={numberFormatter}
            rows={rows}
            t={t}
          />
          {isPagedOperationalReport(type) && pageInfo ? (
            <PaginationControls page={pageInfo} t={t} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The query function. Each report type reads a different endpoint, and three of
 * them page, so the paging metadata comes back alongside the rows.
 */
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
    const depositPage = await rentalAppApi.reports.listDeposits({ page });

    return {
      rows: depositPage.rows,
      pageInfo: depositPage,
    };
  }

  if (type === "outstandingBalances") {
    const outstandingPage = await rentalAppApi.reports.listOutstandingBalances({ page });

    return {
      rows: outstandingPage.rows,
      pageInfo: outstandingPage,
    };
  }
  if (type === "dailyClosing") {
    return { rows: [await rentalAppApi.reports.getDailyClosing(date)] };
  }
  if (type === "vehicleUtilization") {
    return { rows: await rentalAppApi.reports.getVehicleUtilization(startDate, endDate) };
  }
  if (type === "vehicleNetSummary") {
    return { rows: await rentalAppApi.reports.getVehicleNetSummary(startDate, endDate) };
  }
  if (type === "expiringDocuments") {
    return { rows: await rentalAppApi.reports.getExpiringDocuments() };
  }
  if (type === "cancelledRentals") {
    return { rows: await rentalAppApi.reports.getCancelledRentals() };
  }
  if (type === "paymentVoids") {
    return { rows: await rentalAppApi.reports.getPaymentVoids() };
  }
  if (type === "vehicleSales") {
    const salePage = await rentalAppApi.reports.getVehicleSales({
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
