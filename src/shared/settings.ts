import type { LanguageCode } from "./language";

export type ShopSettings = {
  shopName: string;
  shopLogoDataUrl: string | null;
  shopLogoPath: string | null;
  ownerSignatureDataUrl: string | null;
  ownerSignaturePath: string | null;
  shopPhone: string;
  shopAddress: string;
  defaultCurrency: string;
  defaultLateFee: number;
  enableClientDeposit: boolean;
  autoPrintReceipt: boolean;
  dailyClosingEnabled: boolean;
  printLanguage: "app" | "ar" | "en" | "both";
  insuranceWarningDays: number;
  registrationWarningDays: number;
  technicalInspectionWarningDays: number;
  licenseWarningDays: number;
  backupReminderDays: number;
  scheduledBackupEnabled: boolean;
  scheduledBackupFolder: string | null;
  ownerPinEnabled: boolean;
  enableSalesCommission: boolean;
  defaultDailyCommissionRate: number;
  contractFooter: string;
  printHeaderSubtitle: string;
  printTermsAndConditions: string;
  enableContractWatermark: boolean;
  lastAutoBackupAt: string | null;
  language: LanguageCode;
};

export const defaultShopSettings: ShopSettings = {
  shopName: "مكتب التأجير",
  shopLogoDataUrl: null,
  shopLogoPath: null,
  ownerSignatureDataUrl: null,
  ownerSignaturePath: null,
  shopPhone: "+218 91 000 0000",
  shopAddress: "طرابلس",
  defaultCurrency: "LYD",
  defaultLateFee: 50,
  enableClientDeposit: false,
  autoPrintReceipt: false,
  dailyClosingEnabled: false,
  printLanguage: "app",
  insuranceWarningDays: 30,
  registrationWarningDays: 30,
  technicalInspectionWarningDays: 30,
  licenseWarningDays: 15,
  backupReminderDays: 7,
  scheduledBackupEnabled: false,
  scheduledBackupFolder: null,
  ownerPinEnabled: false,
  enableSalesCommission: true,
  defaultDailyCommissionRate: 2,
  contractFooter:
    "بتوقيع هذا العقد، يوافق العميل على إعادة المركبة بالحالة نفسها التي استلمها بها وفي موعد الإرجاع المتفق عليه. تخضع حالات التأخير لرسوم تأخير حسب سياسة المحل.",
  printHeaderSubtitle: "عقد تأجير سيارات ومحركات",
  printTermsAndConditions:
    "1. يتعهد المستأجر بالحفاظ على المركبة وتسليمها في الموعد المحدد.\n2. يتحمل المستأجر مسؤوليته الكاملة عن أي أضرار أو مخالفات مرورية خلال فترة التأجير.\n3. لا يحق للمستأجر تسليم المركبة للغير دون موافقة خطية من المكتب.",
  enableContractWatermark: true,
  lastAutoBackupAt: null,
  language: "ar",
};
