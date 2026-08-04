import {
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CarFront,
  Coins,
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
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import { ActiveRentalsReport } from "./ActiveRentalsReport";
import { OverdueRentalsReport } from "./OverdueRentalsReport";
import { DailyPaymentsReport } from "./DailyPaymentsReport";
import { VehicleIncomeReport } from "./VehicleIncomeReport";
import { ReturnedRentalsReport } from "./ReturnedRentalsReport";
import { CustomerRentalHistoryReport } from "./CustomerRentalHistoryReport";
import { OperationalReport } from "./OperationalReport";
import { CommissionReport } from "./CommissionReport";
import { PaymentReceiptsReport } from "./PaymentReceiptsReport";

type ReportTab =
  | "active"
  | "overdue"
  | "returned"
  | "daily"
  | "receipts"
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
  | "sales"
  | "commissions";

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
    label: "Everyday Reports",
    reports: [
      { id: "active", label: "Active Rentals", description: "Open contracts currently on the road.", icon: CalendarCheck },
      { id: "overdue", label: "Overdue Rentals", description: "Active contracts past the expected return time.", icon: AlertTriangle },
      { id: "daily", label: "Daily Payments", description: "Payments recorded on a selected date.", icon: CreditCard },
      { id: "receipts", label: "Payment Receipts", description: "Cash vouchers and payment receipt vouchers.", icon: ReceiptText },
      { id: "customer", label: "Customer History", description: "Rental history for one customer.", icon: User },
    ],
  },
  {
    id: "more",
    label: "Additional Reports",
    reports: [
      { id: "returned", label: "Returned Rentals", description: "Completed contracts in a selected period.", icon: RotateCcw },
      { id: "cancelled", label: "Cancelled Rentals", description: "Contracts cancelled by staff or manager.", icon: History },
      { id: "closing", label: "Daily Closing", description: "Cash, card, bank transfer, and refund totals.", icon: CalendarClock },
      { id: "deposits", label: "Deposits", description: "Required, paid, refunded, and held deposits.", icon: CreditCard },
      { id: "outstanding", label: "Outstanding Balances", description: "Contracts with remaining balance due.", icon: ReceiptText },
      { id: "voids", label: "Payment Voids", description: "Voided payments with reasons for review.", icon: ReceiptText },
      { id: "sales", label: "Vehicle Sales", description: "Sold fleet vehicles and sale proceeds.", icon: HandCoins },
      { id: "commissions", label: "Sales Commission", description: "Daily commission calculations by sales employee.", icon: Coins },
      { id: "income", label: "Vehicle Income", description: "Rental income grouped by vehicle.", icon: CarFront },
      { id: "utilization", label: "Vehicle Utilization", description: "Rental days and utilization for a date range.", icon: CarFront },
      { id: "net", label: "Vehicle Net Summary", description: "Simple rental income minus maintenance cost.", icon: FileText },
      { id: "expiring", label: "Expiring Documents", description: "Insurance, registration, and license renewals.", icon: CalendarClock },
    ],
  },
];

export function ReportsPage() {
  const { settings, t } = useI18n();
  const [activeTab, setActiveTab] = useState<ReportTab | null>(null);
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
  const visibleActiveTab = activeTab && reports.some((report) => report.id === activeTab)
    ? activeTab
    : null;
  const activeReport = reports.find((tab) => tab.id === visibleActiveTab);

  if (!visibleActiveTab || !activeReport) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold">{t("Report Hub")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Choose a report to review or export.")}
          </p>
        </div>
        {visibleReportCategories.map((category) => (
          <section key={category.id} className="space-y-3">
            <h3 className="text-base font-bold">{t(category.label)}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {category.reports.map((report) => {
                const Icon = report.icon;

                return (
                  <button
                    key={report.id}
                    className="group flex min-h-28 gap-4 rounded-2xl border border-border/80 bg-card p-4 text-start shadow-xs transition hover:border-primary/40 hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => setActiveTab(report.id)}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold group-hover:text-primary">{t(report.label)}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {t(report.description)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className="min-w-0 rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h3 className="text-lg font-bold">{t(activeReport.label)}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t(activeReport.description)}</p>
        </div>
        <Button variant="outline" onClick={() => setActiveTab(null)}>
          <ArrowLeft className="rtl:rotate-180" data-icon="inline-start" />
          {t("Change Report")}
        </Button>
      </div>
      <div className="min-w-0 p-5">
          {visibleActiveTab === "active" && <ActiveRentalsReport />}
          {visibleActiveTab === "overdue" && <OverdueRentalsReport />}
          {visibleActiveTab === "returned" && <ReturnedRentalsReport />}
          {visibleActiveTab === "daily" && <DailyPaymentsReport />}
          {visibleActiveTab === "receipts" && <PaymentReceiptsReport />}
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
          {visibleActiveTab === "commissions" && <CommissionReport />}
      </div>
    </section>
  );
}
