import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
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
  onSaveDraft?: (input: RentalActivationInput) => Promise<void>;
};

export function RentalForm({
  error,
  isSaving,
  options,
  onCancel,
  onSave,
  onSaveDraft,
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
  const selectedCustomerId = useWatch({ control, name: "customerId" });
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

  const customerSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      options.customers.map((customer) => ({
        description: customer.phone,
        label: customer.fullName,
        searchText: `${customer.fullName} ${customer.phone}`,
        value: String(customer.id),
      })),
    [options.customers],
  );

  const vehicleSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      options.vehicles.map((vehicle) => ({
        description: `${vehicle.brand} ${vehicle.model}`,
        label: vehicle.plateNumber,
        searchText: `${vehicle.plateNumber} ${vehicle.brand} ${vehicle.model}`,
        value: String(vehicle.id),
      })),
    [options.vehicles],
  );

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

      <WorkflowSteps
        steps={[
          t("Customer"),
          t("Vehicle"),
          t("Rental Period"),
          t("Amounts"),
        ]}
      />

      <input type="hidden" {...register("customerId")} />
      <input type="hidden" {...register("vehicleId")} />

      <WorkflowSection
        title={t("Customer & Vehicle")}
        description={t("Choose a customer, choose an available vehicle, then activate the rental.")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer" required error={errors.customerId?.message}>
            <SearchableSelect
              ariaLabel={t("Customer")}
              disabled={options.customers.length === 0}
              emptyMessage={t("No customers found.")}
              invalid={Boolean(errors.customerId)}
              moreResultsMessage={(count) =>
                t("{{count}} more matches. Keep typing to narrow.", { count })
              }
              options={customerSelectOptions}
              placeholder={t("Search customer name or phone")}
              value={selectedCustomerId ?? ""}
              onValueChange={(value) =>
                setValue("customerId", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </Field>

          <Field label="Available Vehicle" required error={errors.vehicleId?.message}>
            <SearchableSelect
              ariaLabel={t("Available Vehicle")}
              disabled={options.vehicles.length === 0}
              emptyMessage={t("No vehicles found.")}
              invalid={Boolean(errors.vehicleId)}
              moreResultsMessage={(count) =>
                t("{{count}} more matches. Keep typing to narrow.", { count })
              }
              options={vehicleSelectOptions}
              placeholder={t("Search plate, brand, or model")}
              value={selectedVehicleId ?? ""}
              onValueChange={(value) =>
                setValue("vehicleId", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </Field>
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Rental Period")}>
        <div className="grid gap-4 md:grid-cols-2">
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
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Vehicle Details")}>
        <div className="grid gap-4 md:grid-cols-2">
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

          <div className="md:col-span-2">
            <Field label="Notes" error={errors.notesOut?.message}>
              <Textarea
                placeholder={t("Condition or notes before the vehicle leaves")}
                {...register("notesOut")}
              />
            </Field>
          </div>
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Amounts")}>
        <div className="grid gap-3 md:grid-cols-3">
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
      </WorkflowSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-3 border-t bg-card px-5 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        {onSaveDraft ? (
          <Button
            type="button"
            variant="outline"
            disabled={
              isSaving ||
              options.customers.length === 0 ||
              options.vehicles.length === 0
            }
            onClick={() => void handleSubmit((values) => onSaveDraft(values))()}
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Save Draft")}
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={
            isSaving ||
            options.customers.length === 0 ||
            options.vehicles.length === 0
          }
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Activate Rental")}
        </Button>
      </div>
    </form>
  );
}

function WorkflowSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-xs">
      <div className="border-b bg-muted/35 px-4 py-3">
        <h3 className="text-base font-bold">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function WorkflowSteps({ steps }: { steps: string[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {steps.map((step, index) => (
        <div
          key={step}
          className="border-b-4 border-border pb-2 first:border-primary"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">{step}</p>
        </div>
      ))}
    </div>
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
    <div className="rounded-md border bg-muted/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
