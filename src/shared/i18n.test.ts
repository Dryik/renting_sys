import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html";
import {
  formatDateForLanguage,
  formatDateTimeForLanguage,
  translate,
} from "./i18n";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  normalizeLanguage,
} from "./language";
import { formatMoney } from "./money";
import { defaultShopSettings } from "./settings";

describe("language and formatting helpers", () => {
  it("defaults new installs to Arabic with Libyan currency", () => {
    expect(defaultShopSettings.language).toBe("ar");
    expect(defaultShopSettings.defaultCurrency).toBe("LYD");
  });

  it("normalizes unsupported language values to Arabic", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("fr")).toBe("ar");
    expect(normalizeLanguage(null)).toBe("ar");
  });

  it("returns the expected locale and text direction", () => {
    expect(getDirectionForLanguage("ar")).toBe("rtl");
    expect(getDirectionForLanguage("en")).toBe("ltr");
    expect(getLocaleForLanguage("ar")).toBe("ar-LY-u-nu-latn");
    expect(getLocaleForLanguage("en")).toBe("en-US");
  });

  it("translates known UI labels and preserves English fallback", () => {
    expect(translate("ar", "Dashboard")).toBe("لوحة العمل");
    expect(translate("en", "Dashboard")).toBe("Dashboard");
    expect(translate("ar", "Missing label")).toBe("Missing label");
  });

  it("formats dates and money with the requested locale", () => {
    expect(formatDateForLanguage("2026-05-19T10:00:00.000Z", "en")).toContain(
      "2026",
    );
    expect(
      formatDateTimeForLanguage("2026-05-19T10:00:00.000Z", "ar"),
    ).toMatch(/2026|٢٠٢٦/);
    expect(formatMoney(1250, "LYD", "ar-LY-u-nu-latn")).toBe("1,250.00 LYD");
    expect(formatMoney(12.5, "$", "en-US")).toBe("$12.50");
  });

  it("escapes dynamic printable HTML text", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });
});
