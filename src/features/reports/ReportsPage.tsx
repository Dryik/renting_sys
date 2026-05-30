import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CarFront,
  CreditCard,
  FileText,
  HandCoins,
  History,
  ReceiptText,
  RotateCcw,
  User,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { ActiveRentalsReport } from "./ActiveRentalsReport";
import { OverdueRentalsReport } from "./OverdueRentalsReport";
import { DailyPaymentsReport } from "./DailyPaymentsReport";
import { VehicleIncomeReport } from "./VehicleIncomeReport";
import { ReturnedRentalsReport } from "./ReturnedRentalsReport";
import { CustomerRentalHistoryReport } from "./CustomerRentalHistoryReport";
import { OperationalReport } from "./OperationalReport";

type ReportTab =
  | "active"
  | "overdue"
  | "returned"
  | "daily"
  | "income"
  | "customer"
  | "outstanding"
  | "closing"
  | "deposits"
  | "utilization"
  | "net"
  | "expiring"
  | "cancelled"
  | "voids"
  | "sales";

type ReportCategory = {
  id: string;
  label: string;
  reports: ReportMeta[];
};

type ReportMeta = {
  id: ReportTab;
  label: string;
  description: string;
  icon: LucideIcon;
};

const reportCategories: ReportCategory[] = [
  {
    id: "everyday",
    label: "Everyday reports",
    reports: [
      { id: "active", label: "Active Rentals", description: "Open contracts currently on the road.", icon: CalendarCheck },
      { id: "overdue", label: "Overdue Rentals", description: "Active contracts past the expected return time.", icon: AlertTriangle },
      { id: "daily", label: "Daily Payments", description: "Payments recorded on a selected date.", icon: CreditCard },
      { id: "customer", label: "Customer History", description: "Rental history for one customer.", icon: User },
    ],
  },
  {
    id: "more",
    label: "More reports",
    reports: [
      { id: "returned", label: "Returned Rentals", description: "Completed contracts in a selected period.", icon: RotateCcw },
      { id: "cancelled", label: "Cancelled Rentals", description: "Contracts cancelled by staff or manager.", icon: History },
      { id: "closing", label: "Daily Closing", description: "Cash, card, bank transfer, and refund totals.", icon: CalendarClock },
      { id: "deposits", label: "Deposits", description: "Required, paid, refunded, and held deposits.", icon: CreditCard },
      { id: "outstanding", label: "Outstanding Balances", description: "Contracts with remaining balance due.", icon: ReceiptText },
      { id: "voids", label: "Payment Voids", description: "Voided payments with reasons for review.", icon: ReceiptText },
      { id: "sales", label: "Vehicle Sales", description: "Sold fleet vehicles and sale proceeds.", icon: HandCoins },
      { id: "income", label: "Vehicle Income", description: "Rental income grouped by vehicle.", icon: CarFront },
      { id: "utilization", label: "Vehicle Utilization", description: "Rental days and utilization for a date range.", icon: CarFront },
      { id: "net", label: "Vehicle Net Summary", description: "Simple rental income minus maintenance cost.", icon: FileText },
      { id: "expiring", label: "Expiring Documents", description: "Insurance, registration, and license renewals.", icon: CalendarClock },
    ],
  },
];

export function ReportsPage() {
  const { settings, t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReportTab>("active");
  const visibleReportCategories = useMemo(
    () =>
      settings.dailyClosingEnabled
        ? reportCategories
        : reportCategories
            .map((category) => ({
              ...category,
              reports: category.reports.filter((report) => report.id !== "closing"),
            }))
            .filter((category) => category.reports.length > 0),
    [settings.dailyClosingEnabled],
  );
  const reports = visibleReportCategories.flatMap((category) => category.reports);
  const visibleActiveTab = reports.some((report) => report.id === activeTab)
    ? activeTab
    : reports[0]?.id ?? "active";
  const activeReport = reports.find((tab) => tab.id === visibleActiveTab) ?? reports[0]!;

  return (
    <div className="grid h-[calc(100vh-9rem)] min-h-[34rem] gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
        <div className="shrink-0 px-2 py-2">
          <h3 className="text-base font-bold">{t("Report workspace")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Pick a report category, then review or export the data.")}
          </p>
        </div>
        <div
          className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pe-1"
          role="tablist"
          aria-label={t("Reports")}
        >
          {visibleReportCategories.map((category) => (
            <section key={category.id} className="flex flex-col gap-1">
              <h4 className="px-2 text-xs font-bold text-muted-foreground">
                {t(category.label)}
              </h4>
              {category.reports.map((report) => {
                const Icon = report.icon;
                const isActive = visibleActiveTab === report.id;

                return (
                  <button
                    key={report.id}
                    aria-selected={isActive}
                    className={cn(
                      "flex w-full gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                      isActive
                        ? "bg-accent text-primary"
                        : "text-foreground hover:bg-muted",
                    )}
                    role="tab"
                    type="button"
                    onClick={() => setActiveTab(report.id)}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {t(report.label)}
                      </span>
                      <span className={cn(
                        "mt-0.5 block text-xs leading-5",
                        isActive ? "text-primary/80" : "text-muted-foreground",
                      )}>
                        {t(report.description)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </aside>

      <section
        className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-border/80 bg-card shadow-sm"
        role="tabpanel"
      >
        <div className="shrink-0 border-b border-border/70 px-5 py-4">
          <h3 className="text-lg font-bold">{t(activeReport.label)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(activeReport.description)}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {visibleActiveTab === "active" && <ActiveRentalsReport />}
          {visibleActiveTab === "overdue" && <OverdueRentalsReport />}
          {visibleActiveTab === "returned" && <ReturnedRentalsReport />}
          {visibleActiveTab === "daily" && <DailyPaymentsReport />}
          {visibleActiveTab === "income" && <VehicleIncomeReport />}
          {visibleActiveTab === "customer" && <CustomerRentalHistoryReport />}
          {visibleActiveTab === "outstanding" && <OperationalReport type="outstandingBalances" />}
          {visibleActiveTab === "closing" && <OperationalReport type="dailyClosing" />}
          {visibleActiveTab === "deposits" && <OperationalReport type="deposits" />}
          {visibleActiveTab === "utilization" && <OperationalReport type="vehicleUtilization" />}
          {visibleActiveTab === "net" && <OperationalReport type="vehicleNetSummary" />}
          {visibleActiveTab === "expiring" && <OperationalReport type="expiringDocuments" />}
          {visibleActiveTab === "cancelled" && <OperationalReport type="cancelledRentals" />}
          {visibleActiveTab === "voids" && <OperationalReport type="paymentVoids" />}
          {visibleActiveTab === "sales" && <OperationalReport type="vehicleSales" />}
        </div>
      </section>
    </div>
  );
}
