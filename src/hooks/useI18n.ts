import { useCallback, useMemo } from "react";
import {
  formatDateForLanguage,
  formatDateTimeForLanguage,
  getTextDirection,
  translate,
} from "@/shared/i18n";
import { getLocaleForLanguage } from "@/shared/language";
import { formatMoney } from "@/shared/money";
import { useShopSettings } from "./useShopSettings";

type TranslationValues = Record<string, string | number>;

export function useI18n() {
  const settings = useShopSettings();
  const language = settings.language;
  const locale = getLocaleForLanguage(language);
  const dir = getTextDirection(language);

  const t = useCallback(
    (key: string, values?: TranslationValues) => translate(language, key, values),
    [language],
  );

  const formatCurrency = useCallback(
    (value: number, currency = settings.defaultCurrency) =>
      formatMoney(value, currency, locale),
    [locale, settings.defaultCurrency],
  );

  const formatDate = useCallback(
    (value: string | Date) => formatDateForLanguage(value, language),
    [language],
  );

  const formatDateTime = useCallback(
    (value: string | Date) => formatDateTimeForLanguage(value, language),
    [language],
  );

  return useMemo(
    () => ({
      dir,
      formatCurrency,
      formatDate,
      formatDateTime,
      language,
      locale,
      settings,
      t,
    }),
    [dir, formatCurrency, formatDate, formatDateTime, language, locale, settings, t],
  );
}
