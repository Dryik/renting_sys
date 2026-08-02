import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { defaultShopSettings } from "../src/shared/settings";
import {
  buildRentalContractHtml,
  type RentalContractDocumentInput,
} from "./db/rental-contract-document";
import { renderHtmlToA4Pdf } from "./printing/pdf-renderer";

app.on("window-all-closed", () => {
  // Keep the standalone QA process alive between its hidden render windows.
});

function createFixture(
  vehicleType: "car" | "motorcycle",
  language: "ar" | "en",
): RentalContractDocumentInput {
  return {
    rental: {
      contractNo: vehicleType === "car" ? "QA-CAR-001" : "QA-MOTO-001",
      status: "active",
      startDatetime: "2026-08-01T08:00:00.000Z",
      expectedReturnDatetime: "2026-08-04T08:00:00.000Z",
      actualReturnDatetime: null,
      dailyPrice: 125,
      depositRequired: 500,
      depositPaid: 500,
      mileageOut: 18450,
      mileageIn: null,
      fuelOut: language === "ar" ? "ممتلئ" : "Full",
      fuelIn: null,
      notesOut:
        language === "ar"
          ? "خدش بسيط موثق على الجانب الأيسر قبل التسليم."
          : "A small documented scratch is present on the left side before handover.",
      notesIn: null,
      damageNotes: null,
      extraCharges: 0,
      accessoryCharges: 25,
      discount: 10,
      totalAmount: 390,
      paidAmount: 200,
      remainingAmount: 190,
      customerName:
        language === "ar"
          ? "عميل اختبار باسم عربي طويل للتحقق من التفاف النص"
          : "Long Test Customer Name for Text Wrapping",
      customerPhone: "+218 91 000 0001",
      customerNationalId: "QA-ID-123456789",
      customerLicenseNo: "QA-DL-987654321",
      customerLicenseExpiryDate: "2028-01-01",
      customerAddress:
        language === "ar"
          ? "طرابلس، ليبيا - عنوان اختبار طويل للتحقق من التخطيط"
          : "Tripoli, Libya - Long QA Address for Layout Verification",
      vehicleType,
      vehiclePlateNumber: "5-123456",
      vehicleChassisNumber: "QA-VIN-1234567890",
      vehicleBrand: vehicleType === "car" ? "Toyota" : "Honda",
      vehicleModel: vehicleType === "car" ? "Corolla" : "CB500X",
      vehicleColor: language === "ar" ? "أبيض" : "White",
      vehicleYear: 2025,
      vehicleInsuranceExpiryDate: "2027-01-01",
      vehicleRegistrationExpiryDate: "2027-02-01",
      vehicleTechnicalInspectionExpiryDate: "2027-03-01",
      returnedByName: null,
    },
    settings: {
      ...defaultShopSettings,
      language,
      printLanguage: language,
      shopName: language === "ar" ? "مكتب اختبار التأجير" : "QA Rental Shop",
      shopAddress: language === "ar" ? "طرابلس، ليبيا" : "Tripoli, Libya",
      shopPhone: "+218 92 000 0002",
      printHeaderSubtitle:
        language === "ar" ? "عقد تأجير مركبات" : "Vehicle Rental Agreement",
      printTermsAndConditions: "",
      contractFooter:
        language === "ar"
          ? "نسخة اختبار لضمان جودة الطباعة فقط."
          : "Quality-assurance print fixture only.",
    },
    accessories: [
      {
        name: language === "ar" ? "خوذة أو مقعد طفل" : "Helmet or child seat",
        quantity: 1,
        unitCharge: 25,
        returnedQuantity: 0,
        missingQuantity: 0,
        notes: language === "ar" ? "حالة جيدة" : "Good condition",
      },
    ],
    collateralItems: [
      {
        type: "passport",
        description: language === "ar" ? "جواز سفر اختبار" : "QA passport",
        referenceNumber: "QA-PASSPORT-001",
        estimatedValue: null,
        currency: null,
        status: "held",
        notes: null,
      },
    ],
    issuedByName: language === "ar" ? "موظف الاختبار" : "QA Clerk",
    issuedByUsername: "qa.clerk",
    printedAt: "2026-08-02T12:00:00.000Z",
  };
}

app.whenReady().then(async () => {
  const outputDirectory = process.env.RENTAL_PRINT_QA_OUTPUT_DIR
    ? path.resolve(process.env.RENTAL_PRINT_QA_OUTPUT_DIR)
    : path.join(app.getPath("temp"), "rental-print-qa");
  fs.mkdirSync(outputDirectory, { recursive: true });

  try {
    const fixtures = [
      { name: "contract-car-en.pdf", input: createFixture("car", "en") },
      {
        name: "contract-motorcycle-ar.pdf",
        input: createFixture("motorcycle", "ar"),
      },
    ];

    for (const fixture of fixtures) {
      const html = buildRentalContractHtml(fixture.input);
      const pdf = await renderHtmlToA4Pdf(html);
      const outputPath = path.join(outputDirectory, fixture.name);
      fs.writeFileSync(outputPath, pdf);
      console.info(`Generated contract print QA PDF: ${outputPath}`);
    }
  } catch (error) {
    console.error("Contract print QA failed:", error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
