import { useCallback, useEffect, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { MoneyText } from "@/components/ui/money-text";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import type { RentalListRecord } from "@/shared/rentals";
import { RentalStatusBadge } from "@/features/rentals/RentalStatusBadge";
import { ReportExportButtons } from "./ReportExportButtons";

const emptyReturnedPage: PageResult<RentalListRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export function ReturnedRentalsReport() {
  const { formatCurrency, formatDate, t } = useI18n();
  const today = new Date();
  const [dateFrom, setDateFrom] = useState(
    toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(toDateInputValue(today));
  const [rentalPage, setRentalPage] = useState(emptyReturnedPage);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadRentals = useCallback(async (nextPage = page) => {
    setLoading(true);

    try {
      const data = await window.rentalApp.reports.getReturnedRentals({
        dateFrom,
        dateTo,
        page: nextPage,
      });
      setRentalPage(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRentals(page);
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [loadRentals, page]);

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setPage(1);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="returnedFrom" className="text-sm font-medium">
            {t("From")}
          </label>
          <Input
            id="returnedFrom"
            type="date"
            value={dateFrom}
            onChange={(event) => handleDateFromChange(event.target.value)}
            className="w-40"
          />
          <label htmlFor="returnedTo" className="text-sm font-medium">
            {t("To")}
          </label>
          <Input
            id="returnedTo"
            type="date"
            value={dateTo}
            onChange={(event) => handleDateToChange(event.target.value)}
            className="w-40"
          />
        </div>
        <ReportExportButtons
          type="returnedRentals"
          disabled={loading || rentalPage.total === 0}
          startDate={dateFrom}
          endDate={dateTo}
        />
      </div>

      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Contract No")}</Th>
            <Th>{t("Customer & Vehicle")}</Th>
            <Th>{t("Returned")}</Th>
            <Th className="text-end">{t("Balance")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyTableRow colSpan={4} message={t("Loading...")} state="loading" />
          ) : rentalPage.rows.length === 0 ? (
            <EmptyTableRow colSpan={4} message={t("No returned rentals yet.")} />
          ) : (
            rentalPage.rows.map((rental) => (
              <tr key={rental.id} className="border-t">
                <Td>
                  <BidiValue className="font-medium" value={rental.contractNo} />
                  <div className="mt-1">
                    <RentalStatusBadge status={rental.status} />
                  </div>
                </Td>
                <Td>
                  <div className="truncate font-medium">{rental.customerName}</div>
                  <div className="truncate text-muted-foreground">
                    {rental.vehicleBrand} {rental.vehicleModel} - <BidiValue value={rental.vehiclePlateNumber} />
                  </div>
                </Td>
                <Td className="whitespace-nowrap tabular-nums">
                  {rental.actualReturnDatetime
                    ? <BidiValue value={formatDate(rental.actualReturnDatetime)} />
                    : t("No date")}
                </Td>
                <Td className="text-end">
                  <div className="font-medium">
                    <BidiValue value={formatCurrency(rental.totalAmount)} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rental.remainingAmount < 0 ? t("Credit") : t("Remaining")}{" "}
                    <MoneyText
                      amount={rental.remainingAmount}
                      className="text-xs"
                      formatCurrency={formatCurrency}
                    />
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      <PaginationControls page={rentalPage} t={t} onPageChange={setPage} />
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
