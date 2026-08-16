import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalizedDateInput } from "@/components/ui/localized-date-input";
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
  rentalToFormValues,
  type RentalActivationInput,
  type RentalCollateralInput,
  type RentalFormOptions,
  type RentalFormValues,
  type RentalListRecord,
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
  initialRental?: RentalListRecord | null;
  error: string | null;
  isSaving: boolean;
  options: RentalFormOptions;
  onCancel: () => void;
  onSave: (input: RentalActivationInput) => Promise<void>;
  onSaveDraft?: (input: RentalActivationInput) => Promise<void>;
};

export function RentalForm({
  initialRental,
  error,
  isSaving,
  options,
  onCancel,
  onSave,
  onSaveDraft,
}: RentalFormProps) {
  const { formatCurrency, formatDate, locale, settings, t } = useI18n();
  const {
    formState: { errors },
    control,
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
    trigger,
  } = useForm<RentalFormValues, undefined, RentalActivationInput>({
    resolver: zodResolver(rentalFormSchema),
    defaultValues: initialRental
      ? rentalToFormValues(initialRental)
      : getDefaultRentalFormValues(),
    mode: "onBlur",
  });
  const [accessoryRows, setAccessoryRows] = useState<AccessoryFormRow[]>(() =>
    initialRentalToAccessoryRows(initialRental),
  );
  const [collateralRows, setCollateralRows] = useState<CollateralFormRow[]>(() =>
    initialRentalToCollateralRows(initialRental),
  );
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const previousVehicleIdRef = useRef<string | null>(
    initialRental ? String(initialRental.vehicleId) : null,
  );

  const selectedVehicleId = useWatch({ control, name: "vehicleId" });
  const selectedCustomerId = useWatch({ control, name: "customerId" });
  const startDatetime = useWatch({ control, name: "startDatetime" });
  const expectedReturnDatetime = useWatch({
    control,
    name: "expectedReturnDatetime",
  });
  const dailyPriceValue = useWatch({ control, name: "dailyPrice" });

  const availableVehicles = useMemo(() => {
    if (!initialRental) return options.vehicles;
    const exists = options.vehicles.some((v) => v.id === initialRental.vehicleId);
    if (exists) return options.vehicles;
    return [
      {
        id: initialRental.vehicleId,
        plateNumber: initialRental.vehiclePlateNumber,
        brand: initialRental.vehicleBrand,
        model: initialRental.vehicleModel,
        dailyPrice: initialRental.dailyPrice,
        depositAmount: initialRental.depositRequired,
        mileage: initialRental.mileageOut,
      },
      ...options.vehicles,
    ];
  }, [options.vehicles, initialRental]);

  const availableCustomers = useMemo(() => {
    if (!initialRental) return options.customers;
    const exists = options.customers.some((c) => c.id === initialRental.customerId);
    if (exists) return options.customers;
    return [
      {
        id: initialRental.customerId,
        fullName: initialRental.customerName,
        phone: initialRental.customerPhone,
      },
      ...options.customers,
    ];
  }, [options.customers, initialRental]);

  const selectedVehicle = useMemo(() => {
    const id = Number(selectedVehicleId);

    return availableVehicles.find((vehicle) => vehicle.id === id) ?? null;
  }, [availableVehicles, selectedVehicleId]);
  const selectedCustomer = useMemo(() => {
    const id = Number(selectedCustomerId);

    return availableCustomers.find((customer) => customer.id === id) ?? null;
  }, [availableCustomers, selectedCustomerId]);

  const customerSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      availableCustomers.map((customer) => ({
        description: customer.phone,
        label: customer.fullName,
        searchText: `${customer.fullName} ${customer.phone}`,
        value: String(customer.id),
      })),
    [availableCustomers],
  );

  const vehicleSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      availableVehicles.map((vehicle) => ({
        description: `${vehicle.brand} ${vehicle.model}`,
        label: vehicle.plateNumber,
        searchText: `${vehicle.plateNumber} ${vehicle.brand} ${vehicle.model}`,
        value: String(vehicle.id),
      })),
    [availableVehicles],
  );

  useEffect(() => {
    if (!selectedVehicle) {
      return;
    }

    if (previousVehicleIdRef.current === String(selectedVehicle.id)) {
      return;
    }
    previousVehicleIdRef.current = String(selectedVehicle.id);

    setValue("dailyPrice", String(selectedVehicle.dailyPrice), {
      shouldValidate: true,
    });
    setValue(
      "depositRequired",
      settings.enableClientDeposit ? String(selectedVehicle.depositAmount) : "0",
      {
        shouldValidate: true,
      },
    );
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
      reset(
        initialRental
          ? rentalToFormValues(initialRental)
          : getDefaultRentalFormValues(),
      );
      setAccessoryRows(initialRentalToAccessoryRows(initialRental));
      setCollateralRows(initialRentalToCollateralRows(initialRental));
      previousVehicleIdRef.current = initialRental ? String(initialRental.vehicleId) : null;
      setCurrentStep(1);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [reset, initialRental]);

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

  async function goToNextStep() {
    if (currentStep === 1) {
      const valid = await trigger(["customerId", "vehicleId"]);

      if (!valid) {
        const targetId = !getValues("customerId")
          ? "rental-customer"
          : "rental-vehicle";
        document.getElementById(targetId)?.focus();
        return;
      }

      setCurrentStep(2);
      return;
    }

    const valid = await trigger(undefined, { shouldFocus: true });
    if (valid) {
      setCurrentStep(3);
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (currentStep < 3) {
      void goToNextStep();
      return;
    }

    void handleSubmit((values) => onSave(submitRental(values)))();
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={submitForm}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      {availableCustomers.length === 0 || availableVehicles.length === 0 ? (
        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {availableCustomers.length === 0
            ? t("Add a customer before creating a rental.")
            : t("No vehicles are available for rental right now.")}
        </div>
      ) : null}

      <WorkflowSteps
        currentStep={currentStep}
        steps={[
          t("Customer & Vehicle"),
          t("Rental Details"),
          t(initialRental ? "Review & Save" : "Review & Activate"),
        ]}
      />

      <input type="hidden" {...register("customerId")} />
      <input type="hidden" {...register("vehicleId")} />

      {currentStep === 1 ? (
        <WorkflowSection
          title={t("Customer & Vehicle")}
          description={t(
            initialRental
              ? "Update customer, vehicle, or rental details."
              : "Choose a customer, choose an available vehicle, then activate the rental.",
          )}
        >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer" required error={errors.customerId?.message}>
            <SearchableSelect
              ariaLabel={t("Customer")}
              inputId="rental-customer"
              disabled={availableCustomers.length === 0}
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
              inputId="rental-vehicle"
              disabled={availableVehicles.length === 0}
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
      ) : null}

      {currentStep === 2 ? (
        <>
      <WorkflowSection title={t("Rental Period")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Start Date"
            required
            error={errors.startDatetime?.message}
          >
            <LocalizedDateInput
              aria-invalid={Boolean(errors.startDatetime)}
              displayValue={startDatetime}
              type="date"
              {...register("startDatetime")}
            />
          </Field>

          <Field
            label="Expected Return"
            required
            error={errors.expectedReturnDatetime?.message}
          >
            <LocalizedDateInput
              aria-invalid={Boolean(errors.expectedReturnDatetime)}
              displayValue={expectedReturnDatetime}
              type="date"
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
        </>
      ) : null}

      {currentStep === 3 ? (
        <RentalReview
          accessoryChargeTotal={accessoryChargeTotal}
          accessoryCount={rentalAccessories.length}
          collateralCount={collateralItems.length}
          customerName={selectedCustomer?.fullName ?? t("No details")}
          endDatetime={expectedReturnDatetime}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formatNumber={(value) => new Intl.NumberFormat(locale).format(value)}
          startDatetime={startDatetime}
          summary={summary}
          t={t}
          values={getValues()}
          vehicleLabel={selectedVehicle
            ? `${selectedVehicle.plateNumber} - ${selectedVehicle.brand} ${selectedVehicle.model}`
            : t("No details")}
          onEditStep={setCurrentStep}
        />
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        {currentStep > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep((step) => (step === 3 ? 2 : 1))}
          >
            {t("Back")}
          </Button>
        ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
        {onSaveDraft ? (
          <Button
            type="button"
            variant="outline"
            disabled={
              isSaving ||
              availableCustomers.length === 0 ||
              availableVehicles.length === 0
            }
            onClick={() =>
              void handleSubmit((values) => onSaveDraft(submitRental(values)))()
            }
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t(initialRental ? "Save Changes" : "Save Draft")}
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={
            isSaving ||
            availableCustomers.length === 0 ||
            availableVehicles.length === 0
          }
        >
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t(
            currentStep === 3
              ? (initialRental ? "Save Changes" : "Activate Rental")
              : "Next",
          )}
        </Button>
        </div>
      </div>
    </form>
  );
}

function initialRentalToAccessoryRows(
  rental: RentalListRecord | null | undefined,
): AccessoryFormRow[] {
  if (!rental?.accessories) return [];
  return rental.accessories.map((item) => ({
    accessoryId: String(item.accessoryId),
    quantity: String(item.quantity),
    unitCharge: String(item.unitCharge),
    notes: item.notes ?? "",
  }));
}

function initialRentalToCollateralRows(
  rental: RentalListRecord | null | undefined,
): CollateralFormRow[] {
  if (!rental?.collateralItems) return [];
  return rental.collateralItems.map((item) => ({
    type: item.type,
    description: item.description,
    referenceNumber: item.referenceNumber ?? "",
    estimatedValue:
      item.estimatedValue !== null ? String(item.estimatedValue) : "",
    currency: item.currency ?? "",
    notes: item.notes ?? "",
  }));
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

function RentalReview({
  accessoryChargeTotal,
  accessoryCount,
  collateralCount,
  customerName,
  endDatetime,
  formatCurrency,
  formatDate,
  formatNumber,
  onEditStep,
  startDatetime,
  summary,
  t,
  values,
  vehicleLabel,
}: {
  accessoryChargeTotal: number;
  accessoryCount: number;
  collateralCount: number;
  customerName: string;
  endDatetime: string;
  formatCurrency: (value: number) => string;
  formatDate: (value: string | Date) => string;
  formatNumber: (value: number) => string;
  onEditStep: (step: 1 | 2 | 3) => void;
  startDatetime: string;
  summary: { days: number; totalAmount: number };
  t: (key: string, values?: Record<string, string | number>) => string;
  values: RentalFormValues;
  vehicleLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <WorkflowSection title={t("Review & Activate")}>
        <div className="mb-4 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => onEditStep(1)}>
            {t("Edit")} {t("Customer & Vehicle")}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ReviewDetail label={t("Customer")} value={customerName} />
          <ReviewDetail label={t("Vehicle")} value={<BidiValue value={vehicleLabel} wrap />} />
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Rental Details")}>
        <div className="mb-4 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => onEditStep(2)}>
            {t("Edit")} {t("Rental Details")}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ReviewDetail label={t("Start Date")} value={<BidiValue value={formatDate(startDatetime)} />} />
          <ReviewDetail label={t("Expected Return")} value={<BidiValue value={formatDate(endDatetime)} />} />
          <ReviewDetail label={t("Daily Price")} value={<BidiValue value={formatCurrency(Number(values.dailyPrice) || 0)} />} />
          <ReviewDetail label={t("Deposit")} value={<BidiValue value={formatCurrency(Number(values.depositRequired) || 0)} />} />
          <ReviewDetail label={t("Deposit Paid")} value={<BidiValue value={formatCurrency(Number(values.depositPaid) || 0)} />} />
          <ReviewDetail label={t("Mileage Out")} value={<BidiValue value={values.mileageOut || t("No details")} />} />
          <ReviewDetail label={t("Fuel Out")} value={values.fuelOut || t("No details")} />
          <ReviewDetail label={t("Accessories")} value={<BidiValue value={formatNumber(accessoryCount)} />} />
          <ReviewDetail label={t("Amanat")} value={<BidiValue value={formatNumber(collateralCount)} />} />
        </div>
        {values.notesOut ? (
          <div className="mt-3 rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{t("Notes")}</div>
            <p className="mt-1 text-muted-foreground" dir="auto">{values.notesOut}</p>
          </div>
        ) : null}
      </WorkflowSection>

      <WorkflowSection title={t("Amounts")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryValue label={t("Rental Days")} value={<BidiValue value={formatNumber(summary.days)} />} />
          <SummaryValue label={t("Daily Price")} value={<BidiValue value={formatCurrency(Number(values.dailyPrice) || 0)} />} />
          <SummaryValue label={t("Accessory Charges")} value={<BidiValue value={formatCurrency(accessoryChargeTotal)} />} />
          <SummaryValue label={t("Total")} value={<BidiValue value={formatCurrency(summary.totalAmount)} />} />
        </div>
      </WorkflowSection>
    </div>
  );
}

function ReviewDetail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function WorkflowSteps({ currentStep, steps }: { currentStep: 1 | 2 | 3; steps: string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" role="list">
      {steps.map((step, index) => (
        <div
          key={step}
          aria-current={currentStep === index + 1 ? "step" : undefined}
          className={`border-b-4 pb-2 ${
            currentStep === index + 1
              ? "border-primary"
              : currentStep > index + 1
                ? "border-primary/35"
                : "border-border"
          }`}
          role="listitem"
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
