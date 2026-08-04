import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BidiValue } from "@/components/ui/bidi-value";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";

type BackupAction = "backup" | "restore";
type RestoreStage = "idle" | "previewed" | "verified";

export function BackupPage() {
  const { can } = useAuth();
  const { settings, t } = useI18n();
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info" | null;
    message: string | null;
  }>({ type: null, message: null });
  const [busyAction, setBusyAction] = useState<BackupAction | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreReasonOpen, setRestoreReasonOpen] = useState(false);
  const [restoreStage, setRestoreStage] = useState<RestoreStage>("idle");
  const [restoreFilePath, setRestoreFilePath] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{
    lastBackupAt: string | null;
    lastBackupPath: string | null;
  } | null>(null);
  const isLoading = busyAction !== null;
  const canRestore = can("backup.restore");
  const canVerifyRestore = restoreStage === "previewed" || restoreStage === "verified";
  const restoreVerified = restoreStage === "verified";

  useEffect(() => {
    window.rentalApp.backup.getStatus().then(setBackupStatus).catch(() => {
      setBackupStatus(null);
    });
  }, []);

  async function handleBackup() {
    setBusyAction("backup");
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.runBackup();
      if (result.success) {
        setRestoreStage("idle");
        setRestoreFilePath(null);
        window.rentalApp.backup.getStatus().then(setBackupStatus).catch(() => undefined);
        setStatus({
          type: "success",
          message: t("Backup created successfully at: {{path}}", {
            path: result.filePath ?? "",
          }),
        });
      } else {
        setStatus({
          type: result.error === "Backup process cancelled by user." ? "info" : "error",
          message: result.error ? t(result.error) : t("Backup was cancelled."),
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? t(err.message) : t("Failed to generate backup."),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore({
    approvalToken,
    reason,
  }: {
    approvalToken?: string;
    reason?: string;
  }) {
    setRestoreConfirmOpen(false);
    setRestoreReasonOpen(false);
    setBusyAction("restore");
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.runRestore({
        approvalToken,
        reason: reason ?? "",
      });
      if (result.success) {
        window.rentalApp.backup.getStatus().then(setBackupStatus).catch(() => undefined);
        setStatus({
          type: "success",
          message: result.safetyBackupPath
            ? t("Database and file storage restored successfully. Safety backup saved at: {{path}}", {
                path: result.safetyBackupPath,
              })
            : t("Database and file storage restored successfully. The application has loaded the restored state."),
        });
      } else {
        setStatus({
          type: result.error === "Restore process cancelled by user." ? "info" : "error",
          message: result.error ? t(result.error) : t("Restore was cancelled."),
        });
      }
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? t(err.message) : t("Failed to restore backup."),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePreview() {
    setBusyAction("restore");
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.preview();
      setRestoreStage(result.success ? "previewed" : "idle");
      setRestoreFilePath(result.success ? result.filePath ?? null : null);
      setStatus({
        type: result.success ? "success" : "error",
        message: result.success
          ? t("Backup preview: {{date}} / {{version}}", {
              date: result.backupDate ?? "",
              version: result.appVersion ?? "",
            })
          : t(result.error ?? "Backup preview failed."),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerify() {
    setBusyAction("restore");
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.verify();
      if (result.success) {
        setRestoreStage("verified");
        setRestoreFilePath(result.filePath ?? restoreFilePath);
      } else {
        setRestoreStage((current) => current === "idle" ? "idle" : "previewed");
      }
      setStatus({
        type: result.success ? "success" : "error",
        message: result.success
          ? t("Backup verified successfully.")
          : t(result.error ?? "Backup verification failed."),
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6" aria-busy={isLoading}>
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
              <Archive className="size-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-normal">{t("Backup and Restore")}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("Create local ZIP backups and restore them only after checking the file.")}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-primary" />
              {t("Local storage only")}
            </div>
            <p className="mt-2 leading-5">
              {t("Backups are selected and saved on this computer or a local drive.")}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/35">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-success/10 text-success">
              <Download className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Save Backup File")}</CardTitle>
              <CardDescription>{t("Export all shop data to a ZIP file.")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("Backup concise help")}
          </p>
          <p className="rounded-lg border bg-muted/35 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            {t("The backup includes the database and local documents/photos.")}
          </p>
          {settings.scheduledBackupEnabled ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-semibold text-primary">{t("Automated Daily Backup Active")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("Automatically creates a local ZIP archive in app data folder on launch.")}
                  </p>
                  {settings.lastAutoBackupAt ? (
                    <p className="mt-1 text-xs font-mono text-muted-foreground">
                      {t("Last auto-backup:")} <BidiValue value={settings.lastAutoBackupAt} />
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {backupStatus?.lastBackupAt ? (
            <div className="rounded-lg border bg-muted/35 p-3 text-sm">
              <div className="flex items-start gap-3">
                <Archive className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0">
                  <p className="font-medium">{t("Last backup")}</p>
                  <p className="mt-1 break-words text-muted-foreground">
                    <BidiValue value={backupStatus.lastBackupAt} />
                  </p>
                  {backupStatus.lastBackupPath ? (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      <BidiValue wrap value={backupStatus.lastBackupPath} />
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <Button
            size="lg"
            className="w-full sm:w-auto sm:min-w-[200px]"
            onClick={handleBackup}
            disabled={isLoading || !can("backup.export")}
          >
            {busyAction === "backup" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t("Save Backup File")}
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-warning/25 bg-warning/5">
        <CardHeader className="border-b border-warning/20 bg-warning/10">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-card text-warning">
              <Upload className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Restore Data Backup")}</CardTitle>
              <CardDescription>{t("Import database state from a backup ZIP file.")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <div className="rounded-lg border border-warning/20 bg-card p-4 text-sm shadow-xs">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warning" />
              <p className="leading-relaxed text-muted-foreground">
                {t("Restore checks the selected local backup and makes a safety copy before replacing current data.")}
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("Restore concise warning")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => void handlePreview()} disabled={isLoading || !canRestore}>
              <FileCheck2 className="size-4" />
              {t("Choose Backup File")}
            </Button>
            <Button
              disabled={isLoading || !canRestore || !canVerifyRestore}
              size="lg"
              title={!canVerifyRestore ? t("Choose Backup File") : undefined}
              variant="outline"
              onClick={() => void handleVerify()}
            >
              <ShieldCheck className="size-4" />
              {t("Check Backup")}
            </Button>
            <Button
              size="lg"
              variant={restoreVerified ? "destructive" : "outline"}
              className={`min-h-12 w-full sm:w-auto sm:min-w-[200px] ${
                restoreVerified ? "" : "border-border text-muted-foreground hover:bg-card hover:text-muted-foreground"
              }`}
              onClick={() => setRestoreConfirmOpen(true)}
              disabled={isLoading || !canRestore || !restoreVerified}
            >
              {busyAction === "restore" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {t("Restore Backup")}
            </Button>
          </div>
          {restoreFilePath || !restoreVerified ? (
            <div className="rounded-lg border border-warning/20 bg-card px-3 py-2 text-sm text-muted-foreground">
              {restoreFilePath ? (
                <p className="break-words">
                  <span className="font-medium text-foreground">
                    {restoreVerified ? t("Backup verified successfully.") : t("Preview")}
                  </span>
                  {": "}
                  <BidiValue wrap value={restoreFilePath} />
                </p>
              ) : (
                <p>{t("Verify the backup before restoring.")}</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {(busyAction || status.type) && (
        <div className="md:col-span-2">
          {busyAction ? (
            <StatusBanner
              icon={<Loader2 className="size-5 animate-spin" />}
              message={t(busyAction === "backup" ? "Backup concise help" : "Restore concise warning")}
              title={busyAction === "backup" ? t("Save Backup File") : t("Restore Backup")}
              tone="info"
            />
          ) : status.type ? (
            <StatusBanner
              icon={
                status.type === "success" ? (
                  <CheckCircle2 className="size-5" />
                ) : status.type === "error" ? (
                  <AlertTriangle className="size-5" />
                ) : (
                  <AlertCircle className="size-5" />
                )
              }
              message={status.message}
              title={
                status.type === "success"
                  ? t("Operation Completed")
                  : status.type === "error"
                    ? t("Operation Failed")
                    : t("Notice")
              }
              tone={status.type}
            />
          ) : null}
        </div>
      )}
      </div>

      <ConfirmDialog
        open={restoreConfirmOpen}
        title={t("Restore backup?")}
        description={t("Restore backup confirmation")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Restore backup")}
        variant="destructive"
        isBusy={isLoading}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={() => {
          setRestoreConfirmOpen(false);
          setRestoreReasonOpen(true);
        }}
      />
      <SensitiveActionDialog
        action="backup.restore"
        open={restoreReasonOpen}
        title={t("Restore backup?")}
        description={t("Restore backup confirmation")}
        ownerPinRequired={settings.ownerPinEnabled}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Restore backup")}
        variant="destructive"
        isBusy={isLoading}
        onCancel={() => setRestoreReasonOpen(false)}
        onConfirm={(values) => void handleRestore(values)}
      />
    </div>
  );
}

function StatusBanner({
  icon,
  message,
  title,
  tone,
}: {
  icon: ReactNode;
  message?: string | null;
  title: string;
  tone: "error" | "info" | "success";
}) {
  const toneClass = {
    error: "border-destructive/20 bg-destructive/5 text-destructive",
    info: "border-primary/20 bg-accent text-primary",
    success: "border-success/20 bg-success/10 text-success",
  }[tone];

  return (
    <div
      aria-live="polite"
      className={`flex items-start gap-3 rounded-md border px-4 py-3 ${toneClass}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-sm">
        <h5 className="font-semibold">{title}</h5>
        {message ? <p className="mt-1 break-words opacity-80">{message}</p> : null}
      </div>
    </div>
  );
}
