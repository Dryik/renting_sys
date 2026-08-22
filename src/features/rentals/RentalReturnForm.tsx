import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { formatMoney } from "@/shared/money";
import {
  calculateReturnSummary,
  toRentSegmentPeriods,
  formatCollateralType,
  getDefaultRentalReturnFormValues,
  type RentalListRecord,
  type RentalAccessoryReturnInput,
  type RentalCollateralReturnInput,
  type RentalReturnFormInput,
  type RentalReturnFormValues,
  type RentalReturnInput,
  rentalReturnFormSchema,
} from "@/shared/rentals";

type RentalReturnFormProps = {
  currency: string;
  defaultLateFee: number;
  error: string | null;
  isSaving: boolean;
  rental: RentalListRecord;
  onCancel: () => void;
  onSave: (input: RentalReturnInput) => Promise<void>;
  onSaveWithPayment?: (input: RentalReturnInput) => Promise<void>;
};

export function RentalReturnForm({
  currency,
  defaultLateFee,
  error,
  isSaving,
  rental,
  onCancel,
  onSave,
  onSaveWithPayment,
}: RentalReturnFormProps) {
  const { locale, t } = useI18n();
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<RentalReturnFormValues, undefined, RentalReturnFormInput>({
    resolver: zodResolver(rentalReturnFormSchema),
    defaultValues: getDefaultRentalReturnFormValues(rental, defaultLateFee),
    mode: "onBlur",
  });
  const [accessoryReturns, setAccessoryReturns] = useState<
    RentalAccessoryReturnInput[]
  >(() => getDefaultAccessoryReturns(rental));
  const [collateralReturns, setCollateralReturns] = useState<
    RentalCollateralReturnInput[]
  >(() => getDefaultCollateralReturns(rental));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      reset(getDefaultRentalReturnFormValues(rental, defaultLateFee));
      setAccessoryReturns(getDefaultAccessoryReturns(rental));
      setCollateralReturns(getDefaultCollateralReturns(rental));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [defaultLateFee, rental, reset]);

  const actualReturnDatetime = useWatch({
    control,
    name: "actualReturnDatetime",
  });
  const recalculateForActualDays = useWatch({
    control,
    name: "recalculateForActualDays",
  });
  const lateFeePerDay = useWatch({ control, name: "lateFeePerDay" });
  const damageCharge = useWatch({ control, name: "damageCharge" });
  const discount = useWatch({ control, name: "discount" });
  const vehicleStatus = useWatch({ control, name: "vehicleStatus" });

  const summary = calculateReturnSummary({
    startDatetime: rental.startDatetime,
    expectedReturnDatetime: rental.expectedReturnDatetime,
    actualReturnDatetime,
    dailyPrice: rental.dailyPrice,
    // Present only after a mid-contract replacement, so an early return is
    // previewed at the rates the customer actually rode on.
    segments: toRentSegmentPeriods(rental.vehicleSegments),
    accessoryCharges: rental.accessoryCharges,
    recalculateForActualDays: Boolean(recalculateForActualDays),
    baseTotalAmount: rental.totalAmount,
    paidAmount: rental.paidAmount,
    lateFeePerDay: Number(lateFeePerDay) || 0,
    damageCharge: Number(damageCharge) || 0,
    discount: Number(discount) || 0,
  });
  const buildReturnInput = (values: RentalReturnFormInput): RentalReturnInput => ({
    ...values,
    rentalId: rental.id,
    accessoryReturns,
    collateralReturns,
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => {
        return onSave(buildReturnInput(values));
      })}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <WorkflowSection
        title={t("Return Vehicle")}
        description={t("Mark this rental returned and update the vehicle status?")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Actual Return"
            required
            error={errors.actualReturnDatetime?.message}
          >
            <Input
              aria-invalid={Boolean(errors.actualReturnDatetime)}
              data-ltr="true"
              type="date"
              {...register("actualReturnDatetime")}
            />
          </Field>

          <Field
            label="Vehicle After Return"
            required
            error={errors.vehicleStatus?.message}
          >
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.vehicleStatus)}
              {...register("vehicleStatus")}
            >
              <option value="available">{t("Available")}</option>
              <option value="maintenance">{t("Maintenance")}</option>
            </select>
          </Field>
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Vehicle Details")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Mileage In" error={errors.mileageIn?.message}>
            <Input
              inputMode="numeric"
              data-ltr="true"
              placeholder={t("Vehicle mileage")}
              {...register("mileageIn")}
            />
          </Field>

          <Field label="Fuel In" error={errors.fuelIn?.message}>
            <Input placeholder={t("Full, half, empty")} {...register("fuelIn")} />
          </Field>
        </div>
      </WorkflowSection>

      {rental.accessories?.length ? (
        <WorkflowSection title={t("Accessories")}>
          <div className="flex flex-col gap-3">
            {rental.accessories.map((accessory) => {
              const row = accessoryReturns.find(
                (item) => item.rentalAccessoryId === accessory.id,
              );

              return (
                <div
                  key={accessory.id}
                  className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-4"
                >
                  <div>
                    <p className="text-sm font-semibold">{accessory.accessoryName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("Assigned")}: {accessory.quantity}
                    </p>
                  </div>
                  <Field label="Returned">
                    <Input
                      data-ltr="true"
                      inputMode="numeric"
                      value={String(row?.returnedQuantity ?? 0)}
                      onChange={(event) =>
                        updateAccessoryReturn(setAccessoryReturns, accessory.id, {
                          returnedQuantity: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </Field>
                  <Field label="Missing">
                    <Input
                      data-ltr="true"
                      inputMode="numeric"
                      value={String(row?.missingQuantity ?? 0)}
                      onChange={(event) =>
                        updateAccessoryReturn(setAccessoryReturns, accessory.id, {
                          missingQuantity: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </Field>
                  <Field label="Notes">
                    <Input
                      value={row?.notes ?? ""}
                      onChange={(event) =>
                        updateAccessoryReturn(setAccessoryReturns, accessory.id, {
                          notes: event.target.value.trim() || null,
                        })
                      }
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </WorkflowSection>
      ) : null}

      {rental.collateralItems?.length ? (
        <WorkflowSection title={t("Amanat Held")}>
          <div className="flex flex-col gap-3">
            {rental.collateralItems.map((item) => {
              const row = collateralReturns.find(
                (returnItem) => returnItem.collateralId === item.id,
              );

              return (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[1.2fr_0.8fr_1fr]"
                >
                  <div>
                    <p className="text-sm font-semibold">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(formatCollateralType(item.type, "en"))}
                      {item.referenceNumber ? ` - ${item.referenceNumber}` : ""}
                    </p>
                  </div>
                  <Field label="Status">
                    <select
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      value={row?.status ?? item.status}
                      onChange={(event) =>
                        updateCollateralReturn(setCollateralReturns, item.id, {
                          status: event.target.value as "held" | "returned",
                        })
                      }
                    >
                      <option value="held">{t("Held")}</option>
                      <option value="returned">{t("Returned")}</option>
                    </select>
                  </Field>
                  <Field label="Notes">
                    <Input
                      value={row?.notes ?? ""}
                      onChange={(event) =>
                        updateCollateralReturn(setCollateralReturns, item.id, {
                          notes: event.target.value.trim() || null,
                        })
                      }
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </WorkflowSection>
      ) : null}

      <WorkflowSection title={t("Amounts")}>
        {summary.isEarlyReturn ? (
          <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Info className="size-5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
              <div className="flex flex-col gap-2">
                <div>
                  <span className="font-semibold text-foreground">
                    {t("Early Return Detected")}
                  </span>
                  <p className="text-muted-foreground mt-0.5">
                    {t(
                      "Returned early: {{actualDays}} of {{bookedDays}} days completed ({{earlyDays}} days early).",
                      {
                        actualDays: summary.actualDays,
                        bookedDays: summary.bookedDays,
                        earlyDays: summary.earlyDays,
                      },
                    )}
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none font-medium mt-1">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input text-primary focus:ring-ring"
                    {...register("recalculateForActualDays")}
                  />
                  <span>
                    {t("Recalculate rent for actual days ({{days}} days)", {
                      days: summary.actualDays,
                    })}
                  </span>
                </label>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Late Fee Per Day"
            required
            error={errors.lateFeePerDay?.message}
          >
            <Input
              aria-invalid={Boolean(errors.lateFeePerDay)}
              data-ltr="true"
              inputMode="decimal"
              placeholder="0"
              {...register("lateFeePerDay")}
            />
          </Field>

          <Field
            label="Damage / Extra Charges"
            required
            error={errors.damageCharge?.message}
          >
            <Input
              aria-invalid={Boolean(errors.damageCharge)}
              data-ltr="true"
              inputMode="decimal"
              placeholder="0"
              {...register("damageCharge")}
            />
          </Field>

          <Field label="Discount" required error={errors.discount?.message}>
            <Input
              aria-invalid={Boolean(errors.discount)}
              data-ltr="true"
              inputMode="decimal"
              placeholder="0"
              {...register("discount")}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 rounded-md border bg-muted/25 p-4 lg:grid-cols-5 md:grid-cols-3">
          <SummaryValue
            label={summary.isEarlyReturn && recalculateForActualDays ? t("Adjusted Rent") : t("Base Rent")}
            value={<BidiValue value={formatMoney(summary.effectiveBaseAmount, currency, locale)} />}
          />
          <SummaryValue
            label={t("Late Days")}
            value={<BidiValue value={new Intl.NumberFormat(locale).format(summary.lateDays)} />}
          />
          <SummaryValue label={t("Late Fee")} value={<BidiValue value={formatMoney(summary.lateFee, currency, locale)} />} />
          <SummaryValue
            label={t("Final Amount")}
            value={<BidiValue value={formatMoney(summary.finalAmount, currency, locale)} />}
          />
          <SummaryValue
            label={t("Remaining")}
            value={<BidiValue value={formatMoney(summary.remainingAmount, currency, locale)} />}
          />
        </div>
      </WorkflowSection>

      <WorkflowSection title={t("Return Notes")}>
        <div className="grid gap-4 md:grid-cols-2">
          {vehicleStatus === "maintenance" ? (
            <>
              <Field
                label="Maintenance Reason"
                required
                error={errors.maintenanceTitle?.message}
              >
                <Input
                  placeholder={t("Damage after rental / General inspection")}
                  {...register("maintenanceTitle")}
                />
              </Field>
              <Field
                label="Maintenance Description"
                error={errors.maintenanceDescription?.message}
              >
                <Textarea
                  placeholder={t("Optional maintenance details")}
                  {...register("maintenanceDescription")}
                />
              </Field>
            </>
          ) : null}
          <Field label="Damage Notes" error={errors.damageNotes?.message}>
            <Textarea
              placeholder={t("Damage or extra-charge details")}
              {...register("damageNotes")}
            />
          </Field>
          <Field label="Return Notes" error={errors.notesIn?.message}>
            <Textarea
              placeholder={t("Condition or notes after return")}
              {...register("notesIn")}
            />
          </Field>
        </div>
      </WorkflowSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-3 border-t bg-card px-5 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        {onSaveWithPayment ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() =>
              void handleSubmit((values) =>
                onSaveWithPayment({
                  ...buildReturnInput(values),
                }),
              )()
            }
          >
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Return and Pay")}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("Mark Returned")}
        </Button>
      </div>
    </form>
  );
}

function getDefaultAccessoryReturns(
  rental: RentalListRecord,
): RentalAccessoryReturnInput[] {
  return (rental.accessories ?? []).map((accessory) => ({
    rentalAccessoryId: accessory.id,
    returnedQuantity: Math.max(
      0,
      accessory.quantity - accessory.missingQuantity,
    ),
    missingQuantity: accessory.missingQuantity,
    notes: accessory.notes,
  }));
}

function getDefaultCollateralReturns(
  rental: RentalListRecord,
): RentalCollateralReturnInput[] {
  return (rental.collateralItems ?? []).map((item) => ({
    collateralId: item.id,
    status: item.status,
    notes: item.notes,
  }));
}

function updateAccessoryReturn(
  setRows: Dispatch<SetStateAction<RentalAccessoryReturnInput[]>>,
  rentalAccessoryId: number,
  patch: Partial<RentalAccessoryReturnInput>,
): void {
  setRows((rows) =>
    rows.map((row) =>
      row.rentalAccessoryId === rentalAccessoryId
        ? {
            ...row,
            ...patch,
          }
        : row,
    ),
  );
}

function updateCollateralReturn(
  setRows: Dispatch<SetStateAction<RentalCollateralReturnInput[]>>,
  collateralId: number,
  patch: Partial<RentalCollateralReturnInput>,
): void {
  setRows((rows) =>
    rows.map((row) =>
      row.collateralId === collateralId
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
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
