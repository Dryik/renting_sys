import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import { formatPaymentMethod, formatPaymentType } from "@/shared/payments";
import type { DailyPaymentRecord } from "@/shared/reports";
import { ReportExportButtons } from "./ReportExportButtons";

const emptyPaymentPage: PageResult<DailyPaymentRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export function DailyPaymentsReport() {
  const { formatCurrency, formatDate, language, t } = useI18n();
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [page, setPage] = useState(1);
  const request = { date, page };
  const paymentsQuery = useBusinessQuery<PageResult<DailyPaymentRecord>>(
    "reports",
    "dailyPayments",
    request,
    () => rentalAppApi.reports.getDailyPayments(request),
  );
  const paymentPage = paymentsQuery.data ?? emptyPaymentPage;
  const loading = paymentsQuery.isPending;

  const pageTotal = useMemo(() => {
    return paymentPage.rows.reduce(
      (sum, payment) => sum + getSignedPaymentAmount(payment),
      0,
    );
  }, [paymentPage.rows]);

  function handleDateChange(value: string) {
    setDate(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <label htmlFor="paymentDate" className="text-sm font-medium">
            {t("Payment Date")}
          </label>
          <Input
            id="paymentDate"
            type="date"
            value={date}
            onChange={(event) => handleDateChange(event.target.value)}
            className="w-40"
          />
        </div>
        <ReportExportButtons
          type="dailyPayments"
          date={date}
          disabled={loading || paymentPage.total === 0}
        />
      </div>

      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Date")}</Th>
            <Th>{t("Rental & Customer")}</Th>
            <Th>{t("Type")}</Th>
            <Th>{t("Method")}</Th>
            <Th className="text-end">{t("Amount")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyTableRow colSpan={5} message={t("Loading...")} state="loading" />
          ) : paymentPage.rows.length === 0 ? (
            <EmptyTableRow colSpan={5} message={t("No payments recorded on this date.")} />
          ) : (
            <>
              {paymentPage.rows.map((payment) => {
                const isRefund = payment.type === "refund";

                return (
                  <tr key={payment.id} className="border-t">
                    <Td className="whitespace-nowrap tabular-nums text-muted-foreground">
                      <BidiValue value={formatDate(payment.paymentDate)} />
                    </Td>
                    <Td>
                      <div className="truncate font-medium"><BidiValue value={payment.contractNo} /></div>
                      <div className="truncate text-muted-foreground">{payment.customerName}</div>
                    </Td>
                    <Td>
                      <Badge variant="outline" className="capitalize">
                        {formatPaymentType(payment.type, language)}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="capitalize text-muted-foreground">
                        {formatPaymentMethod(payment.method, language)}
                      </span>
                    </Td>
                    <Td className={`text-end font-medium ${isRefund ? "text-warning" : ""}`}>
                      <BidiValue value={formatCurrency(getSignedPaymentAmount(payment))} />
                    </Td>
                  </tr>
                );
              })}
              <tr className="bg-muted/30 font-semibold">
                <Td className="text-end" colSpan={4}>{t("Page Total:")}</Td>
                <Td className="text-end"><BidiValue value={formatCurrency(pageTotal)} /></Td>
              </tr>
            </>
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={paymentPage} t={t} onPageChange={setPage} />
    </div>
  );
}

function getSignedPaymentAmount(payment: DailyPaymentRecord): number {
  return payment.type === "refund" ? -payment.amount : payment.amount;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
