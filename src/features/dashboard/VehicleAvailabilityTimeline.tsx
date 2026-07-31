import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import type { VehicleRecord } from "@/shared/vehicles";
import type { RentalListRecord } from "@/shared/rentals";
import { Calendar, ChevronLeft, ChevronRight, Car, Bike } from "lucide-react";

export function VehicleAvailabilityTimeline() {
  const { formatDate, language, t } = useI18n();
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [rentals, setRentals] = useState<RentalListRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysCount, setDaysCount] = useState<7 | 14 | 30>(14);
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [vRes, rRes] = await Promise.all([
          window.rentalApp.vehicles.list({ pageSize: 100 }),
          window.rentalApp.rentals.list({ queue: "all", pageSize: 200 }),
        ]);
        setVehicles(vRes.rows);
        setRentals(rRes.rows.filter((r) => r.status === "active" || r.status === "overdue"));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      list.push(d);
    }
    return list;
  }, [startDate, daysCount]);

  function shiftDays(amount: number) {
    setStartDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + amount);
      return next;
    });
  }

  function resetToToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setStartDate(d);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2 font-bold text-lg">
          <Calendar className="size-5 text-primary" />
          <span>{t("Vehicle Availability Timeline")}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-muted/30 p-1 text-xs">
            <Button
              size="sm"
              variant={daysCount === 7 ? "secondary" : "ghost"}
              className="h-7 px-2.5"
              onClick={() => setDaysCount(7)}
            >
              7 {t("Days")}
            </Button>
            <Button
              size="sm"
              variant={daysCount === 14 ? "secondary" : "ghost"}
              className="h-7 px-2.5"
              onClick={() => setDaysCount(14)}
            >
              14 {t("Days")}
            </Button>
            <Button
              size="sm"
              variant={daysCount === 30 ? "secondary" : "ghost"}
              className="h-7 px-2.5"
              onClick={() => setDaysCount(30)}
            >
              30 {t("Days")}
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="size-8" title={t("Previous Days")} onClick={() => shiftDays(-7)}>
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs font-medium" onClick={resetToToday}>
              {t("Today")}
            </Button>
            <Button size="icon" variant="outline" className="size-8" title={t("Next Days")} onClick={() => shiftDays(7)}>
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground border-b pb-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" />
          <span>{t("Available")}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" />
          <span>{t("Rented")}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive" />
          <span>{t("Overdue")}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-purple-500" />
          <span>{t("Maintenance")}</span>
        </span>
      </div>

      {/* Grid view */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("Loading...")}</div>
      ) : vehicles.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("No vehicles registered.")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky start-0 z-10 min-w-44 bg-muted/90 p-2 text-start font-semibold">
                  {t("Vehicle")}
                </th>
                {days.map((d) => {
                  const isToday =
                    d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
                  return (
                    <th
                      key={d.toISOString()}
                      className={`min-w-16 p-2 text-center font-medium ${
                        isToday ? "bg-primary/15 text-primary font-bold" : ""
                      }`}
                    >
                      <div>{d.toLocaleDateString(language === "ar" ? "ar-LY" : "en-US", { weekday: "short" })}</div>
                      <div className="text-[10px] text-muted-foreground">{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const vehicleRentals = rentals.filter((r) => r.vehicleId === v.id);
                return (
                  <tr key={v.id} className="border-b transition-colors hover:bg-muted/20">
                    <td className="sticky start-0 z-10 flex items-center gap-2 border-r bg-card p-2 font-medium">
                      {v.type === "motorcycle" ? (
                        <Bike className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Car className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <BidiValue value={v.plateNumber} className="block font-mono font-bold" />
                        <span className="truncate block text-[10px] text-muted-foreground">
                          {v.brand} {v.model}
                        </span>
                      </div>
                    </td>

                    {days.map((d) => {
                      const dayStart = new Date(d);
                      dayStart.setHours(0, 0, 0, 0);
                      const dayEnd = new Date(d);
                      dayEnd.setHours(23, 59, 59, 999);

                      const activeRental = vehicleRentals.find((r) => {
                        const rStart = new Date(r.startDatetime);
                        const rEnd = new Date(r.expectedReturnDatetime);
                        return rStart <= dayEnd && rEnd >= dayStart;
                      });

                      const isVehicleMaintenance = v.status === "maintenance";

                      if (isVehicleMaintenance) {
                        return (
                          <td key={d.toISOString()} className="p-1 text-center bg-purple-500/10 text-purple-700 dark:text-purple-300">
                            <span className="text-[10px] font-semibold">{t("Maintenance")}</span>
                          </td>
                        );
                      }

                      if (activeRental) {
                        const isOverdue = activeRental.status === "overdue";
                        return (
                          <td
                            key={d.toISOString()}
                            className={`p-1 text-center font-medium ${
                              isOverdue
                                ? "bg-destructive/20 text-destructive font-bold"
                                : "bg-primary/20 text-primary"
                            }`}
                            title={`${activeRental.customerName} (${activeRental.contractNo})`}
                          >
                            <span className="block truncate text-[10px]">
                              {activeRental.customerName.split(" ")[0]}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={d.toISOString()} className="p-1 text-center bg-emerald-500/5 text-emerald-600/60 dark:text-emerald-400/60">
                          <span className="text-[10px]">•</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
