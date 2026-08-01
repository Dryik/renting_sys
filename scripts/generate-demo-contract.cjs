const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const artifactDir = "C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\2b3da1c4-7467-4d3a-8113-96bb63aac516";
const htmlPath = path.join(artifactDir, "demo_rental_contract.html");
const pdfPath = path.join(artifactDir, "demo_rental_contract.pdf");
const diagramBase64Path = path.join(artifactDir, "diagram_base64.txt");
const logoBase64Path = path.join(artifactDir, "logo_base64.txt");

const diagramDataUri = fs.readFileSync(diagramBase64Path, "utf8").trim();
const shopLogoDataUrl = fs.readFileSync(logoBase64Path, "utf8").trim();

const detailedTerms = [
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
];

const demoHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>عقد تأجير دراجة نارية - CNT-2026-0089</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    
    * { box-sizing: border-box; }
    body {
      font-family: 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #000000;
      line-height: 1.45;
      margin: 0;
      padding: 16px;
      font-size: 12px;
      background-color: #ffffff;
      direction: rtl;
      text-align: right;
    }
    .contract-card, .terms-sheet {
      position: relative;
      overflow: hidden;
      max-width: 820px;
      margin: 0 auto;
      border: 1.5px solid #000000;
      border-radius: 6px;
      padding: 22px;
      background-color: #ffffff;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 360px;
      max-width: 80%;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      border-bottom: 3px solid #000000;
      padding-bottom: 12px;
      margin-bottom: 12px;
      position: relative;
      z-index: 1;
    }
    .shop-brand-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-logo-img {
      width: 76px;
      height: 76px;
      object-fit: contain;
    }
    .shop-info h1 {
      font-size: 20px;
      margin: 0 0 4px 0;
      font-weight: 800;
      color: #000000;
    }
    .shop-info p {
      margin: 2px 0;
      color: #000000;
      font-size: 11.5px;
      font-weight: 600;
    }
    .contract-title {
      text-align: left;
      min-width: 200px;
    }
    .contract-title h2 {
      font-size: 18px;
      margin: 0 0 4px 0;
      color: #000000;
      font-weight: 800;
    }
    .contract-title p {
      margin: 2px 0;
      font-size: 14px;
      font-weight: 800;
      color: #000000;
    }
    .meta-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
      position: relative;
      z-index: 1;
    }
    .meta-item {
      border: 1px solid #000000;
      border-radius: 4px;
      padding: 6px 10px;
      background: #FFFFFF;
    }
    .meta-item .label {
      color: #000000;
      font-size: 10px;
      font-weight: 700;
    }
    .meta-item .value {
      color: #000000;
      font-weight: 800;
      font-size: 12px;
      margin-top: 2px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      border-bottom: 2px solid #000000;
      padding-bottom: 4px;
      margin: 14px 0 8px 0;
      color: #000000;
      position: relative;
      z-index: 1;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      position: relative;
      z-index: 1;
    }
    .data-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .data-list li {
      display: grid;
      grid-template-columns: 125px 1fr;
      gap: 8px;
      margin-bottom: 4px;
      padding-bottom: 2px;
      border-bottom: 1px dashed #666666;
    }
    .data-list .label {
      font-weight: 700;
      color: #000000;
    }
    .data-list .value {
      color: #000000;
      font-weight: 700;
    }
    .ltr {
      direction: ltr;
      display: inline-block;
    }

    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      margin-bottom: 10px;
      position: relative;
      z-index: 1;
      border: 1px solid #000000;
    }
    .details-table td {
      border: 1px solid #000000;
      padding: 7px 10px;
      font-size: 11.5px;
      vertical-align: middle;
    }
    .details-table .label-cell {
      background-color: #E6E6E6;
      font-weight: 800;
      color: #000000;
      width: 22%;
      text-align: right;
    }
    .details-table .value-cell {
      background-color: #FFFFFF;
      font-weight: 700;
      color: #000000;
      width: 28%;
      text-align: right;
    }
    .highlight-val {
      font-weight: 800;
      color: #000000;
    }
    .zero-balance {
      font-weight: 800;
      color: #000000;
    }

    .notes-box {
      border: 1px solid #000000;
      background-color: #FFFFFF;
      padding: 8px 10px;
      border-radius: 4px;
      margin-top: 4px;
      font-size: 11px;
      color: #000000;
    }
    .signatures-container {
      margin-top: 18px;
      page-break-inside: avoid;
      break-inside: avoid;
      position: relative;
      z-index: 1;
    }
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .signature-card {
      border: 1px solid #000000;
      border-radius: 4px;
      padding: 10px 12px;
      background-color: #FFFFFF;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 120px;
    }
    .signature-card-title {
      font-weight: 800;
      font-size: 11px;
      color: #000000;
      margin-bottom: 4px;
      border-bottom: 1px solid #000000;
      padding-bottom: 3px;
    }
    .signature-pad-area {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .signature-line {
      border-top: 1.5px dashed #000000;
      padding-top: 4px;
      text-align: center;
      font-weight: 800;
      color: #000000;
      font-size: 11.5px;
    }
    .signature-subtext {
      font-size: 10px;
      color: #000000;
      text-align: center;
      margin-top: 2px;
      font-weight: 600;
    }
    .signature-placeholder {
      color: #555555;
      font-size: 10.5px;
      font-style: italic;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10.5px;
      font-weight: 800;
      border: 1.5px solid #000000;
      background: #FFFFFF;
      color: #000000;
    }

    /* Dedicated Portrait Page 2 for Detailed Terms */
    .page-break-portrait {
      margin-top: 30px;
      page-break-before: always;
      break-before: page;
    }
    .terms-header {
      border-bottom: 2.5px solid #000000;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    .terms-header h2 {
      margin: 0;
      font-size: 17px;
      color: #000000;
      font-weight: 800;
    }
    .terms-header p {
      margin: 2px 0 0 0;
      font-size: 11px;
      color: #000000;
    }
    .terms-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 14px;
      position: relative;
      z-index: 1;
    }
    .term-card {
      border: 1px solid #000000;
      border-radius: 4px;
      padding: 7px 9px;
      background: #FFFFFF;
    }
    .term-num {
      font-weight: 800;
      color: #000000;
      margin-left: 4px;
    }
    .term-title {
      font-weight: 800;
      color: #000000;
      font-size: 11px;
      margin-bottom: 3px;
      border-bottom: 1px solid #000000;
      padding-bottom: 2px;
    }
    .term-body {
      font-size: 10px;
      color: #000000;
      line-height: 1.4;
    }
    .terms-footer-sign {
      margin-top: 14px;
      border-top: 1px solid #000000;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #000000;
      position: relative;
      z-index: 1;
      font-weight: 700;
    }
    .mini-sign-line {
      border-bottom: 1.5px dashed #000000;
      width: 200px;
      display: inline-block;
      margin-right: 8px;
    }

    /* Dedicated Landscape Page 3 for Inspection Sheet */
    .page-break-landscape {
      margin-top: 40px;
      page-break-before: always;
      break-before: page;
    }
    .landscape-sheet {
      border: 1.5px solid #000000;
      border-radius: 6px;
      padding: 20px;
      background: #FFFFFF;
      max-width: 960px;
      margin: 0 auto;
    }
    .landscape-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2.5px solid #000000;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .landscape-brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .landscape-logo-img {
      width: 54px;
      height: 54px;
      object-fit: contain;
    }
    .landscape-header .shop-title h2 {
      margin: 0;
      font-size: 18px;
      color: #000000;
      font-weight: 800;
    }
    .landscape-header .shop-title p {
      margin: 2px 0 0 0;
      font-size: 11px;
      color: #000000;
    }
    .landscape-meta {
      display: flex;
      gap: 16px;
      font-size: 11.5px;
      color: #000000;
      background: #FFFFFF;
      padding: 6px 12px;
      border-radius: 4px;
      border: 1px solid #000000;
    }
    .diagram-image-box {
      border: 1.5px solid #000000;
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 14px;
      background: #FFFFFF;
      text-align: center;
    }
    .diagram-image-box img {
      max-width: 100%;
      height: 310px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .landscape-footer-grid {
      display: grid;
      grid-template-columns: 1fr 1.8fr 1fr;
      gap: 14px;
    }
    .inspection-checklist-box, .inspection-notes-box, .inspection-signature-box {
      border: 1px solid #000000;
      border-radius: 4px;
      padding: 10px 12px;
      background: #FFFFFF;
    }
    .box-title {
      font-size: 11px;
      font-weight: 800;
      color: #000000;
      border-bottom: 1px solid #000000;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }
    .checklist-items {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 8px;
      font-size: 11px;
      color: #000000;
      font-weight: 600;
    }
    .chk {
      display: inline-block;
      margin-left: 4px;
    }
    .notes-line-area {
      height: 60px;
      background: repeating-linear-gradient(
        to bottom,
        transparent,
        transparent 15px,
        #000000 16px
      );
    }
    .sign-off-space {
      height: 40px;
    }
    .sign-off-line {
      border-top: 1.5px dashed #000000;
      padding-top: 4px;
      text-align: center;
      font-size: 11px;
      font-weight: 800;
      color: #000000;
    }

    @media print {
      body { padding: 0; }
      .contract-card, .terms-sheet { border: none; box-shadow: none; padding: 0; }
      .page-break-portrait, .page-break-landscape {
        page-break-before: always;
        break-before: page;
        margin-top: 0;
      }
      .landscape-sheet {
        border: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>

<!-- PAGE 1: RENTAL CONTRACT & SIGNATURES -->
<div class="contract-card">
  <img src="${shopLogoDataUrl}" class="watermark" alt="Watermark">
  
  <!-- Header -->
  <div class="header">
    <div class="shop-brand-header">
      <img src="${shopLogoDataUrl}" class="header-logo-img" alt="Logo">
      <div class="shop-info">
        <h1>الضويبي لتأجير الدراجات النارية</h1>
        <p>Aldwebi Motorcycle Rentals - طرابلس، ليبيا</p>
        <p>الهاتف: <span class="ltr">+218 91 234 5678</span></p>
      </div>
    </div>
    <div class="contract-title">
      <h2>عقد تأجير دراجة نارية</h2>
      <p class="ltr">CNT-2026-0089</p>
    </div>
  </div>

  <!-- Status & Meta -->
  <div class="meta-strip">
    <div class="meta-item">
      <div class="label">حالة العقد</div>
      <div class="value"><span class="status-badge">نشط (ساري)</span></div>
    </div>
    <div class="meta-item">
      <div class="label">تاريخ الطباعة</div>
      <div class="value ltr">2026-08-01 22:38</div>
    </div>
    <div class="meta-item">
      <div class="label">الموظف المحرر</div>
      <div class="value">أحمد المنصوري</div>
    </div>
    <div class="meta-item">
      <div class="label">اسم المستخدم</div>
      <div class="value ltr">admin</div>
    </div>
  </div>

  <!-- Customer & Vehicle Details -->
  <div class="grid-2">
    <div>
      <div class="section-title">بيانات المستأجر</div>
      <ul class="data-list">
        <li>
          <span class="label">الاسم الكامل:</span>
          <span class="value">محمد علي الطاهر</span>
        </li>
        <li>
          <span class="label">رقم الهاتف:</span>
          <span class="value ltr">+218 92 876 5432</span>
        </li>
        <li>
          <span class="label">الرقم الوطني / الهوية:</span>
          <span class="value ltr">119980123456</span>
        </li>
        <li>
          <span class="label">رقم رخصة القيادة:</span>
          <span class="value ltr">DL-98765432</span>
        </li>
        <li>
          <span class="label">صلاحية الرخصة:</span>
          <span class="value ltr">2028-10-15</span>
        </li>
        <li>
          <span class="label">العنوان:</span>
          <span class="value">طرابلس - حي الأندلس</span>
        </li>
      </ul>
    </div>

    <div>
      <div class="section-title">بيانات الدراجة النارية</div>
      <ul class="data-list">
        <li>
          <span class="label">نوع المركبة:</span>
          <span class="value">دراجة نارية (سكوتر)</span>
        </li>
        <li>
          <span class="label">الماركة والنوع:</span>
          <span class="value">Aprilia SR 160</span>
        </li>
        <li>
          <span class="label">رقم اللوحة:</span>
          <span class="value ltr">M-88201</span>
        </li>
        <li>
          <span class="label">رقم الهيكل:</span>
          <span class="value ltr">JYARN291000012345</span>
        </li>
        <li>
          <span class="label">اللون / سنة الصنع:</span>
          <span class="value">أبيض / 2025</span>
        </li>
        <li>
          <span class="label">عداد الخروج:</span>
          <span class="value ltr">12,400 كم</span>
        </li>
        <li>
          <span class="label">مستوى الوقود:</span>
          <span class="value">ممتلئ</span>
        </li>
      </ul>
    </div>
  </div>

  <!-- Perfectly Aligned 4-Column Details Table -->
  <div class="section-title">تفاصيل الإيجار والحسابات المالية</div>
  <table class="details-table">
    <tbody>
      <tr>
        <td class="label-cell">تاريخ ووقت الاستلام:</td>
        <td class="value-cell"><span class="ltr">2026-08-01 10:00</span></td>
        <td class="label-cell">تاريخ الإرجاع المتوقع:</td>
        <td class="value-cell"><span class="ltr">2026-08-05 10:00</span></td>
      </tr>
      <tr>
        <td class="label-cell">عدد أيام الإيجار:</td>
        <td class="value-cell">4 أيام</td>
        <td class="label-cell">السعر اليومي:</td>
        <td class="value-cell">120.00 د.ل</td>
      </tr>
      <tr>
        <td class="label-cell">الوديعة (التأمين):</td>
        <td class="value-cell">250.00 د.ل</td>
        <td class="label-cell">إجمالي قيمة الإيجار:</td>
        <td class="value-cell"><span class="highlight-val">480.00 د.ل</span></td>
      </tr>
      <tr>
        <td class="label-cell">المبلغ المدفوع:</td>
        <td class="value-cell"><span class="highlight-val">480.00 د.ل</span></td>
        <td class="label-cell">المبلغ المتبقي:</td>
        <td class="value-cell"><span class="zero-balance">0.00 د.ل</span></td>
      </tr>
    </tbody>
  </table>

  <!-- Accessories & Amanat -->
  <div class="grid-2">
    <div>
      <div class="section-title">الملحقات المسلمة</div>
      <div class="notes-box">
        ✓ خوذة حماية أصيلة (عدد 1)<br>
        ✓ حقيبة دراجة (حقيبة تخزين)<br>
        ✓ قفل أمان ومفتاح إضافي<br>
        ✓ كتيب الصيانة والتسجيل
      </div>
    </div>
    <div>
      <div class="section-title">الأمانات المحفوظة</div>
      <div class="notes-box">
        • جواز سفر أصل (رقم: P-882194) - محتفظ به لدى المكتب
      </div>
    </div>
  </div>

  <!-- Signatures Block -->
  <div class="signatures-container">
    <div class="section-title">التوقيعات والاعتماد</div>
    <div class="signatures-grid">
      <div class="signature-card">
        <div class="signature-card-title">موافقة وتوقيع المستأجر</div>
        <div class="signature-pad-area">
          <span class="signature-placeholder">توقيع المستأجر</span>
        </div>
        <div class="signature-line">توقيع المستأجر</div>
        <div class="signature-subtext">محمد علي الطاهر</div>
      </div>

      <div class="signature-card">
        <div class="signature-card-title">اعتماد ممثل المكتب</div>
        <div class="signature-pad-area">
          <span class="signature-placeholder">توقيع وختم المكتب المعتمد</span>
        </div>
        <div class="signature-line">توقيع وختم المكتب</div>
        <div class="signature-subtext">الضويبي لتأجير الدراجات — محرر العقد: أحمد المنصوري</div>
      </div>
    </div>
  </div>
</div>

<!-- PAGE 2: DEDICATED TERMS & CONDITIONS PAGE -->
<div class="page-break-portrait">
  <div class="terms-sheet">
    <img src="${shopLogoDataUrl}" class="watermark" alt="Watermark">
    
    <div class="terms-header">
      <div>
        <h2>الشروط والأحكام التفصيلية لعقد التأجير</h2>
        <p>تعتبر هذه الشروط جزءاً لا يتجزأ من عقد التأجير رقم: <span class="ltr">CNT-2026-0089</span></p>
      </div>
      <div>
        <strong>المستأجر:</strong> محمد علي الطاهر
      </div>
    </div>

    <div class="terms-grid">
      ${detailedTerms
        .map(
          (t, idx) => `
            <div class="term-card">
              <div class="term-title"><span class="term-num">${idx + 1}.</span> ${t.title}</div>
              <div class="term-body">${t.body}</div>
            </div>
          `,
        )
        .join("")}
    </div>

    <div class="terms-footer-sign">
      <div>أقر أنا المستأجر باطلاعي على كافة الشروط والأحكام أعلاه والالتزام التام بها.</div>
      <div>توقيع المستأجر: <span class="mini-sign-line"></span></div>
    </div>
  </div>
</div>

<!-- PAGE 3: STANDALONE REAL TECHNICAL MOTORCYCLE CONDITION DIAGRAM -->
<div class="page-break-landscape">
  <div class="landscape-sheet">
    <div class="landscape-header">
      <div class="landscape-brand">
        <img src="${shopLogoDataUrl}" class="landscape-logo-img" alt="Logo">
        <div class="shop-title">
          <h2>مخطط فحص ومعاينة حالة الدراجة النارية</h2>
          <p>قم بتحديد الخدوش والأضرار بالقلم مباشرة على المخطط قبل التوقيع</p>
        </div>
      </div>
      <div class="landscape-meta">
        <div><strong>رقم العقد:</strong> <span class="ltr">CNT-2026-0089</span></div>
        <div><strong>رقم اللوحة:</strong> <span class="ltr">M-88201</span></div>
        <div><strong>المركبة:</strong> Aprilia SR 160</div>
        <div><strong>المستأجر:</strong> محمد علي الطاهر</div>
      </div>
    </div>

    <!-- Real Technical Diagram Image -->
    <div class="diagram-image-box">
      <img src="${diagramDataUri}" alt="مخطط فحص الدراجة النارية">
    </div>

    <!-- Handover Checklist & Notes Grid -->
    <div class="landscape-footer-grid">
      <div class="inspection-checklist-box">
        <div class="box-title">قائمة الفحص قبل التسليم</div>
        <div class="checklist-items">
          <span><span class="chk">&#9744;</span>المكابح والكوابل</span>
          <span><span class="chk">&#9744;</span>ضغط الإطارات</span>
          <span><span class="chk">&#9744;</span>المصابيح والإشارات</span>
          <span><span class="chk">&#9744;</span>مستوى الزيت والوقود</span>
          <span><span class="chk">&#9744;</span>الخوذة والأقفال</span>
          <span><span class="chk">&#9744;</span>كتيب الإرشادات</span>
        </div>
      </div>

      <div class="inspection-notes-box">
        <div class="box-title">ملاحظات الأضرار والخدوش</div>
        <div class="notes-line-area"></div>
      </div>

      <div class="inspection-signature-box">
        <div class="box-title">اعتماد المعاينة عند التسليم</div>
        <div class="sign-off-space"></div>
        <div class="sign-off-line">توقيع المستأجر والمعاين</div>
      </div>
    </div>
  </div>
</div>

</body>
</html>`;

fs.writeFileSync(htmlPath, demoHtml, "utf8");
console.log("Saved demo HTML to:", htmlPath);

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1000,
      height: 1400,
      show: false,
      webPreferences: {
        offscreen: true,
      },
    });

    await win.loadFile(htmlPath);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4,
      },
    });

    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log("PDF generated successfully at:", pdfPath);
  } catch (err) {
    console.error("PDF generation failed:", err);
  } finally {
    app.quit();
  }
});
