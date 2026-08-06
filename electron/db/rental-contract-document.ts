import cairoArabic400 from "../../src/assets/fonts/cairo-arabic-400.woff2?inline";
import cairoArabic700 from "../../src/assets/fonts/cairo-arabic-700.woff2?inline";
import cairoLatin400 from "../../src/assets/fonts/cairo-latin-400.woff2?inline";
import cairoLatin700 from "../../src/assets/fonts/cairo-latin-700.woff2?inline";
import { escapeHtml } from "../../src/shared/html";
import { translate } from "../../src/shared/i18n";
import {
  getDirectionForLanguage,
  getLocaleForLanguage,
  type LanguageCode,
} from "../../src/shared/language";
import {
  formatCollateralType,
  formatRentalStatus,
  type CollateralType,
  type RentalCollateralStatus,
  type RentalStatus,
} from "../../src/shared/rentals";
import type { ShopSettings } from "../../src/shared/settings";
import { formatVehicleType, type VehicleRecord } from "../../src/shared/vehicles";
import { defaultMotorcycleDiagramDataUri } from "./motorcycle-diagram";

export type ContractPrintLanguage = LanguageCode | "both";

export type RentalContractRecord = {
  contractNo: string;
  status: RentalStatus;
  startDatetime: string;
  expectedReturnDatetime: string;
  actualReturnDatetime: string | null;
  dailyPrice: number;
  depositRequired: number;
  depositPaid: number;
  mileageOut: number | null;
  mileageIn: number | null;
  fuelOut: string | null;
  fuelIn: string | null;
  notesOut: string | null;
  notesIn: string | null;
  damageNotes: string | null;
  extraCharges: number;
  accessoryCharges: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  customerName: string;
  customerPhone: string;
  customerNationalId: string | null;
  customerLicenseNo: string | null;
  customerLicenseExpiryDate: string | null;
  customerAddress: string | null;
  vehicleType: VehicleRecord["type"];
  vehiclePlateNumber: string;
  vehicleChassisNumber: string | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string | null;
  vehicleYear: number | null;
  vehicleInsuranceExpiryDate: string | null;
  vehicleRegistrationExpiryDate: string | null;
  vehicleTechnicalInspectionExpiryDate: string | null;
  returnedByName: string | null;
};

export type RentalContractAccessory = {
  name: string;
  quantity: number;
  unitCharge: number;
  returnedQuantity: number;
  missingQuantity: number;
  notes: string | null;
};

export type RentalContractCollateral = {
  type: CollateralType;
  description: string;
  referenceNumber: string | null;
  estimatedValue: number | null;
  currency: string | null;
  status: RentalCollateralStatus;
  notes: string | null;
};

export type RentalContractDocumentInput = {
  rental: RentalContractRecord;
  settings: ShopSettings;
  accessories: RentalContractAccessory[];
  collateralItems: RentalContractCollateral[];
  issuedByName: string | null;
  issuedByUsername: string | null;
  printedAt: string;
  languageOverride?: ContractPrintLanguage;
};

const standardTermKeys = [
  "The customer received the vehicle in the condition shown above and agrees to return it in the same condition, except for normal use.",
  "The customer must return the vehicle by the expected return date and time shown in this contract.",
  "Late return, missing fuel, cleaning, damage, missing accessories, fines, tolls, and unpaid balances may be charged to the customer.",
  "Only the customer and authorized listed drivers or riders may operate the vehicle.",
  "The vehicle may not be used for racing, stunts, off-road use, towing, illegal activity, paid hire, ride-share, or delivery unless the shop explicitly allows it in writing.",
  "The customer must not operate the vehicle under the influence of alcohol, drugs, or any impairing substance.",
  "The customer must contact the shop immediately for accident, theft, breakdown, warning light, unsafe condition, or police involvement.",
  "The deposit may be applied to unpaid rent, late fees, damage, fuel, cleaning, missing accessories, fines, or other amounts owed under this contract.",
  "Insurance or waiver coverage, if any, applies only according to the selected policy and local law. Unauthorized, reckless, illegal, or impaired use may void coverage.",
] as const;

const motorcycleTerms: Array<{ ar: string; en: string }> = [
  {
    ar: "يلتزم المستأجر بسداد جميع المخالفات المرورية ورسوم الوقوف أو السحب أو أي غرامات أو رسوم قانونية تترتب على استخدام الدراجة خلال مدة الإيجار.",
    en: "The customer must pay all traffic fines, parking, towing, and legal fees incurred during the rental period.",
  },
  {
    ar: "يتحمل المستأجر المسؤولية عن الأضرار والخسائر الناتجة عن الحوادث أثناء فترة الإيجار، بما في ذلك الإصلاح والسحب ونسبة التحمل.",
    en: "The customer is responsible for accident damage, repairs, towing, and any applicable insurance deductible during the rental period.",
  },
  {
    ar: "لا يجوز قيادة الدراجة إلا من قبل المستأجر المذكور في العقد، ولا يجوز إعارتها أو تأجيرها للغير دون موافقة خطية.",
    en: "Only the customer named in this contract may operate the motorcycle unless the shop gives written approval.",
  },
  {
    ar: "يحظر إخراج الدراجة خارج النطاق الجغرافي المصرح به أو خارج دولة ليبيا دون موافقة كتابية من المؤجر.",
    en: "The motorcycle may not leave the authorized area or Libya without the shop's written approval.",
  },
  {
    ar: "يمنع استخدام الدراجة في السباقات أو الاستعراضات أو الطرق الوعرة أو أي قيادة خطرة أو غير قانونية.",
    en: "Racing, stunts, off-road riding, reckless operation, and illegal use are prohibited.",
  },
  {
    ar: "يمنع قيادة الدراجة تحت تأثير الكحول أو المخدرات أو الأدوية التي تؤثر على القدرة على القيادة.",
    en: "The motorcycle must not be operated under the influence of alcohol, drugs, or impairing medication.",
  },
  {
    ar: "يتحمل المستأجر تكلفة الأضرار الناتجة عن سوء الاستخدام الميكانيكي أو القيادة العنيفة أو تجاوز حدود التشغيل الطبيعية.",
    en: "The customer is liable for damage caused by mechanical abuse, aggressive riding, or operation outside normal limits.",
  },
  {
    ar: "يجب إعادة الدراجة بمستوى الوقود المسجل عند الاستلام، وإلا تطبق تكلفة الوقود ورسوم خدمة التعبئة.",
    en: "The motorcycle must be returned with the recorded fuel level or refueling and service charges will apply.",
  },
  {
    ar: "يترتب على التأخير دون موافقة رسوم إضافية وفق سياسة المكتب.",
    en: "Late returns without approval incur additional charges under the shop policy.",
  },
  {
    ar: "يتحمل المستأجر تكلفة تلف الإطارات أو العجلات الناتج عن سوء الاستخدام أو الحوادث.",
    en: "The customer is responsible for tire or wheel damage caused by misuse or accidents.",
  },
  {
    ar: "عند السرقة أو الفقدان يجب إبلاغ الجهات الأمنية والمكتب فوراً، ويتحمل المستأجر مسؤولية الإهمال أو التأخر في الإبلاغ.",
    en: "The customer must immediately notify the police and shop of theft or loss and is responsible for negligence or delayed reporting.",
  },
  {
    ar: "يتحمل المستأجر تكلفة استبدال المفاتيح أو الأقفال أو البرمجة المرتبطة بها عند الفقدان أو التلف.",
    en: "The customer must pay for lost or damaged keys, locks, and related programming.",
  },
  {
    ar: "يتحمل المستأجر قيمة فقدان أو تلف مستندات الدراجة أو ملحقاتها المسلمة معه.",
    en: "The customer is responsible for lost or damaged motorcycle documents and supplied accessories.",
  },
  {
    ar: "تعاد الوديعة بعد فحص الدراجة وتسوية الأضرار والمخالفات والوقود والمبالغ المستحقة.",
    en: "The deposit is returned after inspection and settlement of damage, fines, fuel, and outstanding amounts.",
  },
  {
    ar: "يجب إعادة الخوذة والقفل وحامل الهاتف وجميع الملحقات بحالة جيدة أو دفع قيمة المفقود أو التالف.",
    en: "Helmets, locks, mounts, and all accessories must be returned in good condition or replacement charges will apply.",
  },
  {
    ar: "يحق للمكتب احتساب رسوم تنظيف عند إعادة الدراجة بحالة تتطلب تنظيفاً غير اعتيادي.",
    en: "The shop may charge a cleaning fee when the motorcycle requires unusual cleaning.",
  },
  {
    ar: "عند ظهور عطل أو مؤشر تحذير يجب التوقف وإبلاغ المكتب فوراً، ويمنع إجراء إصلاح دون موافقة.",
    en: "If a warning or fault appears, the rider must stop and contact the shop; unauthorized repairs are prohibited.",
  },
  {
    ar: "يقر المستأجر بفحص الدراجة وملحقاتها واستلامها بالحالة المبينة في العقد ومخطط الفحص.",
    en: "The customer acknowledges inspecting and receiving the motorcycle and accessories in the documented condition.",
  },
  {
    ar: "يحق للمؤجر استرداد الدراجة عند مخالفة شروط العقد أو استخدامها بطريقة خطرة أو غير قانونية.",
    en: "The shop may recover the motorcycle when contract terms are breached or it is used dangerously or illegally.",
  },
  {
    ar: "تُعاد الأمانات والوثائق المحتفظ بها عند إعادة المركبة وتسوية جميع الالتزامات المالية.",
    en: "Held collateral and documents are returned when the vehicle is returned and all obligations are settled.",
  },
];

export function resolveContractPrintLanguage(
  settings: Pick<ShopSettings, "language" | "printLanguage">,
  override?: ContractPrintLanguage,
): ContractPrintLanguage {
  const requested = override ?? settings.printLanguage;
  return requested === "app" ? settings.language : requested;
}

export function buildRentalContractHtml(input: RentalContractDocumentInput): string {
  const { accessories, collateralItems, rental, settings } = input;
  const language = resolveContractPrintLanguage(settings, input.languageOverride);
  const primaryLanguage: LanguageCode = language === "en" ? "en" : "ar";
  const direction = getDirectionForLanguage(primaryLanguage);
  const tr = (key: string): string => {
    if (language === "both") {
      return `${translate("ar", key)} / ${translate("en", key)}`;
    }
    return translate(language, key);
  };
  const fallback = tr("N/A");
  const dateTime = (value: string): string => formatDate(value, primaryLanguage, true);
  const dateOnly = (value: string | null): string =>
    value ? formatDate(value, primaryLanguage, false) : fallback;
  const optional = (value: string | number | null | undefined): string =>
    value === null || value === undefined || value === "" ? fallback : String(value);
  const ltr = (value: string | number): string =>
    `<span class="ltr" dir="ltr">${escapeHtml(String(value))}</span>`;
  const labelValue = (label: string, value: string, valueIsHtml = false): string => `
    <div class="field">
      <div class="field-label">${escapeHtml(tr(label))}</div>
      <div class="field-value">${valueIsHtml ? value : escapeHtml(value)}</div>
    </div>`;

  const accessoriesHtml = accessories.length
    ? `
      <section class="avoid-break">
        <h2>${escapeHtml(tr("Assigned Accessories"))}</h2>
        <table>
          <thead><tr>
            <th>${escapeHtml(tr("Accessory"))}</th>
            <th>${escapeHtml(tr("Quantity"))}</th>
            ${rental.actualReturnDatetime ? `<th>${escapeHtml(tr("Returned / Missing"))}</th>` : ""}
            <th>${escapeHtml(tr("Notes"))}</th>
          </tr></thead>
          <tbody>${accessories
            .map(
              (accessory) => `<tr>
                <td>${escapeHtml(accessory.name)}</td>
                <td>${ltr(accessory.quantity)}</td>
                ${rental.actualReturnDatetime ? `<td>${ltr(`${accessory.returnedQuantity} / ${accessory.missingQuantity}`)}</td>` : ""}
                <td>${accessory.notes ? escapeHtml(accessory.notes) : escapeHtml(fallback)}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>`
    : "";

  const collateralHtml = collateralItems.length
    ? `
      <section class="avoid-break">
        <h2>${escapeHtml(tr("Amanat Held"))}</h2>
        <table>
          <thead><tr>
            <th>${escapeHtml(tr("Type"))}</th>
            <th>${escapeHtml(tr("Description"))}</th>
            <th>${escapeHtml(tr("Reference"))}</th>
            <th>${escapeHtml(tr("Status"))}</th>
          </tr></thead>
          <tbody>${collateralItems
            .map(
              (item) => `<tr>
                <td>${escapeHtml(formatCollateralType(item.type, primaryLanguage))}</td>
                <td>${escapeHtml(item.description)}${item.notes ? `<div class="subtext">${escapeHtml(item.notes)}</div>` : ""}</td>
                <td>${ltr(optional(item.referenceNumber))}</td>
                <td>${escapeHtml(tr(item.status === "returned" ? "Returned" : "Held"))}</td>
              </tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>`
    : "";

  const returnHtml = rental.actualReturnDatetime
    ? `
      <section class="avoid-break">
        <h2>${escapeHtml(tr("Return Acknowledgment"))}</h2>
        <div class="fields four">
          ${labelValue("Actual Return", dateOnly(rental.actualReturnDatetime))}
          ${labelValue("Returned By", optional(rental.returnedByName))}
          ${labelValue("Mileage In", rental.mileageIn === null ? fallback : `${rental.mileageIn} ${tr("km")}`)}
          ${labelValue("Fuel In", optional(rental.fuelIn))}
        </div>
        <div class="notes">${formatMultiline([rental.damageNotes, rental.notesIn].filter(Boolean).join(" — ") || tr("No return notes."))}</div>
      </section>`
    : "";

  const configuredTerms = settings.printTermsAndConditions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const termsHtml = (configuredTerms.length
    ? configuredTerms
    : standardTermKeys.map((key) => tr(key)))
    .map((term, index) => `<li><span class="term-number">${index + 1}.</span><span>${escapeHtml(term)}</span></li>`)
    .join("");
  const motorcycleTermsHtml = rental.vehicleType === "motorcycle"
    ? `
      <h2>${escapeHtml(tr("Detailed Motorcycle Rental Terms & Conditions"))}</h2>
      <div class="motorcycle-terms">${motorcycleTerms
        .map((term, index) => {
          const body = language === "both"
            ? `${escapeHtml(term.ar)}<br><span dir="ltr">${escapeHtml(term.en)}</span>`
            : escapeHtml(term[language]);
          return `<div class="term-card"><strong>${index + 1}.</strong> ${body}</div>`;
        })
        .join("")}</div>`
    : "";

  const logoHtml = settings.shopLogoDataUrl
    ? `<img class="shop-logo" src="${escapeHtml(settings.shopLogoDataUrl)}" alt="${escapeHtml(tr("Shop Logo"))}">`
    : "";
  const ownerSignatureHtml = settings.ownerSignatureDataUrl
    ? `<img class="signature-image" src="${escapeHtml(settings.ownerSignatureDataUrl)}" alt="${escapeHtml(tr("Owner Signature"))}">`
    : "";
  const watermarkHtml =
    settings.enableContractWatermark !== false && settings.shopLogoDataUrl
      ? `<img class="page-watermark" src="${escapeHtml(settings.shopLogoDataUrl)}" alt="" />`
      : "";
  const headerSubtitle = settings.printHeaderSubtitle.trim();
  const footer = settings.contractFooter.trim();
  const diagramHtml = rental.vehicleType === "motorcycle"
    ? `
      <article class="page inspection-page">
        ${watermarkHtml}
        ${buildHeader(logoHtml, settings, headerSubtitle, tr)}
        <div class="inspection-title">
          <div><h1>${escapeHtml(tr("Motorcycle Condition Diagram"))}</h1><p>${escapeHtml(tr("Mark scratches, dents, and damage directly on the diagram before signing."))}</p></div>
          <div class="inspection-meta">${ltr(rental.contractNo)} · ${ltr(rental.vehiclePlateNumber)}</div>
        </div>
        <div class="diagram-image"><img src="${defaultMotorcycleDiagramDataUri}" alt="${escapeHtml(tr("Motorcycle Inspection Diagram"))}"></div>
        <div class="inspection-grid">
          <div class="inspection-box"><strong>${escapeHtml(tr("Pre-Handover Checklist"))}</strong><p>☐ ${escapeHtml(tr("Brakes & Levers"))}<br>☐ ${escapeHtml(tr("Tire Pressure"))}<br>☐ ${escapeHtml(tr("Headlight & Signals"))}<br>☐ ${escapeHtml(tr("Fuel & Oil Level"))}</p></div>
          <div class="inspection-box"><strong>${escapeHtml(tr("Damage & Condition Notes"))}</strong><div class="writing-lines"></div></div>
          <div class="inspection-box signature-small"><strong>${escapeHtml(tr("Handover Sign-off"))}</strong><div></div><span>${escapeHtml(tr("Customer & Inspector Sign-off"))}</span></div>
        </div>
      </article>`
    : "";

  return `<!DOCTYPE html>
  <html lang="${primaryLanguage}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(tr("Rental Contract"))} - ${escapeHtml(rental.contractNo)}</title>
    <style>${buildContractCss(direction)}</style>
  </head>
  <body>
    <article class="page contract-page">
      ${watermarkHtml}
      ${buildHeader(logoHtml, settings, headerSubtitle, tr)}
      <div class="document-heading">
        <div><h1>${escapeHtml(tr("RENTAL CONTRACT"))}</h1><div class="contract-number">${ltr(rental.contractNo)}</div></div>
        <div class="print-meta"><span>${escapeHtml(tr("Status"))}: ${escapeHtml(formatRentalStatus(rental.status, primaryLanguage))}</span><span>${escapeHtml(tr("Printed At"))}: ${escapeHtml(dateTime(input.printedAt))}</span></div>
      </div>

      <section>
        <h2>${escapeHtml(tr("Customer Details"))}</h2>
        <div class="fields three">
          ${labelValue("Full Name", rental.customerName)}
          ${labelValue("Phone", ltr(rental.customerPhone), true)}
          ${labelValue("National ID/Pass", ltr(optional(rental.customerNationalId)), true)}
          ${labelValue("Driver License", ltr(optional(rental.customerLicenseNo)), true)}
          ${labelValue("License Expiry", dateOnly(rental.customerLicenseExpiryDate))}
          ${labelValue("Address", optional(rental.customerAddress))}
        </div>
      </section>

      <section>
        <h2>${escapeHtml(tr("Vehicle Details"))}</h2>
        <div class="fields three">
          ${labelValue("Vehicle Type", formatVehicleType(rental.vehicleType, primaryLanguage))}
          ${labelValue("Brand / Model", `${rental.vehicleBrand} ${rental.vehicleModel}`)}
          ${labelValue("Plate Number", ltr(rental.vehiclePlateNumber), true)}
          ${labelValue("Chassis Number", ltr(optional(rental.vehicleChassisNumber)), true)}
          ${labelValue("Color / Year", `${optional(rental.vehicleColor)} / ${optional(rental.vehicleYear)}`)}
          ${labelValue("Mileage Out", rental.mileageOut === null ? fallback : `${rental.mileageOut} ${tr("km")}`)}
          ${labelValue("Fuel Level Out", optional(rental.fuelOut))}
          ${labelValue("Insurance Expiry", dateOnly(rental.vehicleInsuranceExpiryDate))}
          ${labelValue("Registration Expiry", dateOnly(rental.vehicleRegistrationExpiryDate))}
          ${labelValue("Technical Inspection Expiry", dateOnly(rental.vehicleTechnicalInspectionExpiryDate))}
        </div>
      </section>

      <section class="avoid-break">
        <h2>${escapeHtml(tr("Rental Period"))}</h2>
        <div class="fields two">
          ${labelValue("Start Date", dateOnly(rental.startDatetime))}
          ${labelValue("Return Date", dateOnly(rental.expectedReturnDatetime))}
        </div>
      </section>

      <section class="avoid-break">
        <h2>${escapeHtml(tr("Handover Notes"))}</h2>
        <div class="notes">${formatMultiline(rental.notesOut || tr("No handover notes."))}</div>
      </section>

      ${accessoriesHtml}
      ${collateralHtml}
      ${returnHtml}

      <section class="signatures avoid-break">
        <h2>${escapeHtml(tr("Signatures & Authorization"))}</h2>
        <div class="signature-grid">
          <div class="signature-card"><strong>${escapeHtml(tr("Customer Approval"))}</strong><div class="signature-space"></div><div class="signature-line"></div><small>${escapeHtml(rental.customerName)}</small></div>
          <div class="signature-card"><strong>${escapeHtml(tr("Shop Representative"))}</strong><div class="signature-space">${ownerSignatureHtml}</div><div class="signature-line"></div><small>${escapeHtml(settings.shopName)}${input.issuedByName ? ` — ${escapeHtml(tr("Issued By"))}: ${escapeHtml(input.issuedByName)}` : ""}</small></div>
        </div>
      </section>
    </article>

    <article class="page terms-page">
      ${watermarkHtml}
      ${buildHeader(logoHtml, settings, headerSubtitle, tr)}
      <div class="document-heading"><div><h1>${escapeHtml(tr(rental.vehicleType === "motorcycle" ? "Detailed Motorcycle Rental Terms & Conditions" : "Contract Terms & Conditions"))}</h1><div class="contract-number">${ltr(rental.contractNo)}</div></div><div>${escapeHtml(rental.customerName)}</div></div>
      ${rental.vehicleType === "motorcycle" ? motorcycleTermsHtml : `<ol class="terms-list">${termsHtml}</ol>`}
      ${footer ? `<div class="contract-footer">${formatMultiline(footer)}</div>` : ""}
      <div class="terms-signature avoid-break"><span>${escapeHtml(tr("The customer acknowledges reading and agreeing to all detailed terms above."))}</span><span>${escapeHtml(tr("Customer Signature"))}: ____________________</span></div>
    </article>

    ${diagramHtml}
  </body>
  </html>`;
}

function buildHeader(
  logoHtml: string,
  settings: ShopSettings,
  subtitle: string,
  tr: (key: string) => string,
): string {
  return `<header class="shop-header">
    <div class="shop-brand">${logoHtml}<div><div class="shop-name">${escapeHtml(settings.shopName)}</div>${subtitle ? `<div>${escapeHtml(subtitle)}</div>` : ""}</div></div>
    <div class="shop-contact"><div>${escapeHtml(settings.shopAddress || tr("N/A"))}</div><div>${escapeHtml(tr("Phone"))}: <span dir="ltr">${escapeHtml(settings.shopPhone)}</span></div></div>
  </header>`;
}

function buildContractCss(direction: "rtl" | "ltr"): string {
  return `
    @font-face { font-family: "Rental Cairo"; src: url("${cairoLatin400}") format("woff2"); font-weight: 400; font-style: normal; font-display: block; unicode-range: U+0000-05FF; }
    @font-face { font-family: "Rental Cairo"; src: url("${cairoArabic400}") format("woff2"); font-weight: 400; font-style: normal; font-display: block; unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
    @font-face { font-family: "Rental Cairo"; src: url("${cairoLatin700}") format("woff2"); font-weight: 700; font-style: normal; font-display: block; unicode-range: U+0000-05FF; }
    @font-face { font-family: "Rental Cairo"; src: url("${cairoArabic700}") format("woff2"); font-weight: 700; font-style: normal; font-display: block; unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; }
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { color: #000; font-family: "Rental Cairo", "Segoe UI", Tahoma, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; direction: ${direction}; text-align: ${direction === "rtl" ? "right" : "left"}; }
    .page { break-after: page; page-break-after: always; min-height: 277mm; position: relative; overflow: hidden; }
    .page-watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 65%; max-width: 420px; max-height: 420px; object-fit: contain; opacity: 0.08; pointer-events: none; z-index: 0; }
    .page > *:not(.page-watermark) { position: relative; z-index: 1; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    .shop-header { display: flex; justify-content: space-between; align-items: center; gap: 12mm; border-bottom: 2px solid #000; padding-bottom: 4mm; margin-bottom: 5mm; }
    .shop-brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
    .shop-logo { width: 18mm; height: 18mm; object-fit: contain; flex: 0 0 auto; }
    .shop-name { font-size: 17pt; font-weight: 700; }
    .shop-contact { text-align: ${direction === "rtl" ? "left" : "right"}; font-size: 9pt; }
    .document-heading { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: flex-start; gap: 8mm; margin-bottom: 4mm; }
    .document-heading > * { min-width: 0; overflow-wrap: anywhere; }
    .document-heading h1, .inspection-title h1 { margin: 0; font-size: 16pt; }
    .contract-number { margin-top: 1mm; font-size: 12pt; font-weight: 700; }
    .print-meta { display: flex; flex-direction: column; gap: 1mm; font-size: 8.5pt; }
    section { margin-top: 3mm; }
    h2 { margin: 0 0 1.5mm; padding-bottom: 0.8mm; border-bottom: 1.5px solid #000; font-size: 11pt; }
    .fields { display: grid; gap: 1.2mm; }
    .fields.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .fields.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .fields.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .field { border: 1px solid #000; min-width: 0; }
    .field-label { padding: 0.8mm 1.5mm; border-bottom: 1px solid #000; background: #eee; font-size: 7.5pt; font-weight: 700; }
    .field-value { padding: 1mm 1.5mm; min-height: 6.5mm; overflow-wrap: anywhere; font-size: 9.5pt; }
    .ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; text-align: left; }
    .notes { min-height: 10mm; padding: 2mm; border: 1px solid #000; white-space: normal; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    th, td { border: 1px solid #000; padding: 1.2mm; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eee; font-weight: 700; }
    .subtext { margin-top: 1mm; font-size: 7.5pt; }
    .signatures { margin-top: 3.5mm; }
    .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
    .signature-card { border: 1px solid #000; padding: 2.5mm; text-align: center; }
    .signature-space { height: 13mm; display: flex; align-items: center; justify-content: center; }
    .signature-image { max-width: 50mm; max-height: 12mm; object-fit: contain; }
    .placeholder { color: #555; font-size: 8pt; }
    .signature-line { padding-top: 1.2mm; border-top: 1px dashed #000; font-weight: 700; font-size: 8.5pt; }
    .signature-card small { display: block; margin-top: 0.8mm; font-size: 7.8pt; }
    .terms-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 2.2mm; }
    .terms-list li { display: grid; grid-template-columns: 8mm 1fr; gap: 1mm; padding: 1.8mm 2mm; border: 1px solid #000; break-inside: avoid; font-size: 8.5pt; }
    .term-number { font-weight: 700; }
    .motorcycle-terms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5mm; font-size: 7.5pt; }
    .term-card { padding: 1.5mm 2mm; border: 1px solid #000; break-inside: avoid; overflow-wrap: anywhere; }
    .contract-footer { margin-top: 3mm; padding: 2.5mm; border: 1.5px solid #000; font-weight: 700; font-size: 8.5pt; }
    .terms-signature { display: flex; justify-content: space-between; gap: 8mm; margin-top: 4mm; padding-top: 2.5mm; border-top: 1.5px solid #000; font-weight: 700; font-size: 8.5pt; }
    .inspection-title { display: flex; justify-content: space-between; gap: 8mm; margin-bottom: 3mm; }
    .inspection-title p { margin: 1mm 0 0; font-size: 9pt; }
    .inspection-meta { font-weight: 700; }
    .diagram-image { height: 170mm; border: 1.5px solid #000; padding: 3mm; }
    .diagram-image img { width: 100%; height: 100%; display: block; object-fit: contain; }
    .inspection-grid { display: grid; grid-template-columns: 1fr 1.6fr 1fr; gap: 3mm; margin-top: 3mm; }
    .inspection-box { min-height: 40mm; padding: 2.5mm; border: 1px solid #000; font-size: 8.5pt; }
    .inspection-box p { margin: 2mm 0 0; }
    .writing-lines { height: 28mm; margin-top: 2mm; background: repeating-linear-gradient(to bottom, transparent, transparent 6mm, #000 6.2mm); }
    .signature-small { display: flex; flex-direction: column; justify-content: space-between; text-align: center; }
    .signature-small span { border-top: 1px dashed #000; padding-top: 1mm; }
    @media (max-width: 700px) { .fields.four, .fields.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `;
}

function formatDate(value: string, language: LanguageCode, includeTime: boolean): string {
  try {
    const options: Intl.DateTimeFormatOptions = includeTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" };
    return new Intl.DateTimeFormat(getLocaleForLanguage(language), options).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function formatMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}
