import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getUpdatesApi, rentalAppApi } from "@/data/rental-app-api";
import { useI18n } from "@/hooks/useI18n";
import type { DiagnosticsStatus } from "@/shared/diagnostics";

/**
 * Checks for and reports application updates. It owns its own subscription to
 * the updater's status events, which is why it keeps its effects.
 */
export function SoftwareUpdateCard({ currentVersion }: { currentVersion?: string }) {
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState<string>(currentVersion || "");
  const [checking, setChecking] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!appVersion) {
      rentalAppApi?.diagnostics?.getStatus?.().then((diag: DiagnosticsStatus) => {
        if (diag?.appVersion) setAppVersion(diag.appVersion);
      }).catch(() => {});
    }

    void getUpdatesApi()?.getPendingUpdate?.().then((info) => {
      if (info?.version) {
        setDownloadedVersion(info.version);
      }
    });

    const unsubDownloaded = getUpdatesApi()?.onDownloaded?.((info) => {
      setDownloadedVersion(info.version);
      setStatusText(t("Update ready! Click Restart & Update to install."));
    });

    const unsubStatus = getUpdatesApi()?.onStatusChange?.((state) => {
      if (state.status === "checking") {
        setChecking(true);
        setStatusText(t("Checking for updates..."));
      } else if (state.status === "available") {
        setChecking(true);
        setStatusText(t("A new version (v{{version}}) is available and downloading...", { version: state.version ?? "" }));
      } else if (state.status === "downloading") {
        setChecking(true);
        setStatusText(t("Downloading update... {{percent}}%", { percent: state.percent ?? 0 }));
      } else if (state.status === "downloaded") {
        setChecking(false);
        if (state.version) setDownloadedVersion(state.version);
        setStatusText(t("Update ready! Click Restart & Update to install."));
      } else if (state.status === "error") {
        setChecking(false);
        if (state.error?.includes("404")) {
          setStatusText(t("Could not access update server (404 Not Found). Repository may be private."));
        } else {
          setStatusText(state.error || t("Could not check for updates. Check internet connection."));
        }
      } else if (state.status === "idle") {
        setChecking(false);
      }
    });

    return () => {
      unsubDownloaded?.();
      unsubStatus?.();
    };
  }, [appVersion, t]);

  async function handleCheckForUpdates() {
    setChecking(true);
    setStatusText(null);
    try {
      const res = await getUpdatesApi()?.checkForUpdates?.();
      if (res?.status === "idle" && !downloadedVersion) {
        setStatusText(t("Your app is completely up to date."));
      }
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : t("Could not check for updates. Check internet connection."));
    } finally {
      setChecking(false);
    }
  }

  async function handleRestartAndInstall() {
    await getUpdatesApi()?.restartAndInstall?.();
  }

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <RefreshCw className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Software Updates")}</CardTitle>
            <CardDescription>
              {t("Check for software updates and install latest release.")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("Current Version")}</p>
            <p className="font-mono text-base font-bold text-foreground">v{appVersion || currentVersion || "0.2.2"}</p>
          </div>
          {downloadedVersion ? (
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={handleRestartAndInstall}
            >
              <RefreshCw className="size-4 animate-spin" />
              {t("Restart & Update (v{{version}})", { version: downloadedVersion })}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checking}
              onClick={handleCheckForUpdates}
              className="gap-2"
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {t("Check for Updates")}
            </Button>
          )}
        </div>
        {statusText ? (
          <p className="rounded-md border border-primary/20 bg-accent/40 px-3 py-2 text-xs font-medium text-foreground">
            {statusText}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
