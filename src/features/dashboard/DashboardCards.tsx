import { useEffect, useState, type ReactNode } from "react";
import { CarFront, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BidiValue } from "@/components/ui/bidi-value";
import { MetricStrip } from "@/components/ui/metric-strip";
import type { DashboardStats } from "@/shared/reports";
import { useI18n } from "@/hooks/useI18n";
import type { AppInfo } from "../../../electron/types";

type DashboardCardsProps = {
  appInfo: AppInfo | null;
  onNewRental: () => void;
  onReturnVehicle: () => void;
};

export function DashboardCards({
  appInfo,
  onNewRental,
  onReturnVehicle,
}: DashboardCardsProps) {
  const { formatCurrency, locale, t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.rentalApp.reports
      .getDashboardStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load dashboard stats", error);
        setLoading(false);
      });
  }, []);

  const numberFormatter = new Intl.NumberFormat(locale);
  const displayStats = [
    {
      label: t("Available Vehicles"),
      tone: "good" as const,
      value: numberFormatter.format(stats?.availableVehicles ?? 0),
    },
    {
      label: t("Rented Vehicles"),
      value: numberFormatter.format(stats?.rentedVehicles ?? 0),
    },
    {
      label: t("Overdue Rentals"),
      tone: "danger" as const,
      value: numberFormatter.format(stats?.overdueRentals ?? 0),
    },
    {
      label: t("Expected Returns Today"),
      tone: "warning" as const,
      value: numberFormatter.format(stats?.expectedReturnsToday ?? 0),
    },
    {
      label: t("Income Today"),
      value: formatCurrency(stats?.incomeToday ?? 0),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <MetricStrip
        columns={5}
        items={displayStats.map((stat) => ({
          label: stat.label,
          tone: stat.tone,
          value: loading ? <BidiValue value="..." /> : <BidiValue value={stat.value} />,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-md border bg-card p-5 shadow-xs">
          <h3 className="text-lg font-semibold">{t("Today work")}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <WorkItem
              label={t("Start a rental")}
              description={t("Choose customer and available vehicle.")}
              actionLabel={t("New Rental")}
              icon={<FileText data-icon="inline-start" />}
              onClick={onNewRental}
            />
            <WorkItem
              label={t("Receive a vehicle")}
              description={t("Complete return, charges, and vehicle status.")}
              actionLabel={t("Return Vehicle")}
              icon={<RotateCcw data-icon="inline-start" />}
              onClick={onReturnVehicle}
            />
          </div>
        </div>

        <div className="rounded-md border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <CarFront data-icon="inline-start" />
            </div>
            <div>
              <h3 className="font-semibold">{t("Data status")}</h3>
              <p className="text-sm text-muted-foreground">
                {appInfo ? t("Local database is ready.") : t("Starting database")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkItem({
  actionLabel,
  description,
  icon,
  label,
  onClick,
}: {
  actionLabel: string;
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <Button className="mt-4" type="button" onClick={onClick}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
