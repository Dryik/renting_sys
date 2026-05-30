import { AlertTriangle, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ReasonDialogProps = {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  open: boolean;
  reasonLabel: string;
  title: string;
  variant?: "default" | "destructive";
};

export function ReasonDialog({
  cancelLabel,
  confirmLabel,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  reasonLabel,
  title,
  variant = "default",
}: ReasonDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");

  if (!open) {
    return null;
  }

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4 backdrop-blur-[1px]"
      data-motion="overlay"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-motion="dialog"
        role="alertdialog"
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md border",
              variant === "destructive"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
          >
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold" id={titleId}>
              {title}
            </h2>
            <p
              className="mt-2 text-sm leading-6 text-muted-foreground"
              id={descriptionId}
            >
              {description}
            </p>
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
          <span>{reasonLabel}</span>
          <Textarea
            value={reason}
            rows={4}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReason("");
              onCancel();
            }}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
            disabled={isBusy || reason.trim().length === 0}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
