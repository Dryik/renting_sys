import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { normalizeDigits } from "@/shared/numerals";

/**
 * Offers to collect the outstanding balance while returning a vehicle. The
 * page owns the amount and the mutation; this only asks the question.
 */
export function FinalPaymentDialog({
  currency,
  error,
  isBusy,
  onCancel,
  onConfirm,
  open,
  t,
}: {
  currency: string;
  error: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: (amount: number) => Promise<boolean>;
  open: boolean;
  t: (key: string) => string;
}) {
  const [amountText, setAmountText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: cancel,
    open,
  });

  if (!open) {
    return null;
  }

  function cancel() {
    setAmountText("");
    setValidationError(null);
    onCancel();
  }

  async function submit() {
    const normalizedAmount = Number(
      normalizeDigits(amountText).trim().replace(",", "."),
    );

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setValidationError("Amount must be more than zero.");
      return;
    }

    setValidationError(null);
    const didReturn = await onConfirm(normalizedAmount);

    if (didReturn) {
      setAmountText("");
    }
  }

  const displayError = validationError ?? error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <form
        ref={dialogRef}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="dialog"
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-base font-semibold">
          {t("Return vehicle and record payment")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Enter the payment collected at return.")}
        </p>

        <div className="mt-4 rounded-md border bg-muted/25 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("Currency")}: </span>
          <BidiValue className="font-semibold" value={currency} />
        </div>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
          <span>{t("Final payment amount")}</span>
          <Input
            autoFocus
            aria-invalid={Boolean(displayError)}
            data-ltr="true"
            inputMode="decimal"
            value={amountText}
            onChange={(event) => {
              setAmountText(event.target.value);
              setValidationError(null);
            }}
          />
        </label>

        {displayError ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(displayError)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel} disabled={isBusy}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isBusy || amountText.trim().length === 0}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Record Payment and Return")}
          </Button>
        </div>
      </form>
    </div>
  );
}
