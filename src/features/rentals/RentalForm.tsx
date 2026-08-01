import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
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
  collateralTypeValues,
  formatCollateralType,
  getDefaultRentalFormValues,
  type RentalActivationInput,
  type RentalCollateralInput,
  type RentalFormOptions,
  type RentalFormValues,
  rentalFormSchema,
} from "@/shared/rentals";
import {
  calculateAccessoryChargeTotal,
  type RentalAccessoryInput,
} from "@/shared/accessories";

type AccessoryFormRow = {
  accessoryId: string;
  quantity: string;
  unitCharge: string;
  notes: string;
};

type CollateralFormRow = {
  type: RentalCollateralInput["type"];
  description: string;
  referenceNumber: string;
  estimatedValue: string;
  currency: string;
  notes: string;
};

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
  const [accessoryRows, setAccessoryRows] = useState<AccessoryFormRow[]>([]);
  const [collateralRows, setCollateralRows] = useState<CollateralFormRow[]>([]);

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
    const timeout = window.setTimeout(() => {
      reset(getDefaultRentalFormValues());
      setAccessoryRows([]);
      setCollateralRows([]);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [reset]);

  const rentalAccessories = useMemo(
    () => normalizeAccessoryRows(accessoryRows),
    [accessoryRows],
  );
  const collateralItems = useMemo(
    () => normalizeCollateralRows(collateralRows, settings.defaultCurrency),
    [collateralRows, settings.defaultCurrency],
  );
  const accessoryChargeTotal = calculateAccessoryChargeTotal(rentalAccessories);
  const summary = calculateRentalSummary(
    startDatetime,
    expectedReturnDatetime,
    Number(dailyPriceValue),
    accessoryChargeTotal,
  );
  const submitRental = (values: RentalActivationInput): RentalActivationInput => ({
    ...values,
    accessories: rentalAccessories,
    collateralItems,
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => onSave(submitRental(values)))}
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
          t("Accessories"),
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

          {settings.enableSalesCommission ? (
            <Field label="Sales Representative" error={errors.salesUserId?.message}>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm font-medium"
                {...register("salesUserId")}
              >
                <option value="">{t("Default (Logged-in user)")}</option>
                {options.salesUsers?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({user.username})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
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

      <WorkflowSection
        title={t("Accessories")}
        description={t("Assign helmets, backpacks, or other accessories. Charges are zero unless you enter an amount.")}
      >
        <div className="flex flex-col gap-3">
          {accessoryRows.length === 0 ? (
            <p className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              {t("No accessories assigned.")}
            </p>
          ) : (
            accessoryRows.map((row, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[1.4fr_0.7fr_0.9fr_auto]"
              >
                <Field label="Accessory">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={row.accessoryId}
                    onChange={(event) => {
                      const accessory = options.accessories.find(
                        (item) => item.id === Number(event.target.value),
                      );
                      updateAccessoryRow(setAccessoryRows, index, {
                        accessoryId: event.target.value,
                        unitCharge: accessory
                          ? String(accessory.defaultCharge)
                          : row.unitCharge,
                      });
                    }}
                  >
                    <option value="">{t("Select accessory")}</option>
                    {options.accessories.map((accessory) => (
                      <option key={accessory.id} value={accessory.id}>
                        {accessory.name} ({t("Available")}: {accessory.quantityAvailable})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <Input
                    data-ltr="true"
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(event) =>
                      updateAccessoryRow(setAccessoryRows, index, {
                        quantity: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Charge">
                  <Input
                    data-ltr="true"
                    inputMode="decimal"
                    value={row.unitCharge}
                    onChange={(event) =>
                      updateAccessoryRow(setAccessoryRows, index, {
                        unitCharge: event.target.value,
                      })
                    }
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setAccessoryRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    {t("Remove")}
                  </Button>
                </div>
                <div className="md:col-span-4">
                  <Field label="Notes">
                    <Input
                      value={row.notes}
                      onChange={(event) =>
                        updateAccessoryRow(setAccessoryRows, index, {
                          notes: event.target.value,
                        })
                      }
                      placeholder={t("Optional accessory notes")}
                    />
                  </Field>
                </div>
              </div>
            ))
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={options.accessories.length === 0}
              onClick={() =>
                setAccessoryRows((rows) => [
                  ...rows,
                  { accessoryId: "", quantity: "1", unitCharge: "0", notes: "" },
                ])
              }
            >
              {t("Add Accessory")}
            </Button>
          </div>
        </div>
      </WorkflowSection>

      <WorkflowSection
        title={t("Amanat")}
        description={t("Track documents, cash, or items left by the customer. This does not affect payments.")}
      >
        <div className="flex flex-col gap-3">
          {collateralRows.length === 0 ? (
            <p className="rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
              {t("No Amanat recorded.")}
            </p>
          ) : (
            collateralRows.map((row, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-2"
              >
                <Field label="Type">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={row.type}
                    onChange={(event) =>
                      updateCollateralRow(setCollateralRows, index, {
                        type: event.target.value as RentalCollateralInput["type"],
                      })
                    }
                  >
                    {collateralTypeValues.map((type) => (
                      <option key={type} value={type}>
                        {t(formatCollateralType(type, "en"))}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" required>
                  <Input
                    value={row.description}
                    onChange={(event) =>
                      updateCollateralRow(setCollateralRows, index, {
                        description: event.target.value,
                      })
                    }
                    placeholder={t("Passport, ID card, cash, or item details")}
                  />
                </Field>
                <Field label="Reference Number">
                  <Input
                    data-ltr="true"
                    value={row.referenceNumber}
                    onChange={(event) =>
                      updateCollateralRow(setCollateralRows, index, {
                        referenceNumber: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Estimated Value">
                  <Input
                    data-ltr="true"
                    inputMode="decimal"
                    value={row.estimatedValue}
                    onChange={(event) =>
                      updateCollateralRow(setCollateralRows, index, {
                        estimatedValue: event.target.value,
                      })
                    }
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <Input
                      value={row.notes}
                      onChange={(event) =>
                        updateCollateralRow(setCollateralRows, index, {
                          notes: event.target.value,
                        })
                      }
                      placeholder={t("Optional Amanat notes")}
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setCollateralRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                    }
                  >
                    {t("Remove Amanat")}
                  </Button>
                </div>
              </div>
            ))
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setCollateralRows((rows) => [
                  ...rows,
                  {
                    type: "id_card",
                    description: "",
                    referenceNumber: "",
                    estimatedValue: "",
                    currency: settings.defaultCurrency,
                    notes: "",
                  },
                ])
              }
            >
              {t("Add Amanat")}
            </Button>
          </div>
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Amounts")}>
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryValue
            label={t("Rental Days")}
            value={<BidiValue value={new Intl.NumberFormat(locale).format(summary.days)} />}
          />
          <SummaryValue
            label={t("Daily Price")}
            value={<BidiValue value={formatCurrency(Number(dailyPriceValue) || 0)} />}
          />
          <SummaryValue
            label={t("Accessory Charges")}
            value={<BidiValue value={formatCurrency(accessoryChargeTotal)} />}
          />
          <SummaryValue
            label={t("Total")}
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
            onClick={() =>
              void handleSubmit((values) => onSaveDraft(submitRental(values)))()
            }
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

function normalizeAccessoryRows(rows: AccessoryFormRow[]): RentalAccessoryInput[] {
  return rows.flatMap((row) => {
    const accessoryId = Number(row.accessoryId);
    const quantity = Number(row.quantity);
    const unitCharge = Number(row.unitCharge);

    if (!Number.isInteger(accessoryId) || accessoryId <= 0) {
      return [];
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return [];
    }

    return [
      {
        accessoryId,
        quantity,
        unitCharge: Number.isFinite(unitCharge) && unitCharge >= 0 ? unitCharge : 0,
        notes: row.notes.trim() || null,
      },
    ];
  });
}

function normalizeCollateralRows(
  rows: CollateralFormRow[],
  defaultCurrency: string,
): RentalCollateralInput[] {
  return rows.flatMap((row) => {
    const description = row.description.trim();
    const estimatedValue = Number(row.estimatedValue);

    if (!description) {
      return [];
    }

    return [
      {
        type: row.type,
        description,
        referenceNumber: row.referenceNumber.trim() || null,
        estimatedValue:
          row.estimatedValue.trim() && Number.isFinite(estimatedValue)
            ? estimatedValue
            : null,
        currency: row.currency.trim() || defaultCurrency || null,
        notes: row.notes.trim() || null,
      },
    ];
  });
}

function updateAccessoryRow(
  setRows: Dispatch<SetStateAction<AccessoryFormRow[]>>,
  index: number,
  patch: Partial<AccessoryFormRow>,
): void {
  setRows((rows) =>
    rows.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            ...patch,
          }
        : row,
    ),
  );
}

function updateCollateralRow(
  setRows: Dispatch<SetStateAction<CollateralFormRow[]>>,
  index: number,
  patch: Partial<CollateralFormRow>,
): void {
  setRows((rows) =>
    rows.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            ...patch,
          }
        : row,
    ),
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
    <div className="grid gap-3 md:grid-cols-5">
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
