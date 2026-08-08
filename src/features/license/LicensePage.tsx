import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Upload,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import type { LicenseStatus } from "@/shared/license";
import { rentalAppApi } from "@/data/rental-app-api";

type LicensePageProps = {
  status: LicenseStatus;
  onStatusChange: (status: LicenseStatus) => void;
};

export function LicensePage({ onStatusChange, status }: LicensePageProps) {
  const { formatDateTime, t } = useI18n();
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<{
    type: "error" | "success" | null;
    message: string | null;
  }>({ type: null, message: null });

  async function handleExportRequest() {
    setIsBusy(true);
    setNotice({ type: null, message: null });

    try {
      const result = await rentalAppApi.license.exportRequest();
      setNotice({
        type: result.success ? "success" : "error",
        message: result.success
          ? t("License request exported successfully.")
          : t(result.error ?? "License request export failed."),
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? t(error.message) : t("License request export failed."),
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportLicense() {
    setIsBusy(true);
    setNotice({ type: null, message: null });

    try {
      const result = await rentalAppApi.license.importLicense();
      onStatusChange(result.status);
      setNotice({
        type: result.success ? "success" : "error",
        message: result.success
          ? t("License imported successfully.")
          : t(result.error ?? "License import failed."),
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? t(error.message) : t("License import failed."),
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="rounded-lg border bg-card p-5 shadow-xs">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
              <KeyRound className="size-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-normal">{t("App License")}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("Activate this computer with an offline license file.")}
              </p>
            </div>
          </div>
          <StatusPill status={status} />
        </div>
      </section>

      {notice.type ? (
        <div
          className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
            notice.type === "success"
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          )}
          <p className="font-medium">{notice.message}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("License Status")}</CardTitle>
            <CardDescription>{getStatusDescription(status, t)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <InfoLine
              label={t("Machine Code")}
              value={
                status.machineCode
                  ? <BidiValue wrap value={status.machineCode} />
                  : t("Machine code unavailable")
              }
            />
            {status.license ? (
              <>
                <InfoLine label={t("Customer Name")} value={status.license.customerName} />
                <InfoLine label={t("License ID")} value={<BidiValue value={status.license.licenseId} />} />
                <InfoLine label={t("Issued At")} value={<BidiValue value={formatDateTime(status.license.issuedAt)} />} />
                <InfoLine
                  label={t("Expires At")}
                  value={
                    status.license.expiresAt
                      ? <BidiValue value={formatDateTime(status.license.expiresAt)} />
                      : t("No expiry")
                  }
                />
              </>
            ) : null}
            {status.trial ? (
              <>
                <InfoLine label={t("Trial Started")} value={<BidiValue value={formatDateTime(status.trial.startedAt)} />} />
                <InfoLine label={t("Trial Expires")} value={<BidiValue value={formatDateTime(status.trial.expiresAt)} />} />
                <InfoLine
                  label={t("Days Remaining")}
                  value={<BidiValue value={String(status.trial.daysRemaining ?? 0)} />}
                />
              </>
            ) : null}
            {status.reason ? (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
                {t(getReasonMessage(status.reason))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Offline Activation")}</CardTitle>
              <CardDescription>
                {t("Send the request file to support, then import the license file you receive.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                size="lg"
                variant="outline"
                disabled={isBusy || !status.machineCode}
                onClick={() => void handleExportRequest()}
              >
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {t("Export License Request")}
              </Button>
              <Button size="lg" disabled={isBusy} onClick={() => void handleImportLicense()}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {t("Import License File")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("Support")}</CardTitle>
              <CardDescription>{t("Contact ARAK to issue or reissue a license.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SupportLine icon={<Phone className="size-4" />} label={t("Phone")} value="+218 92 782 8080" />
              <SupportLine icon={<Mail className="size-4" />} label={t("Sales Email")} value="sales@arak.ly" />
              <SupportLine icon={<Mail className="size-4" />} label={t("Email")} value="info@arak.ly" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LicenseStatus }) {
  const { t } = useI18n();
  const isReadonly = status.mode === "readonly";

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${
        status.mode === "licensed"
          ? "border-success/20 bg-success/10 text-success"
          : isReadonly
            ? "border-destructive/20 bg-destructive/10 text-destructive"
            : "border-primary/25 bg-accent text-accent-foreground"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {status.mode === "licensed" ? (
          <CheckCircle2 className="size-4" />
        ) : isReadonly ? (
          <AlertTriangle className="size-4" />
        ) : (
          <CalendarDays className="size-4" />
        )}
        {status.mode === "licensed"
          ? t("Licensed")
          : isReadonly
            ? t("Read-only")
            : t("Trial")}
      </div>
      <p className="mt-2 leading-5">
        {status.canWrite ? t("Full access is enabled.") : t("Write actions are currently blocked.")}
      </p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-muted/25 p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 font-semibold">{value}</span>
    </div>
  );
}

function SupportLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/25 px-3 py-2">
      <span className="text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <BidiValue className="font-semibold" value={value} />
      </span>
    </div>
  );
}

function getStatusDescription(
  status: LicenseStatus,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (status.mode === "licensed") {
    return t("This computer has a valid paid license.");
  }

  if (status.mode === "trial") {
    return t("Trial mode: {{days}} days remaining. Activate your license to continue after the trial.", {
      days: status.trial?.daysRemaining ?? 0,
    });
  }

  return status.reason === "system-clock-invalid"
    ? t("Your system date/time appears to be incorrect. Please correct the Windows date/time to continue the trial.")
    : status.reason === "machine-code-unavailable"
      ? t(status.message ?? "This computer's machine code could not be read. Please check Windows permissions or contact support.")
    : t("License required. The app is currently read-only. Your data is still available.");
}

function getReasonMessage(reason: string): string {
  if (reason === "machine-code-unavailable") {
    return "This computer's machine code could not be read. Please check Windows permissions or contact support.";
  }

  if (reason === "system-clock-invalid") {
    return "Your system date/time appears to be incorrect. Please correct the Windows date/time to continue the trial.";
  }

  if (reason === "trial-expired") {
    return "The free trial has expired.";
  }

  if (reason === "trial-wrong-machine") {
    return "This trial file belongs to another computer.";
  }

  return "A valid license is required to continue writing data.";
}
