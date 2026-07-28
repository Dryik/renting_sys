import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  FileText,
  Globe2,
  History,
  Image,
  KeyRound,
  Languages,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BidiValue } from "@/components/ui/bidi-value";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/useI18n";
import { notifyShopSettingsUpdated } from "@/hooks/useShopSettings";
import {
  accessoryFormSchema,
  emptyAccessoryFormValues,
  type AccessoryInput,
  type AccessoryFormValues,
  type AccessoryRecord,
} from "@/shared/accessories";
import { languageValues } from "@/shared/language";
import { normalizeDigits } from "@/shared/numerals";
import type { ShopSettings } from "@/shared/settings";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

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
  autoPrintReceipt: z.boolean(),
  dailyClosingEnabled: z.boolean(),
  printLanguage: z.enum(["app", "ar", "en", "both"]),
  insuranceWarningDays: z.string().trim().min(1),
  registrationWarningDays: z.string().trim().min(1),
  technicalInspectionWarningDays: z.string().trim().min(1),
  licenseWarningDays: z.string().trim().min(1),
  backupReminderDays: z.string().trim().min(1),
  scheduledBackupEnabled: z.boolean(),
  ownerPinEnabled: z.boolean(),
  contractFooter: z.string().trim().max(1000, "Footer text is too long."),
  language: z.enum(languageValues),
});

type SettingsFormInput = z.infer<typeof settingsFormSchema>;

type SettingsPageProps = {
  onOpenActivityLog: () => void;
  onOpenAppLicense: () => void;
  onOpenUsers: () => void;
};

export function SettingsPage({
  onOpenActivityLog,
  onOpenAppLicense,
  onOpenUsers,
}: SettingsPageProps) {
  const { can } = useAuth();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentSettings, setCurrentSettings] = useState<ShopSettings | null>(null);
  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string | null;
  }>({ type: null, message: null });
  const [pendingSettings, setPendingSettings] = useState<Partial<ShopSettings> | null>(null);
  const [pendingLogoAction, setPendingLogoAction] = useState<"clear" | "select" | null>(null);
  const [pendingSignatureAction, setPendingSignatureAction] =
    useState<"clear" | "select" | null>(null);
  const [pendingOwnerPinAction, setPendingOwnerPinAction] =
    useState<"clear" | "set" | null>(null);
  const [ownerPin, setOwnerPin] = useState("");
  const [confirmOwnerPin, setConfirmOwnerPin] = useState("");
  const [ownerPinError, setOwnerPinError] = useState<string | null>(null);

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
      autoPrintReceipt: false,
      dailyClosingEnabled: false,
      printLanguage: "app",
      insuranceWarningDays: "30",
      registrationWarningDays: "30",
      technicalInspectionWarningDays: "30",
      licenseWarningDays: "15",
      backupReminderDays: "7",
      scheduledBackupEnabled: false,
      ownerPinEnabled: false,
      contractFooter: "",
      language: "ar",
    },
  });

  function resetSettingsForm(data: ShopSettings) {
    reset({
      shopName: data.shopName,
      shopPhone: data.shopPhone,
      shopAddress: data.shopAddress,
      defaultCurrency: data.defaultCurrency,
      defaultLateFee: String(data.defaultLateFee),
      enableClientDeposit: data.enableClientDeposit,
      autoPrintReceipt: data.autoPrintReceipt,
      dailyClosingEnabled: data.dailyClosingEnabled,
      printLanguage: data.printLanguage,
      insuranceWarningDays: String(data.insuranceWarningDays),
      registrationWarningDays: String(data.registrationWarningDays),
      technicalInspectionWarningDays: String(data.technicalInspectionWarningDays),
      licenseWarningDays: String(data.licenseWarningDays),
      backupReminderDays: String(data.backupReminderDays),
      scheduledBackupEnabled: data.scheduledBackupEnabled,
      ownerPinEnabled: data.ownerPinEnabled,
      contractFooter: data.contractFooter,
      language: data.language,
    });
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await window.rentalApp.settings.get();
        setCurrentSettings(data);
        reset({
          shopName: data.shopName,
          shopPhone: data.shopPhone,
          shopAddress: data.shopAddress,
          defaultCurrency: data.defaultCurrency,
          defaultLateFee: String(data.defaultLateFee),
          enableClientDeposit: data.enableClientDeposit,
          autoPrintReceipt: data.autoPrintReceipt,
          dailyClosingEnabled: data.dailyClosingEnabled,
          printLanguage: data.printLanguage,
          insuranceWarningDays: String(data.insuranceWarningDays),
          registrationWarningDays: String(data.registrationWarningDays),
          technicalInspectionWarningDays: String(data.technicalInspectionWarningDays),
          licenseWarningDays: String(data.licenseWarningDays),
          backupReminderDays: String(data.backupReminderDays),
          scheduledBackupEnabled: data.scheduledBackupEnabled,
          ownerPinEnabled: data.ownerPinEnabled,
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
    const payload = buildSettingsPayload(values);
    setPendingSettings(payload);
  }

  async function saveSettings(
    payload: Partial<ShopSettings>,
    values: { approvalToken?: string; reason?: string },
  ) {
    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const updated = await window.rentalApp.settings.save({
        ...payload,
        approvalToken: values.approvalToken,
        reason: values.reason,
      });
      setPendingSettings(null);
      setCurrentSettings(updated);
      notifyShopSettingsUpdated(updated);
      resetSettingsForm(updated);

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

  async function handleSelectLogo() {
    setPendingLogoAction("select");
  }

  async function handleClearLogo() {
    setPendingLogoAction("clear");
  }

  async function performLogoAction(values: { approvalToken?: string }) {
    if (!pendingLogoAction) {
      return;
    }

    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const updated =
        pendingLogoAction === "select"
          ? await window.rentalApp.settings.selectLogo({
              approvalToken: values.approvalToken,
            })
          : await window.rentalApp.settings.clearLogo({
              approvalToken: values.approvalToken,
            });
      setCurrentSettings(updated);
      resetSettingsForm(updated);
      notifyShopSettingsUpdated(updated);
      setStatus({
        type: "success",
        message:
          pendingLogoAction === "select"
            ? t("Shop logo updated successfully.")
            : t("Shop logo removed."),
      });
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err instanceof Error
            ? t(err.message)
            : pendingLogoAction === "select"
              ? t("Shop logo could not be updated.")
              : t("Shop logo could not be removed."),
      });
    } finally {
      setIsSaving(false);
      setPendingLogoAction(null);
    }
  }

  async function handleSelectOwnerSignature() {
    setPendingSignatureAction("select");
  }

  async function handleClearOwnerSignature() {
    setPendingSignatureAction("clear");
  }

  async function performSignatureAction(values: { approvalToken?: string }) {
    if (!pendingSignatureAction) {
      return;
    }

    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const updated =
        pendingSignatureAction === "select"
          ? await window.rentalApp.settings.selectOwnerSignature({
              approvalToken: values.approvalToken,
            })
          : await window.rentalApp.settings.clearOwnerSignature({
              approvalToken: values.approvalToken,
            });
      setCurrentSettings(updated);
      resetSettingsForm(updated);
      notifyShopSettingsUpdated(updated);
      setStatus({
        type: "success",
        message:
          pendingSignatureAction === "select"
            ? t("Owner signature updated successfully.")
            : t("Owner signature removed."),
      });
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err instanceof Error
            ? t(err.message)
            : pendingSignatureAction === "select"
              ? t("Owner signature could not be updated.")
              : t("Owner signature could not be removed."),
      });
    } finally {
      setIsSaving(false);
      setPendingSignatureAction(null);
    }
  }

  async function handleSetOwnerPin() {
    setOwnerPinError(null);
    setOwnerPin("");
    setConfirmOwnerPin("");
    setPendingOwnerPinAction("set");
  }

  async function handleClearOwnerPin() {
    setOwnerPinError(null);
    setOwnerPin("");
    setConfirmOwnerPin("");
    setPendingOwnerPinAction("clear");
  }

  async function performOwnerPinAction(values: { approvalToken?: string }) {
    if (!pendingOwnerPinAction) {
      return;
    }

    if (pendingOwnerPinAction === "set") {
      if (!/^\d{4}$/.test(ownerPin)) {
        setOwnerPinError(t("PIN must be exactly 4 digits."));
        return;
      }

      if (ownerPin !== confirmOwnerPin) {
        setOwnerPinError(t("PINs do not match."));
        return;
      }
    }

    setIsSaving(true);
    setStatus({ type: null, message: null });
    setOwnerPinError(null);

    try {
      if (pendingOwnerPinAction === "set") {
        await window.rentalApp.security.setOwnerPin({
          approvalToken: values.approvalToken,
          pin: ownerPin,
        });
      } else {
        await window.rentalApp.security.clearOwnerPin({
          approvalToken: values.approvalToken,
        });
      }

      const updated = await window.rentalApp.settings.get();
      setCurrentSettings(updated);
      resetSettingsForm(updated);
      notifyShopSettingsUpdated(updated);
      setPendingOwnerPinAction(null);
      setOwnerPin("");
      setConfirmOwnerPin("");
      setStatus({
        type: "success",
        message:
          pendingOwnerPinAction === "set"
            ? t("Owner PIN updated.")
            : t("Owner PIN disabled."),
      });
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err instanceof Error
            ? t(err.message)
            : pendingOwnerPinAction === "set"
              ? t("Owner PIN could not be updated.")
              : t("Owner PIN could not be disabled."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-xl rounded-lg border bg-card p-4">
        <StatusBanner
          icon={<Loader2 className="size-5 animate-spin" />}
          message={t("Loading...")}
          title={t("Shop Settings")}
          tone="info"
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-7xl flex-col gap-6">
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
              <Settings className="size-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-normal">{t("Shop Settings")}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("Configure local shop details, print defaults, reminders, and owner PIN prompts.")}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-primary" />
              {t("Local-only setup")}
            </div>
            <p className="mt-2 leading-5">
              {t("Data stays on this computer and is protected by local backups.")}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
            {isSaving ? (
              <StatusBanner
                icon={<Loader2 className="size-5 animate-spin" />}
                message={t("Shop details used on contracts and receipts.")}
                title={t("Save Settings")}
                tone="info"
              />
            ) : status.type ? (
              <StatusBanner
                icon={
                  status.type === "success" ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <AlertTriangle className="size-5" />
                  )
                }
                message={
                  status.type === "success"
                    ? t("Shop details used on contracts and receipts.")
                    : status.message
                }
                title={
                  status.type === "success"
                    ? t("Settings saved successfully.")
                    : t("Operation Failed")
                }
                tone={status.type}
              />
            ) : null}

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

            <div className="rounded-2xl border border-border/80 bg-muted p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card text-muted-foreground shadow-xs">
                    {currentSettings?.shopLogoDataUrl ? (
                      <img
                        alt={t("Shop Logo")}
                        className="max-h-14 max-w-14 object-contain"
                        src={currentSettings.shopLogoDataUrl}
                      />
                    ) : (
                      <Image className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{t("Shop Logo")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("Shop logo help")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSaving || !can("settings.edit")}
                    onClick={() => void handleSelectLogo()}
                  >
                    <Upload data-icon="inline-start" />
                    {t("Choose Logo")}
                  </Button>
                  {currentSettings?.shopLogoDataUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSaving || !can("settings.edit")}
                      onClick={() => void handleClearLogo()}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("Remove Logo")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

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
                    onClick={() => void handleSelectOwnerSignature()}
                  >
                    <Upload data-icon="inline-start" />
                    {t("Choose Signature")}
                  </Button>
                  {currentSettings?.ownerSignatureDataUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSaving || !can("settings.edit")}
                      onClick={() => void handleClearOwnerSignature()}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t("Remove Signature")}
                    </Button>
                  ) : null}
                </div>
              </div>
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

            <SettingBlock
              icon={<Languages className="size-5" />}
              title={t("Language and receipts")}
              description={t("Choose app language and receipt behavior for this computer.")}
            >
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
            </SettingBlock>

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
                <span className="min-w-0">
                  <span className="block font-medium">{t("Enable client deposit")}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {t("Client deposit setting help")}
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
                      onClick={() => void handleSetOwnerPin()}
                    >
                      {t("Set PIN")}
                    </Button>
                    {currentSettings?.ownerPinEnabled ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isSaving || !can("settings.edit")}
                        onClick={() => void handleClearOwnerPin()}
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
              title={t("Reminders")}
              description={t("Local reminders for renewals and backup checks.")}
            >
              <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-xs">
                <span>
                  <span className="block font-medium">{t("Manual Backup Only")}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {t("Create backups manually from the Backup screen.")}
                  </span>
                </span>
              </div>

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

            <SettingBlock
              icon={<FileText className="size-5" />}
              title={t("Contract text")}
              description={t("Footer text printed on rental contracts.")}
            >
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
            </SettingBlock>

            <div className="flex justify-end border-t border-border/70 bg-muted px-1 pt-4">
              <Button type="submit" size="lg" aria-busy={isSaving} disabled={isSaving || !can("settings.edit")}>
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
      <div className="flex flex-col gap-6">
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
        {can("accessories.view") ? (
          <AccessoryManager canEdit={can("accessories.create") || can("accessories.edit")} />
        ) : null}
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
        <DiagnosticsPanel />
      </div>
      </div>
      <SensitiveActionDialog
        action="settings.edit"
        open={Boolean(pendingSettings)}
        title={t("Save Settings")}
        description={t("Enter the reason for changing settings.")}
        ownerPinRequired={currentSettings?.ownerPinEnabled ?? false}
        reasonLabel={t("Reason")}
        cancelLabel={t("Cancel")}
        confirmLabel={t("Save Settings")}
        isBusy={isSaving}
        onCancel={() => setPendingSettings(null)}
        onConfirm={(values) => {
          if (pendingSettings) {
            void saveSettings(pendingSettings, values);
          }
        }}
      />
      <SensitiveActionDialog
        action="settings.edit"
        open={Boolean(pendingLogoAction)}
        title={t(pendingLogoAction === "clear" ? "Remove Logo" : "Choose Logo")}
        description={t("Enter owner PIN to continue.")}
        ownerPinRequired={currentSettings?.ownerPinEnabled ?? false}
        reasonRequired={false}
        cancelLabel={t("Cancel")}
        confirmLabel={t(pendingLogoAction === "clear" ? "Remove Logo" : "Choose Logo")}
        isBusy={isSaving}
        onCancel={() => setPendingLogoAction(null)}
        onConfirm={(values) => void performLogoAction(values)}
      />
      <SensitiveActionDialog
        action="settings.edit"
        open={Boolean(pendingSignatureAction)}
        title={t(pendingSignatureAction === "clear" ? "Remove Signature" : "Choose Signature")}
        description={t("Enter owner PIN to continue.")}
        ownerPinRequired={currentSettings?.ownerPinEnabled ?? false}
        reasonRequired={false}
        cancelLabel={t("Cancel")}
        confirmLabel={t(pendingSignatureAction === "clear" ? "Remove Signature" : "Choose Signature")}
        isBusy={isSaving}
        onCancel={() => setPendingSignatureAction(null)}
        onConfirm={(values) => void performSignatureAction(values)}
      />
      <SensitiveActionDialog
        action="ownerPin.change"
        open={Boolean(pendingOwnerPinAction)}
        title={t(pendingOwnerPinAction === "clear" ? "Disable owner PIN prompts?" : "Set PIN")}
        description={
          pendingOwnerPinAction === "clear"
            ? t("Disable owner PIN prompts?")
            : t("Enter the new owner PIN.")
        }
        ownerPinRequired={currentSettings?.ownerPinEnabled ?? false}
        reasonRequired={false}
        cancelLabel={t("Cancel")}
        confirmLabel={t(pendingOwnerPinAction === "clear" ? "Disable" : "Set PIN")}
        confirmDisabled={
          pendingOwnerPinAction === "set" &&
          (!/^\d{4}$/.test(ownerPin) || ownerPin !== confirmOwnerPin)
        }
        variant={pendingOwnerPinAction === "clear" ? "destructive" : "default"}
        isBusy={isSaving}
        onCancel={() => {
          setPendingOwnerPinAction(null);
          setOwnerPin("");
          setConfirmOwnerPin("");
          setOwnerPinError(null);
        }}
        onConfirm={(values) => void performOwnerPinAction(values)}
      >
        {pendingOwnerPinAction === "set" ? (
          <div className="grid gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("New PIN")}</span>
              <Input
                autoComplete="new-password"
                data-ltr="true"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                type="password"
                value={ownerPin}
                onChange={(event) => {
                  setOwnerPin(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4));
                  setOwnerPinError(null);
                }}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Confirm PIN")}</span>
              <Input
                autoComplete="new-password"
                data-ltr="true"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                type="password"
                value={confirmOwnerPin}
                onChange={(event) => {
                  setConfirmOwnerPin(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4));
                  setOwnerPinError(null);
                }}
              />
            </label>
            {ownerPinError ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ownerPinError}
              </p>
            ) : null}
          </div>
        ) : null}
      </SensitiveActionDialog>
    </div>
  );
}

function AdminShortcut({
  description,
  icon,
  label,
  onClick,
}: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full justify-start gap-3 whitespace-normal p-3 text-start"
      onClick={onClick}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}

function AccessoryManager({ canEdit }: { canEdit: boolean }) {
  const { formatCurrency, t } = useI18n();
  const [accessories, setAccessories] = useState<AccessoryRecord[]>([]);
  const [editing, setEditing] = useState<AccessoryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<AccessoryFormValues, undefined, AccessoryInput>({
    resolver: zodResolver(accessoryFormSchema),
    defaultValues: emptyAccessoryFormValues,
  });

  const loadAccessories = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.rentalApp.accessories.list({ pageSize: 100 });
      setAccessories(result.rows);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Accessories could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAccessories();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadAccessories]);

  async function saveAccessory(input: AccessoryInput) {
    setIsSaving(true);
    setError(null);

    try {
      if (editing) {
        await window.rentalApp.accessories.update(editing.id, input);
      } else {
        await window.rentalApp.accessories.create(input);
      }
      setEditing(null);
      reset(emptyAccessoryFormValues);
      await loadAccessories();
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Accessory could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <CardTitle>{t("Accessories")}</CardTitle>
            <CardDescription>
              {t("Owned quantity and default charge for rental accessories.")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {canEdit ? (
          <form className="grid gap-3" onSubmit={handleSubmit(saveAccessory)}>
            <label className="flex flex-col gap-1 text-sm font-medium">
              <span>{t("Name")}</span>
              <Input {...register("name")} />
              {errors.name ? (
                <span className="text-xs text-destructive">{t(errors.name.message ?? "")}</span>
              ) : null}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                <span>{t("Owned")}</span>
                <Input data-ltr="true" inputMode="numeric" {...register("quantityOwned")} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                <span>{t("Default Charge")}</span>
                <Input data-ltr="true" inputMode="decimal" {...register("defaultCharge")} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                {...register("isActive")}
              />
              <span>{t("Active")}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              <span>{t("Notes")}</span>
              <Textarea rows={2} {...register("notes")} />
            </label>
            <div className="flex justify-end gap-2">
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    reset(emptyAccessoryFormValues);
                  }}
                >
                  {t("Cancel")}
                </Button>
              ) : null}
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? t("Update") : t("Add")}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="divide-y rounded-md border">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">{t("Loading...")}</p>
          ) : accessories.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("No accessories yet.")}</p>
          ) : (
            accessories.map((accessory) => (
              <div key={accessory.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{accessory.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("Available")}: {accessory.quantityAvailable} / {accessory.quantityOwned}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("Default Charge")}: {formatCurrency(accessory.defaultCharge)}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(accessory);
                        reset({
                          name: accessory.name,
                          quantityOwned: String(accessory.quantityOwned),
                          defaultCharge: String(accessory.defaultCharge),
                          isActive: accessory.isActive,
                          notes: accessory.notes ?? "",
                        });
                      }}
                    >
                      {t("Edit")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function buildSettingsPayload(values: SettingsFormInput): Partial<ShopSettings> {
  return {
    shopName: values.shopName,
    shopPhone: values.shopPhone,
    shopAddress: values.shopAddress,
    defaultCurrency: values.defaultCurrency,
    defaultLateFee: Number(values.defaultLateFee),
    enableClientDeposit: values.enableClientDeposit,
    autoPrintReceipt: values.autoPrintReceipt,
    dailyClosingEnabled: values.dailyClosingEnabled,
    printLanguage: values.printLanguage,
    insuranceWarningDays: Number(values.insuranceWarningDays),
    registrationWarningDays: Number(values.registrationWarningDays),
    technicalInspectionWarningDays: Number(values.technicalInspectionWarningDays),
    licenseWarningDays: Number(values.licenseWarningDays),
    backupReminderDays: Number(values.backupReminderDays),
    scheduledBackupEnabled: values.scheduledBackupEnabled,
    ownerPinEnabled: values.ownerPinEnabled,
    contractFooter: values.contractFooter,
    language: values.language,
  };
}

function SettingBlock({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-muted p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs ring-1 ring-border">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
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
        <p className="font-semibold">{title}</p>
        {message ? <p className="mt-1 break-words opacity-80">{message}</p> : null}
      </div>
    </div>
  );
}

function SupportLine({
  icon,
  label,
  value,
  valueMode = "auto",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueMode?: "auto" | "ltr";
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="break-words font-medium">
          {valueMode === "ltr" ? <BidiValue value={value} wrap /> : <span dir="auto">{value}</span>}
        </p>
      </div>
    </div>
  );
}
