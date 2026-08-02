import { describe, expect, it } from "vitest";
import { defaultShopSettings } from "../../src/shared/settings";
import {
  buildRentalContractHtml,
  resolveContractPrintLanguage,
  type RentalContractDocumentInput,
} from "./rental-contract-document";

function createInput(
  overrides: Partial<RentalContractDocumentInput> = {},
): RentalContractDocumentInput {
  return {
    rental: {
      contractNo: "CNT-2026-0042",
      status: "returned",
      startDatetime: "2026-08-01T08:00:00.000Z",
      expectedReturnDatetime: "2026-08-03T08:00:00.000Z",
      actualReturnDatetime: "2026-08-03T09:00:00.000Z",
      dailyPrice: 120,
      depositRequired: 300,
      depositPaid: 300,
      mileageOut: 12000,
      mileageIn: 12125,
      fuelOut: "Full",
      fuelIn: "Three quarters",
      notesOut: "Small scratch on the left door.",
      notesIn: "Returned clean.",
      damageNotes: "No new damage.",
      extraCharges: 20,
      accessoryCharges: 10,
      discount: 5,
      totalAmount: 265,
      paidAmount: 200,
      remainingAmount: 65,
      customerName: "Ahmed Test Customer",
      customerPhone: "+218910000001",
      customerNationalId: "ID-1001",
      customerLicenseNo: "DL-2002",
      customerLicenseExpiryDate: "2028-01-01",
      customerAddress: "Tripoli",
      vehicleType: "car",
      vehiclePlateNumber: "5-12345",
      vehicleChassisNumber: "VIN-TEST-001",
      vehicleBrand: "Toyota",
      vehicleModel: "Corolla",
      vehicleColor: "White",
      vehicleYear: 2024,
      vehicleInsuranceExpiryDate: "2027-01-01",
      vehicleRegistrationExpiryDate: "2027-02-01",
      vehicleTechnicalInspectionExpiryDate: "2027-03-01",
      returnedByName: "Test Clerk",
    },
    settings: {
      ...defaultShopSettings,
      language: "en",
      printLanguage: "en",
      shopName: "Test Rental Shop",
      shopAddress: "Tripoli, Libya",
      shopPhone: "+218920000002",
      shopLogoDataUrl: "data:image/png;base64,bG9nbw==",
      ownerSignatureDataUrl: "data:image/png;base64,c2lnbmF0dXJl",
      printHeaderSubtitle: "Vehicle Rental Agreement",
      printTermsAndConditions:
        "Return the vehicle on time.\nReport accidents immediately.",
      contractFooter: "Thank you for choosing Test Rental Shop.",
    },
    accessories: [
      {
        name: "Child seat",
        quantity: 1,
        unitCharge: 10,
        returnedQuantity: 1,
        missingQuantity: 0,
        notes: "Blue seat",
      },
    ],
    collateralItems: [
      {
        type: "passport",
        description: "Test passport",
        referenceNumber: "P-3003",
        estimatedValue: null,
        currency: null,
        status: "returned",
        notes: "Returned to customer",
      },
    ],
    issuedByName: "Test Clerk",
    issuedByUsername: "test.clerk",
    printedAt: "2026-08-03T10:00:00.000Z",
    ...overrides,
  };
}

describe("rental contract document", () => {
  it("builds a self-contained A4 document with all configured sections", () => {
    const html = buildRentalContractHtml(createInput());

    expect(html).toContain("@page { size: A4 portrait; margin: 10mm; }");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("Vehicle Rental Agreement");
    expect(html).toContain("Ahmed Test Customer");
    expect(html).toContain("Child seat");
    expect(html).toContain("Test passport");
    expect(html).toContain("Return Acknowledgment");
    expect(html).toContain("Return the vehicle on time.");
    expect(html).toContain("Thank you for choosing Test Rental Shop.");
    expect(html).toContain("Customer Signature");
    expect(html).not.toContain("https://");
  });

  it("renders the motorcycle inspection page and embedded diagram", () => {
    const base = createInput();
    const html = buildRentalContractHtml({
      ...base,
      rental: { ...base.rental, vehicleType: "motorcycle" },
      languageOverride: "both",
    });

    expect(html).toContain('class="page inspection-page"');
    expect(html).toContain("Motorcycle Condition Diagram");
    expect(html).toContain("مخطط حالة الدراجة النارية");
    expect(html).toContain("data:image/");
    expect(html).toContain("The customer must pay all traffic fines");
  });

  it("uses Arabic labels throughout an Arabic print", () => {
    const base = createInput();
    const html = buildRentalContractHtml({
      ...base,
      rental: { ...base.rental, vehicleType: "motorcycle" },
      settings: { ...base.settings, language: "ar", printLanguage: "ar" },
    });

    expect(html).toContain("الملحقات المسلّمة");
    expect(html).toContain("التوقيعات والاعتماد");
    expect(html).toContain("إجمالي رسوم التأجير");
    expect(html).toContain("يقر العميل بأنه قرأ جميع الشروط التفصيلية");
  });

  it("renders 3-column field grid and deduplicates terms for motorcycles", () => {
    const base = createInput();
    const carHtml = buildRentalContractHtml(base);
    expect(carHtml).toContain('class="fields three"');
    expect(carHtml).toContain("Contract Terms");

    const motoHtml = buildRentalContractHtml({
      ...base,
      rental: { ...base.rental, vehicleType: "motorcycle" },
    });
    expect(motoHtml).toContain("Detailed Motorcycle Rental Terms");
    expect(motoHtml).not.toContain("Contract Terms &amp; Conditions");
  });

  it("honors app, explicit, and bilingual print language settings", () => {
    expect(
      resolveContractPrintLanguage({ language: "ar", printLanguage: "app" }),
    ).toBe("ar");
    expect(
      resolveContractPrintLanguage({ language: "ar", printLanguage: "en" }),
    ).toBe("en");
    expect(
      resolveContractPrintLanguage(
        { language: "ar", printLanguage: "ar" },
        "both",
      ),
    ).toBe("both");
  });
});
