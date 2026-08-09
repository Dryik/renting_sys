import { z } from "zod";
import { languageValues } from "@/shared/language";

/**
 * The Settings form's validation shape.
 *
 * Split out so each tab component can type its `register` and `errors` against
 * the same schema the page validates with — one form, one schema, five views.
 * Unchanged from where it lived inside the page.
 */
export const settingsFormSchema = z.object({
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
  enableSalesCommission: z.boolean(),
  defaultDailyCommissionRate: z
    .string()
    .trim()
    .min(1, "Default daily commission is required.")
    .refine((val) => !Number.isNaN(Number(val)) && Number(val) >= 0, "Must be zero or a positive number."),
  printLanguage: z.enum(["app", "ar", "en", "both"]),
  insuranceWarningDays: z.string().trim().min(1),
  registrationWarningDays: z.string().trim().min(1),
  technicalInspectionWarningDays: z.string().trim().min(1),
  licenseWarningDays: z.string().trim().min(1),
  backupReminderDays: z.string().trim().min(1),
  scheduledBackupEnabled: z.boolean(),
  ownerPinEnabled: z.boolean(),
  contractFooter: z.string().trim().max(1000, "Footer text is too long."),
  printHeaderSubtitle: z.string().trim().max(200, "Header subtitle is too long."),
  printTermsAndConditions: z.string().trim().max(2000, "Terms text is too long."),
  enableContractWatermark: z.boolean(),
  language: z.enum(languageValues),
});

export type SettingsFormInput = z.infer<typeof settingsFormSchema>;
