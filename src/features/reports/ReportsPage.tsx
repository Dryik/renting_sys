import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { ActiveRentalsReport } from "./ActiveRentalsReport";
import { OverdueRentalsReport } from "./OverdueRentalsReport";
import { DailyPaymentsReport } from "./DailyPaymentsReport";
import { VehicleIncomeReport } from "./VehicleIncomeReport";
import { ReturnedRentalsReport } from "./ReturnedRentalsReport";
import { CustomerRentalHistoryReport } from "./CustomerRentalHistoryReport";

type ReportTab = "active" | "overdue" | "returned" | "daily" | "income" | "customer";

export function ReportsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReportTab>("active");

  const tabs = [
    { id: "active", label: "Active Rentals" },
    { id: "overdue", label: "Overdue Rentals" },
    { id: "returned", label: "Returned Rentals" },
    { id: "daily", label: "Daily Payments" },
    { id: "income", label: "Vehicle Income" },
    { id: "customer", label: "Customer History" },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b pb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            )}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === "active" && <ActiveRentalsReport />}
        {activeTab === "overdue" && <OverdueRentalsReport />}
        {activeTab === "returned" && <ReturnedRentalsReport />}
        {activeTab === "daily" && <DailyPaymentsReport />}
        {activeTab === "income" && <VehicleIncomeReport />}
        {activeTab === "customer" && <CustomerRentalHistoryReport />}
      </div>
    </div>
  );
}
