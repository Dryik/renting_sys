import type { LanguageCode } from "./language";

export type ShopSettings = {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  defaultCurrency: string;
  defaultLateFee: number;
  enableClientDeposit: boolean;
  contractFooter: string;
  language: LanguageCode;
};

export const defaultShopSettings: ShopSettings = {
  shopName: "مكتب التأجير",
  shopPhone: "+218 91 000 0000",
  shopAddress: "طرابلس",
  defaultCurrency: "LYD",
  defaultLateFee: 50,
  enableClientDeposit: false,
  contractFooter:
    "بتوقيع هذا العقد، يوافق العميل على إعادة المركبة بالحالة نفسها التي استلمها بها وفي موعد الإرجاع المتفق عليه. تخضع حالات التأخير لرسوم تأخير حسب سياسة المحل.",
  language: "ar",
};
