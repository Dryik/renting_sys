import { getDatabase } from "./database";
import { appSettings } from "./schema";
import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  defaultShopSettings,
  type ShopSettings,
} from "../../src/shared/settings";
import { normalizeLanguage } from "../../src/shared/language";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { requireSensitiveApproval } from "./security.service";

const allowedImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

function getUserDataPath(): string {
  return process.env.RENTAL_APP_USER_DATA_DIR
    ? path.resolve(process.env.RENTAL_APP_USER_DATA_DIR)
    : app.getPath("userData");
}

export function getShopSettings(): ShopSettings {
  const db = getDatabase();
  const rows = db.select().from(appSettings).all();
  const settingsMap = new Map(rows.map((row) => [row.key, row.value]));
  const shopLogoPath = normalizeUploadPath(settingsMap.get("shop_logo_path"));
  const ownerSignaturePath = normalizeUploadPath(
    settingsMap.get("owner_signature_path"),
  );

  return {
    shopName: settingsMap.get("shop_name") ?? defaultShopSettings.shopName,
    shopLogoDataUrl: getImageDataUrl(shopLogoPath),
    shopLogoPath,
    ownerSignatureDataUrl: getImageDataUrl(ownerSignaturePath),
    ownerSignaturePath,
    shopPhone: settingsMap.get("shop_phone") ?? defaultShopSettings.shopPhone,
    shopAddress: settingsMap.get("shop_address") ?? defaultShopSettings.shopAddress,
    defaultCurrency:
      settingsMap.get("default_currency") ?? defaultShopSettings.defaultCurrency,
    defaultLateFee: Number(
      settingsMap.get("default_late_fee") ?? defaultShopSettings.defaultLateFee,
    ),
    enableClientDeposit:
      settingsMap.get("enable_client_deposit") === "true"
        ? true
        : defaultShopSettings.enableClientDeposit,
    autoPrintReceipt:
      settingsMap.get("auto_print_receipt") === "true"
        ? true
        : defaultShopSettings.autoPrintReceipt,
    dailyClosingEnabled:
      settingsMap.get("daily_closing_enabled") === "true"
        ? true
        : defaultShopSettings.dailyClosingEnabled,
    printLanguage: normalizePrintLanguage(
      settingsMap.get("print_language") ?? defaultShopSettings.printLanguage,
    ),
    insuranceWarningDays: normalizePositiveInteger(
      settingsMap.get("insurance_warning_days"),
      defaultShopSettings.insuranceWarningDays,
    ),
    registrationWarningDays: normalizePositiveInteger(
      settingsMap.get("registration_warning_days"),
      defaultShopSettings.registrationWarningDays,
    ),
    technicalInspectionWarningDays: normalizePositiveInteger(
      settingsMap.get("technical_inspection_warning_days"),
      defaultShopSettings.technicalInspectionWarningDays,
    ),
    licenseWarningDays: normalizePositiveInteger(
      settingsMap.get("license_warning_days"),
      defaultShopSettings.licenseWarningDays,
    ),
    backupReminderDays: normalizePositiveInteger(
      settingsMap.get("backup_reminder_days"),
      defaultShopSettings.backupReminderDays,
    ),
    scheduledBackupEnabled:
      settingsMap.get("scheduled_backup_enabled") === "true"
        ? true
        : defaultShopSettings.scheduledBackupEnabled,
    scheduledBackupFolder: settingsMap.get("scheduled_backup_folder") || null,
    ownerPinEnabled:
      settingsMap.get("owner_pin_enabled") === "true"
        ? true
        : defaultShopSettings.ownerPinEnabled,
    enableSalesCommission:
      settingsMap.get("enable_sales_commission") === undefined
        ? defaultShopSettings.enableSalesCommission
        : settingsMap.get("enable_sales_commission") === "true",
    defaultDailyCommissionRate: Number(
      settingsMap.get("default_daily_commission_rate") ??
        defaultShopSettings.defaultDailyCommissionRate,
    ),
    contractFooter:
      settingsMap.get("contract_footer") ?? defaultShopSettings.contractFooter,
    printHeaderSubtitle:
      settingsMap.get("print_header_subtitle") ?? defaultShopSettings.printHeaderSubtitle,
    printTermsAndConditions:
      settingsMap.get("print_terms_and_conditions") ?? defaultShopSettings.printTermsAndConditions,
    enableContractWatermark:
      settingsMap.get("enable_contract_watermark") === undefined
        ? defaultShopSettings.enableContractWatermark
        : settingsMap.get("enable_contract_watermark") === "true",
    lastAutoBackupAt: settingsMap.get("last_auto_backup_at") || null,
    language: normalizeLanguage(
      settingsMap.get("app_language") ?? defaultShopSettings.language,
    ),
  };
}

export function saveShopSettings(settings: Partial<ShopSettings>): ShopSettings {
  requirePermissionForCurrentSession("settings.edit");
  const db = getDatabase();
  const current = getShopSettings();
  const reason =
    typeof (settings as { reason?: unknown }).reason === "string"
      ? ((settings as { reason: string }).reason.trim() || null)
      : null;
  const approvalToken =
    typeof (settings as { approvalToken?: unknown }).approvalToken === "string"
      ? (settings as { approvalToken: string }).approvalToken
      : undefined;
  requireSensitiveApproval("settings.edit", approvalToken);
  const {
    approvalToken: _approvalToken,
    ownerPinEnabled: _ownerPinEnabled,
    reason: _reason,
    ...settingsWithoutReason
  } = settings as Partial<ShopSettings> & {
    approvalToken?: string;
    ownerPinEnabled?: boolean;
    reason?: string;
  };
  void _approvalToken;
  void _ownerPinEnabled;
  void _reason;
  const updated = { ...current, ...settingsWithoutReason };

  const entries = [
    { key: "shop_name", value: updated.shopName },
    { key: "shop_logo_path", value: toStoredUploadPath(updated.shopLogoPath) },
    {
      key: "owner_signature_path",
      value: toStoredUploadPath(updated.ownerSignaturePath),
    },
    { key: "shop_phone", value: updated.shopPhone },
    { key: "shop_address", value: updated.shopAddress },
    { key: "default_currency", value: updated.defaultCurrency },
    { key: "default_late_fee", value: String(updated.defaultLateFee) },
    { key: "enable_client_deposit", value: String(updated.enableClientDeposit) },
    { key: "auto_print_receipt", value: String(updated.autoPrintReceipt) },
    { key: "daily_closing_enabled", value: String(updated.dailyClosingEnabled) },
    { key: "print_language", value: updated.printLanguage },
    { key: "insurance_warning_days", value: String(updated.insuranceWarningDays) },
    { key: "registration_warning_days", value: String(updated.registrationWarningDays) },
    { key: "technical_inspection_warning_days", value: String(updated.technicalInspectionWarningDays) },
    { key: "license_warning_days", value: String(updated.licenseWarningDays) },
    { key: "backup_reminder_days", value: String(updated.backupReminderDays) },
    { key: "scheduled_backup_enabled", value: String(updated.scheduledBackupEnabled) },
    { key: "scheduled_backup_folder", value: updated.scheduledBackupFolder ?? "" },
    { key: "owner_pin_enabled", value: String(updated.ownerPinEnabled) },
    { key: "enable_sales_commission", value: String(updated.enableSalesCommission) },
    {
      key: "default_daily_commission_rate",
      value: String(updated.defaultDailyCommissionRate),
    },
    { key: "contract_footer", value: updated.contractFooter },
    { key: "print_header_subtitle", value: updated.printHeaderSubtitle },
    { key: "print_terms_and_conditions", value: updated.printTermsAndConditions },
    { key: "enable_contract_watermark", value: String(updated.enableContractWatermark) },
    { key: "last_auto_backup_at", value: updated.lastAutoBackupAt ?? "" },
    { key: "app_language", value: normalizeLanguage(updated.language) },
  ];

  db.transaction((tx) => {
    for (const entry of entries) {
      tx.insert(appSettings)
        .values(entry)
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: entry.value },
        })
        .run();
    }

    logAuditEvent(tx, {
      action: "settings.updated",
      entityType: "settings",
      entityLabel: "shop_settings",
      summaryAr: "تم تحديث الإعدادات",
      summaryEn: "Settings were updated.",
      before: current,
      after: updated,
      reason,
    });
  });

  return updated;
}

export async function selectShopLogo(input?: unknown): Promise<ShopSettings> {
  requirePermissionForCurrentSession("settings.edit");
  const approvalToken =
    input && typeof input === "object" && "approvalToken" in input
      ? (input as { approvalToken?: string }).approvalToken
      : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select Shop Logo",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) {
    return getShopSettings();
  }

  const sourcePath = filePaths[0]!;
  const extension = path.extname(sourcePath).toLowerCase();

  if (!allowedImageExtensions.has(extension)) {
    throw new Error("Logo file must be PNG, JPG, WEBP, or SVG.");
  }

  const uploadsPath = path.join(getUserDataPath(), "uploads");
  fs.mkdirSync(uploadsPath, { recursive: true });

  const logoPath = path.join(uploadsPath, `shop-logo${extension}`);
  fs.copyFileSync(sourcePath, logoPath);

  const updated = saveShopSettings({
    shopLogoPath: toPortablePath(path.relative(uploadsPath, logoPath)),
    approvalToken,
    reason: "Shop logo updated.",
  } as Partial<ShopSettings>);

  return updated;
}

export function clearShopLogo(input?: unknown): ShopSettings {
  requirePermissionForCurrentSession("settings.edit");
  const approvalToken =
    input && typeof input === "object" && "approvalToken" in input
      ? (input as { approvalToken?: string }).approvalToken
      : undefined;

  return saveShopSettings({
    approvalToken,
    shopLogoDataUrl: null,
    shopLogoPath: null,
    reason: "Shop logo removed.",
  } as Partial<ShopSettings>);
}

export async function selectOwnerSignature(input?: unknown): Promise<ShopSettings> {
  requirePermissionForCurrentSession("settings.edit");
  const approvalToken =
    input && typeof input === "object" && "approvalToken" in input
      ? (input as { approvalToken?: string }).approvalToken
      : undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select Owner Signature",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "svg"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || filePaths.length === 0) {
    return getShopSettings();
  }

  const sourcePath = filePaths[0]!;
  const extension = path.extname(sourcePath).toLowerCase();

  if (!allowedImageExtensions.has(extension)) {
    throw new Error("Signature file must be PNG, JPG, WEBP, or SVG.");
  }

  const uploadsPath = path.join(getUserDataPath(), "uploads");
  fs.mkdirSync(uploadsPath, { recursive: true });

  const signaturePath = path.join(uploadsPath, `owner-signature${extension}`);
  fs.copyFileSync(sourcePath, signaturePath);

  return saveShopSettings({
    ownerSignaturePath: toPortablePath(path.relative(uploadsPath, signaturePath)),
    approvalToken,
    reason: "Owner signature updated.",
  } as Partial<ShopSettings>);
}

export function clearOwnerSignature(input?: unknown): ShopSettings {
  requirePermissionForCurrentSession("settings.edit");
  const approvalToken =
    input && typeof input === "object" && "approvalToken" in input
      ? (input as { approvalToken?: string }).approvalToken
      : undefined;

  return saveShopSettings({
    approvalToken,
    ownerSignatureDataUrl: null,
    ownerSignaturePath: null,
    reason: "Owner signature removed.",
  } as Partial<ShopSettings>);
}

function normalizeUploadPath(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const uploadsPath = path.join(getUserDataPath(), "uploads");
  const resolved = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(uploadsPath, value);
  const relative = path.relative(uploadsPath, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return fs.existsSync(resolved) ? resolved : null;
}

function toStoredUploadPath(value: string | null): string {
  if (!value) {
    return "";
  }

  const uploadsPath = path.join(getUserDataPath(), "uploads");
  const resolved = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(uploadsPath, value);
  const relative = path.relative(uploadsPath, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "";
  }

  return toPortablePath(relative);
}

function toPortablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function getImageDataUrl(imagePath: string | null): string | null {
  if (!imagePath) {
    return null;
  }

  try {
    if (!fs.existsSync(imagePath)) {
      return null;
    }
    const extension = path.extname(imagePath).toLowerCase();
    const mimeType =
      extension === ".svg"
        ? "image/svg+xml"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".jpg" || extension === ".jpeg"
            ? "image/jpeg"
            : "image/png";
    const bytes = fs.readFileSync(imagePath);

    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.error("Failed to read image data URL:", error);
    return null;
  }
}

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizePrintLanguage(value: string): ShopSettings["printLanguage"] {
  if (value === "app" || value === "ar" || value === "en" || value === "both") {
    return value;
  }

  return defaultShopSettings.printLanguage;
}
