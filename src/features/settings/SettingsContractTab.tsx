import { FileText, Image, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { Permission } from "@/shared/auth";
import type { ShopSettings } from "@/shared/settings";
import type { SettingsFormInput } from "./settings-form-schema";
import type { UseFormRegister } from "react-hook-form";

/**
 * What the printed contract says and looks like, including the owner
 * signature image. The signature mutations belong to the page.
 */
export function SettingsContractTab({
  can,
  currentSettings,
  isSaving,
  onClearOwnerSignature,
  onSelectOwnerSignature,
  register,
  t,
}: {
  can: (permission: Permission) => boolean;
  currentSettings: ShopSettings | null;
  isSaving: boolean;
  onClearOwnerSignature: () => void;
  onSelectOwnerSignature: () => void;
  register: UseFormRegister<SettingsFormInput>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <FileText className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Contract & Terms")}</CardTitle>
            <CardDescription>
              {t("Owner signature, terms and conditions, and footer printed on rental contracts.")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-5">
        <div className="rounded-2xl border border-border/80 bg-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card text-muted-foreground shadow-xs">
                {currentSettings?.ownerSignatureDataUrl ? (
                  <img
                    alt={t("Owner Signature")}
                    className="max-h-14 max-w-24 object-contain"
                    src={currentSettings.ownerSignatureDataUrl}
                  />
                ) : (
                  <Image className="size-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{t("Owner Signature")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Printed above the employee finalizer line on rental contracts.")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || !can("settings.edit")}
                onClick={() => void onSelectOwnerSignature()}
              >
                <Upload data-icon="inline-start" />
                {t("Choose Signature")}
              </Button>
              {currentSettings?.ownerSignatureDataUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSaving || !can("settings.edit")}
                  onClick={() => void onClearOwnerSignature()}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("Remove Signature")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium">
          <span>{t("Header Subtitle")}</span>
          <Input {...register("printHeaderSubtitle")} placeholder={t("e.g. Car & Motorcycle Rental Agreement")} />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          <span>{t("Contract Terms & Conditions")}</span>
          <Textarea
            {...register("printTermsAndConditions")}
            className="min-h-28"
            placeholder={t("Enter custom shop rental terms & conditions clause here...")}
          />
        </label>

        <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            {...register("enableContractWatermark")}
          />
          <span className="min-w-0">
            <span className="block font-medium">{t("Contract Watermark")}</span>
            <span className="mt-1 block text-muted-foreground">
              {t("Displays a faint, centered logo watermark in the background of contract pages.")}
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium">
          <span>{t("Contract Agreement Footer")}</span>
          <Textarea
            {...register("contractFooter")}
            className="min-h-20"
            placeholder={t("Enter contract agreement note here...")}
          />
        </label>

      </CardContent>
    </Card>
  );
}
