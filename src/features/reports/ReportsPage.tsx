import { useState } from "react";
import { cn } from "@/lib/utils";
import { ActiveRentalsReport } from "./ActiveRentalsReport";
import { OverdueRentalsReport } from "./OverdueRentalsReport";
import { DailyPaymentsReport } from "./DailyPaymentsReport";
import { VehicleIncomeReport } from "./VehicleIncomeReport";

type ReportTab = "active" | "overdue" | "daily" | "income";

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("active");

  const tabs = [
    { id: "active", label: "Active Rentals" },
    { id: "overdue", label: "Overdue Rentals" },
    { id: "daily", label: "Daily Payments" },
    { id: "income", label: "Vehicle Income" },
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
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === "active" && <ActiveRentalsReport />}
        {activeTab === "overdue" && <OverdueRentalsReport />}
        {activeTab === "daily" && <DailyPaymentsReport />}
        {activeTab === "income" && <VehicleIncomeReport />}
      </div>
    </div>
  );
}
