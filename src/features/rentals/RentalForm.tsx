import { zodResolver } from "@hookform/resolvers/zod";
import {
  Calendar,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Gauge,
  Loader2,
  PackagePlus,
  Phone,
  Plus,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
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
  const { formatCurrency, settings, t } = useI18n();
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
    setValue,
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
  const [showAccessories, setShowAccessories] = useState(() =>
    Boolean(initialRental?.accessories && initialRental.accessories.length > 0),
  );
  const [showCollateral, setShowCollateral] = useState(() =>
    Boolean(initialRental?.collateralItems && initialRental.collateralItems.length > 0),
  );

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
  const depositRequiredValue = useWatch({ control, name: "depositRequired" });

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
      setShowAccessories(
        Boolean(initialRental?.accessories && initialRental.accessories.length > 0),
      );
      setShowCollateral(
        Boolean(initialRental?.collateralItems && initialRental.collateralItems.length > 0),
      );
      previousVehicleIdRef.current = initialRental ? String(initialRental.vehicleId) : null;
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

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmit((values) => onSave(submitRental(values)))();
  }

  const hasVehicleOrCustomerMissing =
    availableCustomers.length === 0 || availableVehicles.length === 0;

  return (
    <form className="flex flex-col gap-6" onSubmit={submitForm}>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive font-medium">
          {t(error)}
        </div>
      ) : null}

      {hasVehicleOrCustomerMissing ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-sm text-warning-foreground">
          {availableCustomers.length === 0
            ? t("Add a customer before creating a rental.")
            : t("No vehicles are available for rental right now.")}
        </div>
      ) : null}

      <input type="hidden" {...register("customerId")} />
      <input type="hidden" {...register("vehicleId")} />

      {/* Main Unified 2-Column Desktop Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customer, Vehicle, Handover, Accessories, Collaterals (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Customer Selection Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-colors hover:border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="size-4 text-primary" />
                {t("Customer")}
                <span className="text-destructive">*</span>
              </h3>
              {selectedCustomer ? (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {t("Customer Selected")}
                </span>
              ) : null}
            </div>

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

            {selectedCustomer ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3 text-xs sm:text-sm">
                <div>
                  <div className="font-semibold text-foreground">
                    {selectedCustomer.fullName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Phone className="size-3.5" />
                    <BidiValue value={selectedCustomer.phone} />
                  </div>
                </div>
              </div>
            ) : null}

            {errors.customerId ? (
              <p className="mt-1.5 text-xs text-destructive">
                {t(errors.customerId.message ?? "")}
              </p>
            ) : null}
          </div>

          {/* Vehicle Selection Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-colors hover:border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Car className="size-4 text-primary" />
                {t("Available Vehicle")}
                <span className="text-destructive">*</span>
              </h3>
              {selectedVehicle ? (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {t("Vehicle Selected")}
                </span>
              ) : null}
            </div>

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

            {selectedVehicle ? (
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground block mb-0.5">
                    {t("Vehicle")}
                  </span>
                  <div className="font-semibold text-foreground truncate">
                    {selectedVehicle.brand} {selectedVehicle.model}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">
                    {t("Plate Number")}
                  </span>
                  <div className="font-semibold text-primary font-mono truncate">
                    {selectedVehicle.plateNumber}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">
                    {t("Default Rate")}
                  </span>
                  <div className="font-semibold text-foreground">
                    {formatCurrency(selectedVehicle.dailyPrice)}
                  </div>
                </div>
              </div>
            ) : null}

            {errors.vehicleId ? (
              <p className="mt-1.5 text-xs text-destructive">
                {t(errors.vehicleId.message ?? "")}
              </p>
            ) : null}
          </div>

          {/* Outgoing Handover Details (Mileage, Fuel, Notes) */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Gauge className="size-4 text-primary" />
              {t("Outgoing Handover")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Mileage Out" error={errors.mileageOut?.message}>
                <Input
                  inputMode="numeric"
                  data-ltr="true"
                  placeholder={t("Vehicle mileage")}
                  {...register("mileageOut")}
                />
              </Field>

              <Field label="Fuel Out" error={errors.fuelOut?.message}>
                <Input
                  placeholder={t("Full, half, empty")}
                  {...register("fuelOut")}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Notes" error={errors.notesOut?.message}>
                  <Textarea
                    placeholder={t("Condition or notes before the vehicle leaves")}
                    {...register("notesOut")}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Accessories Section (Collapsible) */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                onClick={() => setShowAccessories((prev) => !prev)}
              >
                <PackagePlus className="size-4 text-primary" />
                {t("Accessories")}
                {accessoryRows.length > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {accessoryRows.length}
                  </span>
                ) : null}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAccessories((prev) => !prev)}
              >
                {showAccessories ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </div>

            {showAccessories ? (
              <div className="mt-4 flex flex-col gap-3">
                {accessoryRows.length === 0 ? (
                  <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {t("No accessories assigned.")}
                  </p>
                ) : (
                  accessoryRows.map((row, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1.5fr_0.7fr_0.8fr_auto]"
                    >
                      <Field label="Accessory">
                        <select
                          className="h-10 rounded-md border bg-background px-3 text-xs sm:text-sm"
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
                              {accessory.name} ({t("Available")}:{" "}
                              {accessory.quantityAvailable})
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
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setAccessoryRows((rows) =>
                              rows.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="sm:col-span-4">
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
                    size="sm"
                    disabled={options.accessories.length === 0}
                    onClick={() => {
                      setShowAccessories(true);
                      setAccessoryRows((rows) => [
                        ...rows,
                        { accessoryId: "", quantity: "1", unitCharge: "0", notes: "" },
                      ]);
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    {t("Add Accessory")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Amanat / Collateral Section (Collapsible) */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                onClick={() => setShowCollateral((prev) => !prev)}
              >
                <ShieldAlert className="size-4 text-primary" />
                {t("Amanat")}
                {collateralRows.length > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {collateralRows.length}
                  </span>
                ) : null}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCollateral((prev) => !prev)}
              >
                {showCollateral ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </div>

            {showCollateral ? (
              <div className="mt-4 flex flex-col gap-3">
                {collateralRows.length === 0 ? (
                  <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {t("No Amanat recorded.")}
                  </p>
                ) : (
                  collateralRows.map((row, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-2"
                    >
                      <Field label="Type">
                        <select
                          className="h-10 rounded-md border bg-background px-3 text-xs sm:text-sm"
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
                      <div className="sm:col-span-2 flex items-end justify-between gap-3">
                        <div className="flex-1">
                          <Field label="Notes">
                            <Input
                              value={row.notes}
                              onChange={(event) =>
                                updateCollateralRow(setCollateralRows, index, {
                                  notes: event.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setCollateralRows((rows) =>
                              rows.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCollateral(true);
                      setCollateralRows((rows) => [
                        ...rows,
                        {
                          type: "id_card",
                          description: "",
                          referenceNumber: "",
                          estimatedValue: "",
                          currency: "",
                          notes: "",
                        },
                      ]);
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    {t("Add Amanat")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Right Column: Dates, Pricing & Live Financial Summary (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Rental Period Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                {t("Rental Period")}
              </h3>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {summary.days} {t(summary.days === 1 ? "day" : "days")}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>
          </div>

          {/* Pricing & Deposit Card */}
          <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <CreditCard className="size-4 text-primary" />
              {t("Rates & Deposit")}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Daily Price"
                required
                error={errors.dailyPrice?.message}
              >
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
                  <Field
                    label="Deposit Required"
                    required
                    error={errors.depositRequired?.message}
                  >
                    <Input
                      aria-invalid={Boolean(errors.depositRequired)}
                      data-ltr="true"
                      inputMode="decimal"
                      placeholder="100"
                      {...register("depositRequired")}
                    />
                  </Field>

                  <Field
                    label="Deposit Paid"
                    required
                    error={errors.depositPaid?.message}
                  >
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
                  <input
                    type="hidden"
                    {...register("depositRequired")}
                    defaultValue="0"
                  />
                  <input
                    type="hidden"
                    {...register("depositPaid")}
                    defaultValue="0"
                  />
                </>
              )}

              {settings.enableSalesCommission ? (
                <div className="sm:col-span-2">
                  <Field
                    label="Sales Representative"
                    error={errors.salesUserId?.message}
                  >
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm font-medium"
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
                </div>
              ) : null}
            </div>
          </div>

          {/* Live Financial Summary Card */}
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              {t("Contract Financial Summary")}
            </h3>

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t("Rental Charge")} ({summary.days} ×{" "}
                  {formatCurrency(Number(dailyPriceValue) || 0)}):
                </span>
                <span className="font-medium text-foreground">
                  {formatCurrency(
                    summary.days * (Number(dailyPriceValue) || 0),
                  )}
                </span>
              </div>

              {accessoryChargeTotal > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t("Accessories")}:
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(accessoryChargeTotal)}
                  </span>
                </div>
              ) : null}

              {settings.enableClientDeposit &&
              Number(depositRequiredValue) > 0 ? (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {t("Deposit Required")}:
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(Number(depositRequiredValue) || 0)}
                  </span>
                </div>
              ) : null}

              <div className="border-t border-border/80 pt-3 mt-3 flex items-baseline justify-between">
                <span className="font-bold text-base text-foreground">
                  {t("Total Amount")}:
                </span>
                <span className="text-xl sm:text-2xl font-extrabold text-primary font-mono">
                  {formatCurrency(summary.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Action Footer */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t bg-card px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
        <div>
          {onSaveDraft ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || hasVehicleOrCustomerMissing}
              onClick={handleSubmit((values) =>
                onSaveDraft(submitRental(values)),
              )}
            >
              <FileText data-icon="inline-start" />
              {t(initialRental ? "Save Changes" : "Save Draft")}
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={onCancel}
          >
            {t("Cancel")}
          </Button>

          <Button
            type="submit"
            disabled={isSaving || hasVehicleOrCustomerMissing}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <CheckCircle2 data-icon="inline-start" />
            )}
            {t(initialRental ? "Save Changes" : "Activate Rental")}
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
    <label className="flex flex-col gap-1.5 text-xs sm:text-sm font-medium">
      <span className="text-foreground">
        {t(label)}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-normal text-destructive">{t(error)}</span>
      ) : null}
    </label>
  );
}
