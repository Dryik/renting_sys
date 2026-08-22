import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Bike, Loader2, Wrench } from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import {
  calculateVehicleReplacementSummary,
  rentalVehicleReplaceFormSchema,
  type RentalListRecord,
  type RentalVehicleOption,
  type RentalVehicleReplaceFormInput,
  type RentalVehicleReplaceFormValues,
  type RentalVehicleReplaceInput,
} from "@/shared/rentals";

type ReplaceVehicleDialogProps = {
  formatCurrency: (amount: number) => string;
  formatDateTime: (value: string | Date) => string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (
    input: RentalVehicleReplaceInput,
    printContract: boolean,
  ) => Promise<boolean>;
  open: boolean;
  rental: RentalListRecord | null;
  t: (key: string, values?: Record<string, string | number>) => string;
  vehicles: RentalVehicleOption[];
};

function nowForInput(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function defaultValues(rental: RentalListRecord | null): RentalVehicleReplaceFormValues {
  return {
    replacementVehicleId: "",
    replacedAtDatetime: nowForInput(),
    newDailyPrice: String(rental?.dailyPrice ?? 0),
    reason: "",
    outgoingMileageIn: "",
    outgoingFuelIn: "",
    // A replacement almost always means something is wrong with the vehicle,
    // so maintenance is the starting point and handing it straight back is the
    // deliberate choice.
    outgoingVehicleStatus: "maintenance",
    maintenanceTitle: "",
    maintenanceDescription: "",
    incomingMileageOut: "",
    incomingFuelOut: "",
    notes: "",
    originalVehicleNotHandedOver: false,
    printContract: true,
  };
}

export function ReplaceVehicleDialog({
  formatCurrency,
  formatDateTime,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  rental,
  t,
  vehicles,
}: ReplaceVehicleDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fieldIdPrefix = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldIds = {
    replacementVehicle: `${fieldIdPrefix}-vehicle`,
    replacementDate: `${fieldIdPrefix}-date`,
    dailyPrice: `${fieldIdPrefix}-price`,
    outgoingMileage: `${fieldIdPrefix}-outgoing-mileage`,
    outgoingFuel: `${fieldIdPrefix}-outgoing-fuel`,
    incomingMileage: `${fieldIdPrefix}-incoming-mileage`,
    incomingFuel: `${fieldIdPrefix}-incoming-fuel`,
    reason: `${fieldIdPrefix}-reason`,
    maintenanceTitle: `${fieldIdPrefix}-maintenance-title`,
    maintenanceDescription: `${fieldIdPrefix}-maintenance-description`,
    notes: `${fieldIdPrefix}-notes`,
    originalVehicleNotHandedOver: `${fieldIdPrefix}-not-handed-over`,
    printContract: `${fieldIdPrefix}-print`,
  };

  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<RentalVehicleReplaceFormValues, undefined, RentalVehicleReplaceFormInput>({
    resolver: zodResolver(rentalVehicleReplaceFormSchema),
    defaultValues: defaultValues(rental),
  });

  useEffect(() => {
    if (rental && open) {
      reset(defaultValues(rental));
    }
  }, [rental, open, reset]);

  const replacementVehicleId = useWatch({ control, name: "replacementVehicleId" });
  const replacedAtDatetime = useWatch({ control, name: "replacedAtDatetime" });
  const newDailyPrice = useWatch({ control, name: "newDailyPrice" });
  const outgoingVehicleStatus = useWatch({ control, name: "outgoingVehicleStatus" });
  const originalVehicleNotHandedOver = useWatch({
    control,
    name: "originalVehicleNotHandedOver",
  });
  const printContract = useWatch({ control, name: "printContract" });

  // The vehicle the contract is on cannot replace itself.
  const currentVehicleId = rental?.vehicleId;
  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.id !== currentVehicleId),
    [vehicles, currentVehicleId],
  );
  const selectedVehicle = availableVehicles.find(
    (vehicle) => String(vehicle.id) === replacementVehicleId,
  );
  const canCorrectOriginalHandover = rental?.vehicleSegments?.length === 1;

  // What the contract will total once the swap is recorded, worked out by the
  // same rule the service writes with so the counter and the receipt agree.
  const summary = useMemo(() => {
    if (!rental || !selectedVehicle || !replacedAtDatetime) {
      return null;
    }

    return calculateVehicleReplacementSummary({
      startDatetime: rental.startDatetime,
      expectedReturnDatetime: rental.expectedReturnDatetime,
      segments: rental.vehicleSegments,
      replacedAtDatetime,
      newDailyPrice: Number(newDailyPrice) || 0,
      accessoryCharges: rental.accessoryCharges,
      currentTotalAmount: rental.totalAmount,
      paidAmount: rental.paidAmount,
      originalVehicleNotHandedOver,
    });
  }, [
    rental,
    selectedVehicle,
    replacedAtDatetime,
    newDailyPrice,
    originalVehicleNotHandedOver,
  ]);

  async function onFormSubmit(data: RentalVehicleReplaceFormInput) {
    if (!rental) return;

    const input: RentalVehicleReplaceInput = {
      rentalId: rental.id,
      replacementVehicleId: data.replacementVehicleId,
      replacedAtDatetime: new Date(data.replacedAtDatetime).toISOString(),
      newDailyPrice: data.newDailyPrice,
      reason: data.reason,
      outgoingMileageIn: data.originalVehicleNotHandedOver
        ? null
        : data.outgoingMileageIn,
      outgoingFuelIn: data.originalVehicleNotHandedOver
        ? null
        : data.outgoingFuelIn,
      outgoingVehicleStatus: data.outgoingVehicleStatus,
      maintenanceTitle:
        data.outgoingVehicleStatus === "maintenance" ? data.maintenanceTitle : null,
      maintenanceDescription:
        data.outgoingVehicleStatus === "maintenance"
          ? data.maintenanceDescription
          : null,
      incomingMileageOut: data.incomingMileageOut,
      incomingFuelOut: data.incomingFuelOut,
      notes: data.notes,
      originalVehicleNotHandedOver: data.originalVehicleNotHandedOver,
    };

    await onConfirm(input, data.printContract);
  }

  if (!open || !rental) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 py-6 backdrop-blur-[1px] overflow-y-auto"
      data-motion="overlay"
    >
      <div
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="my-auto w-full max-w-2xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Bike className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold" id={titleId}>
                  {t("Replace Vehicle")}
                </h2>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  <BidiValue value={rental.contractNo} />
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>
                {t(
                  "Give the customer a different vehicle. The contract stays open under the same number.",
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border/80 bg-muted/40 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <span className="text-xs text-muted-foreground">
                {t("Current Vehicle")}
              </span>
              <div className="font-medium">
                <BidiValue value={rental.vehiclePlateNumber} />
              </div>
              <div className="text-xs text-muted-foreground">
                {rental.vehicleBrand} {rental.vehicleModel} ·{" "}
                {formatCurrency(rental.dailyPrice)}
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-muted-foreground">
                {t("Replacement Vehicle")}
              </span>
              <div className="font-medium">
                {selectedVehicle ? (
                  <BidiValue value={selectedVehicle.plateNumber} />
                ) : (
                  <span className="text-muted-foreground">{t("Not selected")}</span>
                )}
              </div>
              {selectedVehicle ? (
                <div className="text-xs text-muted-foreground">
                  {selectedVehicle.brand} {selectedVehicle.model}
                </div>
              ) : null}
            </div>
          </div>

          {canCorrectOriginalHandover ? (
            <label
              className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/5 p-3 text-sm"
              htmlFor={fieldIds.originalVehicleNotHandedOver}
            >
              <input
                className="mt-1 size-4 shrink-0"
                id={fieldIds.originalVehicleNotHandedOver}
                type="checkbox"
                {...register("originalVehicleNotHandedOver")}
              />
              <span>
                <span className="block font-semibold">
                  {t("Original vehicle was not handed over")}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {t(
                    "Use only when the customer left without a vehicle. The contract starts on the replacement date and its return date moves by the same delay.",
                  )}
                </span>
              </span>
            </label>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor={fieldIds.replacementVehicle}>
                {t("Replacement Vehicle")}
                <span className="text-destructive" aria-hidden="true"> *</span>
              </label>
              <SearchableSelect
                ariaLabel={t("Replacement Vehicle")}
                emptyMessage={t("No available vehicles found.")}
                inputId={fieldIds.replacementVehicle}
                invalid={Boolean(errors.replacementVehicleId)}
                onValueChange={(value: string) => {
                  setValue("replacementVehicleId", value, {
                    shouldValidate: true,
                  });
                  const picked = availableVehicles.find(
                    (vehicle) => String(vehicle.id) === value,
                  );

                  if (picked) {
                    // The replacement's own rate, offered as the starting
                    // point. Staff can hold the contract's rate instead.
                    setValue("newDailyPrice", String(picked.dailyPrice), {
                      shouldValidate: true,
                    });

                    if (picked.mileage !== null) {
                      setValue("incomingMileageOut", String(picked.mileage), {
                        shouldValidate: true,
                      });
                    }
                  }
                }}
                options={availableVehicles.map((vehicle) => ({
                  label: `${vehicle.plateNumber} — ${vehicle.brand} ${vehicle.model}`,
                  value: String(vehicle.id),
                }))}
                placeholder={t("Search by plate, brand or model")}
                value={replacementVehicleId}
              />
              {errors.replacementVehicleId ? (
                <p className="mt-1 text-xs text-destructive">
                  {t(errors.replacementVehicleId.message ?? "")}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor={fieldIds.replacementDate}>
                {t("Replacement Date")}
                <span className="text-destructive" aria-hidden="true"> *</span>
              </label>
              <Input
                aria-invalid={Boolean(errors.replacedAtDatetime)}
                id={fieldIds.replacementDate}
                type="datetime-local"
                {...register("replacedAtDatetime")}
              />
              {errors.replacedAtDatetime ? (
                <p className="mt-1 text-xs text-destructive">
                  {t(errors.replacedAtDatetime.message ?? "")}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor={fieldIds.dailyPrice}>
                {t("Daily Price")}
                <span className="text-destructive" aria-hidden="true"> *</span>
              </label>
              <Input
                aria-invalid={Boolean(errors.newDailyPrice)}
                id={fieldIds.dailyPrice}
                inputMode="decimal"
                {...register("newDailyPrice")}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Applies from the replacement date onward.")}
              </p>
              {errors.newDailyPrice ? (
                <p className="mt-1 text-xs text-destructive">
                  {t(errors.newDailyPrice.message ?? "")}
                </p>
              ) : null}
            </div>

            {!originalVehicleNotHandedOver ? (
              <>
                <div>
                  <label className="text-sm font-medium" htmlFor={fieldIds.outgoingMileage}>
                    {t("Mileage In")} — <BidiValue value={rental.vehiclePlateNumber} />
                  </label>
                  <Input
                    id={fieldIds.outgoingMileage}
                    inputMode="numeric"
                    {...register("outgoingMileageIn")}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium" htmlFor={fieldIds.outgoingFuel}>
                    {t("Fuel In")} — <BidiValue value={rental.vehiclePlateNumber} />
                  </label>
                  <Input id={fieldIds.outgoingFuel} {...register("outgoingFuelIn")} />
                </div>
              </>
            ) : null}

            <div>
              <label className="text-sm font-medium" htmlFor={fieldIds.incomingMileage}>
                {t("Mileage Out")} — {t("Replacement Vehicle")}
              </label>
              <Input
                id={fieldIds.incomingMileage}
                inputMode="numeric"
                {...register("incomingMileageOut")}
              />
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor={fieldIds.incomingFuel}>
                {t("Fuel Out")} — {t("Replacement Vehicle")}
              </label>
              <Input id={fieldIds.incomingFuel} {...register("incomingFuelOut")} />
            </div>

            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor={fieldIds.reason}>
                {t("Reason for the replacement")}
                <span className="text-destructive" aria-hidden="true"> *</span>
              </label>
              <Textarea
                aria-invalid={Boolean(errors.reason)}
                id={fieldIds.reason}
                rows={2}
                {...register("reason")}
              />
              {errors.reason ? (
                <p className="mt-1 text-xs text-destructive">
                  {t(errors.reason.message ?? "")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border/80 p-3">
            <span className="text-sm font-medium">
              {t("What happens to")} <BidiValue value={rental.vehiclePlateNumber} />
            </span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-border/70 p-2 text-sm">
                <input
                  type="radio"
                  value="maintenance"
                  {...register("outgoingVehicleStatus")}
                />
                <Wrench className="size-4 text-muted-foreground" />
                {t("Mark Maintenance")}
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border/70 p-2 text-sm">
                <input
                  type="radio"
                  value="available"
                  {...register("outgoingVehicleStatus")}
                />
                <Bike className="size-4 text-muted-foreground" />
                {t("Return to available")}
              </label>
            </div>

            {outgoingVehicleStatus === "maintenance" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium" htmlFor={fieldIds.maintenanceTitle}>
                    {t("Maintenance Reason")}
                    <span className="text-destructive" aria-hidden="true"> *</span>
                  </label>
                  <Input
                    aria-invalid={Boolean(errors.maintenanceTitle)}
                    id={fieldIds.maintenanceTitle}
                    {...register("maintenanceTitle")}
                  />
                  {errors.maintenanceTitle ? (
                    <p className="mt-1 text-xs text-destructive">
                      {t(errors.maintenanceTitle.message ?? "")}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor={fieldIds.maintenanceDescription}
                  >
                    {t("Notes")}
                  </label>
                  <Input
                    id={fieldIds.maintenanceDescription}
                    {...register("maintenanceDescription")}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {summary ? (
            <div className="mt-4 rounded-lg border border-border/80 bg-muted/40 p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("Days on the current vehicle")}
                  </span>
                  <span className="font-medium">{summary.outgoingDays}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("Days on the replacement")}
                  </span>
                  <span className="font-medium">{summary.incomingDays}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("New Total")}</span>
                  <span className="font-semibold">
                    {formatCurrency(summary.newTotalAmount)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("Balance due")}</span>
                  <span className="font-semibold">
                    {formatCurrency(summary.newRemainingAmount)}
                  </span>
                </div>
              </div>
              {summary.difference !== 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {summary.difference > 0
                    ? t("The contract total rises by {amount}.", {
                        amount: formatCurrency(summary.difference),
                      })
                    : t("The contract total falls by {amount}.", {
                        amount: formatCurrency(Math.abs(summary.difference)),
                      })}
                </p>
              ) : null}
              {summary.correctedStartDatetime &&
              summary.correctedExpectedReturnDatetime ? (
                <div className="mt-3 grid gap-2 border-t border-border/80 pt-3 sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t("Corrected contract start")}
                    </span>
                    <div className="font-semibold">
                      {formatDateTime(summary.correctedStartDatetime)}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      {t("Corrected expected return")}
                    </span>
                    <div className="font-semibold">
                      {formatDateTime(summary.correctedExpectedReturnDatetime)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            <label className="text-sm font-medium" htmlFor={fieldIds.notes}>
              {t("Notes")}
            </label>
            <Textarea id={fieldIds.notes} rows={2} {...register("notes")} />
          </div>

          <label
            className="mt-4 flex items-center gap-2 text-sm"
            htmlFor={fieldIds.printContract}
          >
            <input
              id={fieldIds.printContract}
              type="checkbox"
              {...register("printContract")}
            />
            {t("Print the updated contract")}
          </label>

          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 flex justify-end gap-2 border-t bg-card px-6 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)]">
            <Button disabled={isBusy} onClick={onCancel} type="button" variant="outline">
              {t("Cancel")}
            </Button>
            <Button disabled={isBusy} type="submit">
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {printContract ? t("Replace and Print") : t("Replace Vehicle")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
