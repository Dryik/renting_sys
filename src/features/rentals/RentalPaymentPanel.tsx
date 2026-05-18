import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  formatPaymentMethod,
  formatPaymentType,
  getDefaultPaymentFormValues,
  type PaymentFormInput,
  type PaymentFormValues,
  type PaymentInput,
  paymentFormSchema,
  paymentMethodValues,
  type PaymentRecord,
  paymentTypeValues,
} from "@/shared/payments";
import type { RentalListRecord } from "@/shared/rentals";

type RentalPaymentPanelProps = {
  error: string | null;
  isSaving: boolean;
  payments: PaymentRecord[];
  rental: RentalListRecord;
  onCancel: () => void;
  onSave: (input: PaymentInput) => Promise<void>;
};

export function RentalPaymentPanel({
  error,
  isSaving,
  payments,
  rental,
  onCancel,
  onSave,
}: RentalPaymentPanelProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<PaymentFormValues, undefined, PaymentFormInput>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: getDefaultPaymentFormValues(),
    mode: "onBlur",
  });

  useEffect(() => {
    reset(getDefaultPaymentFormValues());
  }, [rental.id, reset]);

  async function submit(values: PaymentFormInput) {
    await onSave({
      ...values,
      rentalId: rental.id,
    });
    reset(getDefaultPaymentFormValues());
  }

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h4 className="text-lg font-semibold">Record Payment</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {rental.contractNo} - {rental.customerName} -{" "}
            {rental.vehiclePlateNumber}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryValue label="Total Amount" value={formatMoney(rental.totalAmount)} />
        <SummaryValue label="Paid Amount" value={formatMoney(rental.paidAmount)} />
        <SummaryValue
          label="Remaining"
          value={formatMoney(rental.remainingAmount)}
        />
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <form
        className="mt-5 border-t pt-5"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <div className="grid gap-4 lg:grid-cols-5 md:grid-cols-2">
          <Field label="Payment Type" required error={errors.type?.message}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.type)}
              {...register("type")}
            >
              {paymentTypeValues.map((type) => (
                <option key={type} value={type}>
                  {formatPaymentType(type)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Method" required error={errors.method?.message}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.method)}
              {...register("method")}
            >
              {paymentMethodValues.map((method) => (
                <option key={method} value={method}>
                  {formatPaymentMethod(method)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount" required error={errors.amount?.message}>
            <Input
              aria-invalid={Boolean(errors.amount)}
              inputMode="decimal"
              placeholder="0"
              {...register("amount")}
            />
          </Field>

          <Field label="Payment Date" required error={errors.paymentDate?.message}>
            <Input
              aria-invalid={Boolean(errors.paymentDate)}
              type="datetime-local"
              {...register("paymentDate")}
            />
          </Field>

          <div className="lg:col-span-1 md:col-span-2">
            <Field label="Notes" error={errors.notes?.message}>
              <Textarea placeholder="Optional note" {...register("notes")} />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 data-icon="inline-start" /> : null}
            Save Payment
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t pt-5">
        <h5 className="font-semibold">Payment History</h5>
        <div className="mt-3 overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No payments recorded for this rental yet.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="px-4 py-3">{formatDateTime(payment.paymentDate)}</td>
                    <td className="px-4 py-3">{formatPaymentType(payment.type)}</td>
                    <td className="px-4 py-3">
                      {formatPaymentMethod(payment.method)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payment.type === "refund" ? "-" : ""}
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {payment.notes ?? "No notes"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
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
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
