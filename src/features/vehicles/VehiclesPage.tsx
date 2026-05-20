import { Edit, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SidePanel } from "@/components/ui/side-panel";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import {
  formatVehicleType,
  type VehicleInput,
  type VehicleRecord,
  type VehicleStatusFilter,
  type VehicleTypeFilter,
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

const emptyVehiclePage: PageResult<VehicleRecord> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const typeFilters: { value: VehicleTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "car", label: "Cars" },
  { value: "motorcycle", label: "Motorcycles" },
];

const statusFilters: { value: VehicleStatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "available", label: "Available" },
  { value: "rented", label: "Rented" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inactive", label: "Inactive" },
];

export function VehiclesPage() {
  const { formatCurrency, language, settings, t } = useI18n();
  const [vehiclePage, setVehiclePage] = useState(emptyVehiclePage);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<VehicleTypeFilter>("all");
  const [status, setStatus] = useState<VehicleStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);

  const loadVehicles = useCallback(async (nextPage = page) => {
    setIsLoading(true);
    setListError(null);

    try {
      const result = await window.rentalApp.vehicles.list({
        page: nextPage,
        search,
        status,
        type,
      });
      setVehiclePage(result);
    } catch (error) {
      setListError(getErrorMessage(error, t("Vehicles could not be loaded.")));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, status, t, type]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadVehicles(page);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [loadVehicles, page]);

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
      await loadVehicles(page);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Vehicle could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  function resetToFirstPage() {
    setPage(1);
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
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-10"
            placeholder={t("Search plate, brand, or model")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetToFirstPage();
            }}
          />
        </div>

        <Button onClick={openCreateForm}>
          <Plus data-icon="inline-start" />
          {t("Add Vehicle")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {typeFilters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={type === filter.value ? "default" : "outline"}
              onClick={() => {
                setType(filter.value);
                resetToFirstPage();
              }}
            >
              {t(filter.label)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={status === filter.value ? "default" : "outline"}
              onClick={() => {
                setStatus(filter.value);
                resetToFirstPage();
              }}
            >
              {t(filter.label)}
            </Button>
          ))}
        </div>
      </div>

      <SidePanel
        open={Boolean(formState)}
        title={formState?.mode === "edit" ? t("Edit Vehicle") : t("Add Vehicle")}
        description={t("Vehicle form description")}
        width="lg"
        onClose={() => setFormState(null)}
      >
        <VehicleForm
          error={formError}
          isSaving={isSaving}
          vehicle={formState?.vehicle ?? null}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
        />
      </SidePanel>

      <section className="rounded-md border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{t("Vehicle List")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Search by plate number, brand, or model.")}
            </p>
          </div>
          <Badge variant="secondary">{t("{{count}} shown", { count: vehiclePage.total })}</Badge>
        </div>
        {listError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </div>
        ) : null}

        <DataTable className="min-w-[760px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <Th>{t("Plate")}</Th>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Type")}</Th>
              <Th className="text-end">{t("Daily Price")}</Th>
              {settings.enableClientDeposit ? <Th className="text-end">{t("Deposit")}</Th> : null}
              <Th>{t("Status")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={settings.enableClientDeposit ? 7 : 6} message={t("Loading vehicles...")} />
            ) : vehiclePage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={settings.enableClientDeposit ? 7 : 6}
                message={
                  search.trim()
                    ? t("No vehicles match this search.")
                    : t("No vehicles yet. Use Add Vehicle to create the first one.")
                }
              />
            ) : (
              vehiclePage.rows.map((vehicle) => (
                <tr key={vehicle.id} className="border-t hover:bg-muted/25">
                  <Td>
                    <BidiValue className="font-semibold" value={vehicle.plateNumber} />
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {vehicle.brand} {vehicle.model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[vehicle.color, vehicle.year].filter(Boolean).join(" / ") ||
                          t("No color or year")}
                      </span>
                    </div>
                  </Td>
                  <Td>{formatVehicleType(vehicle.type, language)}</Td>
                  <Td className="text-end">
                    <BidiValue value={formatCurrency(vehicle.dailyPrice)} />
                  </Td>
                  {settings.enableClientDeposit ? (
                    <Td className="text-end">
                      <BidiValue value={formatCurrency(vehicle.depositAmount)} />
                    </Td>
                  ) : null}
                  <Td>
                    <VehicleStatusBadge status={vehicle.status} />
                  </Td>
                  <Td className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditForm(vehicle)}
                    >
                      <Edit data-icon="inline-start" />
                      {t("Edit")}
                    </Button>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={vehiclePage} t={t} onPageChange={setPage} />
      </section>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
