import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { formatMoney } from "@/shared/money";
import {
  calculateReturnSummary,
  getDefaultRentalReturnFormValues,
  type RentalListRecord,
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

  useEffect(() => {
    reset(getDefaultRentalReturnFormValues(rental, defaultLateFee));
  }, [defaultLateFee, rental, reset]);

  const actualReturnDatetime = useWatch({
    control,
    name: "actualReturnDatetime",
  });
  const lateFeePerDay = useWatch({ control, name: "lateFeePerDay" });
  const damageCharge = useWatch({ control, name: "damageCharge" });
  const discount = useWatch({ control, name: "discount" });
  const vehicleStatus = useWatch({ control, name: "vehicleStatus" });

  const summary = calculateReturnSummary({
    expectedReturnDatetime: rental.expectedReturnDatetime,
    actualReturnDatetime,
    baseTotalAmount: rental.totalAmount,
    paidAmount: rental.paidAmount,
    lateFeePerDay: Number(lateFeePerDay) || 0,
    damageCharge: Number(damageCharge) || 0,
    discount: Number(discount) || 0,
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) => {
        return onSave({
          ...values,
          rentalId: rental.id,
        });
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
              type="datetime-local"
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

      <WorkflowSection title={t("Amounts")}>
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
            label={t("Base Rent")}
            value={<BidiValue value={formatMoney(rental.totalAmount, currency, locale)} />}
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
                  ...values,
                  rentalId: rental.id,
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
