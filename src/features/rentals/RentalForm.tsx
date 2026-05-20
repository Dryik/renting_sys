import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
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
  const { formatCurrency, locale, settings, t } = useI18n();
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
    setValue("depositRequired", settings.enableClientDeposit ? String(selectedVehicle.depositAmount) : "0", {
      shouldValidate: true,
    });
    if (!settings.enableClientDeposit) {
      setValue("depositPaid", "0", {
        shouldValidate: true,
      });
    }
    setValue(
      "mileageOut",
      selectedVehicle.mileage === null ? "" : String(selectedVehicle.mileage),
    );
  }, [selectedVehicle, setValue, settings.enableClientDeposit]);

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
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => onSave(values))}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      {options.customers.length === 0 || options.vehicles.length === 0 ? (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {options.customers.length === 0
            ? t("Add a customer before creating a rental.")
            : t("No vehicles are available for rental right now.")}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field label="Customer" required error={errors.customerId?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.customerId)}
            {...register("customerId")}
          >
            <option value="">{t("Select customer")}</option>
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
            <option value="">{t("Select vehicle")}</option>
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
            data-ltr="true"
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
            data-ltr="true"
            type="datetime-local"
            {...register("expectedReturnDatetime")}
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
          <>
            <Field label="Deposit" required error={errors.depositRequired?.message}>
              <Input
                aria-invalid={Boolean(errors.depositRequired)}
                data-ltr="true"
                inputMode="decimal"
                placeholder="100"
                {...register("depositRequired")}
              />
            </Field>

            <Field label="Deposit Paid" required error={errors.depositPaid?.message}>
              <Input
                aria-invalid={Boolean(errors.depositPaid)}
                data-ltr="true"
                inputMode="decimal"
                placeholder="0"
                {...register("depositPaid")}
              />
            </Field>
          </>
        ) : (
          <>
            <input type="hidden" {...register("depositRequired")} defaultValue="0" />
            <input type="hidden" {...register("depositPaid")} defaultValue="0" />
          </>
        )}

        <Field label="Mileage Out" error={errors.mileageOut?.message}>
          <Input
            inputMode="numeric"
            data-ltr="true"
            placeholder={t("Vehicle mileage")}
            {...register("mileageOut")}
          />
        </Field>

        <Field label="Fuel Out" error={errors.fuelOut?.message}>
          <Input placeholder={t("Full, half, empty")} {...register("fuelOut")} />
        </Field>

        <div className="lg:col-span-3 md:col-span-2">
          <Field label="Notes" error={errors.notesOut?.message}>
            <Textarea
              placeholder={t("Condition or notes before the vehicle leaves")}
              {...register("notesOut")}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-3">
        <SummaryValue
          label={t("Rental Days")}
          value={<BidiValue value={new Intl.NumberFormat(locale).format(summary.days)} />}
        />
        <SummaryValue
          label={t("Daily Price")}
          value={<BidiValue value={formatCurrency(Number(dailyPriceValue) || 0)} />}
        />
        <SummaryValue
          label={t("Rent Total")}
          value={<BidiValue value={formatCurrency(summary.totalAmount)} />}
        />
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
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
          {t("Activate Rental")}
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

function SummaryValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
