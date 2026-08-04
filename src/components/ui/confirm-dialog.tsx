import { AlertTriangle, Loader2 } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "default" | "destructive";
};

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  title,
  variant = "default",
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalBehavior({
    closeDisabled: isBusy,
    containerRef: dialogRef,
    onClose: onCancel,
    open,
  });

  if (!open) {
    return null;
  }

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
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
        data-motion="dialog"
        data-modal-layer="true"
        role="alertdialog"
        tabIndex={-1}
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
            <AlertTriangle data-icon="inline-start" />
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

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 data-icon="inline-start" /> : null}
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
