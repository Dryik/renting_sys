import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  error: string | null;
  isSaving: boolean;
  rental: RentalListRecord;
  onCancel: () => void;
  onSave: (input: RentalReturnInput) => Promise<void>;
};

export function RentalReturnForm({
  error,
  isSaving,
  rental,
  onCancel,
  onSave,
}: RentalReturnFormProps) {
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<RentalReturnFormValues, undefined, RentalReturnFormInput>({
    resolver: zodResolver(rentalReturnFormSchema),
    defaultValues: getDefaultRentalReturnFormValues(rental),
    mode: "onBlur",
  });

  useEffect(() => {
    reset(getDefaultRentalReturnFormValues(rental));
  }, [rental, reset]);

  const actualReturnDatetime = useWatch({
    control,
    name: "actualReturnDatetime",
  });
  const lateFeePerDay = useWatch({ control, name: "lateFeePerDay" });
  const damageCharge = useWatch({ control, name: "damageCharge" });
  const discount = useWatch({ control, name: "discount" });

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
      className="rounded-lg border bg-card p-5 shadow-sm"
      onSubmit={handleSubmit((values) => {
        const confirmed = window.confirm(
          "Mark this rental returned and update the vehicle status?",
        );

        if (!confirmed) {
          return;
        }

        return onSave({
          ...values,
          rentalId: rental.id,
        });
      })}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h4 className="text-lg font-semibold">Return Vehicle</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {rental.contractNo} - {rental.vehiclePlateNumber} -{" "}
            {rental.customerName}
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

      <div className="mt-5 grid gap-4 lg:grid-cols-4 md:grid-cols-2">
        <Field
          label="Actual Return"
          required
          error={errors.actualReturnDatetime?.message}
        >
          <Input
            aria-invalid={Boolean(errors.actualReturnDatetime)}
            type="datetime-local"
            {...register("actualReturnDatetime")}
          />
        </Field>

        <Field label="Mileage In" error={errors.mileageIn?.message}>
          <Input
            inputMode="numeric"
            placeholder="Vehicle mileage"
            {...register("mileageIn")}
          />
        </Field>

        <Field label="Fuel In" error={errors.fuelIn?.message}>
          <Input placeholder="Full, half, empty" {...register("fuelIn")} />
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
            <option value="available">Available</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>

        <Field
          label="Late Fee Per Day"
          required
          error={errors.lateFeePerDay?.message}
        >
          <Input
            aria-invalid={Boolean(errors.lateFeePerDay)}
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
            inputMode="decimal"
            placeholder="0"
            {...register("damageCharge")}
          />
        </Field>

        <Field label="Discount" required error={errors.discount?.message}>
          <Input
            aria-invalid={Boolean(errors.discount)}
            inputMode="decimal"
            placeholder="0"
            {...register("discount")}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Damage Notes" error={errors.damageNotes?.message}>
          <Textarea
            placeholder="Damage or extra-charge details"
            {...register("damageNotes")}
          />
        </Field>
        <Field label="Return Notes" error={errors.notesIn?.message}>
          <Textarea
            placeholder="Condition or notes after return"
            {...register("notesIn")}
          />
        </Field>
      </div>

      <div className="mt-5 grid gap-3 rounded-md border bg-muted/40 p-4 lg:grid-cols-5 md:grid-cols-3">
        <SummaryValue label="Base Rent" value={formatMoney(rental.totalAmount)} />
        <SummaryValue label="Late Days" value={String(summary.lateDays)} />
        <SummaryValue label="Late Fee" value={formatMoney(summary.lateFee)} />
        <SummaryValue
          label="Final Amount"
          value={formatMoney(summary.finalAmount)}
        />
        <SummaryValue
          label="Remaining"
          value={formatMoney(summary.remainingAmount)}
        />
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 data-icon="inline-start" /> : null}
          Mark Returned
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
