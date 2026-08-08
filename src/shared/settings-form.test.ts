import { describe, expect, it } from "vitest";
import { defaultShopSettings, type ShopSettings } from "./settings";
import {
  shopSettingsToFormValues,
  type ShopSettingsFormValues,
} from "./settings-form";

/**
 * Deliberately unlike the defaults in every field, so a value that fails to
 * make it through the mapper shows up as a default rather than blending in.
 */
const storedSettings: ShopSettings = {
  ...defaultShopSettings,
  shopName: "Tripoli Rentals",
  shopPhone: "0910000001",
  shopAddress: "17 Omar Street",
  defaultCurrency: "USD",
  defaultLateFee: 12.5,
  enableClientDeposit: !defaultShopSettings.enableClientDeposit,
  autoPrintReceipt: !defaultShopSettings.autoPrintReceipt,
  dailyClosingEnabled: !defaultShopSettings.dailyClosingEnabled,
  enableSalesCommission: !defaultShopSettings.enableSalesCommission,
  defaultDailyCommissionRate: 7.25,
  printLanguage: "both",
  insuranceWarningDays: 11,
  registrationWarningDays: 12,
  technicalInspectionWarningDays: 13,
  licenseWarningDays: 14,
  backupReminderDays: 15,
  scheduledBackupEnabled: !defaultShopSettings.scheduledBackupEnabled,
  ownerPinEnabled: !defaultShopSettings.ownerPinEnabled,
  contractFooter: "Footer text",
  printHeaderSubtitle: "Header subtitle",
  printTermsAndConditions: "Terms and conditions",
  enableContractWatermark: !defaultShopSettings.enableContractWatermark,
  language: "en",
};

describe("mapping stored settings onto the form", () => {
  it("carries every field across", () => {
    const values = shopSettingsToFormValues(storedSettings);

    expect(values).toEqual<ShopSettingsFormValues>({
      shopName: "Tripoli Rentals",
      shopPhone: "0910000001",
      shopAddress: "17 Omar Street",
      defaultCurrency: "USD",
      defaultLateFee: "12.5",
      enableClientDeposit: storedSettings.enableClientDeposit,
      autoPrintReceipt: storedSettings.autoPrintReceipt,
      dailyClosingEnabled: storedSettings.dailyClosingEnabled,
      enableSalesCommission: storedSettings.enableSalesCommission,
      defaultDailyCommissionRate: "7.25",
      printLanguage: "both",
      insuranceWarningDays: "11",
      registrationWarningDays: "12",
      technicalInspectionWarningDays: "13",
      licenseWarningDays: "14",
      backupReminderDays: "15",
      scheduledBackupEnabled: storedSettings.scheduledBackupEnabled,
      ownerPinEnabled: storedSettings.ownerPinEnabled,
      contractFooter: "Footer text",
      printHeaderSubtitle: "Header subtitle",
      printTermsAndConditions: "Terms and conditions",
      enableContractWatermark: storedSettings.enableContractWatermark,
      language: "en",
    });
  });

  it("keeps a non-default commission configuration", () => {
    const values = shopSettingsToFormValues(storedSettings);

    // The defect this replaces: the first-load hydration omitted both of these,
    // so opening Settings and saving a phone number reset the shop's real
    // commission configuration to the schema defaults.
    expect(values.enableSalesCommission).toBe(storedSettings.enableSalesCommission);
    expect(values.defaultDailyCommissionRate).toBe("7.25");
    expect(values.defaultDailyCommissionRate).not.toBe(
      String(defaultShopSettings.defaultDailyCommissionRate),
    );
  });

  it("leaves no field at its default when the stored value differs", () => {
    const values = shopSettingsToFormValues(storedSettings);
    const defaults = shopSettingsToFormValues(defaultShopSettings);
    const unchanged = (
      Object.keys(values) as Array<keyof ShopSettingsFormValues>
    ).filter((key) => values[key] === defaults[key]);

    // Every field in the fixture is deliberately different, so any overlap means
    // the mapper dropped it and the default showed through.
    expect(unchanged).toEqual([]);
  });

  it("covers exactly the fields the form declares", () => {
    const values = shopSettingsToFormValues(defaultShopSettings);

    expect(Object.keys(values).sort()).toEqual(
      [
        "autoPrintReceipt",
        "backupReminderDays",
        "contractFooter",
        "dailyClosingEnabled",
        "defaultCurrency",
        "defaultDailyCommissionRate",
        "defaultLateFee",
        "enableClientDeposit",
        "enableContractWatermark",
        "enableSalesCommission",
        "insuranceWarningDays",
        "language",
        "licenseWarningDays",
        "ownerPinEnabled",
        "printHeaderSubtitle",
        "printLanguage",
        "printTermsAndConditions",
        "registrationWarningDays",
        "scheduledBackupEnabled",
        "shopAddress",
        "shopName",
        "shopPhone",
        "technicalInspectionWarningDays",
      ].sort(),
    );
  });

  it("is pure — the same input always maps the same way", () => {
    expect(shopSettingsToFormValues(storedSettings)).toEqual(
      shopSettingsToFormValues(storedSettings),
    );
  });
});
