import { Eye, Plus } from "lucide-react";
import { useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, EmptyTableRow, Td, Th } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { SearchInput } from "@/components/ui/search-input";
import { SectionPanel } from "@/components/ui/section-panel";
import { SegmentedFilter } from "@/components/ui/segmented-filter";
import { SidePanel } from "@/components/ui/side-panel";
import { DocumentPhotoSection } from "@/components/ui/document-photo-section";
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { useBusinessMutation, useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type { PageResult } from "@/shared/pagination";
import {
  formatVehicleType,
  type VehicleInput,
  type VehicleRecord,
  type VehicleStatusFilter,
  type VehicleTypeFilter,
} from "@/shared/vehicles";
import type { VehicleSaleInput } from "@/shared/vehicle-sales";
import { VehicleForm } from "./VehicleForm";
import { VehicleDetailsPanel } from "./VehicleDetailsPanel";
import { VehicleSaleForm } from "./VehicleSaleForm";
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
  { value: "sold", label: "Sold" },
];

const rowClassName =
  "group transition-colors hover:bg-muted/35 focus-within:bg-muted/40";

export function VehiclesPage() {
  const { can } = useAuth();
  const { formatCurrency, language, settings, t } = useI18n();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<VehicleTypeFilter>("all");
  const [status, setStatus] = useState<VehicleStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaleSaving, setIsSaleSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [detailsVehicle, setDetailsVehicle] = useState<VehicleRecord | null>(null);
  const [saleVehicle, setSaleVehicle] = useState<VehicleRecord | null>(null);
  const [pendingSale, setPendingSale] = useState<{
    input: VehicleSaleInput;
    vehicle: VehicleRecord;
  } | null>(null);
  const [pendingInactiveUpdate, setPendingInactiveUpdate] = useState<{
    input: VehicleInput;
    vehicle: VehicleRecord;
  } | null>(null);

  // The same 150 ms wait as before. Search, status and type all sit in the key,
  // so switching a filter asks a new question rather than reusing an answer.
  const debouncedSearch = useDebouncedValue(search, 150);
  const listRequest = { page, search: debouncedSearch, status, type };
  const vehiclesQuery = useBusinessQuery(
    "vehicles",
    "list",
    listRequest,
    () => rentalAppApi.vehicles.list(listRequest),
  );
  const vehiclePage = vehiclesQuery.data ?? emptyVehiclePage;
  const isLoading = vehiclesQuery.isPending;
  const listError = vehiclesQuery.isError
    ? getErrorMessage(vehiclesQuery.error, t("Vehicles could not be loaded."))
    : null;

  const updateVehicle = useBusinessMutation(
    (input: { id: number; values: VehicleInput }) =>
      rentalAppApi.vehicles.update(input.id, input.values),
  );
  const createVehicle = useBusinessMutation((values: VehicleInput) =>
    rentalAppApi.vehicles.create(values),
  );
  const createVehicleSale = useBusinessMutation((values: VehicleSaleInput) =>
    rentalAppApi.vehicleSales.create(values),
  );

  async function handleSave(input: VehicleInput) {
    if (
      formState?.mode === "edit" &&
      formState.vehicle.status !== input.status &&
      input.status === "inactive"
    ) {
      setPendingInactiveUpdate({ input, vehicle: formState.vehicle });
      return;
    }

    await saveVehicle(input);
  }

  async function saveVehicle(input: VehicleInput, reason?: string) {
    setIsSaving(true);
    setFormError(null);

    try {
      if (formState?.mode === "edit") {
        await updateVehicle.mutateAsync({
          id: formState.vehicle.id,
          values: reason ? ({ ...input, reason } as VehicleInput) : input,
        });
        setFormState(null);
      } else {
        const createdVehicle = await createVehicle.mutateAsync(input);
        setFormState({ mode: "edit", vehicle: createdVehicle });
      }
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

  function openDetails(vehicle: VehicleRecord) {
    setDetailsVehicle(vehicle);
  }

  function openSaleForm(vehicle: VehicleRecord) {
    setSaleError(null);
    setDetailsVehicle(null);
    setSaleVehicle(vehicle);
  }

  async function refreshDetailsVehicle(vehicle: VehicleRecord) {
    const result = await rentalAppApi.vehicles.list({
      page: 1,
      pageSize: 10,
      search: vehicle.plateNumber,
      status: "all",
      type: "all",
    });
    setDetailsVehicle(result.rows.find((row) => row.id === vehicle.id) ?? null);
  }

  async function handleSaleFormSave(input: VehicleSaleInput) {
    if (!saleVehicle) {
      return;
    }

    setSaleError(null);
    setPendingSale({ input, vehicle: saleVehicle });
  }

  async function confirmSale() {
    if (!pendingSale) {
      return;
    }

    setIsSaleSaving(true);
    setSaleError(null);

    try {
      await createVehicleSale.mutateAsync(pendingSale.input);
      setSaleVehicle(null);
    } catch (error) {
      setSaleError(getErrorMessage(error, t("Vehicle sale could not be saved.")));
    } finally {
      setIsSaleSaving(false);
      setPendingSale(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        actions={can("vehicles.create") ? (
          <Button className="w-full sm:w-auto" size="lg" onClick={openCreateForm}>
            <Plus data-icon="inline-start" />
            {t("Add Vehicle")}
          </Button>
        ) : null}
      >
        <SearchInput
          placeholder={t("Search plate, brand, or model")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetToFirstPage();
          }}
        />
      </ListToolbar>

      <div className="flex flex-wrap gap-3">
        <SegmentedFilter
          label="Type"
          options={typeFilters}
          t={t}
          value={type}
          onChange={(value) => {
            setType(value);
            resetToFirstPage();
          }}
        />
        <SegmentedFilter
          label="Status"
          options={statusFilters}
          t={t}
          value={status}
          onChange={(value) => {
            setStatus(value);
            resetToFirstPage();
          }}
        />
      </div>

      <SidePanel
        open={Boolean(formState)}
        title={formState?.mode === "edit" ? t("Edit Vehicle") : t("Add Vehicle")}
        description={t("Vehicle form description")}
        width="lg"
        onClose={() => setFormState(null)}
      >
        <VehicleForm
          canChangeStatus={can("vehicles.changeStatus")}
          error={formError}
          isSaving={isSaving}
          vehicle={formState?.vehicle ?? null}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
        />
        {formState ? (
          formState.mode === "edit" ? (
            <DocumentPhotoSection entityType="vehicle" entityId={formState.vehicle.id} />
          ) : (
            <div className="mt-5 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {t("Save the vehicle first, then add documents and photos here.")}
            </div>
          )
        ) : null}
      </SidePanel>

      <SidePanel
        open={Boolean(detailsVehicle)}
        title={t("Vehicle Details")}
        description={t("Vehicle records and current availability.")}
        width="lg"
        onClose={() => setDetailsVehicle(null)}
      >
        {detailsVehicle ? (
          <VehicleDetailsPanel
            vehicle={detailsVehicle}
            onEditVehicle={can("vehicles.edit") ? () => {
              const vehicle = detailsVehicle;
              setDetailsVehicle(null);
              openEditForm(vehicle);
            } : undefined}
            onSellVehicle={openSaleForm}
            onSaleChanged={async () => {
              // Voiding the sale already invalidated the list; the panel still
              // needs its own copy of the row refreshed.
              await refreshDetailsVehicle(detailsVehicle);
            }}
          />
        ) : null}
      </SidePanel>

      <SidePanel
        open={Boolean(saleVehicle)}
        title={t("Sell Vehicle")}
        description={t("Record a paid-in-full sale for a fleet vehicle.")}
        width="md"
        onClose={() => setSaleVehicle(null)}
      >
        {saleVehicle ? (
          <VehicleSaleForm
            error={saleError}
            isSaving={isSaleSaving}
            vehicle={saleVehicle}
            onCancel={() => setSaleVehicle(null)}
            onSave={handleSaleFormSave}
          />
        ) : null}
      </SidePanel>

      <SectionPanel className="overflow-hidden p-0">
        {listError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(listError)}
          </div>
        ) : null}

        <DataTable className="min-w-[760px]" containerClassName="rounded-none border-0 shadow-none">
          <thead className="bg-muted/70 text-muted-foreground">
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
              <EmptyTableRow colSpan={settings.enableClientDeposit ? 7 : 6} message={t("Loading vehicles...")} state="loading" />
            ) : vehiclePage.rows.length === 0 ? (
              <EmptyTableRow
                colSpan={settings.enableClientDeposit ? 7 : 6}
                message={search.trim() ? t("No vehicles match this search.") : t("No vehicles yet")}
                description={
                  search.trim()
                    ? t("Search by plate number, brand, model, or chassis number.")
                    : t("Use Add Vehicle to create the first vehicle record.")
                }
                action={
                  !search.trim() && can("vehicles.create")
                    ? { label: t("Add Vehicle"), onClick: openCreateForm }
                    : undefined
                }
              />
            ) : (
              vehiclePage.rows.map((vehicle) => (
                <tr key={vehicle.id} className={rowClassName}>
                  <Td>
                    <BidiValue className="font-semibold" value={vehicle.plateNumber} />
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {vehicle.brand} {vehicle.model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[vehicle.color, vehicle.year, vehicle.chassisNumber].filter(Boolean).join(" / ") ||
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
                    <VehicleStatusBadge status={vehicle.displayStatus} />
                  </Td>
                  <Td className="text-end">
                    <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDetails(vehicle)}
                    >
                      <Eye data-icon="inline-start" />
                      {t("Details")}
                    </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
        <PaginationControls page={vehiclePage} t={t} onPageChange={setPage} />
      </SectionPanel>
      <ReasonDialog
        open={Boolean(pendingInactiveUpdate)}
        title={t("Deactivate vehicle?")}
        description={t("Enter the reason for deactivating this vehicle.")}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Deactivate")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setPendingInactiveUpdate(null)}
        onConfirm={(reason) => {
          if (pendingInactiveUpdate) {
            void saveVehicle(pendingInactiveUpdate.input, reason).then(() =>
              setPendingInactiveUpdate(null),
            );
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingSale)}
        title={t("Sell vehicle?")}
        description={t("This will record a paid sale and mark the vehicle Sold.")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Sell Vehicle")}
        isBusy={isSaleSaving}
        onCancel={() => setPendingSale(null)}
        onConfirm={() => void confirmSale()}
      />
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
