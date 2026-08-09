import { Banknote, CircleDollarSign, Clock, Coins, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AccessoriesManagement } from "../accessories/AccessoriesManagement";
import { SettingBlock } from "./SettingBlock";
import type { SettingsFormInput } from "./settings-form-schema";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

/**
 * Day-to-day operating rules: late fees, deposits, closing, commission and
 * the document expiry warning windows, plus the accessories catalogue.
 */
export function SettingsOperationsTab({
  errors,
  register,
  t,
}: {
  errors: FieldErrors<SettingsFormInput>;
  register: UseFormRegister<SettingsFormInput>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
              <Settings className="size-5" />
            </div>
            <div>
              <CardTitle>{t("Operations & Reminders")}</CardTitle>
              <CardDescription>
                {t("Rental defaults, deposits, commissions, and renewal reminder days.")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Default Late Fee (Per Day)")} <span className="text-destructive">*</span></span>
              <Input
                {...register("defaultLateFee")}
                data-ltr="true"
                placeholder="e.g. 15.00"
                aria-invalid={Boolean(errors.defaultLateFee)}
              />
              {errors.defaultLateFee && (
                <span className="text-xs text-destructive">{t(errors.defaultLateFee.message ?? "")}</span>
              )}
            </label>
          </div>

          <SettingBlock
            icon={<CircleDollarSign className="size-5" />}
            title={t("Rental defaults")}
            description={t("Simple defaults used when staff create new rentals.")}
          >
            <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                {...register("enableClientDeposit")}
              />
              <span>
                <span className="block font-medium">{t("Require security deposit by default")}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t("Pre-fills deposit field when creating new contracts.")}
                </span>
              </span>
            </label>
          </SettingBlock>

          <SettingBlock
            icon={<Banknote className="size-5" />}
            title={t("Cash count")}
            description={t("Optional end-of-day drawer count for shops that need it.")}
          >
            <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                {...register("dailyClosingEnabled")}
              />
              <span className="min-w-0">
                <span className="block font-medium">{t("Show Close Day")}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t("Shows the Today tab and Close Day cash count in Accounting.")}
                </span>
              </span>
            </label>
          </SettingBlock>

          <SettingBlock
            icon={<Coins className="size-5" />}
            title={t("Sales Commission")}
            description={t("Auto calculate fixed daily commission for sales employees.")}
          >
            <div className="space-y-4">
              <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  {...register("enableSalesCommission")}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{t("Enable sales commission calculation")}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {t("Auto calculate fixed daily commission for sales employees.")}
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("Default Daily Commission (Dinars)")}
                </label>
                <input
                  type="number"
                  step="0.5"
                  className="w-full rounded-md border p-2 text-sm"
                  {...register("defaultDailyCommissionRate")}
                />
              </div>
            </div>
          </SettingBlock>

          <SettingBlock
            icon={<Clock className="size-5" />}
            title={t("Reminders")}
            description={t("Local reminders for renewals and backup checks.")}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("Mandatory insurance warning days")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("insuranceWarningDays")} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("Vehicle license warning days")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("registrationWarningDays")} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("Technical inspection warning days")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("technicalInspectionWarningDays")} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("License warning days")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("licenseWarningDays")} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                <span>{t("Backup reminder days")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("backupReminderDays")} />
              </label>
            </div>
          </SettingBlock>

        </CardContent>
      </Card>
      <AccessoriesManagement />
    </div>
  );
}
