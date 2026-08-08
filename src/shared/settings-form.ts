import type { ShopSettings } from "./settings";

/**
 * The form's shape: every field a string or a boolean, because that is what the
 * inputs bind to. Numbers are rendered as text and parsed back on submit.
 */
export type ShopSettingsFormValues = {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  defaultCurrency: string;
  defaultLateFee: string;
  enableClientDeposit: boolean;
  autoPrintReceipt: boolean;
  dailyClosingEnabled: boolean;
  enableSalesCommission: boolean;
  defaultDailyCommissionRate: string;
  printLanguage: ShopSettings["printLanguage"];
  insuranceWarningDays: string;
  registrationWarningDays: string;
  technicalInspectionWarningDays: string;
  licenseWarningDays: string;
  backupReminderDays: string;
  scheduledBackupEnabled: boolean;
  ownerPinEnabled: boolean;
  contractFooter: string;
  printHeaderSubtitle: string;
  printTermsAndConditions: string;
  enableContractWatermark: boolean;
  language: ShopSettings["language"];
};

/**
 * The one mapping from stored settings to form fields.
 *
 * There used to be two: the first load filled the form from an inline object
 * that omitted `enableSalesCommission` and `defaultDailyCommissionRate`, while
 * the post-save reset included them. A shop that opened Settings and saved
 * anything at all — a phone number, a footer — submitted the schema's defaults
 * for those two and silently overwrote its real commission configuration.
 *
 * Every path that fills this form now goes through here, so a field can no
 * longer be present in one and missing from the other.
 */
export function shopSettingsToFormValues(
  settings: ShopSettings,
): ShopSettingsFormValues {
  return {
    shopName: settings.shopName,
    shopPhone: settings.shopPhone,
    shopAddress: settings.shopAddress,
    defaultCurrency: settings.defaultCurrency,
    defaultLateFee: String(settings.defaultLateFee),
    enableClientDeposit: settings.enableClientDeposit,
    autoPrintReceipt: settings.autoPrintReceipt,
    dailyClosingEnabled: settings.dailyClosingEnabled,
    enableSalesCommission: settings.enableSalesCommission,
    defaultDailyCommissionRate: String(settings.defaultDailyCommissionRate),
    printLanguage: settings.printLanguage,
    insuranceWarningDays: String(settings.insuranceWarningDays),
    registrationWarningDays: String(settings.registrationWarningDays),
    technicalInspectionWarningDays: String(settings.technicalInspectionWarningDays),
    licenseWarningDays: String(settings.licenseWarningDays),
    backupReminderDays: String(settings.backupReminderDays),
    scheduledBackupEnabled: settings.scheduledBackupEnabled,
    ownerPinEnabled: settings.ownerPinEnabled,
    contractFooter: settings.contractFooter,
    printHeaderSubtitle: settings.printHeaderSubtitle,
    printTermsAndConditions: settings.printTermsAndConditions,
    enableContractWatermark: settings.enableContractWatermark,
    language: settings.language,
  };
}
