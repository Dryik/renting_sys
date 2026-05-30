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
  const message = isReadonly
    ? status.reason === "machine-code-unavailable"
      ? t(status.message ?? "This computer's machine code could not be read. Please check Windows permissions or contact support.")
      : status.reason === "system-clock-invalid"
      ? t("Your system date/time appears to be incorrect. Please correct the Windows date/time to continue the trial.")
      : t("License required. The app is currently read-only. Your data is still available.")
    : t("Trial mode: {{days}} days remaining. Activate your license to continue after the trial.", {
        days: status.trial?.daysRemaining ?? 0,
      });

  return (
    <div
      className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-xs ${
        isReadonly
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-primary/25 bg-accent text-accent-foreground"
      }`}
      role={isReadonly ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-center gap-3">
        {isReadonly ? (
          <AlertTriangle className="size-5 shrink-0" />
        ) : (
          <KeyRound className="size-5 shrink-0" />
        )}
        <p className="font-medium">{message}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={isReadonly ? "destructive" : "outline"}
        onClick={onOpenLicense}
      >
        <KeyRound className="size-4" />
        {t("App License")}
      </Button>
    </div>
  );
}
