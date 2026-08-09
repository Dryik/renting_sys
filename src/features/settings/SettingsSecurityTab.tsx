import { Clock, Globe2, History, KeyRound, LockKeyhole, Mail, MapPin, Phone, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { Permission } from "@/shared/auth";
import type { ShopSettings } from "@/shared/settings";
import { AdminShortcut } from "./AdminShortcut";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { SettingBlock } from "./SettingBlock";
import { SoftwareUpdateCard } from "./SoftwareUpdateCard";
import { SupportLine } from "./SupportLine";
import type { SettingsFormInput } from "./settings-form-schema";
import type { UseFormRegister } from "react-hook-form";

/**
 * Owner PIN, scheduled backups, the admin shortcuts and the diagnostics and
 * update panels. The PIN mutations are the page's; the shortcuts navigate.
 */
export function SettingsSecurityTab({
  can,
  currentSettings,
  isSaving,
  onClearOwnerPin,
  onOpenActivityLog,
  onOpenAppLicense,
  onOpenUsers,
  onSetOwnerPin,
  register,
  t,
}: {
  can: (permission: Permission) => boolean;
  currentSettings: ShopSettings | null;
  isSaving: boolean;
  onClearOwnerPin: () => void;
  onOpenActivityLog: () => void;
  onOpenAppLicense: () => void;
  onOpenUsers: () => void;
  onSetOwnerPin: () => void;
  register: UseFormRegister<SettingsFormInput>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Security & System")}</CardTitle>
              <CardDescription>
                {t("Owner PIN prompts, automated daily backups, and admin tools.")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-5">
          <SettingBlock
            icon={<LockKeyhole className="size-5" />}
            title={t("Owner PIN prompts")}
            description={t("Use a local owner PIN for sensitive actions on this computer.")}
          >
            <div className="rounded-lg border bg-card p-4 text-sm shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">{t("Owner PIN prompts")}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {currentSettings?.ownerPinEnabled ? t("Enabled") : t("Disabled")}
                  </span>
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSaving || !can("settings.edit")}
                    onClick={() => void onSetOwnerPin()}
                  >
                    {t("Set PIN")}
                  </Button>
                  {currentSettings?.ownerPinEnabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isSaving || !can("settings.edit")}
                      onClick={() => void onClearOwnerPin()}
                    >
                      {t("Disable")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </SettingBlock>

          <SettingBlock
            icon={<Clock className="size-5" />}
            title={t("Auto-Backup")}
            description={t("Automated daily local backup configuration.")}
          >
            <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                {...register("scheduledBackupEnabled")}
              />
              <span className="min-w-0">
                <span className="block font-medium">{t("Automated Daily Backup")}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t("Automatically saves a local backup ZIP into app data folder on application launch.")}
                </span>
              </span>
            </label>
          </SettingBlock>

        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-fit overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                <Settings className="size-5" />
              </div>
              <div>
                <CardTitle>{t("Administration shortcuts")}</CardTitle>
                <CardDescription>
                  {t("Open local admin screens from here.")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {can("users.view") ? (
              <AdminShortcut
                description={t("Manage local staff accounts.")}
                icon={<ShieldCheck className="size-4" />}
                label={t("Users")}
                onClick={onOpenUsers}
              />
            ) : null}
            {can("audit.view") ? (
              <AdminShortcut
                description={t("Review important staff actions.")}
                icon={<History className="size-4" />}
                label={t("Activity Log")}
                onClick={onOpenActivityLog}
              />
            ) : null}
            <AdminShortcut
              description={t("Offline activation and trial status.")}
              icon={<KeyRound className="size-4" />}
              label={t("App License")}
              onClick={onOpenAppLicense}
            />
          </CardContent>
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                <Globe2 className="size-5" />
              </div>
              <div>
                <CardTitle>{t("About")}</CardTitle>
                <CardDescription>
                  {t("Support contacts")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <SupportLine icon={<Globe2 className="size-4" />} label={t("Website")} value="arak.ly" valueMode="ltr" />
            <SupportLine icon={<Phone className="size-4" />} label={t("Phone")} value="+218 92 782 8080" valueMode="ltr" />
            <SupportLine icon={<Mail className="size-4" />} label={t("Sales Email")} value="sales@arak.ly" valueMode="ltr" />
            <SupportLine icon={<Mail className="size-4" />} label={t("Email")} value="info@arak.ly" valueMode="ltr" />
            <SupportLine
              icon={<MapPin className="size-4" />}
              label={t("Office Address")}
              value={t("Khalifa Al-Zaidi Street, Al-Madina Building, 7th Floor, Office 702, Tripoli")}
            />
            <SupportLine icon={<Clock className="size-4" />} label={t("Hours")} value={t("Sun-Thu: 9AM-6PM")} />
            <div className="rounded-xl border border-success/20 bg-success/10 p-3 font-medium text-success">
              {t("Developed by ARAK Communication & IT Services")}
            </div>
          </CardContent>
        </Card>
      </div>

      <SoftwareUpdateCard />
      <DiagnosticsPanel />
    </div>
  );
}
