import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { VehicleIncomeRecord } from "@/shared/reports";

export function VehicleIncomeReport() {
  const today = new Date();
  const firstDay = toDateInputValue(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const lastDay = toDateInputValue(
    new Date(today.getFullYear(), today.getMonth() + 1, 0),
  );

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [incomeRecords, setIncomeRecords] = useState<VehicleIncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!startDate || !endDate) return;

    window.rentalApp.reports
      .getVehicleIncome(startDate, endDate)
      .then((data) => {
        setIncomeRecords(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [startDate, endDate]);

  const totalIncome = incomeRecords.reduce((sum, r) => sum + r.totalIncome, 0);
  const totalRentals = incomeRecords.reduce((sum, r) => sum + r.rentalCount, 0);

  function handleStartDateChange(value: string) {
    setStartDate(value);
    setLoading(Boolean(value && endDate));

    if (!value || !endDate) {
      setIncomeRecords([]);
    }
  }

  function handleEndDateChange(value: string) {
    setEndDate(value);
    setLoading(Boolean(startDate && value));

    if (!startDate || !value) {
      setIncomeRecords([]);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="startDate" className="text-sm font-medium">
            From
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
            To
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

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-[2fr_1fr_1fr] bg-muted px-4 py-3 text-sm font-medium">
          <span>Vehicle</span>
          <span className="text-right">Rentals</span>
          <span className="text-right">Income</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : incomeRecords.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
            No income recorded for this period.
          </div>
        ) : (
          <div className="divide-y">
            {incomeRecords.map((record) => (
              <div
                key={record.vehicleId}
                className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 px-4 py-3 text-sm hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {record.brand} {record.model}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {record.plateNumber}
                  </div>
                </div>
                <div className="text-right text-muted-foreground">
                  {record.rentalCount}
                </div>
                <div className="text-right font-medium">
                  {formatMoney(record.totalIncome)}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[2fr_1fr_1fr] items-center gap-4 bg-muted/30 px-4 py-3 text-sm font-semibold">
              <div className="text-right">Total:</div>
              <div className="text-right">{totalRentals}</div>
              <div className="text-right">{formatMoney(totalIncome)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";

  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
