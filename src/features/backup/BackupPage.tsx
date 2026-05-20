import { useState } from "react";
import { Download, Upload, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/hooks/useI18n";

export function BackupPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info" | null;
    message: string | null;
  }>({ type: null, message: null });
  const [isLoading, setIsLoading] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  async function handleBackup() {
    setIsLoading(true);
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.runBackup();
      if (result.success) {
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
      setIsLoading(false);
    }
  }

  async function handleRestore() {
    setRestoreConfirmOpen(false);
    setIsLoading(true);
    setStatus({ type: null, message: null });

    try {
      const result = await window.rentalApp.backup.runRestore();
      if (result.success) {
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
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <Download className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Create Backup Archive")}</CardTitle>
              <CardDescription>{t("Export all shop data to a ZIP file.")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            {t("Backup concise help")}
          </p>
          <Button
            size="lg"
            className="w-full sm:w-auto min-w-[180px] bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleBackup}
            disabled={isLoading}
          >
            <Download className="size-4" />
            {t("Export Backup ZIP")}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-xs border-destructive/20 bg-destructive/[0.01]">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <Upload className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Restore Data Backup")}</CardTitle>
              <CardDescription>{t("Import database state from a backup ZIP file.")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            {t("Restore concise warning")}
          </p>
          <Button
            size="lg"
            variant="destructive"
            className="w-full sm:w-auto min-w-[180px]"
            onClick={() => setRestoreConfirmOpen(true)}
            disabled={isLoading}
          >
            <Upload className="size-4" />
            {t("Restore Backup")}
          </Button>
        </CardContent>
      </Card>

      {status.type && (
        <div className="md:col-span-2">
          {status.type === "success" && (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-50/50 p-4 text-emerald-800 dark:bg-emerald-950/10 dark:text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h5 className="font-semibold">{t("Operation Completed")}</h5>
                <p className="mt-1">{status.message}</p>
              </div>
            </div>
          )}
          {status.type === "error" && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive">
              <AlertTriangle className="size-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h5 className="font-semibold">{t("Operation Failed")}</h5>
                <p className="mt-1">{status.message}</p>
              </div>
            </div>
          )}
          {status.type === "info" && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-50/50 p-4 text-blue-800 dark:bg-blue-950/10 dark:text-blue-400">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <h5 className="font-semibold">{t("Notice")}</h5>
                <p className="mt-1">{status.message}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={restoreConfirmOpen}
        title={t("Restore backup?")}
        description={t("Restore backup confirmation")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Restore Backup")}
        variant="destructive"
        isBusy={isLoading}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={() => void handleRestore()}
      />
    </div>
  );
}
