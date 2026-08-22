import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Pencil,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import type { RentalListRecord } from "@/shared/rentals";

type ActivateDraftDialogProps = {
  formatCurrency: (amount: number) => string;
  formatDateTime: (date: string | Date) => string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onEditDraft?: () => void;
  open: boolean;
  rental: RentalListRecord | null;
  t: (key: string) => string;
};

export function ActivateDraftDialog({
  formatCurrency,
  formatDateTime,
  isBusy = false,
  onCancel,
  onConfirm,
  onEditDraft,
  open,
  rental,
  t,
}: ActivateDraftDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  const [mountTimestamp] = useState(() => Date.now());

  if (!open || !rental) {
    return null;
  }

  const startTime = new Date(rental.startDatetime).getTime();
  // Check if start datetime is more than 15 minutes in the past
  const isStartDateInPast = startTime < mountTimestamp - 15 * 60 * 1000;
  // Check if start datetime is scheduled for a future date (more than 1 day ahead)
  const isStartDateInFuture = startTime > mountTimestamp + 24 * 60 * 60 * 1000;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <div
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold" id={titleId}>
              {t("Activate Rental Contract")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>
              {t(
                "Confirm activating this draft contract. The vehicle status will become rented and the contract becomes active.",
              )}
            </p>
          </div>
        </div>

        {/* Contract Summary Box */}
        <div className="mt-5 rounded-lg border border-border/80 bg-muted/40 p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Contract No.")}
              </span>
              <div className="font-semibold">{rental.contractNo}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Customer")}
              </span>
              <div className="font-medium truncate">{rental.customerName}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Vehicle")}
              </span>
              <div className="font-medium">
                {rental.vehicleBrand} {rental.vehicleModel}
                <span className="ms-1.5 text-xs text-muted-foreground">
                  ({rental.vehiclePlateNumber})
                </span>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                {t("Total Amount")}
              </span>
              <div className="font-semibold text-primary">
                {formatCurrency(rental.totalAmount)}
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-3 border-t border-border/60 pt-2.5 mt-1">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" />
                  {t("Start Date")}
                </span>
                <BidiValue
                  className="font-medium text-xs sm:text-sm"
                  value={formatDateTime(rental.startDatetime)}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  {t("Expected Return")}
                </span>
                <BidiValue
                  className="font-medium text-xs sm:text-sm"
                  value={formatDateTime(rental.expectedReturnDatetime)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Date Discrepancy Warning */}
        {isStartDateInPast ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3.5 text-sm text-warning-foreground">
            <AlertTriangle className="size-5 shrink-0 text-warning mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-warning">
                {t("Contract start date is in the past.")}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(
                  "The contract will be activated with this start date. If you wish to change the starting date, please edit the draft first.",
                )}
              </p>
            </div>
          </div>
        ) : isStartDateInFuture ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
            <Info className="size-5 shrink-0 text-primary mt-0.5" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("Notice: The contract start date is scheduled for a future date.")}
            </p>
          </div>
        ) : null}

        {/* Dialog Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div>
            {onEditDraft ? (
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={onEditDraft}
              >
                <Pencil data-icon="inline-start" />
                {t("Edit Draft")}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={onCancel}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={isBusy}
              onClick={onConfirm}
            >
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <CheckCircle2 data-icon="inline-start" />
              )}
              {t("Confirm & Activate")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
