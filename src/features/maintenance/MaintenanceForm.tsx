import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import {
  maintenanceRecordSchema,
  getDefaultMaintenanceFormValues,
  normalizeMaintenanceFormValues,
  type MaintenanceFormValues,
  type MaintenanceInput,
  type MaintenanceRecord,
} from "@/shared/maintenance";
import type { VehicleRecord } from "@/shared/vehicles";

type MaintenanceFormProps = {
  error: string | null;
  isSaving: boolean;
  vehicles: VehicleRecord[];
  record: MaintenanceRecord | null;
  onCancel: () => void;
  onSave: (input: MaintenanceInput) => Promise<void>;
};

export function MaintenanceForm({
  error,
  isSaving,
  vehicles,
  record,
  onCancel,
  onSave,
}: MaintenanceFormProps) {
  const { t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceRecordSchema),
    defaultValues: getDefaultMaintenanceFormValues(),
    mode: "onBlur",
  });

  useEffect(() => {
    if (record) {
      reset({
        vehicleId: String(record.vehicleId),
        title: record.title,
        description: record.description || "",
        cost: String(record.cost),
        startDate: record.startDate,
        endDate: record.endDate || "",
      });
    } else {
      reset(getDefaultMaintenanceFormValues());
    }
  }, [record, reset]);

  async function submit(values: MaintenanceFormValues) {
    await onSave(normalizeMaintenanceFormValues(values));
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => void submit(values))}
    >
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      )}

      {vehicles.length === 0 && (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {t("No vehicles found in the system. Create a vehicle before adding maintenance records.")}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Vehicle" required error={errors.vehicleId?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.vehicleId)}
            {...register("vehicleId")}
          >
            <option value="">{t("Select vehicle")}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber} - {v.brand} {v.model} ({v.status})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service / Title" required error={errors.title?.message}>
          <Input
            aria-invalid={Boolean(errors.title)}
            placeholder={t("e.g. Engine Oil Change, Brake Pad Swap")}
            {...register("title")}
          />
        </Field>

        <Field label="Cost" required error={errors.cost?.message}>
          <Input
            aria-invalid={Boolean(errors.cost)}
            inputMode="decimal"
            data-ltr="true"
            placeholder="0.00"
            {...register("cost")}
          />
        </Field>

        <Field label="Start Date" required error={errors.startDate?.message}>
          <Input
            aria-invalid={Boolean(errors.startDate)}
            type="date"
            data-ltr="true"
            {...register("startDate")}
          />
        </Field>

        <Field label="End Date (Optional)" error={errors.endDate?.message}>
          <Input
            aria-invalid={Boolean(errors.endDate)}
            type="date"
            data-ltr="true"
            placeholder="YYYY-MM-DD"
            {...register("endDate")}
          />
        </Field>

        <div className="lg:col-span-3 md:col-span-2">
          <Field label="Description / Details" error={errors.description?.message}>
            <Textarea
              placeholder={t("Provide repair specifics, part numbers, or mechanic notes...")}
              rows={3}
              {...register("description")}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving || vehicles.length === 0}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {record ? t("Save Changes") : t("Record Maintenance")}
        </Button>
      </div>
    </form>
  );
}

type FieldProps = {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
};

function Field({ children, error, label, required = false }: FieldProps) {
  const { t } = useI18n();

  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {t(label)}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {error && <span className="text-xs font-normal text-destructive">{t(error)}</span>}
    </label>
  );
}
