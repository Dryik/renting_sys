import { CheckCircle2, CreditCard, FileDown, Loader2, Pencil, Printer, XCircle } from "lucide-react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { formatCollateralType } from "@/shared/rentals";
import type { PaymentRecord } from "@/shared/payments";
import type { RentalListRecord } from "@/shared/rentals";
import { RentalStatusBadge } from "./RentalStatusBadge";
import { canOperateRental, type PrintAction } from "./rental-panel-helpers";
import type { ReactNode } from "react";

/**
 * Read-only view of one rental, plus the buttons that start its workflows.
 *
 * Every action is a callback the page supplies, and each is optional: the page
 * decides from permissions and rental status whether an action exists at all,
 * so this component never repeats a permission decision.
 */
export function RentalDetailPanel({
  contractPrintAction,
  currency,
  formatCurrency,
  formatDate,
  formatDateTime,
  isSaving,
  onActivateDraft,
  onCancelRental,
  onEditDraft,
  onPrintContract,
  onRecordPayment,
  onReturnVehicle,
  panelError,
  panelNotice,
  paymentError,
  payments,
  rental,
  t,
}: {
  contractPrintAction: PrintAction | null;
  currency: string;
  formatCurrency: (amount: number) => string;
  formatDate: (value: string | Date) => string;
  formatDateTime: (value: string | Date) => string;
  isSaving: boolean;
  onActivateDraft?: () => void;
  onCancelRental?: () => void;
  onEditDraft?: () => void;
  onPrintContract: (printToPDF: boolean) => void;
  onRecordPayment?: () => void;
  onReturnVehicle?: () => void;
  panelError: string | null;
  panelNotice: string | null;
  paymentError: string | null;
  payments: PaymentRecord[];
  rental: RentalListRecord;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const canOperate = canOperateRental(rental);
  const isPrinting = contractPrintAction !== null;

  return (
    <div className="flex flex-col gap-5">
      {panelError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(panelError)}
        </div>
      ) : null}

      {panelNotice ? (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          {t(panelNotice)}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label={t("Contract")} value={<BidiValue value={rental.contractNo} />} />
        <DetailItem label={t("Status")} value={<RentalStatusBadge status={rental.status} />} />
        <DetailItem label={t("Customer")} value={rental.customerName} />
        <DetailItem label={t("Phone")} value={<BidiValue value={rental.customerPhone} />} />
        <DetailItem
          label={t("Vehicle")}
          value={`${rental.vehicleBrand} ${rental.vehicleModel}`}
        />
        <DetailItem label={t("Plate")} value={<BidiValue value={rental.vehiclePlateNumber} />} />
      </div>

      <div className="rounded-md border">
        <div className="border-b px-4 py-3 font-medium">{t("Amounts")}</div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <DetailItem label={t("Total Amount")} value={<BidiValue value={formatCurrency(rental.totalAmount)} />} alignEnd />
          <DetailItem label={t("Paid Amount")} value={<BidiValue value={formatCurrency(rental.paidAmount)} />} alignEnd />
          <DetailItem
            label={rental.remainingAmount < 0 ? t("Credit") : t("Balance due")}
            value={(
              <MoneyText
                amount={rental.remainingAmount}
                formatCurrency={formatCurrency}
              />
            )}
            alignEnd
          />
        </div>
      </div>

      {rental.accessories?.length ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3 font-medium">{t("Accessories")}</div>
          <div className="divide-y">
            {rental.accessories.map((accessory) => (
              <div
                key={accessory.id}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-medium">{accessory.accessoryName}</p>
                  {accessory.notes ? (
                    <p className="text-xs text-muted-foreground">{accessory.notes}</p>
                  ) : null}
                </div>
                <DetailItem
                  label={t("Quantity")}
                  value={`${accessory.quantity}`}
                  alignEnd
                />
                <DetailItem
                  label={t("Charge")}
                  value={<BidiValue value={formatCurrency(accessory.quantity * accessory.unitCharge)} />}
                  alignEnd
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {rental.collateralItems?.length ? (
        <div className="rounded-md border">
          <div className="border-b px-4 py-3 font-medium">{t("Amanat Held")}</div>
          <div className="divide-y">
            {rental.collateralItems.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-3">
                <DetailItem
                  label={t(formatCollateralType(item.type, "en"))}
                  value={item.description}
                />
                <DetailItem
                  label={t("Reference")}
                  value={item.referenceNumber ? <BidiValue value={item.referenceNumber} /> : t("No reference")}
                />
                <DetailItem
                  label={t("Status")}
                  value={t(item.status === "returned" ? "Returned" : "Held")}
                />
                {item.notes ? (
                  <div className="sm:col-span-3 text-sm text-muted-foreground">
                    {item.notes}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-md border">
        <div className="border-b px-4 py-3 font-medium">{t("Rental Period")}</div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <DetailItem label={t("Start")} value={<BidiValue value={formatDate(rental.startDatetime)} />} />
          <DetailItem label={t("Expected Return")} value={<BidiValue value={formatDate(rental.expectedReturnDatetime)} />} />
          <DetailItem
            label={t("Actual Return")}
            value={
              rental.actualReturnDatetime
                ? <BidiValue value={formatDate(rental.actualReturnDatetime)} />
                : t("No date")
            }
          />
          <DetailItem label={t("Currency")} value={<BidiValue value={currency} />} />
        </div>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 className="font-medium">{t("Payments")}</h3>
        </div>
        {paymentError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(paymentError)}
          </div>
        ) : null}
        <div className="flex flex-col">
          {payments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("No payments recorded for this rental yet.")}
            </div>
          ) : (
            payments.map((payment) => (
              <div key={payment.id} className="grid gap-2 border-t px-4 py-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="font-medium">{t(payment.type === "refund" ? "Refund" : "Payment")}</div>
                  <BidiValue className="text-xs text-muted-foreground" value={formatDateTime(payment.paymentDate)} />
                </div>
                <BidiValue
                  className={`text-end font-semibold ${payment.type === "refund" ? "text-warning" : ""}`}
                  value={`${payment.type === "refund" ? "-" : ""}${formatCurrency(payment.amount)}`}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col gap-3 border-t bg-card px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {canOperate && onReturnVehicle ? (
            <Button onClick={onReturnVehicle}>
              <CheckCircle2 data-icon="inline-start" />
              {t("Return Vehicle")}
            </Button>
          ) : null}
          {rental.status === "draft" && onEditDraft ? (
            <Button variant="outline" disabled={isSaving} onClick={onEditDraft}>
              <Pencil data-icon="inline-start" />
              {t("Edit Draft")}
            </Button>
          ) : null}
          {rental.status === "draft" && onActivateDraft ? (
            <Button disabled={isSaving} onClick={onActivateDraft}>
              <CheckCircle2 data-icon="inline-start" />
              {t("Activate Rental")}
            </Button>
          ) : null}
          {onRecordPayment ? (
            <Button variant="outline" onClick={onRecordPayment}>
              <CreditCard data-icon="inline-start" />
              {t("Record Payment")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={isPrinting}
            onClick={() => onPrintContract(false)}
          >
            {contractPrintAction === "print" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer data-icon="inline-start" />
            )}
            {t("Print Contract")}
          </Button>
          <Button
            variant="outline"
            disabled={isPrinting}
            onClick={() => onPrintContract(true)}
          >
            {contractPrintAction === "pdf" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown data-icon="inline-start" />
            )}
            {t("PDF")}
          </Button>
        </div>
        <div className="flex justify-start sm:justify-end">
          {canOperate && onCancelRental ? (
            <Button
              className="border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isSaving}
              variant="outline"
              onClick={onCancelRental}
            >
              <XCircle data-icon="inline-start" />
              {t("Cancel Rental")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  alignEnd = false,
  label,
  value,
}: {
  alignEnd?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className={alignEnd ? "text-end" : undefined}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 text-sm font-medium">{value}</div>
    </div>
  );
}
