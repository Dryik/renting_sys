import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardStats } from "@/shared/reports";
import type { AppInfo } from "../../../electron/types";

export function DashboardCards({ appInfo }: { appInfo: AppInfo | null }) {
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

  const displayStats = [
    { label: "Available Vehicles", value: stats?.availableVehicles ?? "0" },
    { label: "Rented Vehicles", value: stats?.rentedVehicles ?? "0" },
    { label: "Overdue Rentals", value: stats?.overdueRentals ?? "0" },
    { label: "Expected Returns Today", value: stats?.expectedReturnsToday ?? "0" },
    { label: "Income Today", value: `$${stats?.incomeToday.toFixed(2) ?? "0.00"}` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-5 md:grid-cols-2">
        {displayStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="gap-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">
                {loading ? "..." : stat.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Local Data Storage</CardTitle>
          <CardDescription>
            Production data is initialized inside the Electron app data directory.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <DataPath
            label="Database file"
            value={appInfo?.databasePath ?? "Starting..."}
          />
          <DataPath
            label="Uploads folder"
            value={appInfo?.uploadsPath ?? "Starting..."}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function DataPath({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-md border bg-muted/40 p-3 md:grid-cols-[150px_1fr]">
      <span className="font-medium">{label}</span>
      <span className="break-all text-muted-foreground">{value}</span>
    </div>
  );
}
