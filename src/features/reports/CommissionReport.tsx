import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/useI18n";
import type { CommissionReportRecord, CommissionReportSummary } from "@/shared/reports";
import type { UserListRecord } from "@/shared/auth";
import { Coins, Calendar, User, Car } from "lucide-react";

export function CommissionReport() {
  const { formatCurrency, formatDate, language, t } = useI18n();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesUserId, setSalesUserId] = useState<number | undefined>(undefined);
  const [vehicleType, setVehicleType] = useState<"all" | "car" | "motorcycle">("all");
  const [users, setUsers] = useState<UserListRecord[]>([]);
  const [data, setData] = useState<CommissionReportSummary>({
    records: [],
    totalRentals: 0,
    totalDays: 0,
    totalCommission: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.users.list().then(setUsers).catch(console.error);
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.rentalApp.reports.getCommissions({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        salesUserId: salesUserId || undefined,
        vehicleType,
      });
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, salesUserId, vehicleType]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadReport();
    }, 150);
    return () => clearTimeout(timeout);
  }, [loadReport]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Controls */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block font-medium">{t("From Date")}</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block font-medium">{t("To Date")}</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block font-medium">{t("Sales Employee")}</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={salesUserId ?? ""}
            onChange={(e) =>
              setSalesUserId(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">{t("All Employees")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} ({user.username})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block font-medium">{t("Vehicle Type")}</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={vehicleType}
            onChange={(e) =>
              setVehicleType(e.target.value as "all" | "car" | "motorcycle")
            }
          >
            <option value="all">{t("All Vehicles")}</option>
            <option value="car">{t("Car")}</option>
            <option value="motorcycle">{t("Motorcycle")}</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Coins className="size-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("Total Commission")}</div>
            <div className="text-xl font-bold">{formatCurrency(data.totalCommission)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Calendar className="size-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("Rented Days")}</div>
            <div className="text-xl font-bold">{data.totalDays}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Car className="size-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("Total Rentals")}</div>
            <div className="text-xl font-bold">{data.totalRentals}</div>
          </div>
        </div>
      </div>

      {/* Itemized Table */}
      <DataTable className="min-w-full">
        <thead>
          <tr>
            <Th>{t("Contract #")}</Th>
            <Th>{t("Customer")}</Th>
            <Th>{t("Vehicle")}</Th>
            <Th>{t("Sales Employee")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-center">{t("Rented Days")}</Th>
            <Th className="text-end">{t("Rate / Day")}</Th>
            <Th className="text-end">{t("Total Commission")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <EmptyTableRow colSpan={8} message={t("Loading...")} state="loading" />
          ) : data.records.length === 0 ? (
            <EmptyTableRow colSpan={8} message={t("No commission records found for selected filters.")} />
          ) : (
            data.records.map((r) => (
              <tr key={r.rentalId}>
                <Td className="font-mono font-medium">
                  <BidiValue value={r.contractNo} />
                </Td>
                <Td>{r.customerName}</Td>
                <Td>
                  <div>
                    <BidiValue value={r.vehiclePlateNumber} />
                    <span className="block text-xs text-muted-foreground">
                      {r.vehicleBrand} {r.vehicleModel}
                    </span>
                  </div>
                </Td>
                <Td>{r.salesUserName ?? t("Not assigned")}</Td>
                <Td>
                  <Badge variant={r.status === "returned" ? "secondary" : r.status === "active" ? "default" : "outline"}>
                    {r.status}
                  </Badge>
                </Td>
                <Td className="text-center">{r.rentedDays}</Td>
                <Td className="text-end font-mono">{formatCurrency(r.commissionRatePerDay)}</Td>
                <Td className="text-end font-mono font-bold text-primary">
                  {formatCurrency(r.commissionAmount)}
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
