import { Activity, CheckCircle2, Database, HardDrive, Loader2, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BidiValue } from "@/components/ui/bidi-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import type { DataHealthIssue } from "@/shared/data-health";
import type { DiagnosticsStatus } from "@/shared/diagnostics";

export function DiagnosticsPanel() {
  const { t } = useI18n();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsStatus | null>(null);
  const [issues, setIssues] = useState<DataHealthIssue[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    window.rentalApp.diagnostics.getStatus().then(setDiagnostics).catch(() => {
      setDiagnostics(null);
    });
  }, []);

  async function scanDataHealth() {
    setIsScanning(true);

    try {
      const nextIssues = await window.rentalApp.dataHealth.scan();
      setIssues(nextIssues);
      setHasScanned(true);
    } finally {
      setIsScanning(false);
    }
  }

  async function applyFix(issueId: string) {
    const nextIssues = await window.rentalApp.dataHealth.applyFix({ issueId });
    setIssues(nextIssues);
    setHasScanned(true);
    window.rentalApp.diagnostics.getStatus().then(setDiagnostics).catch(() => undefined);
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
            <Activity className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Diagnostics")}</CardTitle>
            <CardDescription>{t("Local data health and support information.")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {diagnostics ? (
          <div className="grid gap-2">
            <DiagnosticLine
              icon={<Activity className="size-4" />}
              label={t("App Version")}
              value={diagnostics.appVersion}
            />
            <DiagnosticLine
              icon={<ShieldCheck className="size-4" />}
              label={t("Integrity")}
              value={diagnostics.integrityCheck}
            />
            <DiagnosticLine
              icon={<Database className="size-4" />}
              label={t("Database Size")}
              value={formatBytes(diagnostics.databaseSizeBytes)}
            />
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-border/80 bg-muted p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <HardDrive className="size-4 text-success" />
              <h4 className="font-semibold">{t("Data Health")}</h4>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isScanning}
              onClick={() => void scanDataHealth()}
            >
              {isScanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw data-icon="inline-start" />
              )}
              {t("Scan")}
            </Button>
          </div>

          {!hasScanned ? (
            <div className="rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground shadow-xs">
              {t("Run data health only when you need to repair mismatched records.")}
            </div>
          ) : issues.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-success">
              <CheckCircle2 className="size-4" />
              {t("No data health issues found.")}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                {t("{{count}} data health issues found.", { count: issues.length })}
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
                {issues.map((issue) => (
                  <div key={issue.id} className="rounded-lg border bg-card p-3 shadow-xs">
                    <p className="text-sm font-medium">{t(issue.title)}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {t(issue.detail)}
                    </p>
                    {issue.canAutoFix ? (
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => void applyFix(issue.id)}>
                        <Wrench data-icon="inline-start" />
                        {t("Apply Fix")}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function DiagnosticLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-xs shadow-xs">
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="text-success">{icon}</span>
        {label}
      </span>
      <BidiValue className="break-words text-end font-medium" value={value} />
    </div>
  );
}
