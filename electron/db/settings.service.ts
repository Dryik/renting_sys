import { getDatabase } from "./database";
import { appSettings } from "./schema";
import {
  defaultShopSettings,
  type ShopSettings,
} from "../../src/shared/settings";
import { normalizeLanguage } from "../../src/shared/language";

export function getShopSettings(): ShopSettings {
  const db = getDatabase();
  const rows = db.select().from(appSettings).all();
  const settingsMap = new Map(rows.map((row) => [row.key, row.value]));

  return {
    shopName: settingsMap.get("shop_name") ?? defaultShopSettings.shopName,
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
    contractFooter:
      settingsMap.get("contract_footer") ?? defaultShopSettings.contractFooter,
    language: normalizeLanguage(
      settingsMap.get("app_language") ?? defaultShopSettings.language,
    ),
  };
}

export function saveShopSettings(settings: Partial<ShopSettings>): ShopSettings {
  const db = getDatabase();
  const current = getShopSettings();
  const updated = { ...current, ...settings };

  const entries = [
    { key: "shop_name", value: updated.shopName },
    { key: "shop_phone", value: updated.shopPhone },
    { key: "shop_address", value: updated.shopAddress },
    { key: "default_currency", value: updated.defaultCurrency },
    { key: "default_late_fee", value: String(updated.defaultLateFee) },
    { key: "enable_client_deposit", value: String(updated.enableClientDeposit) },
    { key: "contract_footer", value: updated.contractFooter },
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
  });

  return updated;
}
