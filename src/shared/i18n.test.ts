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
    expect(translate("ar", "Login")).toBe("تسجيل الدخول");
    expect(translate("ar", "PIN")).toBe("الرمز");
    expect(translate("ar", "Change PIN")).toBe("تغيير الرمز");
    expect(translate("ar", "Void Payment")).toBe("إلغاء الدفعة");
    expect(translate("ar", "Owner PIN approval is required.")).toBe(
      "اعتماد رمز المالك مطلوب.",
    );
    expect(translate("ar", "Activity Log")).toBe("سجل النشاط");
    expect(translate("ar", "Documents & Photos")).toBe("الوثائق والصور");
    expect(translate("ar", "Customer Photo")).toBe("صورة العميل");
    expect(translate("ar", "Vehicle Booklet")).toBe("كتيب المركبة");
    expect(translate("ar", "Mandatory Insurance")).toBe("التأمين الإجباري");
    expect(translate("ar", "Vehicle Circulation License")).toBe("رخصة تجول المركبة");
    expect(translate("ar", "Technical Inspection")).toBe("الفحص الفني");
    expect(translate("ar", "No camera detected")).toBe("لم يتم العثور على كاميرا متصلة");
    expect(translate("ar", "Camera permission denied")).toBe("تم رفض إذن استخدام الكاميرا");
    expect(translate("ar", "Camera is busy or unavailable")).toBe("الكاميرا مشغولة أو غير متاحة");
    expect(translate("ar", "Retry")).toBe("إعادة المحاولة");
    expect(translate("ar", "Upload from device")).toBe("رفع من الجهاز");
    expect(translate("ar", "No identity documents added yet.")).toBe("لا توجد وثائق هوية مضافة بعد.");
    expect(translate("ar", "Supported files: PDF, JPG, PNG, WebP")).toBe(
      "الملفات المدعومة: PDF, JPG, PNG, WebP",
    );
    expect(translate("ar", "The backup includes the database and local documents/photos.")).toBe(
      "تشمل النسخة الاحتياطية قاعدة البيانات والوثائق والصور المحلية.",
    );
    expect(
      translate("ar", "This document will be hidden from the active list but kept in the record."),
    ).toBe("لن تظهر هذه الوثيقة في القائمة النشطة، لكنها ستبقى محفوظة في السجل.");
    expect(translate("ar", "Delete")).toBe("حذف");
    expect(translate("ar", "Delete document?")).toBe("حذف الوثيقة؟");
    expect(translate("ar", "Save the customer first, then add documents and photos here.")).toBe(
      "احفظ بيانات العميل أولا، ثم أضف الوثائق والصور هنا.",
    );
    expect(translate("ar", "Save the vehicle first, then add documents and photos here.")).toBe(
      "احفظ بيانات المركبة أولا، ثم أضف الوثائق والصور هنا.",
    );
    expect(translate("ar", "Permission denied")).toBe(
      "لا تملك صلاحية تنفيذ هذا الإجراء",
    );
    expect(translate("ar", "Missing label")).toBe("Missing label");
  });

  it("translates major audit labels", () => {
    expect(translate("ar", "payment.voided")).toBe("إلغاء دفعة");
    expect(translate("ar", "rental.cancelled")).toBe("إلغاء عقد");
    expect(translate("ar", "backup.restore.completed")).toBe(
      "اكتمال استعادة نسخة",
    );
    expect(translate("ar", "auth.unlock.failed")).toBe("فشل فتح القفل");
    expect(translate("ar", "security.sensitiveApprovalGranted")).toBe(
      "اعتماد إجراء حساس",
    );
    expect(translate("ar", "customer.photo.captured")).toBe("التقاط صورة عميل");
    expect(translate("ar", "vehicle.document.archived")).toBe("حذف وثيقة مركبة");
  });

  it("translates the critical UI optimization labels", () => {
    expect(translate("ar", "Search loans")).toBe("ابحث في السلف");
    expect(translate("ar", "ARAK Rental System")).toBe("نظام أراك للتأجير");
    expect(translate("ar", "Additional Reports")).toBe("تقارير إضافية");
    expect(translate("ar", "Export Excel")).toBe("تصدير Excel");
    expect(translate("ar", "Save Backup File")).toBe("حفظ ملف النسخة الاحتياطية");
    expect(translate("ar", "Discard unsaved changes?")).toBe(
      "هل تريد تجاهل التغييرات غير المحفوظة؟",
    );
  });

  it("isolates interpolated values in Arabic text", () => {
    expect(
      translate("ar", "Trial mode: {{days}} days remaining.", { days: 2 }),
    ).toBe("الوضع التجريبي: متبقي \u20682\u2069 يوم.");
    expect(
      translate("en", "Trial mode: {{days}} days remaining.", { days: 2 }),
    ).toBe("Trial mode: 2 days remaining.");
  });

  it("formats dates and money with the requested locale", () => {
    expect(formatDateForLanguage("2026-05-19T10:00:00.000Z", "en")).toBe(
      "2026-05-19",
    );
    expect(
      formatDateTimeForLanguage("2026-05-19T10:00:00.000Z", "ar"),
    ).toMatch(/2026|٢٠٢٦/);
    expect(formatMoney(1250, "LYD", "ar-LY-u-nu-latn")).toBe("1,250.00 د.ل");
    expect(formatMoney(1250, "LYD", "en-US")).toBe("LYD 1,250.00");
    expect(formatMoney(12.5, "$", "en-US")).toBe("$12.50");
  });

  it("escapes dynamic printable HTML text", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });
});
