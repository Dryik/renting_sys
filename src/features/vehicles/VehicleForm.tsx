import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  vehicle: VehicleRecord | null;
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: VehicleInput) => Promise<void>;
};

export function VehicleForm({
  vehicle,
  error,
  isSaving,
  onCancel,
  onSave,
}: VehicleFormProps) {
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
      className="rounded-lg border bg-card p-5 shadow-sm"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h4 className="text-lg font-semibold">
            {vehicle ? "Edit Vehicle" : "Add Vehicle"}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep the required details short and clear for front-desk staff.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Type" error={errors.type?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.type)}
            {...register("type")}
          >
            {vehicleTypeValues.map((type) => (
              <option key={type} value={type}>
                {type === "car" ? "Car" : "Motorcycle"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Plate Number" required error={errors.plateNumber?.message}>
          <Input
            aria-invalid={Boolean(errors.plateNumber)}
            placeholder="123-ABC"
            {...register("plateNumber")}
          />
        </Field>

        <Field label="Brand" required error={errors.brand?.message}>
          <Input
            aria-invalid={Boolean(errors.brand)}
            placeholder="Toyota"
            {...register("brand")}
          />
        </Field>

        <Field label="Model" required error={errors.model?.message}>
          <Input
            aria-invalid={Boolean(errors.model)}
            placeholder="Corolla"
            {...register("model")}
          />
        </Field>

        <Field label="Daily Price" required error={errors.dailyPrice?.message}>
          <Input
            aria-invalid={Boolean(errors.dailyPrice)}
            inputMode="decimal"
            placeholder="50"
            {...register("dailyPrice")}
          />
        </Field>

        <Field label="Deposit" required error={errors.depositAmount?.message}>
          <Input
            aria-invalid={Boolean(errors.depositAmount)}
            inputMode="decimal"
            placeholder="100"
            {...register("depositAmount")}
          />
        </Field>

        <Field label="Status" error={errors.status?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.status)}
            {...register("status")}
          >
            {vehicleStatusValues.map((status) => (
              <option key={status} value={status}>
                {formatVehicleStatus(status)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Color" error={errors.color?.message}>
          <Input placeholder="White" {...register("color")} />
        </Field>

        <Field label="Year" error={errors.year?.message}>
          <Input inputMode="numeric" placeholder="2022" {...register("year")} />
        </Field>

        <Field label="Mileage" error={errors.mileage?.message}>
          <Input inputMode="numeric" placeholder="25000" {...register("mileage")} />
        </Field>

        <Field label="Insurance Expiry" error={errors.insuranceExpiryDate?.message}>
          <Input type="date" {...register("insuranceExpiryDate")} />
        </Field>

        <Field
          label="Registration Expiry"
          error={errors.registrationExpiryDate?.message}
        >
          <Input type="date" {...register("registrationExpiryDate")} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Notes" error={errors.notes?.message}>
          <Textarea
            placeholder="Optional vehicle notes"
            {...register("notes")}
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          {vehicle ? "Save Changes" : "Save Vehicle"}
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
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-sm font-normal text-destructive">{error}</span>
      ) : null}
    </label>
  );
}
