import { Edit, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatVehicleType,
  type VehicleInput,
  type VehicleRecord,
} from "@/shared/vehicles";
import { VehicleForm } from "./VehicleForm";
import { VehicleStatusBadge } from "./VehicleStatusBadge";

type FormState =
  | {
      mode: "create";
      vehicle: null;
    }
  | {
      mode: "edit";
      vehicle: VehicleRecord;
    }
  | null;

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);

  const loadVehicles = useCallback(async (searchValue: string) => {
    setIsLoading(true);
    setListError(null);

    try {
      const records = await window.rentalApp.vehicles.list(searchValue);
      setVehicles(records);
    } catch (error) {
      setListError(getErrorMessage(error, "Vehicles could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadVehicles(search);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadVehicles, search]);

  const counts = useMemo(() => {
    return vehicles.reduce(
      (summary, vehicle) => {
        summary.total += 1;
        summary[vehicle.status] += 1;
        return summary;
      },
      {
        total: 0,
        available: 0,
        rented: 0,
        maintenance: 0,
        inactive: 0,
      },
    );
  }, [vehicles]);

  async function handleSave(input: VehicleInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      if (formState?.mode === "edit") {
        await window.rentalApp.vehicles.update(formState.vehicle.id, input);
      } else {
        await window.rentalApp.vehicles.create(input);
      }

      setFormState(null);
      await loadVehicles(search);
    } catch (error) {
      setFormError(getErrorMessage(error, "Vehicle could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateForm() {
    setFormError(null);
    setFormState({ mode: "create", vehicle: null });
  }

  function openEditForm(vehicle: VehicleRecord) {
    setFormError(null);
    setFormState({ mode: "edit", vehicle });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Search plate, brand, or model"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Button onClick={openCreateForm}>
          <Plus data-icon="inline-start" />
          Add Vehicle
        </Button>
      </div>

      {formState ? (
        <VehicleForm
          error={formError}
          isSaving={isSaving}
          vehicle={formState.vehicle}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-2">
        <SummaryBadge label="Total" value={counts.total} />
        <SummaryBadge label="Available" value={counts.available} />
        <SummaryBadge label="Rented" value={counts.rented} />
        <SummaryBadge label="Maintenance" value={counts.maintenance} />
        <SummaryBadge label="Inactive" value={counts.inactive} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Vehicle List</CardTitle>
              <CardDescription>
                Search by plate number, brand, or model.
              </CardDescription>
            </div>
            <Badge variant="secondary">{vehicles.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {listError ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {listError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <Th>Plate</Th>
                  <Th>Vehicle</Th>
                  <Th>Type</Th>
                  <Th>Daily Price</Th>
                  <Th>Deposit</Th>
                  <Th>Status</Th>
                  <Th>Expiry</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <EmptyRow message="Loading vehicles..." />
                ) : vehicles.length === 0 ? (
                  <EmptyRow
                    message={
                      search.trim()
                        ? "No vehicles match this search."
                        : "No vehicles yet. Use Add Vehicle to create the first one."
                    }
                  />
                ) : (
                  vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="border-t">
                      <Td>
                        <span className="font-semibold">{vehicle.plateNumber}</span>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {vehicle.brand} {vehicle.model}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {[vehicle.color, vehicle.year].filter(Boolean).join(" / ") ||
                              "No color or year"}
                          </span>
                        </div>
                      </Td>
                      <Td>{formatVehicleType(vehicle.type)}</Td>
                      <Td>{formatMoney(vehicle.dailyPrice)}</Td>
                      <Td>{formatMoney(vehicle.depositAmount)}</Td>
                      <Td>
                        <VehicleStatusBadge status={vehicle.status} />
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-1 text-xs">
                          <span>
                            Insurance: {vehicle.insuranceExpiryDate ?? "No date"}
                          </span>
                          <span>
                            Registration:{" "}
                            {vehicle.registrationExpiryDate ?? "No date"}
                          </span>
                        </div>
                      </Td>
                      <Td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditForm(vehicle)}
                        >
                          <Edit data-icon="inline-start" />
                          Edit
                        </Button>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>
  );
}

function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td className="px-4 py-12 text-center text-muted-foreground" colSpan={8}>
        {message}
      </td>
    </tr>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
