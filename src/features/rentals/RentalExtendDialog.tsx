import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import {
  calculateExtensionSummary,
  extendedReturnDatetime,
  getDefaultRentalExtendFormValues,
  normalizeToCalendarDate,
  rentalExtendFormSchema,
  toDateInputValue,
  type RentalExtendFormInput,
  type RentalExtendFormValues,
  type RentalExtendInput,
  type RentalListRecord,
} from "@/shared/rentals";

type RentalExtendDialogProps = {
  formatCurrency: (amount: number) => string;
  formatDate: (date: string | Date) => string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (
    input: RentalExtendInput,
    printFirstPageOnly: boolean,
  ) => Promise<boolean>;
  open: boolean;
  rental: RentalListRecord | null;
  t: (key: string, values?: Record<string, string | number>) => string;
};

export function RentalExtendDialog({
  formatCurrency,
  formatDate,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  rental,
  t,
}: RentalExtendDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

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
  } = useForm<RentalExtendFormValues, undefined, RentalExtendFormInput>({
    resolver: zodResolver(rentalExtendFormSchema),
    defaultValues: rental
      ? getDefaultRentalExtendFormValues(rental, 7)
      : {
          newExpectedReturnDatetime: "",
          recordPayment: false,
          paymentAmount: "0",
          paymentMethod: "cash",
          paymentNotes: "",
          notes: "",
          printFirstPageOnly: true,
        },
  });

  useEffect(() => {
    if (rental && open) {
      reset(getDefaultRentalExtendFormValues(rental, 7));
    }
  }, [rental, open, reset]);

  const newReturnDate = useWatch({
    control,
    name: "newExpectedReturnDatetime",
  });
  const recordPayment = useWatch({ control, name: "recordPayment" });
  const printFirstPageOnly = useWatch({
    control,
    name: "printFirstPageOnly",
  });

  // The contract's own rate: extending moves the date, it does not reprice.
  const dailyPriceNum = rental?.dailyPrice ?? 0;

  const summary = useMemo(() => {
    if (!rental || !newReturnDate) {
      return null;
    }

    return calculateExtensionSummary({
      startDatetime: rental.startDatetime,
      currentExpectedReturnDatetime: rental.expectedReturnDatetime,
      newExpectedReturnDatetime: newReturnDate,
      dailyPrice: dailyPriceNum,
      accessoryCharges: rental.accessoryCharges,
      paidAmount: rental.paidAmount,
    });
  }, [rental, newReturnDate, dailyPriceNum]);

  function handleQuickAddDays(days: number) {
    if (!rental) return;
    const currentExpected = normalizeToCalendarDate(
      rental.expectedReturnDatetime,
    );
    const updatedDate = new Date(
      currentExpected.getTime() + days * 24 * 60 * 60 * 1000,
    );
    const updatedDateStr = toDateInputValue(updatedDate);

    setValue("newExpectedReturnDatetime", updatedDateStr, {
      shouldValidate: true,
    });

    const updatedSummary = calculateExtensionSummary({
      startDatetime: rental.startDatetime,
      currentExpectedReturnDatetime: rental.expectedReturnDatetime,
      newExpectedReturnDatetime: updatedDateStr,
      dailyPrice: dailyPriceNum,
      accessoryCharges: rental.accessoryCharges,
      paidAmount: rental.paidAmount,
    });

    if (recordPayment) {
      setValue("paymentAmount", String(updatedSummary.addedRentAmount), {
        shouldValidate: true,
      });
    }
  }

  async function onFormSubmit(data: RentalExtendFormInput) {
    if (!rental) return;

    const input: RentalExtendInput = {
      rentalId: rental.id,
      // Staff pick a date; the contract keeps its own time of day, so
      // extending by N days adds exactly N billable days.
      newExpectedReturnDatetime: extendedReturnDatetime(
        rental.expectedReturnDatetime,
        data.newExpectedReturnDatetime,
      ),
      recordPayment: data.recordPayment,
      paymentAmount: data.recordPayment ? data.paymentAmount : undefined,
      paymentMethod: data.recordPayment ? data.paymentMethod : undefined,
      paymentNotes: data.recordPayment ? data.paymentNotes : undefined,
      notes: data.notes || undefined,
    };

    await onConfirm(input, data.printFirstPageOnly);
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
        className="my-auto w-full max-w-xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <CalendarPlus className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold" id={titleId}>
                  {t("Extend Rental")}
                </h2>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  <BidiValue value={rental.contractNo} />
                </span>
              </div>
              <p
                className="mt-1 text-sm text-muted-foreground"
                id={descriptionId}
              >
                {t(
                  "Extend this rental contract by adjusting the return date and recalculating contract totals.",
                )}
              </p>
            </div>
          </div>

          {/* Rental Info Banner */}
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border/80 bg-muted/40 p-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Customer")}
              </span>
              <div className="font-medium">{rental.customerName}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Vehicle")}
              </span>
              <div className="font-medium">
                <BidiValue
                  value={`${rental.vehiclePlateNumber} (${rental.vehicleBrand} ${rental.vehicleModel})`}
                />
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Current Return Date")}
              </span>
              <div className="font-semibold text-foreground">
                <BidiValue value={formatDate(rental.expectedReturnDatetime)} />
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Daily Price")}
              </span>
              <div className="font-semibold text-foreground">
                <BidiValue value={formatCurrency(rental.dailyPrice)} />
              </div>
            </div>
          </div>

          {/* New Return Date & Quick Add Chips */}
          <div className="mt-5 space-y-3">
            <div>
              <label className="text-sm font-medium">
                {t("New Return Date")}
              </label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  data-ltr="true"
                  type="date"
                  aria-invalid={Boolean(errors.newExpectedReturnDatetime)}
                  {...register("newExpectedReturnDatetime")}
                />
              </div>
              {errors.newExpectedReturnDatetime ? (
                <p className="mt-1 text-xs text-destructive">
                  {errors.newExpectedReturnDatetime.message}
                </p>
              ) : null}
            </div>

            {/* Quick Extension Buttons */}
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                {t("Quick Extend")}:
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  { label: "+1 Day", days: 1 },
                  { label: "+3 Days", days: 3 },
                  { label: "+7 Days", days: 7 },
                  { label: "+14 Days", days: 14 },
                  { label: "+30 Days", days: 30 },
                ].map(({ label, days }) => (
                  <Button
                    key={days}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-medium"
                    onClick={() => handleQuickAddDays(days)}
                  >
                    {t(label)}
                  </Button>
                ))}
              </div>
            </div>

          </div>

          {/* Live Extension Summary Card */}
          {summary ? (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between border-b border-primary/10 pb-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <CheckCircle2 className="size-4" />
                  <span>{t("Contract Financial Summary")}</span>
                </div>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                  +{summary.addedDays} {t("day")}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">
                    {t("Current Duration")}
                  </span>
                  <div className="font-medium">
                    {summary.currentDays} {t("day")} (
                    <BidiValue
                      value={formatCurrency(summary.currentTotalAmount)}
                    />
                    )
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    {t("New Duration")}
                  </span>
                  <div className="font-semibold text-foreground">
                    {summary.newDays} {t("day")}{" "}
                    <ArrowRight className="inline size-3 text-primary mx-1" />
                    <BidiValue
                      value={formatCurrency(summary.newTotalAmount)}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    {t("Extension Charge")}
                  </span>
                  <div className="font-bold text-primary">
                    +<BidiValue
                      value={formatCurrency(summary.addedRentAmount)}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    {t("Balance due")}
                  </span>
                  <div className="font-bold text-foreground">
                    <BidiValue
                      value={formatCurrency(summary.newRemainingAmount)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Optional Payment Recording */}
          <div className="mt-5 rounded-lg border border-border bg-card p-3.5">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                {...register("recordPayment")}
              />
              <CreditCard className="size-4 text-muted-foreground" />
              <span>{t("Record Extension Payment")}</span>
            </label>

            {recordPayment ? (
              <div className="mt-3 grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("Amount")}
                  </label>
                  <Input
                    data-ltr="true"
                    inputMode="decimal"
                    className="mt-1"
                    aria-invalid={Boolean(errors.paymentAmount)}
                    {...register("paymentAmount")}
                  />
                  {errors.paymentAmount ? (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.paymentAmount.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("Payment Method")}
                  </label>
                  <select
                    className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    {...register("paymentMethod")}
                  >
                    <option value="cash">{t("Cash")}</option>
                    <option value="card">{t("Card")}</option>
                    <option value="bank_transfer">
                      {t("Bank Transfer")}
                    </option>
                  </select>
                </div>
              </div>
            ) : null}
          </div>

          {/* Print Option */}
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={printFirstPageOnly}
                onChange={(e) =>
                  setValue("printFirstPageOnly", e.target.checked)
                }
              />
              <FileText className="size-4" />
              <span>{t("Print Contract (Page 1 Only)")}</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={onCancel}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={isBusy}>
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus data-icon="inline-start" />
              )}
              {t("Extend Rental")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
