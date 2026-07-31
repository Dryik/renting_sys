import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import {
  emptyVehicleFormValues,
  formatVehicleStatus,
  type VehicleFormValues,
  type VehicleInput,
  type VehicleRecord,
  vehicleFormSchema,
  vehicleStatusValues,
  vehicleToFormValues,
  vehicleTypeValues,
} from "@/shared/vehicles";

type VehicleFormProps = {
  canChangeStatus: boolean;
  vehicle: VehicleRecord | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: VehicleInput) => Promise<void>;
};

export function VehicleForm({
  canChangeStatus,
  vehicle,
  error,
  isSaving,
  onCancel,
  onSave,
}: VehicleFormProps) {
  const { language, settings, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<VehicleFormValues, undefined, VehicleInput>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: vehicle ? vehicleToFormValues(vehicle) : emptyVehicleFormValues,
    mode: "onBlur",
  });

  useEffect(() => {
    reset(vehicle ? vehicleToFormValues(vehicle) : emptyVehicleFormValues);
  }, [reset, vehicle]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Type" error={errors.type?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.type)}
            {...register("type")}
          >
            {vehicleTypeValues.map((type) => (
              <option key={type} value={type}>
                {type === "car" ? t("Car") : t("Motorcycle")}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plate Number" required error={errors.plateNumber?.message}>
          <Input
            aria-invalid={Boolean(errors.plateNumber)}
            data-ltr="true"
            placeholder={t("Plate example")}
            {...register("plateNumber")}
          />
        </Field>

        <Field label="Chassis Number" error={errors.chassisNumber?.message}>
          <Input
            aria-invalid={Boolean(errors.chassisNumber)}
            data-ltr="true"
            placeholder={t("Chassis number placeholder")}
            {...register("chassisNumber")}
          />
        </Field>

        <Field label="Brand" required error={errors.brand?.message}>
          <Input
            aria-invalid={Boolean(errors.brand)}
            placeholder={t("Brand example")}
            {...register("brand")}
          />
        </Field>

        <Field label="Model" required error={errors.model?.message}>
          <Input
            aria-invalid={Boolean(errors.model)}
            placeholder={t("Model example")}
            {...register("model")}
          />
        </Field>

        <Field label="Daily Price" required error={errors.dailyPrice?.message}>
          <Input
            aria-invalid={Boolean(errors.dailyPrice)}
            data-ltr="true"
            inputMode="decimal"
            placeholder="50"
            {...register("dailyPrice")}
          />
        </Field>

        {settings.enableClientDeposit ? (
          <Field label="Deposit" required error={errors.depositAmount?.message}>
            <Input
              aria-invalid={Boolean(errors.depositAmount)}
              data-ltr="true"
              inputMode="decimal"
              placeholder="100"
              {...register("depositAmount")}
            />
          </Field>
        ) : (
          <input type="hidden" {...register("depositAmount")} defaultValue="0" />
        )}

        {settings.enableSalesCommission ? (
          <Field label="Commission Rate Override (Dinars/day)" error={errors.commissionRateOverride?.message}>
            <Input
              aria-invalid={Boolean(errors.commissionRateOverride)}
              data-ltr="true"
              inputMode="decimal"
              placeholder={String(settings.defaultDailyCommissionRate)}
              {...register("commissionRateOverride")}
            />
          </Field>
        ) : null}

        {canChangeStatus ? (
          <Field label="Status" error={errors.status?.message}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.status)}
              {...register("status")}
            >
              {vehicleStatusValues.map((status) => (
                <option key={status} value={status}>
                  {formatVehicleStatus(status, language)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Status" error={errors.status?.message}>
            <input type="hidden" {...register("status")} />
            <div className="flex h-10 items-center rounded-md border bg-muted/45 px-3 text-sm text-muted-foreground">
              {formatVehicleStatus(vehicle?.status ?? "available", language)}
            </div>
          </Field>
        )}

        <Field label="Color" error={errors.color?.message}>
          <Input placeholder={t("Color example")} {...register("color")} />
        </Field>

        <Field label="Year" error={errors.year?.message}>
          <Input data-ltr="true" inputMode="numeric" placeholder="2022" {...register("year")} />
        </Field>

        <Field label="Mileage" error={errors.mileage?.message}>
          <Input data-ltr="true" inputMode="numeric" placeholder="25000" {...register("mileage")} />
        </Field>

        <Field label="Mandatory Insurance Expiry" error={errors.insuranceExpiryDate?.message}>
          <Input data-ltr="true" type="date" {...register("insuranceExpiryDate")} />
        </Field>

        <Field
          label="Vehicle License Expiry"
          error={errors.registrationExpiryDate?.message}
        >
          <Input data-ltr="true" type="date" {...register("registrationExpiryDate")} />
        </Field>

        <Field
          label="Technical Inspection Expiry"
          error={errors.technicalInspectionExpiryDate?.message}
        >
          <Input data-ltr="true" type="date" {...register("technicalInspectionExpiryDate")} />
        </Field>

        <Field label="Last Oil Change Date" error={errors.lastOilChangeDate?.message}>
          <Input data-ltr="true" type="date" {...register("lastOilChangeDate")} />
        </Field>

        <Field label="Oil Change Mileage" error={errors.lastOilChangeMileage?.message}>
          <Input
            data-ltr="true"
            inputMode="numeric"
            placeholder="25000"
            {...register("lastOilChangeMileage")}
          />
        </Field>
      </div>

      <div>
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea placeholder={t("Optional vehicle notes")} {...register("notes")} />
        </Field>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          {vehicle ? t("Save Changes") : t("Save Vehicle")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  children,
  error,
  label,
  required = false,
}: {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  const { t } = useI18n();

  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {t(label)}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-sm font-normal text-destructive">{t(error)}</span>
      ) : null}
    </label>
  );
}
