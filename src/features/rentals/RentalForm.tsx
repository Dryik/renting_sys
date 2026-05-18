import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateRentalSummary,
  getDefaultRentalFormValues,
  type RentalActivationInput,
  type RentalFormOptions,
  type RentalFormValues,
  rentalFormSchema,
} from "@/shared/rentals";

type RentalFormProps = {
  error: string | null;
  isSaving: boolean;
  options: RentalFormOptions;
  onCancel: () => void;
  onSave: (input: RentalActivationInput) => Promise<void>;
};

export function RentalForm({
  error,
  isSaving,
  options,
  onCancel,
  onSave,
}: RentalFormProps) {
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<RentalFormValues, undefined, RentalActivationInput>({
    resolver: zodResolver(rentalFormSchema),
    defaultValues: getDefaultRentalFormValues(),
    mode: "onBlur",
  });

  const selectedVehicleId = useWatch({ control, name: "vehicleId" });
  const startDatetime = useWatch({ control, name: "startDatetime" });
  const expectedReturnDatetime = useWatch({
    control,
    name: "expectedReturnDatetime",
  });
  const dailyPriceValue = useWatch({ control, name: "dailyPrice" });

  const selectedVehicle = useMemo(() => {
    const id = Number(selectedVehicleId);

    return options.vehicles.find((vehicle) => vehicle.id === id) ?? null;
  }, [options.vehicles, selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }

    setValue("dailyPrice", String(selectedVehicle.dailyPrice), {
      shouldValidate: true,
    });
    setValue("depositRequired", String(selectedVehicle.depositAmount), {
      shouldValidate: true,
    });
    setValue(
      "mileageOut",
      selectedVehicle.mileage === null ? "" : String(selectedVehicle.mileage),
    );
  }, [selectedVehicle, setValue]);

  useEffect(() => {
    reset(getDefaultRentalFormValues());
  }, [reset]);

  const summary = calculateRentalSummary(
    startDatetime,
    expectedReturnDatetime,
    Number(dailyPriceValue),
  );

  return (
    <form
      className="rounded-lg border bg-card p-5 shadow-sm"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h4 className="text-lg font-semibold">New Rental</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a customer, choose an available vehicle, then activate the rental.
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

      {options.customers.length === 0 || options.vehicles.length === 0 ? (
        <div className="mt-4 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {options.customers.length === 0
            ? "Add a customer before creating a rental."
            : "No vehicles are available for rental right now."}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Customer" required error={errors.customerId?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.customerId)}
            {...register("customerId")}
          >
            <option value="">Select customer</option>
            {options.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.fullName} - {customer.phone}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Available Vehicle" required error={errors.vehicleId?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.vehicleId)}
            {...register("vehicleId")}
          >
            <option value="">Select vehicle</option>
            {options.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} - {vehicle.brand} {vehicle.model}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Start Date and Time"
          required
          error={errors.startDatetime?.message}
        >
          <Input
            aria-invalid={Boolean(errors.startDatetime)}
            type="datetime-local"
            {...register("startDatetime")}
          />
        </Field>

        <Field
          label="Expected Return"
          required
          error={errors.expectedReturnDatetime?.message}
        >
          <Input
            aria-invalid={Boolean(errors.expectedReturnDatetime)}
            type="datetime-local"
            {...register("expectedReturnDatetime")}
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

        <Field label="Deposit" required error={errors.depositRequired?.message}>
          <Input
            aria-invalid={Boolean(errors.depositRequired)}
            inputMode="decimal"
            placeholder="100"
            {...register("depositRequired")}
          />
        </Field>

        <Field label="Deposit Paid" required error={errors.depositPaid?.message}>
          <Input
            aria-invalid={Boolean(errors.depositPaid)}
            inputMode="decimal"
            placeholder="0"
            {...register("depositPaid")}
          />
        </Field>

        <Field label="Mileage Out" error={errors.mileageOut?.message}>
          <Input
            inputMode="numeric"
            placeholder="Vehicle mileage"
            {...register("mileageOut")}
          />
        </Field>

        <Field label="Fuel Out" error={errors.fuelOut?.message}>
          <Input placeholder="Full, half, empty" {...register("fuelOut")} />
        </Field>

        <div className="lg:col-span-3 md:col-span-2">
          <Field label="Notes" error={errors.notesOut?.message}>
            <Textarea
              placeholder="Condition or notes before the vehicle leaves"
              {...register("notesOut")}
            />
          </Field>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-3">
        <SummaryValue label="Rental Days" value={String(summary.days)} />
        <SummaryValue label="Daily Price" value={formatMoney(Number(dailyPriceValue) || 0)} />
        <SummaryValue label="Rent Total" value={formatMoney(summary.totalAmount)} />
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSaving ||
            options.customers.length === 0 ||
            options.vehicles.length === 0
          }
        >
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          Activate Rental
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

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
