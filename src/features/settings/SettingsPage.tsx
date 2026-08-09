import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SensitiveActionDialog } from "@/components/ui/sensitive-action-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useSetShopSettings, useShopSettingsQuery } from "@/hooks/useShopSettings";
import { rentalAppApi } from "@/data/rental-app-api";
import { normalizeDigits } from "@/shared/numerals";
import type { ShopSettings } from "@/shared/settings";
import { shopSettingsToFormValues } from "@/shared/settings-form";
import { SettingsContractTab } from "./SettingsContractTab";
import { SettingsLocalizationTab } from "./SettingsLocalizationTab";
import { SettingsOperationsTab } from "./SettingsOperationsTab";
import { SettingsProfileTab } from "./SettingsProfileTab";
import { SettingsSecurityTab } from "./SettingsSecurityTab";
import { StatusBanner } from "./StatusBanner";
import {
  settingsFormSchema,
  type SettingsFormInput,
} from "./settings-form-schema";

type SettingsPageProps = {
  onDirtyChange?: (isDirty: boolean) => void;
  onOpenActivityLog: () => void;
  onOpenAppLicense: () => void;
  onOpenUsers: () => void;
};

import { cn } from "@/lib/utils";

type SettingsTab = "profile" | "localization" | "contract" | "operations" | "security";

export function SettingsPage({
  onDirtyChange,
  onOpenActivityLog,
  onOpenAppLicense,
  onOpenUsers,
}: SettingsPageProps) {
  const { can } = useAuth();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const settingsQuery = useShopSettingsQuery();
  const setShopSettings = useSetShopSettings();
  // Guards the one-time hydration below; a ref rather than state so filling the
  // form never schedules another render pass.
  const hasHydratedForm = useRef(false);
  const isLoading = settingsQuery.isPending;
  const [isSaving, setIsSaving] = useState(false);
  const [actionStatus, setActionStatus] = useState<{
    type: "success" | "error" | null;
    message: string | null;
  }>({ type: null, message: null });
  // The saved settings are whatever the shared query holds: a successful save
  // writes the returned object straight into it, so there is no second copy
  // here that could drift.
  const currentSettings = settingsQuery.data ?? null;
  const status = actionStatus.type
    ? actionStatus
    : settingsQuery.isError
      ? { type: "error" as const, message: t("Failed to load shop settings.") }
      : actionStatus;
  const [pendingSettings, setPendingSettings] = useState<Partial<ShopSettings> | null>(null);
  const [pendingLogoAction, setPendingLogoAction] = useState<"clear" | "select" | null>(null);
  const [pendingSignatureAction, setPendingSignatureAction] =
    useState<"clear" | "select" | null>(null);
  const [pendingOwnerPinAction, setPendingOwnerPinAction] =
    useState<"clear" | "set" | null>(null);
  const [ownerPin, setOwnerPin] = useState("");
  const [confirmOwnerPin, setConfirmOwnerPin] = useState("");
  const [ownerPinError, setOwnerPinError] = useState<string | null>(null);
  const [showOwnerPin, setShowOwnerPin] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
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
      enableSalesCommission: true,
      defaultDailyCommissionRate: "2",
      printLanguage: "app",
      insuranceWarningDays: "30",
      registrationWarningDays: "30",
      technicalInspectionWarningDays: "30",
      licenseWarningDays: "15",
      backupReminderDays: "7",
      scheduledBackupEnabled: false,
      ownerPinEnabled: false,
      contractFooter: "",
      enableContractWatermark: true,
      language: "ar",
    },
  });

  function resetSettingsForm(data: ShopSettings) {
    reset(shopSettingsToFormValues(data));
  }

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  /**
   * The form is filled from the shared settings query, but only the first time
   * a value arrives. A later refetch — triggered by a sign-in, a permission
   * change, or anything else — must never reach in and overwrite fields the
   * user is part-way through editing.
   */
  useEffect(() => {
    const data = settingsQuery.data;

    if (data && !hasHydratedForm.current) {
      hasHydratedForm.current = true;
      // The same mapper the post-save reset uses, so no field can be filled
      // on one path and left at its schema default on the other.
      reset(shopSettingsToFormValues(data));
    }
  }, [reset, settingsQuery.data]);

  async function onSubmit(values: SettingsFormInput) {
    const payload = buildSettingsPayload(values);
    setPendingSettings(payload);
  }

  function cancelChanges() {
    if (currentSettings) {
      resetSettingsForm(currentSettings);
    }
    setActionStatus({ type: null, message: null });
  }

  async function saveSettings(
    payload: Partial<ShopSettings>,
    values: { approvalToken?: string; reason?: string },
  ) {
    setIsSaving(true);
    setActionStatus({ type: null, message: null });

    try {
      const updated = await rentalAppApi.settings.save({
        ...payload,
        approvalToken: values.approvalToken,
        reason: values.reason,
      });
      setPendingSettings(null);
      setShopSettings(updated);
      resetSettingsForm(updated);

      setActionStatus({
        type: "success",
        message: t("Settings saved successfully."),
      });
    } catch (err) {
      setActionStatus({
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
    setActionStatus({ type: null, message: null });

    try {
      const updated =
        pendingLogoAction === "select"
          ? await rentalAppApi.settings.selectLogo({
              approvalToken: values.approvalToken,
            })
          : await rentalAppApi.settings.clearLogo({
              approvalToken: values.approvalToken,
            });
      resetSettingsForm(updated);
      setShopSettings(updated);
      setActionStatus({
        type: "success",
        message:
          pendingLogoAction === "select"
            ? t("Shop logo updated successfully.")
            : t("Shop logo removed."),
      });
    } catch (err) {
      setActionStatus({
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
    setActionStatus({ type: null, message: null });

    try {
      const updated =
        pendingSignatureAction === "select"
          ? await rentalAppApi.settings.selectOwnerSignature({
              approvalToken: values.approvalToken,
            })
          : await rentalAppApi.settings.clearOwnerSignature({
              approvalToken: values.approvalToken,
            });
      resetSettingsForm(updated);
      setShopSettings(updated);
      setActionStatus({
        type: "success",
        message:
          pendingSignatureAction === "select"
            ? t("Owner signature updated successfully.")
            : t("Owner signature removed."),
      });
    } catch (err) {
      setActionStatus({
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
    setActionStatus({ type: null, message: null });
    setOwnerPinError(null);

    try {
      if (pendingOwnerPinAction === "set") {
        await rentalAppApi.security.setOwnerPin({
          approvalToken: values.approvalToken,
          pin: ownerPin,
        });
      } else {
        await rentalAppApi.security.clearOwnerPin({
          approvalToken: values.approvalToken,
        });
      }

      const updated = await rentalAppApi.settings.get();
      resetSettingsForm(updated);
      setShopSettings(updated);
      setPendingOwnerPinAction(null);
      setOwnerPin("");
      setConfirmOwnerPin("");
      setActionStatus({
        type: "success",
        message:
          pendingOwnerPinAction === "set"
            ? t("Owner PIN updated.")
            : t("Owner PIN disabled."),
      });
    } catch (err) {
      setActionStatus({
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
    <div className="flex w-full flex-col gap-6">
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
            activeTab === "profile"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Building2 className="size-4" />
          {t("Shop Profile")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("localization")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
            activeTab === "localization"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Languages className="size-4" />
          {t("Language & Currency")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contract")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
            activeTab === "contract"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <FileText className="size-4" />
          {t("Contract & Terms")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("operations")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
            activeTab === "operations"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Settings className="size-4" />
          {t("Operations & Accessories")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
            activeTab === "security"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ShieldCheck className="size-4" />
          {t("Security & System")}
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
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

        {activeTab === "profile" ? (
          <SettingsProfileTab
            can={can}
            currentSettings={currentSettings}
            errors={errors}
            isSaving={isSaving}
            onClearLogo={() => void handleClearLogo()}
            onSelectLogo={() => void handleSelectLogo()}
            register={register}
            t={t}
          />
        ) : null}

        {activeTab === "localization" ? (
          <SettingsLocalizationTab errors={errors} register={register} t={t} />
        ) : null}

        {activeTab === "contract" ? (
          <SettingsContractTab
            can={can}
            currentSettings={currentSettings}
            isSaving={isSaving}
            onClearOwnerSignature={() => void handleClearOwnerSignature()}
            onSelectOwnerSignature={() => void handleSelectOwnerSignature()}
            register={register}
            t={t}
          />
        ) : null}

        {activeTab === "operations" ? (
          <SettingsOperationsTab errors={errors} register={register} t={t} />
        ) : null}

        {activeTab === "security" ? (
          <SettingsSecurityTab
            can={can}
            currentSettings={currentSettings}
            isSaving={isSaving}
            onClearOwnerPin={() => void handleClearOwnerPin()}
            onOpenActivityLog={onOpenActivityLog}
            onOpenAppLicense={onOpenAppLicense}
            onOpenUsers={onOpenUsers}
            onSetOwnerPin={() => void handleSetOwnerPin()}
            register={register}
            t={t}
          />
        ) : null}

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {isDirty ? t("You have unsaved changes.") : t("All changes are saved.")}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isSaving}
              onClick={cancelChanges}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              aria-busy={isSaving}
              disabled={!isDirty || isSaving || !can("settings.edit")}
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t("Save Changes")}
            </Button>
          </div>
        </div>
      </form>
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
              <span className="relative">
                <Input
                  autoComplete="new-password"
                  className="pe-11"
                  data-ltr="true"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  type={showOwnerPin ? "text" : "password"}
                  value={ownerPin}
                  onChange={(event) => {
                    setOwnerPin(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4));
                    setOwnerPinError(null);
                  }}
                />
                <button
                  type="button"
                  className="absolute end-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t(showOwnerPin ? "Hide PIN" : "Show PIN")}
                  onClick={() => setShowOwnerPin((current) => !current)}
                >
                  {showOwnerPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>{t("Confirm PIN")}</span>
              <Input
                autoComplete="new-password"
                data-ltr="true"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                type={showOwnerPin ? "text" : "password"}
                value={confirmOwnerPin}
                onChange={(event) => {
                  setConfirmOwnerPin(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 4));
                  setOwnerPinError(null);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">{t("Use a 4-digit PIN.")}</p>
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
    enableSalesCommission: values.enableSalesCommission,
    defaultDailyCommissionRate: Number(values.defaultDailyCommissionRate),
    printLanguage: values.printLanguage,
    insuranceWarningDays: Number(values.insuranceWarningDays),
    registrationWarningDays: Number(values.registrationWarningDays),
    technicalInspectionWarningDays: Number(values.technicalInspectionWarningDays),
    licenseWarningDays: Number(values.licenseWarningDays),
    backupReminderDays: Number(values.backupReminderDays),
    scheduledBackupEnabled: values.scheduledBackupEnabled,
    ownerPinEnabled: values.ownerPinEnabled,
    contractFooter: values.contractFooter,
    printHeaderSubtitle: values.printHeaderSubtitle,
    printTermsAndConditions: values.printTermsAndConditions,
    enableContractWatermark: values.enableContractWatermark,
    language: values.language,
  };
}
