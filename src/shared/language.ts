export const languageValues = ["ar", "en"] as const;

export type LanguageCode = (typeof languageValues)[number];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "ar" || value === "en";
}

export function normalizeLanguage(value: unknown): LanguageCode {
  return isLanguageCode(value) ? value : "ar";
}

export function getDirectionForLanguage(language: LanguageCode): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}

export function getLocaleForLanguage(language: LanguageCode): string {
  return language === "ar" ? "ar-LY-u-nu-latn" : "en-US";
}
