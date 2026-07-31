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

function getMotorcycleDiagramHtml(tr: (key: string) => string): string {
  return `
    <div class="section-title">${escapeHtml(tr("Motorcycle Condition Diagram"))}</div>
    <div class="motorcycle-diagram">
      <svg viewBox="0 0 760 250" role="img" aria-label="${escapeHtml(tr("Motorcycle Condition Diagram"))}">
        <rect x="1" y="1" width="758" height="248" fill="white" stroke="#111" stroke-width="1"/>
        <circle cx="170" cy="175" r="55" fill="none" stroke="#111" stroke-width="5"/>
        <circle cx="590" cy="175" r="55" fill="none" stroke="#111" stroke-width="5"/>
        <path d="M170 175 L255 95 L375 95 L465 175 L590 175" fill="none" stroke="#111" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M260 95 L320 55 L410 55 L375 95" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M410 55 L485 52 L535 78" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"/>
        <path d="M255 95 L230 55 L185 50" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
        <path d="M360 95 L410 145 L465 175" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
        <path d="M345 95 L310 175 L170 175" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
        <line x1="80" y1="35" x2="700" y2="35" stroke="#999" stroke-dasharray="8 8"/>
        <text x="80" y="24" fill="#111" font-size="18">${escapeHtml(tr("Mark scratches, dents, and damage here before signing."))}</text>
      </svg>
      <div class="diagram-notes"></div>
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
      () => {
        tempWindow.destroy();
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
  const language = resolvePrintLanguage(settings.language, languageOverride);
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
    rental.vehicleType === "motorcycle" ? getMotorcycleDiagramHtml(tr) : "";
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
          color: #0F2B3D;
          line-height: 1.45;
          margin: 0;
          padding: 18px;
          font-size: 12.5px;
          direction: ${direction};
          text-align: ${direction === "rtl" ? "right" : "left"};
        }
        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 3px solid #1D97D7;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .shop-info h1 {
          font-size: 22px;
          margin: 0 0 4px 0;
          font-weight: 700;
        }
        .shop-info p {
          margin: 2px 0;
          color: #435b6a;
        }
        .contract-title {
          text-align: ${alignEnd};
          min-width: 220px;
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
          margin: 16px 0 8px 0;
          color: #0F2B3D;
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
        .signatures {
          margin-top: 36px;
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
        .owner-signature-image {
          display: block;
          max-height: 58px;
          max-width: 220px;
          margin: 0 auto 8px auto;
          object-fit: contain;
        }
        .signature-placeholder {
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          font-size: 11px;
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
          <p>${optionalTextHtml(settings.shopAddress, fallback)}</p>
          <p>${escapeHtml(tr("Phone"))}: ${ltrHtml(settings.shopPhone)}</p>
        </div>
        <div class="contract-title">
          <h2>${escapeHtml(tr("RENTAL CONTRACT"))}</h2>
          <p>${ltrHtml(rental.contractNo)}</p>
        </div>
      </div>

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
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(tr("Start Date & Time"))}</th>
            <th>${escapeHtml(tr("Expected Return Date & Time"))}</th>
            <th>${escapeHtml(tr("Estimated Days"))}</th>
            <th>${escapeHtml(tr("Daily Rate"))}</th>
            <th>${escapeHtml(tr("Deposit Paid / Required"))}</th>
            <th>${escapeHtml(tr("Accessory Charges"))}</th>
            <th>${escapeHtml(tr("Estimated Rental Charge"))}</th>
            <th>${escapeHtml(tr("Remaining"))}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(formatPrintDate(rental.startDatetime, language))}</td>
            <td>${escapeHtml(formatPrintDate(rental.expectedReturnDatetime, language))}</td>
            <td>${ltrHtml(estimatedDays)}</td>
            <td>${ltrHtml(formatPrintMoney(rental.dailyPrice, currency, language))}</td>
            <td>${ltrHtml(`${formatPrintMoney(rental.depositPaid, currency, language)} / ${formatPrintMoney(rental.depositRequired, currency, language)}`)}</td>
            <td>${ltrHtml(formatPrintMoney(rental.accessoryCharges, currency, language))}</td>
            <td style="font-weight: 700;">${ltrHtml(formatPrintMoney(rental.totalAmount, currency, language))}</td>
            <td style="font-weight: 700;">${ltrHtml(formatPrintMoney(rental.remainingAmount, currency, language))}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">${escapeHtml(tr("Vehicle Documents"))}</div>
      <table>
        <tbody>
          <tr>
            <th>${escapeHtml(tr("Insurance Expiry"))}</th>
            ${tableValue(formatOptionalDate(rental.vehicleInsuranceExpiryDate))}
            <th>${escapeHtml(tr("Registration Expiry"))}</th>
            ${tableValue(formatOptionalDate(rental.vehicleRegistrationExpiryDate))}
            <th>${escapeHtml(tr("Technical Inspection Expiry"))}</th>
            ${tableValue(formatOptionalDate(rental.vehicleTechnicalInspectionExpiryDate))}
          </tr>
        </tbody>
      </table>

      <div class="section-title">${escapeHtml(tr("Vehicle Condition"))}</div>
      <table>
        <tbody>
          <tr>
            <th>${escapeHtml(tr("Mileage Out"))}</th>
            <td>${rental.mileageOut !== null ? ltrHtml(`${rental.mileageOut} ${tr("km")}`) : escapeHtml(tr("N/A"))}</td>
            <th>${escapeHtml(tr("Mileage In"))}</th>
            <td>${rental.mileageIn !== null ? ltrHtml(`${rental.mileageIn} ${tr("km")}`) : escapeHtml(tr("N/A"))}</td>
          </tr>
          <tr>
            <th>${escapeHtml(tr("Fuel Out"))}</th>
            <td>${escapeHtml(rental.fuelOut ?? tr("N/A"))}</td>
            <th>${escapeHtml(tr("Fuel In"))}</th>
            <td>${escapeHtml(rental.fuelIn ?? tr("N/A"))}</td>
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

      ${assignedAccessoriesHtml}
      ${collateralHtml}
      ${motorcycleDiagramHtml}

      <div class="section-title">${escapeHtml(tr("Key Terms"))}</div>
      <ol class="terms-list">${termsHtml}</ol>

      ${
        rental.vehicleType === "motorcycle"
          ? `
            <div class="section-title">${escapeHtml(tr("Motorcycle Additional Terms"))}</div>
            <ol class="terms-list">${motorcycleTermsHtml}</ol>
          `
          : ""
      }

      ${returnAcknowledgmentHtml}

      ${
        settings.contractFooter.trim()
          ? `<div class="footer-text">${escapeHtml(settings.contractFooter)}</div>`
          : ""
      }

      <div class="signatures">
        <div>
          <div class="signature-box">${escapeHtml(tr("Customer Signature"))}</div>
        </div>
        <div>
          ${ownerSignatureHtml}
          <div class="signature-box">${escapeHtml(tr("Owner Signature"))}</div>
          <div class="signature-box">${escapeHtml(tr("Employee Finalizer"))}: ${optionalTextHtml(issuedByName, fallback)}</div>
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
