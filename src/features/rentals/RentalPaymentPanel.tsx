import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Printer, FileDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { formatMoney } from "@/shared/money";
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
  currency: string;
  error: string | null;
  isSaving: boolean;
  payments: PaymentRecord[];
  rental: RentalListRecord;
  onCancel: () => void;
  onSave: (input: PaymentInput) => Promise<void>;
};

export function RentalPaymentPanel({
  currency,
  error,
  isSaving,
  payments,
  rental,
  onCancel,
  onSave,
}: RentalPaymentPanelProps) {
  const { formatDateTime, language, locale, settings, t } = useI18n();
  const availablePaymentTypes = settings.enableClientDeposit
    ? paymentTypeValues
    : paymentTypeValues.filter((type) => type !== "deposit");
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryValue
          label={t("Total Amount")}
          value={<BidiValue value={formatMoney(rental.totalAmount, currency, locale)} />}
        />
        <SummaryValue
          label={t("Paid Amount")}
          value={<BidiValue value={formatMoney(rental.paidAmount, currency, locale)} />}
        />
        <SummaryValue
          label={t("Remaining")}
          value={<BidiValue value={formatMoney(rental.remainingAmount, currency, locale)} />}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error)}
        </div>
      ) : null}

      <form
        className="border-t pt-5"
        onSubmit={handleSubmit((values) => void submit(values))}
      >
        <div className="grid gap-4 lg:grid-cols-5 md:grid-cols-2">
          <Field label="Payment Type" required error={errors.type?.message}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.type)}
              {...register("type")}
            >
              {availablePaymentTypes.map((type) => (
                <option key={type} value={type}>
                  {formatPaymentType(type, language)}
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
                  {formatPaymentMethod(method, language)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount" required error={errors.amount?.message}>
            <Input
              aria-invalid={Boolean(errors.amount)}
              data-ltr="true"
              inputMode="decimal"
              placeholder="0"
              {...register("amount")}
            />
          </Field>

          <Field label="Payment Date" required error={errors.paymentDate?.message}>
            <Input
              aria-invalid={Boolean(errors.paymentDate)}
              data-ltr="true"
              type="datetime-local"
              {...register("paymentDate")}
            />
          </Field>

          <div className="lg:col-span-1 md:col-span-2">
            <Field label="Notes" error={errors.notes?.message}>
              <Textarea placeholder={t("Optional note")} {...register("notes")} />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 data-icon="inline-start" /> : null}
            {t("Save Payment")}
          </Button>
        </div>
      </form>

      <div className="border-t pt-5">
        <h5 className="font-semibold">{t("Payment History")}</h5>
        <div className="mt-3 overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-start text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("Date")}</th>
                <th className="px-4 py-3 font-medium">{t("Type")}</th>
                <th className="px-4 py-3 font-medium">{t("Method")}</th>
                <th className="px-4 py-3 font-medium text-end">{t("Amount")}</th>
                <th className="px-4 py-3 font-medium">{t("Notes")}</th>
                <th className="px-4 py-3 font-medium text-end">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-10 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {t("No payments recorded for this rental yet.")}
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-t">
                    <td className="px-4 py-3"><BidiValue value={formatDateTime(payment.paymentDate)} /></td>
                    <td className="px-4 py-3">{formatPaymentType(payment.type, language)}</td>
                    <td className="px-4 py-3">
                      {formatPaymentMethod(payment.method, language)}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <BidiValue value={`${payment.type === "refund" ? "-" : ""}${formatMoney(payment.amount, currency, locale)}`} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-normal">
                      {payment.notes ?? t("No notes")}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void window.rentalApp.payments.printReceipt(payment.id, false)}
                        >
                          <Printer data-icon="inline-start" />
                          {t("Print")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void window.rentalApp.payments.printReceipt(payment.id, true)}
                        >
                          <FileDown data-icon="inline-start" />
                          {t("PDF")}
                        </Button>
                      </div>
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
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
