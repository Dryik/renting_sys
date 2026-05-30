import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Loader2, Printer, FileDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { DataTable, Td, Th } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import { useAuth } from "@/hooks/useAuth";
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
  onVoidPayment?: (payment: PaymentRecord) => Promise<void>;
};

type ReceiptPrintAction = {
  paymentId: number;
  printToPDF: boolean;
} | null;

export function RentalPaymentPanel({
  currency,
  error,
  isSaving,
  payments,
  rental,
  onCancel,
  onSave,
  onVoidPayment,
}: RentalPaymentPanelProps) {
  const { can } = useAuth();
  const { formatDateTime, language, locale, settings, t } = useI18n();
  const [receiptPrintAction, setReceiptPrintAction] =
    useState<ReceiptPrintAction>(null);
  const [receiptPrintError, setReceiptPrintError] = useState<string | null>(null);
  const availablePaymentTypes = settings.enableClientDeposit
    ? paymentTypeValues
    : paymentTypeValues.filter((type) => type !== "deposit");
  const permittedPaymentTypes = availablePaymentTypes.filter(
    (type) => type !== "refund" || can("payments.refund"),
  );
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

  async function handlePrintReceipt(paymentId: number, printToPDF: boolean) {
    setReceiptPrintAction({ paymentId, printToPDF });
    setReceiptPrintError(null);

    try {
      await window.rentalApp.payments.printReceipt(paymentId, printToPDF);
    } catch (err) {
      setReceiptPrintError(
        err instanceof Error && err.message ? t(err.message) : t("Operation Failed"),
      );
    } finally {
      setReceiptPrintAction(null);
    }
  }

  function isPrintingReceipt(paymentId: number, printToPDF: boolean): boolean {
    return (
      receiptPrintAction?.paymentId === paymentId &&
      receiptPrintAction.printToPDF === printToPDF
    );
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
        className="rounded-lg border bg-card p-5 shadow-xs"
        onSubmit={handleSubmit(submit)}
      >
        <div className="grid gap-4 lg:grid-cols-5 md:grid-cols-2">
          <Field label="Payment Type" required error={errors.type?.message}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              aria-invalid={Boolean(errors.type)}
              {...register("type")}
            >
              {permittedPaymentTypes.map((type) => (
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

        <div className="mt-5 flex justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Save Payment")}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-card p-5 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h5 className="font-semibold">{t("Payment History")}</h5>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("Payments appear here after they are recorded from a rental.")}
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {t("{{count}} shown", { count: payments.length })}
          </span>
        </div>
        {receiptPrintError ? (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(receiptPrintError)}
          </div>
        ) : null}
        <DataTable className="min-w-[760px]">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <Th>{t("Date")}</Th>
                <Th>{t("Type")}</Th>
                <Th>{t("Method")}</Th>
                <Th className="text-end">{t("Amount")}</Th>
                <Th>{t("Notes")}</Th>
                <Th className="text-end">{t("Actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <PaymentEmptyTableRow
                  title={t("No payments recorded for this rental yet.")}
                  description={t("Payments appear here after they are recorded from a rental.")}
                />
              ) : (
                payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="transition-colors hover:bg-muted/30 focus-within:bg-muted/40"
                  >
                    <Td className="whitespace-nowrap tabular-nums">
                      <BidiValue value={formatDateTime(payment.paymentDate)} />
                    </Td>
                    <Td>{formatPaymentType(payment.type, language)}</Td>
                    <Td>
                      {formatPaymentMethod(payment.method, language)}
                    </Td>
                    <Td className={`text-end font-semibold ${payment.type === "refund" ? "text-warning" : ""}`}>
                      <BidiValue value={`${payment.type === "refund" ? "-" : ""}${formatMoney(payment.amount, currency, locale)}`} />
                    </Td>
                    <Td className="max-w-[14rem] text-muted-foreground">
                      {payment.notes ?? t("No notes")}
                    </Td>
                    <Td className="text-end">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={receiptPrintAction !== null}
                          onClick={() => void handlePrintReceipt(payment.id, false)}
                        >
                          {isPrintingReceipt(payment.id, false) ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Printer data-icon="inline-start" />
                          )}
                          {t("Print")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={receiptPrintAction !== null}
                          onClick={() => void handlePrintReceipt(payment.id, true)}
                        >
                          {isPrintingReceipt(payment.id, true) ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <FileDown data-icon="inline-start" />
                          )}
                          {t("PDF")}
                        </Button>
                        {payment.status === "posted" && onVoidPayment ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={receiptPrintAction !== null || isSaving}
                            onClick={() => void onVoidPayment(payment)}
                          >
                            <Ban data-icon="inline-start" />
                            {t("Void")}
                          </Button>
                        ) : (
                          <span className="inline-flex h-8 items-center rounded-md border px-2 text-xs font-medium text-destructive">
                            {t("Voided")}
                          </span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
        </DataTable>
      </div>
    </div>
  );
}

function PaymentEmptyTableRow({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <tr>
      <td className="px-4 py-10 text-center" colSpan={6}>
        <div className="mx-auto flex max-w-md flex-col gap-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </td>
    </tr>
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
    <div className="rounded-lg border bg-muted/25 p-4 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
