import { BrowserWindow, dialog } from "electron";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
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
import { defaultMotorcycleDiagramDataUri } from "./motorcycle-diagram";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  type LanguageCode,
} from "../../src/shared/language";
import { formatMoney } from "../../src/shared/money";
import { formatPaymentMethod, formatPaymentType } from "../../src/shared/payments";
import {
  calculateRentalDays,
  formatCollateralType,
  formatRentalStatus,
} from "../../src/shared/rentals";
import { formatVehicleType } from "../../src/shared/vehicles";
import { getCurrentUserForService } from "./auth.service";

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

function formatPrintDateOnly(isoString: string, language: LanguageCode): string {
  try {
    return new Intl.DateTimeFormat(getLocaleForLanguage(language), {
      dateStyle: "medium",
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

function optionalTextHtml(
  value: string | number | null | undefined,
  fallback: string,
): string {
  return value === null || value === undefined || value === ""
    ? escapeHtml(fallback)
    : escapeHtml(String(value));
}

function getMotorcycleDiagramHtml(
  tr: (key: string) => string,
  contractNo: string,
  plateNumber: string,
  customerName: string,
  brandModel: string,
  diagramDataUri?: string,
  logoDataUrl?: string | null,
): string {
  const imgSrc = diagramDataUri || defaultMotorcycleDiagramDataUri;
  const logoHtml = logoDataUrl ? `<img src="${logoDataUrl}" class="landscape-logo-img" alt="${escapeHtml(tr("Shop Logo"))}">` : "";
  return `
    <div class="page-break-landscape">
      <div class="landscape-sheet">
        <div class="landscape-header">
          <div class="landscape-brand">
            ${logoHtml}
            <div class="shop-title">
              <h2>${escapeHtml(tr("Motorcycle Condition Diagram"))}</h2>
              <p>${escapeHtml(tr("Mark scratches, dents, and damage directly on the diagram before signing."))}</p>
            </div>
          </div>
          <div class="landscape-meta">
            <div><strong>${escapeHtml(tr("Contract No"))}:</strong> <span class="ltr-value">${escapeHtml(contractNo)}</span></div>
            <div><strong>${escapeHtml(tr("Plate Number"))}:</strong> <span class="ltr-value">${escapeHtml(plateNumber)}</span></div>
            <div><strong>${escapeHtml(tr("Vehicle"))}:</strong> ${escapeHtml(brandModel)}</div>
            <div><strong>${escapeHtml(tr("Customer"))}:</strong> ${escapeHtml(customerName)}</div>
          </div>
        </div>

        <div class="diagram-image-box">
          ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(tr("Motorcycle Inspection Diagram"))}">` : `<div style="height: 280px; border: 1px dashed #000; display: flex; align-items: center; justify-content: center; font-weight: 700;">${escapeHtml(tr("Motorcycle Inspection Diagram"))}</div>`}
        </div>

        <div class="landscape-footer-grid">
          <div class="inspection-checklist-box">
            <div class="box-title">${escapeHtml(tr("Pre-Handover Checklist"))}</div>
            <div class="checklist-items">
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Brakes & Levers"))}</span>
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Tire Pressure"))}</span>
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Headlight & Signals"))}</span>
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Fuel & Oil Level"))}</span>
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Helmet & Locks"))}</span>
              <span><span class="chk">&#9744;</span>${escapeHtml(tr("Registration Document"))}</span>
            </div>
          </div>

          <div class="inspection-notes-box">
            <div class="box-title">${escapeHtml(tr("Damage & Condition Notes"))}</div>
            <div class="notes-line-area"></div>
          </div>

          <div class="inspection-signature-box">
            <div class="box-title">${escapeHtml(tr("Handover Sign-off"))}</div>
            <div class="sign-off-space"></div>
            <div class="sign-off-line">${escapeHtml(tr("Customer & Inspector Sign-off"))}</div>
          </div>
        </div>
      </div>
    </div>
  `;
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
      (success, failureReason) => {
        if (!success) {
          console.error("Direct print failed or canceled:", failureReason);
        }
        setTimeout(() => {
          if (!tempWindow.isDestroyed()) {
            tempWindow.destroy();
          }
        }, 5000);
      },
    );
  }
}

export async function printRentalContract(
  rentalId: number,
  printToPDF: boolean,
  languageOverride?: LanguageCode | "both",
): Promise<void> {
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

  const currency = settings.defaultCurrency;
  const language = languageOverride === "en" ? "en" : "ar";
  const direction = getDirectionForLanguage(language);
  const alignEnd = direction === "rtl" ? "left" : "right";
  const tr = (key: string) => translate(language, key);
  const fallback = tr("N/A");
  const printedAt = new Date().toISOString();
  const currentUser = getCurrentUserForService();
  const estimatedDays = calculateRentalDays(
    rental.startDatetime,
    rental.expectedReturnDatetime,
  );
  const issuedByName =
    rental.activatedByName ?? rental.createdByName ?? currentUser?.fullName;
  const issuedByUsername =
    rental.activatedByUsername ?? rental.createdByUsername ?? currentUser?.username;

  const item = (label: string, valueHtml: string): string => `
    <li>
      <span class="label">${escapeHtml(tr(label))}</span>
      <span class="value">${valueHtml}</span>
    </li>
  `;

  const tableValue = (valueHtml: string): string => `<td>${valueHtml}</td>`;
  const formatOptionalDate = (value: string | null): string =>
    value ? escapeHtml(formatPrintDateOnly(value, language)) : escapeHtml(fallback);
  const termsHtml = [
    "The customer received the vehicle in the condition shown above and agrees to return it in the same condition, except for normal use.",
    "The customer must return the vehicle by the expected return date and time shown in this contract.",
    "Late return, missing fuel, cleaning, damage, missing accessories, fines, tolls, and unpaid balances may be charged to the customer.",
    "Only the customer and authorized listed drivers or riders may operate the vehicle.",
    "The vehicle may not be used for racing, stunts, off-road use, towing, illegal activity, paid hire, ride-share, or delivery unless the shop explicitly allows it in writing.",
    "The customer must not operate the vehicle under the influence of alcohol, drugs, or any impairing substance.",
    "The customer must contact the shop immediately for accident, theft, breakdown, warning light, unsafe condition, or police involvement.",
    "The deposit may be applied to unpaid rent, late fees, damage, fuel, cleaning, missing accessories, fines, or other amounts owed under this contract.",
    "Insurance or waiver coverage, if any, applies only according to the selected policy and local law. Unauthorized, reckless, illegal, or impaired use may void coverage.",
  ]
    .map((term) => `<li>${escapeHtml(tr(term))}</li>`)
    .join("");

  const motorcycleTermsHtml = [
    "The rider must hold a valid motorcycle license or endorsement suitable for this motorcycle.",
    "The rider and passenger must follow helmet and safety gear laws.",
    "Racing, stunts, competitions, and off-road riding are not allowed.",
    "The motorcycle must be locked or secured when parked.",
    "The rider must stop riding immediately if the motorcycle feels unsafe or a warning light appears.",
  ]
    .map((term) => `<li>${escapeHtml(tr(term))}</li>`)
    .join("");

  const accessoryLabels = [
    "Keys",
    "Vehicle documents",
    rental.vehicleType === "motorcycle" ? "Helmet" : "Spare tire / tools",
    rental.vehicleType === "motorcycle" ? "Lock / chain" : "Other accessories",
    rental.vehicleType === "motorcycle" ? "Storage bag" : "Luggage bag",
  ];
  const accessoriesHtml = accessoryLabels
    .map((label) => `<li><span class="checkmark">&#9744;</span>${escapeHtml(tr(label))}</li>`)
    .join("");
  const assignedAccessoriesHtml = assignedAccessories.length
    ? `
      <div class="section-title">${escapeHtml(tr("Assigned Accessories"))}</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(tr("Accessory"))}</th>
            <th>${escapeHtml(tr("Quantity"))}</th>
            <th>${escapeHtml(tr("Unit Charge"))}</th>
            <th>${escapeHtml(tr("Line Total"))}</th>
            <th>${escapeHtml(tr("Returned / Missing"))}</th>
          </tr>
        </thead>
        <tbody>
          ${assignedAccessories
            .map(
              (accessory) => `
                <tr>
                  <td>${escapeHtml(accessory.name)}${accessory.notes ? `<br><small>${escapeHtml(accessory.notes)}</small>` : ""}</td>
                  <td>${ltrHtml(accessory.quantity)}</td>
                  <td>${ltrHtml(formatPrintMoney(accessory.unitCharge, currency, language))}</td>
                  <td>${ltrHtml(formatPrintMoney(accessory.quantity * accessory.unitCharge, currency, language))}</td>
                  <td>${ltrHtml(`${accessory.returnedQuantity} / ${accessory.missingQuantity}`)}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `
    : "";
  const collateralHtml = collateralItems.length
    ? `
      <div class="section-title">${escapeHtml(tr("Amanat Held"))}</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(tr("Type"))}</th>
            <th>${escapeHtml(tr("Description"))}</th>
            <th>${escapeHtml(tr("Reference"))}</th>
            <th>${escapeHtml(tr("Estimated Value"))}</th>
            <th>${escapeHtml(tr("Status"))}</th>
          </tr>
        </thead>
        <tbody>
          ${collateralItems
            .map(
              (item) => `
                <tr>
                  <td>${escapeHtml(formatCollateralType(item.type, language))}</td>
                  <td>${escapeHtml(item.description)}${item.notes ? `<br><small>${escapeHtml(item.notes)}</small>` : ""}</td>
                  <td>${optionalLtrHtml(item.referenceNumber, fallback)}</td>
                  <td>${item.estimatedValue === null ? escapeHtml(fallback) : ltrHtml(formatPrintMoney(item.estimatedValue, item.currency ?? currency, language))}</td>
                  <td>${escapeHtml(tr(item.status === "returned" ? "Returned" : "Held"))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    `
    : "";
  const motorcycleDiagramHtml =
    rental.vehicleType === "motorcycle"
      ? getMotorcycleDiagramHtml(
          tr,
          rental.contractNo,
          rental.vehiclePlateNumber,
          rental.customerName,
          `${rental.vehicleBrand} ${rental.vehicleModel}`,
          undefined,
          settings.shopLogoDataUrl,
        )
      : "";
  const ownerSignatureHtml = settings.ownerSignatureDataUrl
    ? `<img class="owner-signature-image" src="${escapeHtml(settings.ownerSignatureDataUrl)}" alt="${escapeHtml(tr("Owner Signature"))}">`
    : `<div class="signature-placeholder">${escapeHtml(tr("Owner Signature"))}</div>`;
  const returnAcknowledgmentHtml = rental.actualReturnDatetime
    ? `
      <div class="section-title">${escapeHtml(tr("Return Acknowledgment"))}</div>
      <table>
        <tbody>
          <tr>
            <th>${escapeHtml(tr("Actual Return"))}</th>
            ${tableValue(escapeHtml(formatPrintDate(rental.actualReturnDatetime, language)))}
            <th>${escapeHtml(tr("Returned By"))}</th>
            ${tableValue(optionalTextHtml(rental.returnedByName, fallback))}
          </tr>
          <tr>
            <th>${escapeHtml(tr("Mileage In"))}</th>
            ${tableValue(rental.mileageIn !== null ? ltrHtml(`${rental.mileageIn} ${tr("km")}`) : escapeHtml(fallback))}
            <th>${escapeHtml(tr("Fuel In"))}</th>
            ${tableValue(optionalTextHtml(rental.fuelIn, fallback))}
          </tr>
          <tr>
            <th>${escapeHtml(tr("Extra Charges"))}</th>
            ${tableValue(ltrHtml(formatPrintMoney(rental.extraCharges, currency, language)))}
            <th>${escapeHtml(tr("Discount"))}</th>
            ${tableValue(ltrHtml(formatPrintMoney(rental.discount, currency, language)))}
          </tr>
        </tbody>
      </table>
      <div class="notes-box">${optionalTextHtml(
        [rental.damageNotes, rental.notesIn].filter(Boolean).join(" - "),
        tr("No return notes."),
      )}</div>
    `
    : "";

  const html = `
    <!DOCTYPE html>
    <html lang="${escapeHtml(language)}" dir="${escapeHtml(direction)}">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(tr("Rental Contract"))} - ${escapeHtml(rental.contractNo)}</title>
      <style>
        body {
          font-family: Cairo, "Noto Sans Arabic", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
          color: #000000;
          line-height: 1.45;
          margin: 0;
          padding: 18px;
          font-size: 12.5px;
          direction: ${direction};
          text-align: ${direction === "rtl" ? "right" : "left"};
          background-color: #ffffff;
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 3px solid #000000;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .shop-brand-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .header-logo-img {
          width: 58px;
          height: 58px;
          object-fit: contain;
        }
        .shop-info h1 {
          font-size: 22px;
          margin: 0 0 4px 0;
          font-weight: 800;
          color: #000000;
        }
        .shop-info p {
          margin: 2px 0;
          color: #000000;
        }
        .contract-title {
          text-align: ${alignEnd};
          min-width: 220px;
        }
        .contract-title h2 {
          font-size: 20px;
          margin: 0 0 5px 0;
          color: #000000;
          font-weight: 800;
        }
        .contract-title p {
          margin: 2px 0;
          font-size: 16px;
          font-weight: 700;
          color: #000000;
        }
        .section-title {
          font-size: 13.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #000000;
          padding-bottom: 4px;
          margin: 16px 0 8px 0;
          color: #000000;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .data-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .data-list li {
          display: grid;
          grid-template-columns: 142px 1fr;
          gap: 8px;
          margin-bottom: 5px;
        }
        .data-list .label {
          font-weight: 600;
          color: #435b6a;
        }
        .data-list .value {
          color: #0F2B3D;
        }
        .meta-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .meta-item {
          border: 1px solid #d8eef8;
          border-radius: 4px;
          padding: 7px 9px;
          background: #F5FDFF;
        }
        .meta-item .label {
          color: #435b6a;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .meta-item .value {
          color: #0F2B3D;
          font-weight: 700;
          margin-top: 2px;
        }
        .ltr-value {
          direction: ltr;
          unicode-bidi: isolate;
          display: inline-block;
          text-align: left;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          border: 1px solid #d8eef8;
          padding: 7px 9px;
          text-align: ${direction === "rtl" ? "right" : "left"};
          vertical-align: top;
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
        .terms-list {
          margin: 0;
          padding-${direction === "rtl" ? "right" : "left"}: 20px;
          font-size: 11px;
        }
        .terms-list li {
          margin-bottom: 4px;
        }
        .checklist {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 16px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .checkmark {
          display: inline-block;
          margin-${direction === "rtl" ? "left" : "right"}: 6px;
        }
        .footer-text {
          margin-top: 16px;
          font-size: 11px;
          color: #435b6a;
          text-align: justify;
          border-top: 1px solid #d8eef8;
          padding-top: 10px;
        }
        .motorcycle-diagram {
          border: 1px solid #111;
          margin-top: 8px;
          padding: 8px;
          break-inside: avoid;
        }
        .motorcycle-diagram svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .diagram-notes {
          height: 70px;
          margin-top: 8px;
          border: 1px dashed #111;
          background: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 22px,
            #ddd 23px
          );
        }
        .page-break-landscape {
          margin-top: 30px;
          page-break-before: always;
          break-before: page;
        }
        .landscape-sheet {
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          padding: 16px;
          background: #FFFFFF;
        }
        .contract-card, .terms-sheet {
          position: relative;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 340px;
          max-width: 75%;
          opacity: 0.06;
          pointer-events: none;
          z-index: 0;
        }
        .landscape-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .landscape-logo-img {
          width: 44px;
          height: 44px;
          object-fit: contain;
        }
        .landscape-header .shop-title h2 {
          margin: 0;
          font-size: 16px;
          color: #0F2B3D;
          font-weight: 800;
        }
        .landscape-header .shop-title p {
          margin: 2px 0 0 0;
          font-size: 10.5px;
          color: #64748B;
        }
        .landscape-meta {
          display: flex;
          gap: 14px;
          font-size: 11px;
          color: #334155;
          background: #F8FAFC;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid #E2E8F0;
        }
        .diagram-box-bw {
          background: #FFFFFF;
          border: 1.5px solid #000000;
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 14px;
        }
        .landscape-footer-grid {
          display: grid;
          grid-template-columns: 1fr 1.8fr 1fr;
          gap: 14px;
        }
        .zone-list-box, .checklist-box, .sign-off-box {
          border: 1px solid #CBD5E1;
          border-radius: 6px;
          padding: 8px 10px;
          background: #FAFCFF;
        }
        .box-title {
          font-size: 10.5px;
          font-weight: 800;
          color: #475569;
          text-transform: uppercase;
          border-bottom: 1px solid #E2E8F0;
          padding-bottom: 3px;
          margin-bottom: 6px;
        }
        .zone-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 8px;
          font-size: 10.5px;
          color: #334155;
          font-weight: 600;
        }
        .num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #1D97D7;
          color: #FFFFFF;
          font-size: 9.5px;
          font-weight: 800;
          margin-left: 3px;
        }
        .checklist-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 6px;
          font-size: 10.5px;
          color: #334155;
        }
        .chk {
          display: inline-block;
          margin-left: 3px;
        }
        .sign-off-space {
          height: 40px;
        }
        .sign-off-line {
          border-top: 1.5px dashed #94A3B8;
          padding-top: 4px;
          text-align: center;
          font-size: 10.5px;
          font-weight: 700;
          color: #0F2B3D;
        }
        .signatures-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .signature-card {
          border: 1px solid #CBD5E1;
          border-radius: 6px;
          padding: 14px 16px;
          background-color: #FAFCFF;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 140px;
        }
        .signature-card-title {
          font-weight: 700;
          font-size: 12px;
          color: #475569;
          text-transform: uppercase;
          margin-bottom: 8px;
          border-bottom: 1px solid #E2E8F0;
          padding-bottom: 4px;
        }
        .signature-pad-area {
          height: 65px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .signature-line {
          border-top: 1.5px dashed #94A3B8;
          padding-top: 6px;
          text-align: center;
          font-weight: 700;
          color: #0F2B3D;
          font-size: 12.5px;
        }
        .signature-subtext {
          font-size: 11px;
          color: #64748B;
          text-align: center;
          margin-top: 2px;
          font-weight: 500;
        }
        .owner-signature-image {
          display: block;
          max-height: 58px;
          max-width: 220px;
          margin: 0 auto;
          object-fit: contain;
        }
        .signature-placeholder {
          color: #94a3b8;
          font-size: 11px;
          font-style: italic;
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
        <div class="shop-brand-header">
          ${settings.shopLogoDataUrl ? `<img src="${settings.shopLogoDataUrl}" class="header-logo-img" alt="${escapeHtml(tr("Shop Logo"))}">` : ""}
          <div class="shop-info">
            <h1>${escapeHtml(settings.shopName)}</h1>
            <p>${optionalTextHtml(settings.shopAddress, fallback)}</p>
            <p>${escapeHtml(tr("Phone"))}: ${ltrHtml(settings.shopPhone)}</p>
          </div>
        </div>
        <div class="contract-title">
          <h2>${escapeHtml(tr("RENTAL CONTRACT"))}</h2>
          <p>${ltrHtml(rental.contractNo)}</p>
        </div>
      </div>
      ${settings.shopLogoDataUrl ? `<img src="${settings.shopLogoDataUrl}" class="watermark" alt="Watermark">` : ""}

      <div class="meta-strip">
        <div class="meta-item">
          <div class="label">${escapeHtml(tr("Status"))}</div>
          <div class="value">${escapeHtml(formatRentalStatus(rental.status, language))}</div>
        </div>
        <div class="meta-item">
          <div class="label">${escapeHtml(tr("Printed At"))}</div>
          <div class="value">${escapeHtml(formatPrintDate(printedAt, language))}</div>
        </div>
        <div class="meta-item">
          <div class="label">${escapeHtml(tr("Issued By"))}</div>
          <div class="value">${optionalTextHtml(issuedByName, fallback)}</div>
        </div>
        <div class="meta-item">
          <div class="label">${escapeHtml(tr("Username"))}</div>
          <div class="value">${optionalLtrHtml(issuedByUsername, fallback)}</div>
        </div>
      </div>

      <div class="grid">
        <div>
          <div class="section-title">${escapeHtml(tr("Customer Details"))}</div>
          <ul class="data-list">
            ${item("Full Name", escapeHtml(rental.customerName))}
            ${item("Phone", optionalLtrHtml(rental.customerPhone, fallback))}
            ${item("National ID/Pass", optionalLtrHtml(rental.customerNationalId, fallback))}
            ${item("Driver License", optionalLtrHtml(rental.customerLicenseNo, fallback))}
            ${item("License Expiry", formatOptionalDate(rental.customerLicenseExpiryDate))}
            ${item("Address", optionalTextHtml(rental.customerAddress, fallback))}
          </ul>
        </div>
        <div>
          <div class="section-title">${escapeHtml(tr("Vehicle Details"))}</div>
          <ul class="data-list">
            ${item("Vehicle Type", escapeHtml(formatVehicleType(rental.vehicleType, language)))}
            ${item("Brand / Model", escapeHtml(`${rental.vehicleBrand} ${rental.vehicleModel}`))}
            ${item("Plate Number", ltrHtml(rental.vehiclePlateNumber))}
            ${item("Chassis Number", optionalLtrHtml(rental.vehicleChassisNumber, fallback))}
            ${item("Color / Year", `${optionalTextHtml(rental.vehicleColor, fallback)} / ${optionalLtrHtml(rental.vehicleYear, fallback)}`)}
            ${item("Mileage Out", rental.mileageOut !== null ? ltrHtml(`${rental.mileageOut} ${tr("km")}`) : escapeHtml(fallback))}
            ${item("Fuel Level Out", optionalTextHtml(rental.fuelOut, fallback))}
          </ul>
        </div>
      </div>

      <div class="section-title">${escapeHtml(tr("Rental Terms & Pricing"))}</div>
      <table class="details-table">
        <tbody>
          <tr>
            <td class="label-cell">${escapeHtml(tr("Start Date & Time"))}:</td>
            <td class="value-cell"><span class="ltr-value">${escapeHtml(formatPrintDate(rental.startDatetime, language))}</span></td>
            <td class="label-cell">${escapeHtml(tr("Expected Return Date & Time"))}:</td>
            <td class="value-cell"><span class="ltr-value">${escapeHtml(formatPrintDate(rental.expectedReturnDatetime, language))}</span></td>
          </tr>
          <tr>
            <td class="label-cell">${escapeHtml(tr("Estimated Days"))}:</td>
            <td class="value-cell">${ltrHtml(`${estimatedDays} ${tr("days")}`)}</td>
            <td class="label-cell">${escapeHtml(tr("Daily Rate"))}:</td>
            <td class="value-cell">${ltrHtml(formatPrintMoney(rental.dailyPrice, currency, language))}</td>
          </tr>
          <tr>
            <td class="label-cell">${escapeHtml(tr("Deposit Paid / Required"))}:</td>
            <td class="value-cell">${ltrHtml(`${formatPrintMoney(rental.depositPaid, currency, language)} / ${formatPrintMoney(rental.depositRequired, currency, language)}`)}</td>
            <td class="label-cell">${escapeHtml(tr("Total Rental Charge"))}:</td>
            <td class="value-cell"><strong style="font-weight: 800;">${ltrHtml(formatPrintMoney(rental.totalAmount, currency, language))}</strong></td>
          </tr>
          <tr>
            <td class="label-cell">${escapeHtml(tr("Paid Amount"))}:</td>
            <td class="value-cell"><strong style="font-weight: 800;">${ltrHtml(formatPrintMoney(rental.paidAmount, currency, language))}</strong></td>
            <td class="label-cell">${escapeHtml(tr("Remaining Amount"))}:</td>
            <td class="value-cell"><strong style="font-weight: 800; color: #059669;">${ltrHtml(formatPrintMoney(rental.remainingAmount, currency, language))}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="grid">
        <div>
          <div class="section-title">${escapeHtml(tr("Handover Notes"))}</div>
          <div class="notes-box">${optionalTextHtml(rental.notesOut, tr("No handover notes."))}</div>
        </div>
        <div>
          <div class="section-title">${escapeHtml(tr("Accessories Checklist"))}</div>
          <ul class="checklist">${accessoriesHtml}</ul>
        </div>
      </div>

      <div class="signatures-container">
        <div class="section-title">${escapeHtml(tr("Signatures & Authorization"))}</div>
        <div class="signatures-grid">
          <div class="signature-card">
            <div class="signature-card-title">${escapeHtml(tr("Customer Approval"))}</div>
            <div class="signature-pad-area">
              <span class="signature-placeholder">${escapeHtml(tr("Handwritten Signature"))}</span>
            </div>
            <div class="signature-line">${escapeHtml(tr("Customer Signature"))}</div>
            <div class="signature-subtext">${escapeHtml(rental.customerName)}</div>
          </div>

          <div class="signature-card">
            <div class="signature-card-title">${escapeHtml(tr("Shop Representative"))}</div>
            <div class="signature-pad-area">
              ${ownerSignatureHtml}
            </div>
            <div class="signature-line">${escapeHtml(tr("Owner / Authorized Representative"))}</div>
            <div class="signature-subtext">${escapeHtml(settings.shopName)}${issuedByName ? ` — ${escapeHtml(tr("Issued By"))}: ${escapeHtml(issuedByName)}` : ""}</div>
          </div>
        </div>
      </div>

      ${
        rental.vehicleType === "motorcycle"
          ? `
            <div class="page-break-portrait">
              <div class="terms-sheet">
                ${settings.shopLogoDataUrl ? `<img src="${settings.shopLogoDataUrl}" class="watermark" alt="Watermark">` : ""}
                <div class="terms-header">
                  <div>
                    <h2>${escapeHtml(tr("Detailed Motorcycle Rental Terms & Conditions"))}</h2>
                    <p>${escapeHtml(tr("These terms are an integral part of rental contract"))}: <span class="ltr-value">${escapeHtml(rental.contractNo)}</span></p>
                  </div>
                  <div>
                    <strong>${escapeHtml(tr("Customer"))}:</strong> ${escapeHtml(rental.customerName)}
                  </div>
                </div>

                <div class="terms-grid">
                  ${[
                    { title: "المخالفات المرورية", body: "يلتزم المستأجر بسداد جميع المخالفات المرورية ورسوم الوقوف أو السحب أو أي غرامات أو رسوم قانونية تترتب على استخدام الدراجة خلال مدة الإيجار، سواء صدرت أثناء مدة العقد أو بعد انتهائه إذا كانت ناتجة عن فترة الإيجار." },
                    { title: "المسؤولية عن الحوادث", body: "يتحمل المستأجر كامل المسؤولية عن أي أضرار أو خسائر تنتج عن الحوادث التي تقع أثناء فترة الإيجار، بما في ذلك قيمة الإصلاحات، ونسبة التحمل التأميني، وأجور السحب والنقل، وأي خسائر تشغيلية يتكبدها المؤجر نتيجة توقف الدراجة عن العمل." },
                    { title: "السائق المصرح له", body: "لا يجوز قيادة الدراجة إلا من قبل المستأجر المذكور اسمه في هذا العقد، ويُمنع تسليمها أو إعارتها أو تأجيرها لأي شخص آخر دون موافقة خطية من المؤجر." },
                    { title: "نطاق الاستخدام", body: "يحظر إخراج الدراجة خارج حدود دولة ليبيا أو استخدامها خارج النطاق الجغرافي المصرح به إلا بعد الحصول على موافقة كتابية من المؤجر." },
                    { title: "الاستخدام غير المسموح به", body: "يمنع استخدام الدراجة في السباقات، أو الاستعراضات، أو القيادة الخطرة، أو الطرق الوعرة، أو الصحاري، أو الشواطئ، أو أي استخدام يخالف الغرض الطبيعي للمركبة." },
                    { title: "القيادة تحت تأثير المؤثرات", body: "يقر المستأجر بعدم قيادة الدراجة تحت تأثير الكحول أو المخدرات أو أي أدوية تؤثر على القدرة على القيادة، ويتحمل كامل المسؤولية القانونية والمالية عن أي مخالفة أو حادث ينتج عن ذلك." },
                    { title: "سوء الاستخدام الميكانيكي", body: "يتحمل المستأجر تكلفة أي أضرار ناتجة عن سوء الاستخدام، مثل القيادة بعنف، أو رفع العجلة الأمامية، أو الاستعراض، أو إساءة استخدام القابض، أو تجاوز حدود التشغيل الطبيعية للمحرك." },
                    { title: "سياسة الوقود", body: "يجب إعادة الدراجة بنفس مستوى الوقود المسجل عند الاستلام، ويحق للمؤجر خصم قيمة الوقود الناقص بالإضافة إلى رسوم خدمة التعبئة." },
                    { title: "التأخير في إعادة الدراجة", body: "في حال التأخر عن موعد الإرجاع دون موافقة المؤجر، يتم احتساب رسوم إضافية وفق سياسة الشركة، ويحق للمؤجر احتساب يوم إيجار كامل عند تجاوز مدة التأخير المحددة." },
                    { title: "الإطارات والعجلات", body: "يتحمل المستأجر قيمة إصلاح أو استبدال الإطارات أو الجنوط في حال تعرضها للتلف أو الثقب أو الكسر نتيجة سوء الاستخدام أو الحوادث أثناء فترة الإيجار." },
                    { title: "السرقة أو الفقدان", body: "في حال سرقة الدراجة أو فقدانها، يلتزم المستأجر بإبلاغ الجهات الأمنية والمؤجر فوراً، ويتحمل المسؤولية الكاملة إذا ثبت الإهمال أو التأخر في الإبلاغ." },
                    { title: "فقدان المفاتيح", body: "يتحمل المستأجر تكلفة استبدال المفاتيح أو برمجتها أو استبدال الأقفال أو أي أجزاء مرتبطة بها في حال فقدانها أو تلفها." },
                    { title: "المستندات الرسمية", body: "يتحمل المستأجر قيمة فقدان أو تلف أي مستندات أو وثائق خاصة بالدراجة يتم تسليمها معه عند الاستلام." },
                    { title: "الوديعة التأمينية", body: "تُعاد الوديعة بعد فحص الدراجة والتأكد من سلامتها وسداد جميع الالتزامات المالية، ويحق للمؤجر خصم قيمة الأضرار أو المخالفات أو الوقود الناقص أو أي مبالغ مستحقة قبل إعادة المتبقي من الوديعة." },
                    { title: "الخوذة والملحقات", body: "يتحمل المستأجر مسؤولية المحافظة على جميع الملحقات المسلمة معه، بما في ذلك الخوذة، والقفل، وحامل الهاتف، وأي معدات أخرى، ويلتزم بسداد قيمة أي مفقود أو تالف." },
                    { title: "رسوم التنظيف", body: "في حال إعادة الدراجة بحالة تتطلب تنظيفاً غير اعتيادي بسبب الأوساخ أو الرمال أو الزيوت أو غيرها، يحق للمؤجر استيفاء رسوم تنظيف مناسبة." },
                    { title: "الأعطال الميكانيكية", body: "عند ظهور أي عطل أو مؤشر تحذير، يجب على المستأجر التوقف عن استخدام الدراجة وإبلاغ المؤجر فوراً، ويمنع إجراء أي إصلاح دون موافقة مسبقة من المؤجر." },
                    { title: "الإقرار بحالة الدراجة", body: "يقر المستأجر بأنه قام بفحص الدراجة وجميع ملحقاتها، واطلع على مخطط الفحص، واستلمها بالحالة الموضحة في هذا العقد، ولا يحق له الاعتراض على أي أضرار أو ملاحظات مثبتة عند الاستلام." },
                    { title: "حق استرداد المركبة", body: "يحق للمؤجر استرداد الدراجة فوراً ودون إنذار في حال مخالفة أي من شروط هذا العقد أو استخدام الدراجة بطريقة تعرضها للخطر أو تنطوي على مخالفة للقانون، مع احتفاظه بحقه في المطالبة بالتعويض عن أي أضرار أو خسائر." },
                    { title: "الاحتفاظ بالأمانات والوثائق", body: "بموجب التوقيع على هذا العقد، يوافق المستأجر ويقر بحق مكتب التأجير في الاحتفاظ بأصل وثيقة إثبات الشخصية (جواز السفر / الهوية الشخصية) كأمانة معتمدة طيلة فترة سريان هذا العقد، على أن تُعاد للمستأجر فور تسليم المركبة بحالتها الأولى وسداد جميع الالتزامات المالية." }
                  ]
                    .map(
                      (t, idx) => `
                        <div class="term-card">
                          <div class="term-title"><span class="term-num">${idx + 1}.</span> ${escapeHtml(t.title)}</div>
                          <div class="term-body">${escapeHtml(t.body)}</div>
                        </div>
                      `,
                    )
                    .join("")}
                </div>

                <div class="terms-footer-sign">
                  <div>${escapeHtml(tr("The customer acknowledges reading and agreeing to all detailed terms above."))}</div>
                  <div>${escapeHtml(tr("Customer Signature"))}: <span class="mini-sign-line"></span></div>
                </div>
              </div>
            </div>
          `
          : ""
      }

      ${motorcycleDiagramHtml}
    </body>
    </html>
  `;

  await printHTML(html, `contract_${rental.contractNo}.pdf`, printToPDF);
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

  await printHTML(html, `receipt_${receiptNo}.pdf`, printToPDF);
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

  await printHTML(html, `vehicle_sale_${sale.saleNo}.pdf`, printToPDF);
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
