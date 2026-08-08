import { useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useI18n } from "@/hooks/useI18n";
import type { VehicleIncomeRecord } from "@/shared/reports";
import { ReportExportButtons } from "./ReportExportButtons";

export function VehicleIncomeReport() {
  const { formatCurrency, locale, t } = useI18n();
  const today = new Date();
  const firstDay = toDateInputValue(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const lastDay = toDateInputValue(
    new Date(today.getFullYear(), today.getMonth() + 1, 0),
  );

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  // Both dates are in the key, so changing either asks a different question
  // and gets its own answer rather than reusing the previous range's.
  const hasRange = Boolean(startDate && endDate);
  const incomeQuery = useBusinessQuery<VehicleIncomeRecord[]>(
    "reports",
    "vehicleIncome",
    { startDate, endDate },
    () => rentalAppApi.reports.getVehicleIncome(startDate, endDate),
    { enabled: hasRange },
  );
  const incomeRecords = incomeQuery.data ?? [];
  // A disabled query stays "pending" forever, so an incomplete range shows the
  // empty table rather than a spinner that never resolves — as it did before.
  const loading = hasRange && incomeQuery.isPending;

  const totalIncome = incomeRecords.reduce((sum, r) => sum + r.totalIncome, 0);
  const totalRentals = incomeRecords.reduce((sum, r) => sum + r.rentalCount, 0);

  // Clearing a date now simply disables the query, which empties the table and
  // stops the spinner without any bookkeeping here.
  function handleStartDateChange(value: string) {
    setStartDate(value);
  }

  function handleEndDateChange(value: string) {
    setEndDate(value);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="startDate" className="text-sm font-medium">
              {t("From")}
            </label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="endDate" className="text-sm font-medium">
              {t("To")}
            </label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
              className="w-40"
            />
          </div>
        </div>
        <ReportExportButtons
          type="vehicleIncome"
          disabled={loading || incomeRecords.length === 0}
          startDate={startDate}
          endDate={endDate}
        />
      </div>

      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Vehicle")}</Th>
            <Th className="text-end">{t("Rentals")}</Th>
            <Th className="text-end">{t("Income")}</Th>
          </tr>
        </thead>
        <tbody>
        {loading ? (
          <EmptyTableRow colSpan={3} message={t("Loading...")} state="loading" />
        ) : incomeRecords.length === 0 ? (
          <EmptyTableRow colSpan={3} message={t("No income recorded for this period.")} />
        ) : (
          <>
            {incomeRecords.map((record) => (
              <tr
                key={record.vehicleId}
              >
                <Td>
                  <div className="truncate font-medium">
                    {record.brand} {record.model}
                  </div>
                  <div className="truncate text-muted-foreground">
                    <BidiValue value={record.plateNumber} />
                  </div>
                </Td>
                <Td className="text-end text-muted-foreground">
                  <BidiValue value={new Intl.NumberFormat(locale).format(record.rentalCount)} />
                </Td>
                <Td className="text-end font-medium">
                  <BidiValue value={formatCurrency(record.totalIncome)} />
                </Td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <Td className="text-end">{t("Total:")}</Td>
              <Td className="text-end"><BidiValue value={new Intl.NumberFormat(locale).format(totalRentals)} /></Td>
              <Td className="text-end"><BidiValue value={formatCurrency(totalIncome)} /></Td>
            </tr>
          </>
        )}
        </tbody>
      </DataTable>
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
