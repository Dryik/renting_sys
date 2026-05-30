import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { formatPaymentMethod, paymentMethodValues } from "@/shared/payments";
import {
  getDefaultVehicleSaleFormValues,
  type VehicleSaleFormInput,
  type VehicleSaleFormValues,
  type VehicleSaleInput,
  vehicleSaleFormSchema,
} from "@/shared/vehicle-sales";
import type { VehicleRecord } from "@/shared/vehicles";

type VehicleSaleFormProps = {
  error: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (input: VehicleSaleInput) => Promise<void>;
  vehicle: VehicleRecord;
};

export function VehicleSaleForm({
  error,
  isSaving,
  onCancel,
  onSave,
  vehicle,
}: VehicleSaleFormProps) {
  const { formatCurrency, language, t } = useI18n();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<VehicleSaleFormValues, undefined, VehicleSaleFormInput>({
    resolver: zodResolver(vehicleSaleFormSchema),
    defaultValues: getDefaultVehicleSaleFormValues(),
    mode: "onBlur",
  });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit((values) =>
        onSave({
          ...values,
          vehicleId: vehicle.id,
        }),
      )}
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/25 p-4 text-sm">
        <div className="text-xs font-medium text-muted-foreground">
          {t("Vehicle")}
        </div>
        <div className="mt-1 font-semibold">
          <BidiValue value={vehicle.plateNumber} /> - {vehicle.brand} {vehicle.model}
        </div>
        <div className="mt-1 text-muted-foreground">
          {t("Current daily price")}: <BidiValue value={formatCurrency(vehicle.dailyPrice)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Buyer Name" required error={errors.buyerName?.message}>
          <Input
            aria-invalid={Boolean(errors.buyerName)}
            placeholder={t("Buyer full name")}
            {...register("buyerName")}
          />
        </Field>

        <Field label="Buyer Phone" error={errors.buyerPhone?.message}>
          <Input
            aria-invalid={Boolean(errors.buyerPhone)}
            data-ltr="true"
            placeholder={t("Phone")}
            {...register("buyerPhone")}
          />
        </Field>

        <Field label="Buyer ID Number" error={errors.buyerIdNumber?.message}>
          <Input
            aria-invalid={Boolean(errors.buyerIdNumber)}
            data-ltr="true"
            placeholder={t("ID number")}
            {...register("buyerIdNumber")}
          />
        </Field>

        <Field label="Sale Date" required error={errors.saleDate?.message}>
          <Input
            aria-invalid={Boolean(errors.saleDate)}
            data-ltr="true"
            type="datetime-local"
            {...register("saleDate")}
          />
        </Field>

        <Field label="Sale Price" required error={errors.salePrice?.message}>
          <Input
            aria-invalid={Boolean(errors.salePrice)}
            data-ltr="true"
            inputMode="decimal"
            placeholder="5000"
            {...register("salePrice")}
          />
        </Field>

        <Field label="Payment Method" required error={errors.paymentMethod?.message}>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            aria-invalid={Boolean(errors.paymentMethod)}
            {...register("paymentMethod")}
          >
            {paymentMethodValues.map((method) => (
              <option key={method} value={method}>
                {formatPaymentMethod(method, language)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes" error={errors.notes?.message}>
        <Textarea
          placeholder={t("Optional sale notes")}
          rows={4}
          {...register("notes")}
        />
      </Field>

      <div className="rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
        {t("Vehicle sale transfer paperwork note")}
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          {t("Sell Vehicle")}
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
