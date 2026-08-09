import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModalBehavior } from "@/hooks/useModalBehavior";

/**
 * Finds an open rental by plate number so a returning vehicle can be handled
 * without searching the list first. The lookup itself belongs to the page.
 */
export function ReturnByPlateDialog({
  error,
  isBusy,
  onCancel,
  onConfirm,
  onPlateNumberChange,
  open,
  plateNumber,
  t,
}: {
  error: string | null;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onPlateNumberChange: (value: string) => void;
  open: boolean;
  plateNumber: string;
  t: (key: string) => string;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  if (!open) {
    return null;
  }

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
          onConfirm();
        }}
      >
        <h2 className="text-base font-semibold">{t("Return vehicle by plate")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("Enter a plate number to find the active rental.")}
        </p>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
          <span>{t("Plate")}</span>
          <Input
            autoFocus
            aria-invalid={Boolean(error)}
            data-ltr="true"
            value={plateNumber}
            onChange={(event) => onPlateNumberChange(event.target.value)}
          />
        </label>

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t(error)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={isBusy || plateNumber.trim().length === 0}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("Find Rental")}
          </Button>
        </div>
      </form>
    </div>
  );
}
