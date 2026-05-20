import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { notifyShopSettingsUpdated } from "@/hooks/useShopSettings";
import { languageValues } from "@/shared/language";
import type { ShopSettings } from "@/shared/settings";

const settingsFormSchema = z.object({
  shopName: z.string().trim().min(1, "Shop name is required.").max(100),
  shopPhone: z.string().trim().min(1, "Shop phone number is required.").max(40),
  shopAddress: z.string().trim().min(1, "Shop address is required.").max(200),
  defaultCurrency: z.string().trim().min(1, "Default currency is required.").max(10),
  defaultLateFee: z
    .string()
    .trim()
    .min(1, "Default late fee is required.")
    .refine((val) => {
      const num = Number(val);
      return !Number.isNaN(num) && num >= 0;
    }, "Late fee must be zero or a positive number."),
  enableClientDeposit: z.boolean(),
  contractFooter: z.string().trim().max(1000, "Footer text is too long."),
  language: z.enum(languageValues),
});

type SettingsFormInput = z.infer<typeof settingsFormSchema>;

export function SettingsPage() {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string | null;
  }>({ type: null, message: null });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsFormInput>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      shopName: "",
      shopPhone: "",
      shopAddress: "",
      defaultCurrency: "LYD",
      defaultLateFee: "50",
      enableClientDeposit: false,
      contractFooter: "",
      language: "ar",
    },
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await window.rentalApp.settings.get();
        reset({
          shopName: data.shopName,
          shopPhone: data.shopPhone,
          shopAddress: data.shopAddress,
          defaultCurrency: data.defaultCurrency,
          defaultLateFee: String(data.defaultLateFee),
          enableClientDeposit: data.enableClientDeposit,
          contractFooter: data.contractFooter,
          language: data.language,
        });
      } catch {
        setStatus({
          type: "error",
          message: t("Failed to load shop settings."),
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [reset, t]);

  async function onSubmit(values: SettingsFormInput) {
    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const payload: Partial<ShopSettings> = {
        shopName: values.shopName,
        shopPhone: values.shopPhone,
        shopAddress: values.shopAddress,
        defaultCurrency: values.defaultCurrency,
        defaultLateFee: Number(values.defaultLateFee),
        enableClientDeposit: values.enableClientDeposit,
        contractFooter: values.contractFooter,
        language: values.language,
      };

      const updated = await window.rentalApp.settings.save(payload);
      notifyShopSettingsUpdated(updated);
      reset({
        shopName: updated.shopName,
        shopPhone: updated.shopPhone,
        shopAddress: updated.shopAddress,
        defaultCurrency: updated.defaultCurrency,
        defaultLateFee: String(updated.defaultLateFee),
        enableClientDeposit: updated.enableClientDeposit,
        contractFooter: updated.contractFooter,
        language: updated.language,
      });

      setStatus({
        type: "success",
        message: t("Settings saved successfully."),
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? t(err.message) : t("Failed to save settings."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Settings className="size-5" />
              </div>
              <div>
                <CardTitle>{t("Shop Settings")}</CardTitle>
                <CardDescription>
                  {t("Configure metadata printed on customer invoices and contracts.")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            {status.type && (
              <div className="mb-4">
                {status.type === "success" && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-50/50 p-4 text-emerald-800 dark:bg-emerald-950/10 dark:text-emerald-400">
                    <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold">{status.message}</p>
                    </div>
                  </div>
                )}
                {status.type === "error" && (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive">
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold">{status.message}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <div className="grid gap-4 md:grid-cols-2">
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

            <label className="flex items-start gap-3 rounded-md border bg-background p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                {...register("enableClientDeposit")}
              />
              <span className="min-w-0">
                <span className="block font-medium">{t("Enable client deposit")}</span>
                <span className="mt-1 block text-muted-foreground">
                  {t("Client deposit setting help")}
                </span>
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Contract Agreement Footer")}</span>
              <Textarea
                {...register("contractFooter")}
                placeholder={t("Terms and conditions printed at the bottom of contract pages...")}
                rows={5}
                className="resize-y"
              />
              {errors.contractFooter && (
                <span className="text-xs text-destructive">{t(errors.contractFooter.message ?? "")}</span>
              )}
            </label>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {t("Save Settings")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
      <Card className="h-fit shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
        <CardContent className="space-y-4 text-sm">
          <SupportLine icon={<Globe2 className="size-4" />} label={t("Website")} value="arak.ly" />
          <SupportLine icon={<Phone className="size-4" />} label={t("Phone")} value="+218 92 782 8080" />
          <SupportLine icon={<Mail className="size-4" />} label={t("Sales Email")} value="sales@arak.ly" />
          <SupportLine icon={<Mail className="size-4" />} label={t("Email")} value="info@arak.ly" />
          <SupportLine
            icon={<MapPin className="size-4" />}
            label={t("Office Address")}
            value={t("Khalifa Al-Zaidi Street, Al-Madina Building, 7th Floor, Office 702, Tripoli")}
          />
          <SupportLine icon={<Clock className="size-4" />} label={t("Hours")} value={t("Sun-Thu: 9AM-6PM")} />
          <div className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
            {t("Developed by ARAK Communication & IT Services")}
          </div>
        </CardContent>
      </Card>
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
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
    </div>
  );
}
