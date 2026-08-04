import { AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/useI18n";
import type { LicenseStatus } from "@/shared/license";

type LicenseBannerProps = {
  status: LicenseStatus;
  onOpenLicense: () => void;
};

export function LicenseBanner({ onOpenLicense, status }: LicenseBannerProps) {
  const { t } = useI18n();

  if (status.mode === "licensed") {
    return null;
  }

  const isReadonly = status.mode === "readonly";
  const daysRemaining = status.trial?.daysRemaining ?? 0;
  const isEndingSoon = !isReadonly && daysRemaining <= 3;
  const message = isReadonly
    ? status.reason === "machine-code-unavailable"
      ? t(status.message ?? "This computer's machine code could not be read. Please check Windows permissions or contact support.")
      : status.reason === "system-clock-invalid"
      ? t("Your system date/time appears to be incorrect. Please correct the Windows date/time to continue the trial.")
      : t("License required. The app is currently read-only. Your data is still available.")
    : t("Trial mode: {{days}} days remaining.", {
        days: daysRemaining,
      });

  return (
    <div
      className={`mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 text-sm shadow-xs ${
        isReadonly
          ? "py-3 border-destructive/25 bg-destructive/10 text-destructive"
          : isEndingSoon
            ? "py-2 border-warning/30 bg-warning/10 text-warning"
            : "py-2 border-primary/20 bg-accent/70 text-accent-foreground"
      }`}
      role={isReadonly ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-center gap-3">
        {isReadonly ? (
          <AlertTriangle className="size-5 shrink-0" />
        ) : (
          <KeyRound className="size-4 shrink-0" />
        )}
        <p className="font-medium">{message}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={isReadonly ? "destructive" : "ghost"}
        onClick={onOpenLicense}
      >
        <KeyRound className="size-4" />
        {t("App License")}
      </Button>
    </div>
  );
}
