import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";
import type { SensitiveAction } from "@/shared/security";
import { cn } from "@/lib/utils";

type SensitiveActionDialogProps = {
  action: SensitiveAction;
  cancelLabel: string;
  children?: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  description: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: (values: { approvalToken?: string; reason?: string }) => void;
  open: boolean;
  ownerPinRequired?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  title: string;
  variant?: "default" | "destructive";
};

export function SensitiveActionDialog({
  action,
  cancelLabel,
  children,
  confirmLabel,
  confirmDisabled: externalConfirmDisabled = false,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  ownerPinRequired = false,
  reasonLabel,
  reasonRequired = true,
  title,
  variant = "default",
}: SensitiveActionDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  if (!open) {
    return null;
  }

  function resetFields() {
    setReason("");
    setPin("");
    setError(null);
    setIsApproving(false);
  }

  async function submit() {
    setError(null);
    setIsApproving(true);

    try {
      const approval = ownerPinRequired
        ? await window.rentalApp.security.approveSensitiveAction({ action, pin })
        : null;
      onConfirm({
        approvalToken: approval?.token,
        reason: reason.trim() || undefined,
      });
      resetFields();
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Action approval failed."));
    } finally {
      setIsApproving(false);
    }
  }

  const confirmDisabled =
    isBusy ||
    isApproving ||
    externalConfirmDisabled ||
    (reasonRequired && reason.trim().length === 0) ||
    (ownerPinRequired && !/^\d{4}$/.test(pin));

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
            {variant === "destructive" ? (
              <AlertTriangle className="size-5" />
            ) : (
              <ShieldCheck className="size-5" />
            )}
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

        {reasonLabel ? (
          <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
            <span>{reasonLabel}</span>
            <Textarea
              value={reason}
              rows={4}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        ) : null}

        {children ? <div className="mt-4">{children}</div> : null}

        {ownerPinRequired ? (
          <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
            <span>{t("Owner PIN")}</span>
            <Input
              autoComplete="current-password"
              data-ltr="true"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]{4}"
              type="password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetFields();
              onCancel();
            }}
            disabled={isBusy || isApproving}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={confirmDisabled}
          >
            {isBusy || isApproving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
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
