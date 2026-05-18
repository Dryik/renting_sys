import {
  Archive,
  BarChart3,
  CarFront,
  CreditCard,
  Database,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { DashboardCards } from "@/features/dashboard/DashboardCards";
import { RentalsPage } from "@/features/rentals/RentalsPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { VehiclesPage } from "@/features/vehicles/VehiclesPage";
import { cn } from "@/lib/utils";

type PageId =
  | "dashboard"
  | "vehicles"
  | "customers"
  | "rentals"
  | "payments"
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
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "backup", label: "Backup", icon: Archive },
];

const pageCopy: Record<
  PageId,
  {
    title: string;
    description: string;
    primaryAction?: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  dashboard: {
    title: "Dashboard",
    description: "Today's rental status at a glance.",
    emptyTitle: "No shop data yet",
    emptyDescription: "Vehicles, rentals, and payments will appear here after setup.",
  },
  vehicles: {
    title: "Vehicles",
    description: "Cars and motorcycles available for rental.",
    primaryAction: "Add Vehicle",
    emptyTitle: "No vehicles yet",
    emptyDescription: "Vehicle records will be added in the Vehicles milestone.",
  },
  customers: {
    title: "Customers",
    description: "Customer names, phone numbers, and license details.",
    primaryAction: "Add Customer",
    emptyTitle: "No customers yet",
    emptyDescription: "Customer records will be added in the Customers milestone.",
  },
  rentals: {
    title: "Rentals",
    description: "Rental contracts and return workflow.",
    primaryAction: "New Rental",
    emptyTitle: "No rentals yet",
    emptyDescription: "Rental contracts will be added in the Rentals milestone.",
  },
  payments: {
    title: "Payments",
    description: "Rent, deposits, extra charges, and refunds.",
    primaryAction: "Record Payment",
    emptyTitle: "No payments yet",
    emptyDescription: "Payment recording will be added in the Payments milestone.",
  },
  reports: {
    title: "Reports",
    description: "Simple lists for rentals, payments, and vehicle income.",
    emptyTitle: "No reports yet",
    emptyDescription: "Reports will be added after rental and payment data exists.",
  },
  settings: {
    title: "Settings",
    description: "Shop details, currency, late fee, and contract footer.",
    emptyTitle: "Settings are not ready",
    emptyDescription: "Shop settings will be added in a later milestone.",
  },
  backup: {
    title: "Backup",
    description: "Manual backup and restore for local business data.",
    emptyTitle: "Backup is not ready",
    emptyDescription: "Backup and restore will be added before the installer milestone.",
  },
};

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const activeCopy = pageCopy[activePage];

  useEffect(() => {
    window.rentalApp.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo(null);
    });
  }, []);

  const activeLabel = useMemo(
    () => navigation.find((item) => item.id === activePage)?.label ?? "Dashboard",
    [activePage],
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="border-b px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CarFront data-icon="inline-start" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Rental Desk</h1>
              <p className="truncate text-sm text-muted-foreground">Local desktop app</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                <Icon data-icon="inline-start" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t px-4 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database data-icon="inline-start" />
            <span className="truncate">{appInfo ? "Database ready" : "Starting database"}</span>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between border-b bg-card px-6">
          <div>
            <p className="text-sm text-muted-foreground">Current page</p>
            <h2 className="text-xl font-semibold">{activeLabel}</h2>
          </div>
          <Badge variant="secondary">Version 1 Foundation</Badge>
        </header>

        <section className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-2xl font-semibold tracking-normal">{activeCopy.title}</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {activeCopy.description}
              </p>
            </div>

            {activeCopy.primaryAction &&
            activePage !== "vehicles" &&
            activePage !== "customers" &&
            activePage !== "rentals" ? (
              <Button disabled>
                <Plus data-icon="inline-start" />
                {activeCopy.primaryAction}
              </Button>
            ) : null}
          </div>

          {activePage === "dashboard" ? (
            <DashboardCards appInfo={appInfo} />
          ) : activePage === "vehicles" ? (
            <VehiclesPage />
          ) : activePage === "customers" ? (
            <CustomersPage />
          ) : activePage === "rentals" ? (
            <RentalsPage />
          ) : activePage === "reports" ? (
            <ReportsPage />
          ) : (
            <SectionPlaceholder pageId={activePage} />
          )}
        </section>
      </main>
    </div>
  );
}


function SectionPlaceholder({ pageId }: { pageId: PageId }) {
  const copy = pageCopy[pageId];

  return (
    <Card className="min-h-96">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>{copy.emptyTitle}</CardTitle>
            <CardDescription>{copy.emptyDescription}</CardDescription>
          </div>
          <div className="flex h-10 min-w-72 items-center gap-2 rounded-md border bg-muted px-3 text-sm text-muted-foreground">
            <Search data-icon="inline-start" />
            <span>Search will be added with this module</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[1fr_1fr_140px] bg-muted px-4 py-3 text-sm font-medium">
            <span>Name</span>
            <span>Details</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="flex min-h-52 items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground">
            Records will appear here when this milestone is implemented.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
