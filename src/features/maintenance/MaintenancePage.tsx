import { Archive, CheckCircle2, Edit, Eye, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
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
import { ReasonDialog } from "@/components/ui/reason-dialog";
import { useBusinessMutation, useBusinessQuery } from "@/data/hooks";
import { rentalAppApi } from "@/data/rental-app-api";
import { useDebouncedValue } from "@/data/useDebouncedValue";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import type {
  MaintenanceInput,
  MaintenanceListState,
  MaintenanceRecordWithVehicle,
} from "@/shared/maintenance";
import type { PageResult } from "@/shared/pagination";
import { MaintenanceForm } from "./MaintenanceForm";

type FormState =
  | {
      mode: "create";
      record: null;
    }
  | {
      mode: "edit";
      record: MaintenanceRecordWithVehicle;
    }
  | null;

const emptyMaintenancePage: PageResult<MaintenanceRecordWithVehicle> = {
  rows: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

const stateFilters: { value: MaintenanceListState; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
];

const rowClassName =
  "group transition-colors hover:bg-muted/35 focus-within:bg-muted/40";

export function MaintenancePage() {
  const { can } = useAuth();
  const { formatCurrency, formatDate, t } = useI18n();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<MaintenanceListState>("all");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  // Failures raised by an action; a failed load is derived below.
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [detailsRecord, setDetailsRecord] = useState<MaintenanceRecordWithVehicle | null>(null);
  const [recordToComplete, setRecordToComplete] = useState<MaintenanceRecordWithVehicle | null>(null);
  const [recordToArchive, setRecordToArchive] = useState<MaintenanceRecordWithVehicle | null>(null);

  // The same 150 ms wait as before, on the value that forms the key.
  const debouncedSearch = useDebouncedValue(search, 150);
  const listRequest = { page, search: debouncedSearch, state };
  const maintenanceQuery = useBusinessQuery(
    "maintenance",
    "list",
    listRequest,
    () => rentalAppApi.maintenance.list(listRequest),
  );
  const maintenancePage = maintenanceQuery.data ?? emptyMaintenancePage;
  const isLoading = maintenanceQuery.isPending;
  const listError = actionError ??
    (maintenanceQuery.isError
      ? getErrorMessage(maintenanceQuery.error, t("Maintenance records could not be loaded."))
      : null);

  // The vehicle picker inside the form. Marking a vehicle for maintenance
  // changes its availability, so this refetches with everything else.
  const vehicleRequest = { pageSize: 100 };
  const vehiclesQuery = useBusinessQuery(
    "vehicles",
    "list",
    vehicleRequest,
    () => rentalAppApi.vehicles.list(vehicleRequest),
  );
  const vehicles = vehiclesQuery.data?.rows ?? [];

  const updateMaintenance = useBusinessMutation(
    (input: { id: number; values: MaintenanceInput }) =>
      rentalAppApi.maintenance.update(input.id, input.values),
  );
  const createMaintenance = useBusinessMutation((values: MaintenanceInput) =>
    rentalAppApi.maintenance.create(values),
  );
  const archiveMaintenance = useBusinessMutation(
    (input: { maintenanceId: number; reason: string }) =>
      rentalAppApi.maintenance.archive(input),
  );

  async function handleSave(input: MaintenanceInput) {
    setIsSaving(true);
    setFormError(null);

    try {
      if (formState?.mode === "edit") {
        await updateMaintenance.mutateAsync({ id: formState.record.id, values: input });
      } else {
        await createMaintenance.mutateAsync(input);
      }

      setFormState(null);
    } catch (error) {
      setFormError(getErrorMessage(error, t("Maintenance record could not be saved.")));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkComplete(record: MaintenanceRecordWithVehicle) {
    const today = toDateInputValue(new Date());

    await handleSaveForRecord(record, {
      vehicleId: record.vehicleId,
      title: record.title,
      description: record.description,
      cost: record.cost,
      startDate: record.startDate,
      endDate: today,
    });
    setRecordToComplete(null);
    setDetailsRecord(null);
  }

  async function handleArchiveWithReason(
    record: MaintenanceRecordWithVehicle,
    reason: string,
  ) {
    setIsSaving(true);
    setActionError(null);

    try {
      await archiveMaintenance.mutateAsync({ maintenanceId: record.id, reason });
      setDetailsRecord(null);
    } catch (error) {
      setActionError(getErrorMessage(error, t("Maintenance record could not be archived.")));
    } finally {
      setIsSaving(false);
      setRecordToArchive(null);
    }
  }

  async function handleSaveForRecord(
    record: MaintenanceRecordWithVehicle,
    input: MaintenanceInput,
  ) {
    setIsSaving(true);
    setActionError(null);

    try {
      await updateMaintenance.mutateAsync({ id: record.id, values: input });
    } catch (error) {
      setActionError(getErrorMessage(error, t("Maintenance record could not be updated.")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        actions={can("maintenance.create") ? (
          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={() => setFormState({ mode: "create", record: null })}
          >
            <Plus data-icon="inline-start" />
            {t("Record Maintenance")}
          </Button>
        ) : null}
      >
        <SearchInput
          placeholder={t("Search service, plate, brand, or model")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </ListToolbar>

      <div className="flex flex-wrap gap-3">
        <SegmentedFilter
          label="Status"
          options={stateFilters}
          t={t}
          value={state}
          onChange={(value) => {
            setState(value);
            setPage(1);
          }}
        />
      </div>

      <SidePanel
        open={Boolean(formState)}
        title={formState?.mode === "edit" ? t("Edit Maintenance Record") : t("New Maintenance Record")}
        description={formState?.mode === "edit" ? t("Maintenance edit description") : t("Maintenance form description")}
        width="lg"
        onClose={() => setFormState(null)}
      >
        <MaintenanceForm
          error={formError}
          isSaving={isSaving}
          record={formState?.record ?? null}
          vehicles={vehicles}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
        />
      </SidePanel>

      <SidePanel
        open={Boolean(detailsRecord)}
        title={t("Maintenance Details")}
        description={t("Record repairs, service, and maintenance costs by vehicle.")}
        width="md"
        onClose={() => setDetailsRecord(null)}
      >
        {detailsRecord ? (
          <MaintenanceDetails
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            record={detailsRecord}
            t={t}
            onArchive={can("maintenance.archive") ? () => setRecordToArchive(detailsRecord) : undefined}
            onComplete={!detailsRecord.endDate && can("maintenance.complete") ? () => setRecordToComplete(detailsRecord) : undefined}
            onEdit={can("maintenance.edit") ? () => {
              const record = detailsRecord;
              setDetailsRecord(null);
              setFormState({ mode: "edit", record });
            } : undefined}
          />
        ) : null}
      </SidePanel>

      <SectionPanel className="overflow-hidden p-0">
        {listError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(listError)}
          </div>
        ) : null}

        <DataTable className="min-w-[820px]" containerClassName="rounded-none border-0 shadow-none">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              <Th>{t("Vehicle")}</Th>
              <Th>{t("Service")}</Th>
              <Th>{t("Date")}</Th>
              <Th>{t("Status")}</Th>
              <Th className="text-end">{t("Cost")}</Th>
              <Th className="text-end">{t("Actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <EmptyTableRow colSpan={6} message={t("Loading maintenance records...")} state="loading" />
            ) : maintenancePage.rows.length === 0 ? (
              <MaintenanceEmptyRow
                colSpan={6}
                hasSearch={Boolean(search.trim() || state !== "all")}
                t={t}
                onRecordMaintenance={
                  can("maintenance.create")
                    ? () => setFormState({ mode: "create", record: null })
                    : null
                }
              />
            ) : (
              maintenancePage.rows.map((record) => (
                <tr key={record.id} className={rowClassName}>
                  <Td>
                    <div className="flex flex-col gap-1">
                      <BidiValue className="font-medium" value={record.vehiclePlateNumber} />
                      <span className="text-xs text-muted-foreground">
                        {record.vehicleBrand} {record.vehicleModel}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-medium">{record.title}</span>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    <BidiValue value={formatDate(record.startDate)} />
                  </Td>
                  <Td>
                    <Badge variant={record.endDate ? "secondary" : "outline"}>
                      {record.endDate ? t("Completed") : t("Ongoing")}
                    </Badge>
                  </Td>
                  <Td className="text-end">
                    <BidiValue value={formatCurrency(record.cost)} />
                  </Td>
                  <Td className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!record.endDate && can("maintenance.complete") ? (
                        <Button
                          size="sm"
                          disabled={isSaving}
                          onClick={() => setRecordToComplete(record)}
                        >
                          <CheckCircle2 data-icon="inline-start" />
                          {t("Mark Complete")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => setDetailsRecord(record)}>
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
        <PaginationControls page={maintenancePage} t={t} onPageChange={setPage} />
      </SectionPanel>

      <ConfirmDialog
        open={Boolean(recordToComplete)}
        title={t("Complete maintenance?")}
        description={t("Complete maintenance confirmation")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Mark Complete")}
        isBusy={isSaving}
        onCancel={() => setRecordToComplete(null)}
        onConfirm={() => {
          if (recordToComplete) {
            void handleMarkComplete(recordToComplete);
          }
        }}
      />

      <ReasonDialog
        open={Boolean(recordToArchive)}
        title={t("Archive maintenance?")}
        description={t("Archive maintenance confirmation")}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Archive")}
        variant="destructive"
        isBusy={isSaving}
        onCancel={() => setRecordToArchive(null)}
        onConfirm={(reason) => {
          if (recordToArchive) {
            void handleArchiveWithReason(recordToArchive, reason);
          }
        }}
      />
    </div>
  );
}

function MaintenanceDetails({
  formatCurrency,
  formatDate,
  onArchive,
  onComplete,
  onEdit,
  record,
  t,
}: {
  formatCurrency: (value: number) => string;
  formatDate: (value: string | Date) => string;
  onArchive?: () => void;
  onComplete?: () => void;
  onEdit?: () => void;
  record: MaintenanceRecordWithVehicle;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailValue label={t("Vehicle")} value={`${record.vehicleBrand} ${record.vehicleModel}`} />
        <DetailValue label={t("Plate")} value={<BidiValue value={record.vehiclePlateNumber} />} />
        <DetailValue label={t("Service")} value={record.title} />
        <DetailValue
          label={t("Status")}
          value={<Badge variant={record.endDate ? "secondary" : "outline"}>{record.endDate ? t("Completed") : t("Ongoing")}</Badge>}
        />
        <DetailValue label={t("Start")} value={<BidiValue value={formatDate(record.startDate)} />} />
        <DetailValue label={t("Completed")} value={record.endDate ? <BidiValue value={formatDate(record.endDate)} /> : t("No date")} />
        <DetailValue label={t("Cost")} value={<BidiValue value={formatCurrency(record.cost)} />} />
      </div>
      {record.description ? (
        <div className="rounded-xl border bg-muted/25 p-4 text-sm">
          <div className="font-semibold">{t("Description")}</div>
          <p className="mt-1 text-muted-foreground" dir="auto">{record.description}</p>
        </div>
      ) : null}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {onComplete ? (
            <Button type="button" onClick={onComplete}>
              <CheckCircle2 data-icon="inline-start" />
              {t("Mark Complete")}
            </Button>
          ) : null}
          {onEdit ? (
            <Button type="button" variant="outline" onClick={onEdit}>
              <Edit data-icon="inline-start" />
              {t("Edit")}
            </Button>
          ) : null}
        </div>
        {onArchive ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onArchive}
          >
            <Archive data-icon="inline-start" />
            {t("Archive")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function MaintenanceEmptyRow({
  colSpan,
  hasSearch,
  onRecordMaintenance,
  t,
}: {
  colSpan: number;
  hasSearch: boolean;
  onRecordMaintenance: (() => void) | null;
  t: (key: string) => string;
}) {
  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="font-medium text-foreground">
            {hasSearch
              ? t("No maintenance records match this search.")
              : t("No maintenance records yet")}
          </div>
          <p className="text-sm text-muted-foreground">
            {hasSearch
              ? t("Search service, plate, brand, or model")
              : t("Use Record Maintenance to add the first service record.")}
          </p>
          {!hasSearch && onRecordMaintenance ? (
            <Button type="button" onClick={onRecordMaintenance}>
              <Plus data-icon="inline-start" />
              {t("Record Maintenance")}
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
