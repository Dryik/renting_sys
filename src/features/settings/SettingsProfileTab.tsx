import { Building2, Image, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { Permission } from "@/shared/auth";
import type { ShopSettings } from "@/shared/settings";
import type { SettingsFormInput } from "./settings-form-schema";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

/**
 * Shop identity: the name, contact details and logo printed on contracts and
 * receipts. The page owns the form and the logo mutations; this renders them.
 */
export function SettingsProfileTab({
  can,
  currentSettings,
  errors,
  isSaving,
  onClearLogo,
  onSelectLogo,
  register,
  t,
}: {
  can: (permission: Permission) => boolean;
  currentSettings: ShopSettings | null;
  isSaving: boolean;
  onClearLogo: () => void;
  onSelectLogo: () => void;
  errors: FieldErrors<SettingsFormInput>;
  register: UseFormRegister<SettingsFormInput>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
            <Building2 className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Shop Profile")}</CardTitle>
            <CardDescription>
              {t("Details printed on local contracts and receipts.")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Shop Name")} <span className="text-destructive">*</span></span>
            <Input
              {...register("shopName")}
              placeholder={t("e.g. Metro Car Rental")}
              aria-invalid={Boolean(errors.shopName)}
            />
            {errors.shopName && (
              <span className="text-xs text-destructive">{t(errors.shopName.message ?? "")}</span>
            )}
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Contact Phone")} <span className="text-destructive">*</span></span>
            <Input
              {...register("shopPhone")}
              data-ltr="true"
              placeholder={t("e.g. +218 92 000 0000")}
              aria-invalid={Boolean(errors.shopPhone)}
            />
            {errors.shopPhone && (
              <span className="text-xs text-destructive">{t(errors.shopPhone.message ?? "")}</span>
            )}
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium">
          <span>{t("Business Address")} <span className="text-destructive">*</span></span>
          <Input
            {...register("shopAddress")}
            placeholder={t("e.g. Tripoli, Libya")}
            aria-invalid={Boolean(errors.shopAddress)}
          />
          {errors.shopAddress && (
            <span className="text-xs text-destructive">{t(errors.shopAddress.message ?? "")}</span>
          )}
        </label>

        <div className="rounded-2xl border border-border/80 bg-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card text-muted-foreground shadow-xs">
                {currentSettings?.shopLogoDataUrl ? (
                  <img
                    alt={t("Shop Logo")}
                    className="max-h-14 max-w-24 object-contain"
                    src={currentSettings.shopLogoDataUrl}
                  />
                ) : (
                  <Image className="size-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{t("Shop Logo")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Printed on the header of rental contracts and payment receipts.")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !can("settings.edit")}
                onClick={() => void onSelectLogo()}
              >
                <Upload data-icon="inline-start" />
                {t("Choose Logo")}
              </Button>
              {currentSettings?.shopLogoDataUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSaving || !can("settings.edit")}
                  onClick={() => void onClearLogo()}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("Remove Logo")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
