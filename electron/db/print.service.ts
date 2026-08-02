import { app, BrowserWindow, dialog } from "electron";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";
import {
  accessories,
  customers,
  payments,
  rentalAccessories,
  rentalCollateralItems,
  rentals,
  users,
  vehicleSales,
  vehicles,
} from "./schema";
import { getShopSettings } from "./settings.service";
import { escapeHtml } from "../../src/shared/html";
import { translate } from "../../src/shared/i18n";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  type LanguageCode,
} from "../../src/shared/language";
import { formatMoney } from "../../src/shared/money";
import { formatPaymentMethod, formatPaymentType } from "../../src/shared/payments";
import type { PrintDocumentResult } from "../../src/shared/printing";
import { formatVehicleType } from "../../src/shared/vehicles";
import { getCurrentUserForService } from "./auth.service";
import {
  buildRentalContractHtml,
  type ContractPrintLanguage,
} from "./rental-contract-document";
import { renderHtmlToA4Pdf } from "../printing/pdf-renderer";

// Helper to format dates for printable outputs
function formatPrintDate(isoString: string, language: LanguageCode): string {
  try {
    return new Intl.DateTimeFormat(getLocaleForLanguage(language), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function formatPrintMoney(
  amount: number,
  currency: string,
  language: LanguageCode,
): string {
  return formatMoney(amount, currency, getLocaleForLanguage(language));
}

function ltrHtml(value: string | number): string {
  return `<span class="ltr-value" dir="ltr">${escapeHtml(String(value))}</span>`;
}

function optionalLtrHtml(
  value: string | number | null | undefined,
  fallback: string,
): string {
  return value === null || value === undefined || value === ""
    ? escapeHtml(fallback)
    : ltrHtml(value);
}

const printCallbackTimeoutMs = 120_000;
const spoolerGracePeriodMs = 5_000;

// Generate one canonical PDF first, then either save or print those same pages.
async function printHTML(
  htmlContent: string,
  suggestedName: string,
  printToPDF: boolean,
  documentType: "rental_contract" | "payment_receipt" | "vehicle_sale_receipt",
): Promise<PrintDocumentResult> {
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderHtmlToA4Pdf(htmlContent);
  } catch (error) {
    logPrintEvent(documentType, "render_failed", getErrorText(error));
    throw error;
  }

  if (printToPDF) {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: "Export PDF",
        defaultPath: suggestedName,
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });

      if (!filePath) {
        logPrintEvent(documentType, "save_cancelled");
        return { status: "cancelled" };
      }

      fs.writeFileSync(filePath, pdfBuffer);
      logPrintEvent(documentType, "saved");
      return { status: "saved", filePath };
    } catch (error) {
      logPrintEvent(documentType, "save_failed", getErrorText(error));
      throw error;
    }
  }

  return printPdfBuffer(pdfBuffer, documentType);
}

async function printPdfBuffer(
  pdfBuffer: Buffer,
  documentType: "rental_contract" | "payment_receipt" | "vehicle_sale_receipt",
): Promise<PrintDocumentResult> {
  const tempDirectory = path.join(
    fs.realpathSync.native(app.getPath("temp")),
    "arak-rental-print",
  );
  const tempPdfPath = path.join(tempDirectory, `${randomUUID()}.pdf`);
  fs.mkdirSync(tempDirectory, { recursive: true });
  fs.writeFileSync(tempPdfPath, pdfBuffer);

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
    },
  });

  try {
    await printWindow.loadFile(tempPdfPath);
    const outcome = await new Promise<{ success: boolean; reason: string }>((resolve) => {
      let settled = false;
      const finish = (success: boolean, reason: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ success, reason });
      };
      const timeout = setTimeout(
        () => finish(false, "Printer did not respond before the timeout."),
        printCallbackTimeoutMs,
      );

      printWindow.webContents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: "A4",
        },
        (success, failureReason) => finish(success, failureReason),
      );
    });

    if (!outcome.success) {
      const cancelled = /cancel/i.test(outcome.reason);
      logPrintEvent(
        documentType,
        cancelled ? "print_cancelled" : "print_failed",
        outcome.reason,
      );
      if (cancelled) {
        return { status: "cancelled" };
      }
      throw new Error(outcome.reason || "Print job failed.");
    }

    logPrintEvent(documentType, "printed");
    return { status: "printed" };
  } finally {
    await new Promise<void>((resolve) => setTimeout(resolve, spoolerGracePeriodMs));
    if (!printWindow.isDestroyed()) {
      try {
        await printWindow.loadURL("about:blank");
      } catch {
        // The print window may already be closing during app shutdown.
      }
      printWindow.destroy();
    }
    await removeTemporaryPrintFile(tempPdfPath, documentType);
  }
}

async function removeTemporaryPrintFile(
  filePath: string,
  documentType: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.promises.rm(filePath, { force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        logPrintEvent(documentType, "temp_cleanup_failed", getErrorText(error));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 50));
    }
  }
}

function logPrintEvent(
  documentType: string,
  outcome: string,
  reason?: string,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    documentType,
    outcome,
    reason,
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    os: `${process.platform} ${os.release()}`,
    packaged: app.isPackaged,
    pageSize: "A4",
  };
  const line = JSON.stringify(entry);
  console.info("Print event:", line);
  try {
    const logsDirectory = app.getPath("logs");
    fs.mkdirSync(logsDirectory, { recursive: true });
    fs.appendFileSync(path.join(logsDirectory, "printing.jsonl"), `${line}\n`, "utf8");
  } catch (error) {
    console.error("Failed to write print diagnostics:", error);
  }
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function printRentalContract(
  rentalId: number,
  printToPDF: boolean,
  languageOverride?: ContractPrintLanguage,
): Promise<PrintDocumentResult> {
  const db = getDatabase();
  const settings = getShopSettings();
  const activatedUser = alias(users, "activated_user");
  const createdUser = alias(users, "created_user");
  const returnedUser = alias(users, "returned_user");

  const rental = db
    .select({
      id: rentals.id,
      contractNo: rentals.contractNo,
      status: rentals.status,
      startDatetime: rentals.startDatetime,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
      actualReturnDatetime: rentals.actualReturnDatetime,
      dailyPrice: rentals.dailyPrice,
      depositRequired: rentals.depositRequired,
      depositPaid: rentals.depositPaid,
      mileageOut: rentals.mileageOut,
      mileageIn: rentals.mileageIn,
      fuelOut: rentals.fuelOut,
      fuelIn: rentals.fuelIn,
      notesOut: rentals.notesOut,
      notesIn: rentals.notesIn,
      damageNotes: rentals.damageNotes,
      extraCharges: rentals.extraCharges,
      accessoryCharges: rentals.accessoryCharges,
      discount: rentals.discount,
      totalAmount: rentals.totalAmount,
      paidAmount: rentals.paidAmount,
      remainingAmount: rentals.remainingAmount,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerNationalId: customers.nationalId,
      customerLicenseNo: customers.driverLicenseNo,
      customerLicenseExpiryDate: customers.licenseExpiryDate,
      customerAddress: customers.address,
      vehicleType: vehicles.type,
      vehiclePlateNumber: vehicles.plateNumber,
      vehicleChassisNumber: vehicles.chassisNumber,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleColor: vehicles.color,
      vehicleYear: vehicles.year,
      vehicleInsuranceExpiryDate: vehicles.insuranceExpiryDate,
      vehicleRegistrationExpiryDate: vehicles.registrationExpiryDate,
      vehicleTechnicalInspectionExpiryDate: vehicles.technicalInspectionExpiryDate,
      activatedByName: activatedUser.fullName,
      activatedByUsername: activatedUser.username,
      createdByName: createdUser.fullName,
      createdByUsername: createdUser.username,
      returnedByName: returnedUser.fullName,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .leftJoin(activatedUser, eq(rentals.activatedByUserId, activatedUser.id))
    .leftJoin(createdUser, eq(rentals.createdByUserId, createdUser.id))
    .leftJoin(returnedUser, eq(rentals.returnedByUserId, returnedUser.id))
    .where(eq(rentals.id, rentalId))
    .get();

  if (!rental) {
    throw new Error("Rental not found.");
  }

  const assignedAccessories = db
    .select({
      id: rentalAccessories.id,
      name: accessories.name,
      quantity: rentalAccessories.quantity,
      unitCharge: rentalAccessories.unitCharge,
      returnedQuantity: rentalAccessories.returnedQuantity,
      missingQuantity: rentalAccessories.missingQuantity,
      notes: rentalAccessories.notes,
    })
    .from(rentalAccessories)
    .innerJoin(accessories, eq(rentalAccessories.accessoryId, accessories.id))
    .where(eq(rentalAccessories.rentalId, rentalId))
    .all();
  const collateralItems = db
    .select({
      id: rentalCollateralItems.id,
      type: rentalCollateralItems.type,
      description: rentalCollateralItems.description,
      referenceNumber: rentalCollateralItems.referenceNumber,
      estimatedValue: rentalCollateralItems.estimatedValue,
      currency: rentalCollateralItems.currency,
      status: rentalCollateralItems.status,
      notes: rentalCollateralItems.notes,
    })
    .from(rentalCollateralItems)
    .where(eq(rentalCollateralItems.rentalId, rentalId))
    .all();

  const currentUser = getCurrentUserForService();
  const issuedByName =
    rental.activatedByName ?? rental.createdByName ?? currentUser?.fullName ?? null;
  const issuedByUsername =
    rental.activatedByUsername ??
    rental.createdByUsername ??
    currentUser?.username ??
    null;
  const html = buildRentalContractHtml({
    rental,
    settings,
    accessories: assignedAccessories,
    collateralItems,
    issuedByName,
    issuedByUsername,
    printedAt: new Date().toISOString(),
    languageOverride,
  });

  return printHTML(
    html,
    `contract_${rental.contractNo}.pdf`,
    printToPDF,
    "rental_contract",
  );
}

export async function printPaymentReceipt(
  paymentId: number,
  printToPDF: boolean,
  languageOverride?: LanguageCode | "both",
): Promise<void> {
  const db = getDatabase();
  const settings = getShopSettings();

  const paymentInfo = db
    .select({
      id: payments.id,
      receiptNo: payments.receiptNo,
      amount: payments.amount,
      type: payments.type,
      method: payments.method,
      status: payments.status,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
      paymentDate: payments.paymentDate,
      notes: payments.notes,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(payments.id, paymentId))
    .get();

  if (!paymentInfo) {
    throw new Error("Payment record not found.");
  }

  const currency = settings.defaultCurrency;
  const language = resolvePrintLanguage(settings.language, languageOverride);
  const direction = getDirectionForLanguage(language);
  const alignEnd = direction === "rtl" ? "left" : "right";
  const tr = (key: string) => translate(language, key);
  const receiptNo = paymentInfo.receiptNo ?? `REC-${String(paymentInfo.id).padStart(6, "0")}`;

  const html = `
    <!DOCTYPE html>
    <html lang="${escapeHtml(language)}" dir="${escapeHtml(direction)}">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(tr("Payment Receipt"))} - ${escapeHtml(receiptNo)}</title>
      <style>
        body {
          font-family: Cairo, "Noto Sans Arabic", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
          color: #0F2B3D;
          line-height: 1.5;
          margin: 0;
          padding: 20px;
          font-size: 14px;
          direction: ${direction};
          text-align: ${direction === "rtl" ? "right" : "left"};
        }
        .receipt-card {
          max-width: 600px;
          margin: 0 auto;
          border: 1px solid #B8E6FE;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 1px 3px rgba(15,43,61,0.08);
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 3px solid #1D97D7;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .shop-info h1 {
          font-size: 20px;
          margin: 0 0 5px 0;
          font-weight: 700;
        }
        .shop-info p {
          margin: 2px 0;
          color: #435b6a;
          font-size: 12px;
        }
        .receipt-title {
          text-align: ${alignEnd};
        }
        .receipt-title h2 {
          font-size: 18px;
          margin: 0 0 5px 0;
          color: #0F2B3D;
        }
        .receipt-title p {
          margin: 2px 0;
          font-size: 14px;
          font-weight: 600;
          color: #1D97D7;
        }
        .data-row {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #E8F8FF;
          padding: 10px 0;
        }
        .data-row .label {
          font-weight: 600;
          color: #435b6a;
        }
        .data-row .value {
          color: #0F2B3D;
          text-align: ${alignEnd};
        }
        .ltr-value {
          direction: ltr;
          unicode-bidi: isolate;
          display: inline-block;
          text-align: left;
        }
        .amount-row {
          display: flex;
          justify-content: space-between;
          background-color: #F5FDFF;
          border: 1px solid #B8E6FE;
          padding: 12px 15px;
          border-radius: 6px;
          margin-top: 15px;
        }
        .amount-row .label {
          font-weight: 700;
          color: #0F2B3D;
          font-size: 16px;
        }
        .amount-row .value {
          font-weight: 800;
          color: #1D97D7;
          font-size: 18px;
        }
        .notes-section {
          margin-top: 20px;
        }
        .notes-title {
          font-weight: 600;
          color: #435b6a;
          margin-bottom: 5px;
        }
        .notes-content {
          font-style: italic;
          background-color: #F5FDFF;
          border: 1px solid #d8eef8;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #435b6a;
        }
        .void-banner {
          margin: 16px 0;
          border: 2px solid #c53b37;
          color: #c53b37;
          font-weight: 800;
          text-align: center;
          padding: 8px;
          border-radius: 6px;
        }
        @media print {
          body {
            padding: 0;
          }
          .receipt-card {
            border: none;
            box-shadow: none;
            padding: 0;
            max-width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt-card">
        <div class="header">
          <div class="shop-info">
            <h1>${escapeHtml(settings.shopName)}</h1>
            <p>${escapeHtml(settings.shopAddress)}</p>
            <p>${escapeHtml(tr("Phone"))}: ${ltrHtml(settings.shopPhone)}</p>
          </div>
          <div class="receipt-title">
            <h2>${escapeHtml(tr("PAYMENT RECEIPT"))}</h2>
            <p>${ltrHtml(receiptNo)}</p>
          </div>
        </div>

        ${
          paymentInfo.status === "voided"
            ? `<div class="void-banner">${escapeHtml(tr("VOIDED"))}</div>`
            : ""
        }

        <div class="data-row">
          <span class="label">${escapeHtml(tr("Contract Number"))}</span>
          <span class="value font-semibold">${ltrHtml(paymentInfo.contractNo)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Customer Name"))}</span>
          <span class="value">${escapeHtml(paymentInfo.customerName)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Vehicle Plate Number"))}</span>
          <span class="value">${ltrHtml(paymentInfo.vehiclePlateNumber)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Payment Date"))}</span>
          <span class="value">${escapeHtml(formatPrintDate(paymentInfo.paymentDate, language))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Payment Type"))}</span>
          <span class="value">${escapeHtml(formatPaymentType(paymentInfo.type, language))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Payment Method"))}</span>
          <span class="value">${escapeHtml(formatPaymentMethod(paymentInfo.method, language))}</span>
        </div>

        <div class="amount-row">
          <span class="label">${escapeHtml(paymentInfo.type === "refund" ? tr("Refund") : tr("Amount Paid"))}</span>
          <span class="value">${ltrHtml(formatPrintMoney(paymentInfo.amount, currency, language))}</span>
        </div>

        ${
          paymentInfo.status === "voided"
            ? `
          <div class="notes-section">
            <div class="notes-title">${escapeHtml(tr("Void Reason"))}:</div>
            <div class="notes-content">${escapeHtml(paymentInfo.voidReason ?? tr("N/A"))}</div>
          </div>
        `
            : ""
        }

        ${
          paymentInfo.notes
            ? `
          <div class="notes-section">
            <div class="notes-title">${escapeHtml(tr("Payment Notes"))}:</div>
            <div class="notes-content">${escapeHtml(paymentInfo.notes)}</div>
          </div>
        `
            : ""
        }

        <div class="footer">
          <p>${escapeHtml(tr("Thank you for your business!"))}</p>
          <p style="font-size: 10px; margin-top: 15px; color: #94a3b8;">${escapeHtml(tr("Receipt generated automatically on"))} ${escapeHtml(formatPrintDate(new Date().toISOString(), language))}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await printHTML(
    html,
    `receipt_${receiptNo}.pdf`,
    printToPDF,
    "payment_receipt",
  );
}

export async function printVehicleSaleReceipt(
  saleId: number,
  printToPDF: boolean,
  languageOverride?: LanguageCode | "both",
): Promise<void> {
  const db = getDatabase();
  const settings = getShopSettings();

  const sale = db
    .select({
      id: vehicleSales.id,
      saleNo: vehicleSales.saleNo,
      buyerName: vehicleSales.buyerName,
      buyerPhone: vehicleSales.buyerPhone,
      buyerIdNumber: vehicleSales.buyerIdNumber,
      saleDate: vehicleSales.saleDate,
      salePrice: vehicleSales.salePrice,
      paymentMethod: vehicleSales.paymentMethod,
      status: vehicleSales.status,
      voidedAt: vehicleSales.voidedAt,
      voidReason: vehicleSales.voidReason,
      notes: vehicleSales.notes,
      vehicleType: vehicles.type,
      vehiclePlateNumber: vehicles.plateNumber,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleColor: vehicles.color,
      vehicleYear: vehicles.year,
      vehicleMileage: vehicles.mileage,
    })
    .from(vehicleSales)
    .innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id))
    .where(eq(vehicleSales.id, saleId))
    .get();

  if (!sale) {
    throw new Error("Vehicle sale was not found.");
  }

  const currency = settings.defaultCurrency;
  const language = resolvePrintLanguage(settings.language, languageOverride);
  const direction = getDirectionForLanguage(language);
  const alignEnd = direction === "rtl" ? "left" : "right";
  const tr = (key: string) => translate(language, key);

  const html = `
    <!DOCTYPE html>
    <html lang="${escapeHtml(language)}" dir="${escapeHtml(direction)}">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(tr("Vehicle Sale Receipt"))} - ${escapeHtml(sale.saleNo)}</title>
      <style>
        body {
          font-family: Cairo, "Noto Sans Arabic", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
          color: #0F2B3D;
          line-height: 1.5;
          margin: 0;
          padding: 20px;
          font-size: 14px;
          direction: ${direction};
          text-align: ${direction === "rtl" ? "right" : "left"};
        }
        .receipt-card {
          max-width: 720px;
          margin: 0 auto;
          border: 1px solid #B8E6FE;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 1px 3px rgba(15,43,61,0.08);
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 3px solid #1D97D7;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .shop-info h1 {
          font-size: 20px;
          margin: 0 0 5px 0;
          font-weight: 700;
        }
        .shop-info p {
          margin: 2px 0;
          color: #435b6a;
          font-size: 12px;
        }
        .receipt-title {
          text-align: ${alignEnd};
        }
        .receipt-title h2 {
          font-size: 18px;
          margin: 0 0 5px 0;
          color: #0F2B3D;
        }
        .receipt-title p {
          margin: 2px 0;
          font-size: 14px;
          font-weight: 600;
          color: #1D97D7;
        }
        .section-title {
          margin-top: 18px;
          border-bottom: 1px solid #E8F8FF;
          padding-bottom: 6px;
          font-size: 13px;
          font-weight: 800;
          color: #435b6a;
          text-transform: uppercase;
        }
        .data-row {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 1px solid #E8F8FF;
          padding: 10px 0;
        }
        .data-row .label {
          font-weight: 600;
          color: #435b6a;
        }
        .data-row .value {
          color: #0F2B3D;
          text-align: ${alignEnd};
        }
        .ltr-value {
          direction: ltr;
          unicode-bidi: isolate;
          display: inline-block;
          text-align: left;
        }
        .amount-row {
          display: flex;
          justify-content: space-between;
          background-color: #F5FDFF;
          border: 1px solid #B8E6FE;
          padding: 12px 15px;
          border-radius: 6px;
          margin-top: 15px;
        }
        .amount-row .label {
          font-weight: 700;
          color: #0F2B3D;
          font-size: 16px;
        }
        .amount-row .value {
          font-weight: 800;
          color: #1D97D7;
          font-size: 18px;
        }
        .notice {
          margin-top: 18px;
          border: 1px solid #d8eef8;
          border-radius: 6px;
          background: #F5FDFF;
          color: #435b6a;
          padding: 10px 12px;
          font-size: 12px;
        }
        .notes-section {
          margin-top: 16px;
        }
        .notes-title {
          font-weight: 600;
          color: #435b6a;
          margin-bottom: 5px;
        }
        .notes-content {
          font-style: italic;
          background-color: #F5FDFF;
          border: 1px solid #d8eef8;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
        }
        .void-banner {
          margin: 16px 0;
          border: 2px solid #c53b37;
          color: #c53b37;
          font-weight: 800;
          text-align: center;
          padding: 8px;
          border-radius: 6px;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 40px;
        }
        .signature-box {
          min-height: 58px;
          border-top: 1px solid #94a3b8;
          padding-top: 8px;
          color: #435b6a;
          font-size: 12px;
        }
        @media print {
          body {
            padding: 0;
          }
          .receipt-card {
            border: none;
            box-shadow: none;
            padding: 0;
            max-width: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt-card">
        <div class="header">
          <div class="shop-info">
            <h1>${escapeHtml(settings.shopName)}</h1>
            <p>${escapeHtml(settings.shopAddress)}</p>
            <p>${escapeHtml(tr("Phone"))}: ${ltrHtml(settings.shopPhone)}</p>
          </div>
          <div class="receipt-title">
            <h2>${escapeHtml(tr("VEHICLE SALE RECEIPT"))}</h2>
            <p>${ltrHtml(sale.saleNo)}</p>
          </div>
        </div>

        ${
          sale.status === "voided"
            ? `<div class="void-banner">${escapeHtml(tr("VOIDED"))}</div>`
            : ""
        }

        <div class="section-title">${escapeHtml(tr("Buyer Details"))}</div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Buyer Name"))}</span>
          <span class="value">${escapeHtml(sale.buyerName)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Buyer Phone"))}</span>
          <span class="value">${optionalLtrHtml(sale.buyerPhone, tr("N/A"))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Buyer ID Number"))}</span>
          <span class="value">${optionalLtrHtml(sale.buyerIdNumber, tr("N/A"))}</span>
        </div>

        <div class="section-title">${escapeHtml(tr("Vehicle Details"))}</div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Vehicle Plate Number"))}</span>
          <span class="value">${ltrHtml(sale.vehiclePlateNumber)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Vehicle"))}</span>
          <span class="value">${escapeHtml(`${sale.vehicleBrand} ${sale.vehicleModel}`)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Type"))}</span>
          <span class="value">${escapeHtml(formatVehicleType(sale.vehicleType, language))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Color / Year"))}</span>
          <span class="value">${escapeHtml([sale.vehicleColor, sale.vehicleYear].filter(Boolean).join(" / ") || tr("N/A"))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Mileage"))}</span>
          <span class="value">${optionalLtrHtml(sale.vehicleMileage, tr("N/A"))}</span>
        </div>

        <div class="section-title">${escapeHtml(tr("Sale Details"))}</div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Sale Date"))}</span>
          <span class="value">${escapeHtml(formatPrintDate(sale.saleDate, language))}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Payment Method"))}</span>
          <span class="value">${escapeHtml(formatPaymentMethod(sale.paymentMethod, language))}</span>
        </div>
        <div class="amount-row">
          <span class="label">${escapeHtml(tr("Sale Price"))}</span>
          <span class="value">${ltrHtml(formatPrintMoney(sale.salePrice, currency, language))}</span>
        </div>

        ${
          sale.status === "voided"
            ? `
          <div class="notes-section">
            <div class="notes-title">${escapeHtml(tr("Void Reason"))}:</div>
            <div class="notes-content">${escapeHtml(sale.voidReason ?? tr("N/A"))}</div>
          </div>
        `
            : ""
        }

        ${
          sale.notes
            ? `
          <div class="notes-section">
            <div class="notes-title">${escapeHtml(tr("Notes"))}:</div>
            <div class="notes-content">${escapeHtml(sale.notes)}</div>
          </div>
        `
            : ""
        }

        <div class="notice">
          ${escapeHtml(tr("This receipt records a local vehicle sale only. Official ownership transfer and registration paperwork must be completed separately."))}
        </div>

        <div class="signatures">
          <div class="signature-box">${escapeHtml(tr("Buyer Signature"))}</div>
          <div class="signature-box">${escapeHtml(tr("Authorized Shop Representative"))}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  await printHTML(
    html,
    `vehicle_sale_${sale.saleNo}.pdf`,
    printToPDF,
    "vehicle_sale_receipt",
  );
}

function resolvePrintLanguage(
  settingsLanguage: LanguageCode,
  languageOverride?: LanguageCode | "both",
): LanguageCode {
  if (languageOverride === "ar" || languageOverride === "en") {
    return languageOverride;
  }

  return settingsLanguage;
}
