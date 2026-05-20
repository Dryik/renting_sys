import { BrowserWindow, dialog } from "electron";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { getDatabase } from "./database";
import { customers, payments, rentals, vehicles } from "./schema";
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
import { formatRentalStatus } from "../../src/shared/rentals";

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

// Function to print or save HTML content via Electron
async function printHTML(
  htmlContent: string,
  suggestedName: string,
  printToPDF: boolean,
): Promise<void> {
  const tempWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  await tempWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));

  if (printToPDF) {
    try {
      const pdfBuffer = await tempWindow.webContents.printToPDF({
        margins: {
          marginType: "default",
        },
        printBackground: true,
        pageSize: "A4",
      });

      const { filePath } = await dialog.showSaveDialog({
        title: "Export PDF",
        defaultPath: suggestedName,
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });

      if (filePath) {
        fs.writeFileSync(filePath, pdfBuffer);
      }
    } finally {
      tempWindow.destroy();
    }
  } else {
    // Open system print dialog
    tempWindow.webContents.print(
      {
        silent: false,
        printBackground: true,
      },
      () => {
        tempWindow.destroy();
      },
    );
  }
}

export async function printRentalContract(
  rentalId: number,
  printToPDF: boolean,
): Promise<void> {
  const db = getDatabase();
  const settings = getShopSettings();

  const rental = db
    .select({
      id: rentals.id,
      contractNo: rentals.contractNo,
      status: rentals.status,
      startDatetime: rentals.startDatetime,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
      dailyPrice: rentals.dailyPrice,
      depositRequired: rentals.depositRequired,
      depositPaid: rentals.depositPaid,
      mileageOut: rentals.mileageOut,
      fuelOut: rentals.fuelOut,
      notesOut: rentals.notesOut,
      totalAmount: rentals.totalAmount,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerNationalId: customers.nationalId,
      customerLicenseNo: customers.driverLicenseNo,
      customerAddress: customers.address,
      vehiclePlateNumber: vehicles.plateNumber,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleColor: vehicles.color,
      vehicleYear: vehicles.year,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.id, rentalId))
    .get();

  if (!rental) {
    throw new Error("Rental not found.");
  }

  const currency = settings.defaultCurrency;
  const language = settings.language;
  const direction = getDirectionForLanguage(language);
  const alignEnd = direction === "rtl" ? "left" : "right";
  const tr = (key: string) => translate(language, key);

  const html = `
    <!DOCTYPE html>
    <html lang="${escapeHtml(language)}" dir="${escapeHtml(direction)}">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(tr("Rental Contract"))} - ${escapeHtml(rental.contractNo)}</title>
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
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 3px solid #1D97D7;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }
        .shop-info h1 {
          font-size: 24px;
          margin: 0 0 5px 0;
          font-weight: 700;
        }
        .shop-info p {
          margin: 2px 0;
          color: #435b6a;
        }
        .contract-title {
          text-align: ${alignEnd};
        }
        .contract-title h2 {
          font-size: 20px;
          margin: 0 0 5px 0;
          color: #0F2B3D;
        }
        .contract-title p {
          margin: 2px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1D97D7;
        }
        .section-title {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #B8E6FE;
          padding-bottom: 4px;
          margin: 20px 0 10px 0;
          color: #0F2B3D;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .data-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .data-list li {
          display: flex;
          margin-bottom: 6px;
        }
        .data-list .label {
          width: 140px;
          font-weight: 600;
          color: #435b6a;
          flex-shrink: 0;
        }
        .data-list .value {
          color: #0F2B3D;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          border: 1px solid #d8eef8;
          padding: 8px 12px;
          text-align: ${direction === "rtl" ? "right" : "left"};
        }
        th {
          background-color: #F5FDFF;
          font-weight: 600;
          color: #435b6a;
        }
        .notes-box {
          border: 1px solid #d8eef8;
          background-color: #F5FDFF;
          padding: 10px;
          border-radius: 4px;
          margin-top: 10px;
          min-height: 40px;
          font-style: italic;
        }
        .footer-text {
          margin-top: 30px;
          font-size: 11px;
          color: #435b6a;
          text-align: justify;
          border-top: 1px solid #d8eef8;
          padding-top: 10px;
        }
        .signatures {
          margin-top: 50px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        .signature-box {
          border-top: 1px solid #94a3b8;
          text-align: center;
          padding-top: 8px;
          margin-top: 40px;
          font-weight: 600;
          color: #435b6a;
        }
        @media print {
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="shop-info">
          <h1>${escapeHtml(settings.shopName)}</h1>
          <p>${escapeHtml(settings.shopAddress)}</p>
          <p>${escapeHtml(tr("Phone"))}: ${escapeHtml(settings.shopPhone)}</p>
        </div>
        <div class="contract-title">
          <h2>${escapeHtml(tr("RENTAL CONTRACT"))}</h2>
          <p>${escapeHtml(rental.contractNo)}</p>
          <p style="font-size: 12px; color: #64748b; font-weight: normal; margin-top: 5px;">
            ${escapeHtml(tr("Status"))}: ${escapeHtml(formatRentalStatus(rental.status, language))}
          </p>
        </div>
      </div>

      <div class="grid">
        <div>
          <div class="section-title">${escapeHtml(tr("Customer Details"))}</div>
          <ul class="data-list">
            <li><span class="label">${escapeHtml(tr("Full Name"))}:</span><span class="value">${escapeHtml(rental.customerName)}</span></li>
            <li><span class="label">${escapeHtml(tr("Phone"))}:</span><span class="value">${escapeHtml(rental.customerPhone)}</span></li>
            <li><span class="label">${escapeHtml(tr("National ID/Pass"))}:</span><span class="value">${escapeHtml(rental.customerNationalId ?? tr("N/A"))}</span></li>
            <li><span class="label">${escapeHtml(tr("Driver License"))}:</span><span class="value">${escapeHtml(rental.customerLicenseNo ?? tr("N/A"))}</span></li>
            <li><span class="label">${escapeHtml(tr("Address"))}:</span><span class="value">${escapeHtml(rental.customerAddress ?? tr("N/A"))}</span></li>
          </ul>
        </div>
        <div>
          <div class="section-title">${escapeHtml(tr("Vehicle Details"))}</div>
          <ul class="data-list">
            <li><span class="label">${escapeHtml(tr("Brand / Model"))}:</span><span class="value">${escapeHtml(`${rental.vehicleBrand} ${rental.vehicleModel}`)}</span></li>
            <li><span class="label">${escapeHtml(tr("Plate Number"))}:</span><span class="value">${escapeHtml(rental.vehiclePlateNumber)}</span></li>
            <li><span class="label">${escapeHtml(tr("Color / Year"))}:</span><span class="value">${escapeHtml(`${rental.vehicleColor ?? tr("N/A")} / ${rental.vehicleYear ?? tr("N/A")}`)}</span></li>
            <li><span class="label">${escapeHtml(tr("Mileage Out"))}:</span><span class="value">${escapeHtml(rental.mileageOut !== null ? `${rental.mileageOut} ${tr("km")}` : tr("N/A"))}</span></li>
            <li><span class="label">${escapeHtml(tr("Fuel Level Out"))}:</span><span class="value">${escapeHtml(rental.fuelOut ?? tr("N/A"))}</span></li>
          </ul>
        </div>
      </div>

      <div class="section-title">${escapeHtml(tr("Rental Terms & Pricing"))}</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(tr("Start Date & Time"))}</th>
            <th>${escapeHtml(tr("Expected Return Date & Time"))}</th>
            <th>${escapeHtml(tr("Daily Rate"))}</th>
            <th>${escapeHtml(tr("Deposit Paid / Required"))}</th>
            <th>${escapeHtml(tr("Estimated Rental Charge"))}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(formatPrintDate(rental.startDatetime, language))}</td>
            <td>${escapeHtml(formatPrintDate(rental.expectedReturnDatetime, language))}</td>
            <td>${escapeHtml(formatPrintMoney(rental.dailyPrice, currency, language))}</td>
            <td>${escapeHtml(`${formatPrintMoney(rental.depositPaid, currency, language)} / ${formatPrintMoney(rental.depositRequired, currency, language)}`)}</td>
            <td style="font-weight: 700;">${escapeHtml(formatPrintMoney(rental.totalAmount, currency, language))}</td>
          </tr>
        </tbody>
      </table>

      ${
        rental.notesOut
          ? `
        <div class="section-title">${escapeHtml(tr("Rental Notes"))}</div>
        <div class="notes-box">${escapeHtml(rental.notesOut)}</div>
      `
          : ""
      }

      <div class="footer-text">
        ${escapeHtml(settings.contractFooter)}
      </div>

      <div class="signatures">
        <div>
          <div class="signature-box">${escapeHtml(tr("Customer Signature"))}</div>
        </div>
        <div>
          <div class="signature-box">${escapeHtml(tr("Authorized Shop Representative"))}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  await printHTML(html, `contract_${rental.contractNo}.pdf`, printToPDF);
}

export async function printPaymentReceipt(
  paymentId: number,
  printToPDF: boolean,
): Promise<void> {
  const db = getDatabase();
  const settings = getShopSettings();

  const paymentInfo = db
    .select({
      id: payments.id,
      amount: payments.amount,
      type: payments.type,
      method: payments.method,
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
  const language = settings.language;
  const direction = getDirectionForLanguage(language);
  const alignEnd = direction === "rtl" ? "left" : "right";
  const tr = (key: string) => translate(language, key);
  const receiptNo = `REC-${String(paymentInfo.id).padStart(6, "0")}`;

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
            <p>${escapeHtml(tr("Phone"))}: ${escapeHtml(settings.shopPhone)}</p>
          </div>
          <div class="receipt-title">
            <h2>${escapeHtml(tr("PAYMENT RECEIPT"))}</h2>
            <p>${escapeHtml(receiptNo)}</p>
          </div>
        </div>

        <div class="data-row">
          <span class="label">${escapeHtml(tr("Contract Number"))}</span>
          <span class="value font-semibold">${escapeHtml(paymentInfo.contractNo)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Customer Name"))}</span>
          <span class="value">${escapeHtml(paymentInfo.customerName)}</span>
        </div>
        <div class="data-row">
          <span class="label">${escapeHtml(tr("Vehicle Plate Number"))}</span>
          <span class="value">${escapeHtml(paymentInfo.vehiclePlateNumber)}</span>
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
          <span class="label">${escapeHtml(tr("Amount Paid"))}</span>
          <span class="value">${escapeHtml(formatPrintMoney(paymentInfo.amount, currency, language))}</span>
        </div>

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

  await printHTML(html, `receipt_${receiptNo}.pdf`, printToPDF);
}
