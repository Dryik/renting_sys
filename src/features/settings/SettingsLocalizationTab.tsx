import { Languages, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { SettingsFormInput } from "./settings-form-schema";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

/**
 * Language and currency. Arabic remains the default; changing the language
 * here is what flips the whole shell between RTL and LTR.
 */
export function SettingsLocalizationTab({
  errors,
  register,
  t,
}: {
  errors: FieldErrors<SettingsFormInput>;
  register: UseFormRegister<SettingsFormInput>;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <Languages className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Language & Currency")}</CardTitle>
            <CardDescription>
              {t("Choose app language, currency, and receipt behavior.")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 pt-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Application Language")} <span className="text-destructive">*</span></span>
            <select
              {...register("language")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="ar">{t("Arabic")}</option>
              <option value="en">{t("English")}</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Default Currency")} <span className="text-destructive">*</span></span>
            <Input
              {...register("defaultCurrency")}
              data-ltr="true"
              placeholder={t("e.g. LYD")}
              aria-invalid={Boolean(errors.defaultCurrency)}
            />
            {errors.defaultCurrency && (
              <span className="text-xs text-destructive">{t(errors.defaultCurrency.message ?? "")}</span>
            )}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>{t("Default Print Language")}</span>
            <select
              {...register("printLanguage")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <option value="app">{t("Use app language")}</option>
              <option value="ar">{t("Arabic")}</option>
              <option value="en">{t("English")}</option>
              <option value="both">{t("Bilingual")}</option>
            </select>
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            {...register("autoPrintReceipt")}
          />
          <span>
            <span className="flex items-center gap-2 font-medium">
              <ReceiptText className="size-4 text-success" />
              {t("Auto-print receipt after payment")}
            </span>
            <span className="mt-1 block text-muted-foreground">
              {t("Auto-print receipt setting help")}
            </span>
          </span>
        </label>

      </CardContent>
    </Card>
  );
}
