import {
  Archive,
  BarChart3,
  CarFront,
  CreditCard,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { DashboardCards } from "@/features/dashboard/DashboardCards";
import { RentalsPage } from "@/features/rentals/RentalsPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { VehiclesPage } from "@/features/vehicles/VehiclesPage";
import { PaymentsPage } from "@/features/payments/PaymentsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { BackupPage } from "@/features/backup/BackupPage";
import { MaintenancePage } from "@/features/maintenance/MaintenancePage";
import { useI18n } from "@/hooks/useI18n";

type PageId =
  | "dashboard"
  | "vehicles"
  | "customers"
  | "rentals"
  | "payments"
  | "maintenance"
  | "reports"
  | "settings"
  | "backup";

type NavigationItem = {
  id: PageId;
  label: string;
  icon: LucideIcon;
};

type AppInfo = {
  appVersion: string;
  databasePath: string;
  uploadsPath: string;
};

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "vehicles", label: "Vehicles", icon: CarFront },
  { id: "customers", label: "Customers", icon: Users },
  { id: "rentals", label: "Rentals", icon: FileText },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "backup", label: "Backup", icon: Archive },
];

const pageCopy: Record<
  PageId,
  {
    title: string;
    description: string;
  }
> = {
  dashboard: {
    title: "Dashboard",
    description: "Today work summary.",
  },
  vehicles: {
    title: "Vehicles",
    description: "Vehicle records and current availability.",
  },
  customers: {
    title: "Customers",
    description: "Customer identity and contact details.",
  },
  rentals: {
    title: "Rentals",
    description: "Contracts, payments, returns, and overdue work.",
  },
  payments: {
    title: "Payments",
    description: "Recorded rent, deposits, charges, and refunds.",
  },
  maintenance: {
    title: "Maintenance",
    description: "Service work and vehicle downtime.",
  },
  reports: {
    title: "Reports",
    description: "Operational reports for review and printing.",
  },
  settings: {
    title: "Settings",
    description: "Shop details used on contracts and receipts.",
  },
  backup: {
    title: "Backup",
    description: "Export and restore local business data.",
  },
};

export default function App() {
  const { dir, language, settings, t } = useI18n();
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const activeCopy = pageCopy[activePage];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [dir, language]);

  useEffect(() => {
    window.rentalApp.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo(null);
    });
  }, []);

  return (
    <AppShell
      activePage={activePage}
      dir={dir}
      navigation={navigation}
      onNavigate={setActivePage}
      shopName={settings.shopName}
      t={t}
    >
      <div className="flex min-h-screen flex-col">
        <PageHeader title={t(activeCopy.title)} description={t(activeCopy.description)} />

        <section className="flex flex-1 flex-col gap-6 p-6">
          {activePage === "dashboard" ? (
            <DashboardCards
              appInfo={appInfo}
              onNewRental={() => setActivePage("rentals")}
              onReturnVehicle={() => setActivePage("rentals")}
            />
          ) : activePage === "vehicles" ? (
            <VehiclesPage />
          ) : activePage === "customers" ? (
            <CustomersPage />
          ) : activePage === "rentals" ? (
            <RentalsPage />
          ) : activePage === "payments" ? (
            <PaymentsPage />
          ) : activePage === "maintenance" ? (
            <MaintenancePage />
          ) : activePage === "reports" ? (
            <ReportsPage />
          ) : activePage === "settings" ? (
            <SettingsPage />
          ) : activePage === "backup" ? (
            <BackupPage />
          ) : (
            null
          )}
        </section>
      </div>
    </AppShell>
  );
}
