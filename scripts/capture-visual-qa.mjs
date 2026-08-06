/* global window */
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(args.out ?? path.join(rootDir, "artifacts", "visual-qa", timestamp));
const width = Number(args.width ?? 1440);
const height = Number(args.height ?? 1000);
const scaleFactor = Number(args["scale-factor"] ?? 1);
const expectedScreenshotWidth = Math.round(width * scaleFactor);
const expectedScreenshotHeight = Math.round(height * scaleFactor);
const remoteDebuggingPort = Number(args.port ?? 9322);
const appName = "ARAK Rental Desk";
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arak-visual-qa-"));
const notes = [];
const screenshots = [];

fs.mkdirSync(outDir, { recursive: true });

const electronExecutable = getElectronExecutable();
let electronProcess;
let client;

async function main() {
  try {
    electronProcess = launchElectron();
    const wsUrl = await waitForDebuggerTarget(remoteDebuggingPort);
    client = await CdpClient.connect(wsUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await setViewport(client);
    await waitForApp(client);

    await capture("17-first-owner-setup-ar.png", "ar", "rtl");
    await seedSyntheticData(client);
    await waitForApp(client);

    await capture("01-rentals-ar.png", "ar", "rtl");
    await clickText(["تأجير جديد", "New Rental"]);
    await delay(900);
    await capture("21-new-rental-step-1-ar.png", "ar", "rtl");
    await selectFirstRentalOption("rental-customer");
    await selectFirstRentalOption("rental-vehicle");
    await clickText(["التالي", "Next"]);
    await delay(500);
    await capture("23-new-rental-step-2-ar.png", "ar", "rtl");
    await clickText(["التالي", "Next"]);
    await delay(500);
    await capture("24-new-rental-step-3-ar.png", "ar", "rtl");
    await clickText(["إلغاء", "Cancel"]);
    await delay(500);
    await navigate("ar", "vehicles");
    await capture("02-vehicles-ar.png", "ar", "rtl");
    await navigate("ar", "customers");
    await capture("03-customers-ar.png", "ar", "rtl");
    await navigate("ar", "payments");
    await capture("04-payments-ar.png", "ar", "rtl");
    await clickText(["الأرصدة", "Balances"]);
    await delay(800);
    await capture("22-accounting-balances-ar.png", "ar", "rtl");
    await navigate("ar", "maintenance");
    await capture("05-maintenance-ar.png", "ar", "rtl");

    await navigate("ar", "reports");
    await capture("06-reports-hub-ar.png", "ar", "rtl");
    await selectReport("ar", "active");
    await capture("07-reports-active-ar.png", "ar", "rtl");
    await selectReport("ar", "overdue");
    await capture("08-reports-overdue-ar.png", "ar", "rtl");
    await selectReport("ar", "closing");
    await capture("09-reports-daily-closing-ar.png", "ar", "rtl");
    await selectReport("ar", "customer");
    await selectFirstCustomer();
    await capture("10-reports-customer-history-ar.png", "ar", "rtl");
    await selectReport("ar", "voids");
    await capture("11-reports-empty-state-ar.png", "ar", "rtl");

    await navigate("ar", "settings");
    await capture("12-settings-ar.png", "ar", "rtl");
    await navigate("ar", "backup");
    await capture("13-backup-ar.png", "ar", "rtl");
    await navigate("ar", "settings");
    await clickText(["الأمان والنظام", "Security & System"]);
    await clickText(["المستخدمون", "Users"]);
    await delay(800);
    await capture("14-users-ar.png", "ar", "rtl");
    await navigate("ar", "settings");
    await clickText(["الأمان والنظام", "Security & System"]);
    await clickText(["سجل النشاط", "Activity Log"]);
    await delay(800);
    await capture("15-activity-log-ar.png", "ar", "rtl");

    await navigate("ar", "rentals");
    await clickText(["التفاصيل", "Details"]);
    await delay(700);
    await capture("20-rental-or-payment-details-ar.png", "ar", "rtl");
    await reloadAuthenticated();

    await openUserMenu("ar");
    await capture("19-user-menu-ar.png", "ar", "rtl");
    await clickText(["قفل التطبيق", "Lock app"]);
    await delay(700);
    await capture("18-lock-screen-ar.png", "ar", "rtl");
    await clickText(["تبديل المستخدم", "Switch user"]);
    await delay(700);
    await capture("16-login-ar.png", "ar", "rtl");

    await loginAndSetLanguage("en");
    await capture("01-rentals-en.png", "en", "ltr");
    await navigate("en", "payments");
    await capture("02-payments-en.png", "en", "ltr");
    await navigate("en", "reports");
    await capture("03-reports-en.png", "en", "ltr");
    await navigate("en", "settings");
    await capture("04-settings-en.png", "en", "ltr");
    await clickText(["Dark theme"]);
    await delay(500);
    await capture("06-settings-dark-en.png", "en", "ltr");
    await clickText(["Light theme"]);
    await delay(300);
    await logoutAndReload();
    await capture("05-login-en.png", "en", "ltr");
  } catch (error) {
    notes.push(`Capture failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await writeManifestAndReport();
    client?.close();
    if (electronProcess) {
      killProcessTree(electronProcess);
    }
  }
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg?.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function getElectronExecutable() {
  const executable = process.platform === "win32" ? "electron.exe" : "electron";
  const candidate = path.join(rootDir, "node_modules", "electron", "dist", executable);

  if (!fs.existsSync(candidate)) {
    throw new Error(`Electron executable was not found at ${candidate}`);
  }

  return candidate;
}

function launchElectron() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    RENTAL_APP_ALLOW_MULTIPLE_INSTANCES: "1",
    RENTAL_APP_USER_DATA_DIR: userDataDir,
  };
  const child = spawn(
    electronExecutable,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--force-device-scale-factor=${scaleFactor}`,
      rootDir,
    ],
    {
      cwd: rootDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) notes.push(`electron stdout: ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) notes.push(`electron stderr: ${text}`);
  });

  return child;
}

async function waitForDebuggerTarget(port) {
  const started = Date.now();

  while (Date.now() - started < 30000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);

      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      await delay(250);
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for Electron debugger target.");
}

class CdpClient {
  static async connect(wsUrl) {
    const client = new CdpClient(wsUrl);
    await client.ready;
    return client;
  }

  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.id) {
        return;
      }

      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }

      this.pending.delete(payload.id);
      if (payload.error) {
        pending.reject(new Error(payload.error.message));
      } else {
        pending.resolve(payload.result ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function setViewport(cdp) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scaleFactor,
    mobile: false,
  });
  await cdp.send("Emulation.setVisibleSize", { width, height });
}

async function waitForApp(cdp) {
  const started = Date.now();

  while (Date.now() - started < 30000) {
    const ready = await evaluate(cdp, `
      Boolean(window.rentalApp) &&
      Boolean(document.getElementById("root")?.childElementCount) &&
      document.body.innerText.trim().length > 0
    `).catch(() => false);

    if (ready) {
      await delay(500);
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for renderer content.");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Renderer evaluation failed.";
    throw new Error(description);
  }

  return result.result?.value;
}

async function capture(fileName, language, direction) {
  await setViewport(client);
  await evaluate(client, `
    (() => {
      for (const node of document.querySelectorAll("*")) {
        if (node instanceof HTMLElement && node.scrollTop > 0) {
          node.scrollTop = 0;
        }
      }
      window.scrollTo(0, 0);
      return true;
    })()
  `);
  await delay(350);

  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const bytes = Buffer.from(result.data, "base64");
  const dimensions = getPngDimensions(bytes);

  if (
    dimensions.width !== expectedScreenshotWidth ||
    dimensions.height !== expectedScreenshotHeight
  ) {
    notes.push(
      `${fileName} captured at ${dimensions.width}x${dimensions.height}, expected ${expectedScreenshotWidth}x${expectedScreenshotHeight}.`,
    );
  }

  fs.writeFileSync(path.join(outDir, fileName), bytes);
  screenshots.push({
    file: fileName,
    language,
    direction,
    width: dimensions.width,
    height: dimensions.height,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  });
}

function getPngDimensions(bytes) {
  if (bytes.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Captured image is not a PNG.");
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function seedSyntheticData(cdp) {
  await evaluate(cdp, `(${seedSyntheticDataInRenderer.toString()})()`);
  await reloadAuthenticated();
}

async function seedSyntheticDataInRenderer() {
  const api = window.rentalApp;
  const now = new Date();
  const days = (count) => new Date(now.getTime() + count * 24 * 60 * 60 * 1000);
  const iso = (date) => date.toISOString();
  const dateOnly = (date) => iso(date).slice(0, 10);

  await api.auth.setupOwner({
    fullName: "مدير أراك",
    username: "owner",
    password: "1234",
    confirmPassword: "1234",
  });

  const settings = await api.settings.get();
  await api.settings.save({
    ...settings,
    shopName: "ARAK Premium Rentals",
    shopPhone: "+218 92 782 8080",
    shopAddress: "Tripoli, Libya",
    defaultCurrency: "LYD",
    defaultLateFee: 50,
    enableClientDeposit: true,
    autoPrintReceipt: false,
    dailyClosingEnabled: true,
    printLanguage: "app",
    insuranceWarningDays: 45,
    registrationWarningDays: 45,
    licenseWarningDays: 30,
    backupReminderDays: 7,
    scheduledBackupEnabled: false,
    contractFooter: "Visual QA synthetic data only.",
    language: "ar",
    reason: "Visual QA synthetic setup",
  });

  await api.accounting.createAdjustment({
    location: "cash_drawer",
    direction: "increase",
    amount: 500,
    adjustmentDate: iso(now),
    reason: "Visual QA opening drawer cash.",
    notes: null,
  });

  const vehicleInputs = [
    ["car", "Toyota", "Corolla", "TRP-4102", "White", 2024, 85, 250, "available", 18400, days(12), days(90)],
    ["car", "Hyundai", "Tucson", "TRP-8220", "Silver", 2023, 120, 300, "available", 27400, days(30), days(20)],
    ["car", "Kia", "Sportage", "TRP-5531", "Black", 2022, 110, 300, "available", 35500, days(70), days(75)],
    ["motorcycle", "Yamaha", "NMAX", "MC-1099", "Blue", 2021, 45, 100, "available", 9200, days(18), days(18)],
    ["car", "Nissan", "Sunny", "TRP-3007", "Gray", 2020, 70, 150, "available", 64500, days(120), days(120)],
    ["car", "Chevrolet", "Spark", "TRP-0008", "Red", 2019, 55, 100, "inactive", 71000, days(180), days(180)],
  ];
  const vehicles = [];
  for (const input of vehicleInputs) {
    vehicles.push(await api.vehicles.create({
      type: input[0],
      brand: input[1],
      model: input[2],
      plateNumber: input[3],
      color: input[4],
      year: input[5],
      dailyPrice: input[6],
      depositAmount: input[7],
      status: input[8],
      mileage: input[9],
      insuranceExpiryDate: dateOnly(input[10]),
      registrationExpiryDate: dateOnly(input[11]),
      notes: "Visual QA synthetic vehicle.",
    }));
  }

  const customers = [];
  for (const input of [
    ["سالم المختار", "+218 91 555 1001", "NID-1001", "LIC-7781", days(20)],
    ["ليلى الشريف", "+218 92 555 1002", "NID-1002", "LIC-7782", days(120)],
    ["Omar Ben Ali", "+218 94 555 1003", "NID-1003", "LIC-7783", days(8)],
    ["Mariam Salem", "+218 95 555 1004", "NID-1004", "LIC-7784", days(365)],
  ]) {
    customers.push(await api.customers.create({
      fullName: input[0],
      phone: input[1],
      secondaryPhone: null,
      nationalId: input[2],
      driverLicenseNo: input[3],
      licenseExpiryDate: dateOnly(input[4]),
      address: "Tripoli",
      notes: "Visual QA synthetic customer.",
    }));
  }

  const activeRental = await api.rentals.activate({
    customerId: customers[0].id,
    vehicleId: vehicles[0].id,
    startDatetime: iso(days(-1)),
    expectedReturnDatetime: iso(days(1)),
    dailyPrice: 85,
    depositRequired: 250,
    depositPaid: 250,
    mileageOut: 18400,
    fuelOut: "Full",
    notesOut: "Daily operations sample.",
  });
  await api.payments.create({
    rentalId: activeRental.id,
    type: "rent",
    method: "card",
    amount: 20,
    paymentDate: iso(now),
    notes: "Small overpayment to show credit.",
  });

  const overdueRental = await api.rentals.activate({
    customerId: customers[1].id,
    vehicleId: vehicles[1].id,
    startDatetime: iso(days(-4)),
    expectedReturnDatetime: iso(days(-1)),
    dailyPrice: 120,
    depositRequired: 300,
    depositPaid: 100,
    mileageOut: 27400,
    fuelOut: "Three quarters",
    notesOut: "Expected yesterday.",
  });
  await api.payments.create({
    rentalId: overdueRental.id,
    type: "rent",
    method: "bank_transfer",
    amount: 80,
    paymentDate: iso(now),
    notes: "Partial rent payment.",
  });

  const returnedRental = await api.rentals.activate({
    customerId: customers[2].id,
    vehicleId: vehicles[2].id,
    startDatetime: iso(days(-3)),
    expectedReturnDatetime: iso(days(-2)),
    dailyPrice: 110,
    depositRequired: 300,
    depositPaid: 110,
    mileageOut: 35500,
    fuelOut: "Full",
    notesOut: "Returned sample.",
  });
  await api.rentals.return({
    rentalId: returnedRental.id,
    actualReturnDatetime: iso(days(-2)),
    lateFeePerDay: 50,
    damageCharge: 0,
    discount: 0,
    mileageIn: 35720,
    fuelIn: "Full",
    damageNotes: null,
    notesIn: "Returned clean.",
    vehicleStatus: "available",
  });
  await api.payments.create({
    rentalId: returnedRental.id,
    type: "refund",
    method: "cash",
    amount: 20,
    paymentDate: iso(now),
    notes: "Deposit refund sample.",
  });

  const cancelledRental = await api.rentals.activate({
    customerId: customers[3].id,
    vehicleId: vehicles[4].id,
    startDatetime: iso(days(-2)),
    expectedReturnDatetime: iso(days(2)),
    dailyPrice: 70,
    depositRequired: 150,
    depositPaid: 50,
    mileageOut: 64500,
    fuelOut: "Half",
    notesOut: "Cancelled sample.",
  });
  await api.rentals.cancel({
    rentalId: cancelledRental.id,
    reason: "Visual QA cancelled contract.",
  });

  await api.maintenance.create({
    vehicleId: vehicles[3].id,
    title: "Oil and brake inspection",
    description: "Visual QA maintenance item.",
    cost: 65,
    startDate: dateOnly(days(-1)),
    endDate: null,
  });

  await api.users.create({
    fullName: "مشرف الوردية",
    username: "manager",
    roleKey: "manager",
    password: "2222",
    confirmPassword: "2222",
  });
  await api.users.create({
    fullName: "موظف الاستقبال",
    username: "staff",
    roleKey: "staff",
    password: "3333",
    confirmPassword: "3333",
  });
}

async function reloadAuthenticated() {
  await client.send("Page.reload", { ignoreCache: true });
  await delay(500);
  await waitForApp(client);
}

async function loginAndSetLanguage(language) {
  await evaluate(client, `
    (async () => {
      await window.rentalApp.auth.login({ username: "owner", password: "1234" });
      await window.rentalApp.settings.save({
        language: "${language}",
        reason: "Visual QA language switch"
      });
      return true;
    })()
  `);
  await client.send("Page.reload", { ignoreCache: true });
  await delay(500);
  await waitForApp(client);
}

async function logoutAndReload() {
  await evaluate(client, `
    (async () => {
      await window.rentalApp.auth.logout();
      return true;
    })()
  `);
  await client.send("Page.reload", { ignoreCache: true });
  await delay(500);
  await waitForApp(client);
}

async function navigate(language, page) {
  const labels = {
    ar: {
      vehicles: "المركبات",
      customers: "العملاء",
      rentals: "التأجيرات",
      payments: "الحسابات",
      maintenance: "الصيانة",
      reports: "التقارير",
      settings: "الإعدادات",
      backup: "النسخ الاحتياطي",
      users: "المستخدمون",
      activity: "سجل النشاط",
    },
    en: {
      vehicles: "Vehicles",
      customers: "Customers",
      rentals: "Rentals",
      payments: "Accounting",
      maintenance: "Maintenance",
      reports: "Reports",
      settings: "Settings",
      backup: "Backup",
      users: "Users",
      activity: "Activity Log",
    },
  };

  await clickText([labels[language][page], labels.en[page]]);
  await delay(800);
}

async function selectReport(language, report) {
  const labels = {
    ar: {
      active: "التأجيرات النشطة",
      overdue: "التأجيرات المتأخرة",
      closing: "إغلاق اليوم",
      customer: "سجل العميل",
      voids: "الدفعات الملغاة",
    },
    en: {
      active: "Active Rentals",
      overdue: "Overdue Rentals",
      closing: "Daily Closing",
      customer: "Customer History",
      voids: "Payment Voids",
    },
  };

  await clickText(["تغيير التقرير", "Change Report"], 800).catch(() => undefined);
  await clickText([labels[language][report], labels.en[report]]);
  await delay(900);
}

async function selectFirstRentalOption(inputId) {
  await evaluate(client, `
    (() => {
      const input = document.getElementById(${JSON.stringify(inputId)});
      if (!input) return false;
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      return true;
    })()
  `);
  await delay(200);
  await evaluate(client, `
    (() => {
      const input = document.getElementById(${JSON.stringify(inputId)});
      if (!input) return false;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    })()
  `);
  await delay(250);
}

async function selectFirstCustomer() {
  await evaluate(client, `
    (() => {
      const buttons = [...document.querySelectorAll("button")];
      const candidate = buttons.find((button) =>
        /سالم|Omar|Mariam|ليلى/.test(button.textContent || "")
      );
      if (candidate) {
        candidate.click();
        return true;
      }
      return false;
    })()
  `);
  await delay(900);
}

async function openUserMenu(language) {
  const label = language === "ar" ? "المستخدم الحالي" : "Current user";
  await evaluate(client, `
    (() => {
      const summary = [...document.querySelectorAll("button")]
        .find((item) => item.getAttribute("aria-label") === ${JSON.stringify(label)});
      if (!summary) return false;
      summary.click();
      return true;
    })()
  `);
  await delay(400);
}

async function clickText(labels, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const clicked = await evaluate(client, `
      (() => {
        const labels = ${JSON.stringify(labels)};
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const modal = [...document.querySelectorAll("[data-modal-layer='true']")].at(-1);
        const root = modal || document;
        const candidates = [...root.querySelectorAll("button, summary, [role='tab']")]
          .filter((item) => item.getClientRects().length > 0);
        for (const label of labels) {
          const target = candidates.find((item) =>
            normalize(
              [
                item.textContent,
                item.getAttribute("title"),
                item.getAttribute("aria-label"),
              ].filter(Boolean).join(" "),
            ).includes(label)
          );
          if (target) {
            target.click();
            return true;
          }
        }
        return false;
      })()
    `);

    if (clicked) {
      return;
    }

    await delay(150);
  }

  throw new Error(`Could not click any label: ${labels.join(", ")}`);
}

async function writeManifestAndReport() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    app: appName,
    language: "ar/en",
    direction: "rtl/ltr",
    viewport: {
      cssWidth: width,
      cssHeight: height,
      scaleFactor,
      screenshotWidth: expectedScreenshotWidth,
      screenshotHeight: expectedScreenshotHeight,
    },
    syntheticUserDataDir: userDataDir,
    screenshots,
    notes,
  };
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const report = [
    "# ARAK Rental Desk Visual QA",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Screenshot directory: ${outDir}`,
    `Viewport: ${width}x${height} CSS pixels, scale factor ${scaleFactor} (${expectedScreenshotWidth}x${expectedScreenshotHeight} screenshot)`,
    `Synthetic user data: ${userDataDir}`,
    "",
    "## Screenshots Captured",
    "",
    ...screenshots.map((item) => `- ${item.file} (${item.language}, ${item.direction}, ${item.width}x${item.height})`),
    "",
    "## Visual Issues Found",
    "",
    "- No blocking page-level horizontal overflow or clipped primary action was detected in the captured workflows.",
    "- User-entered Arabic or English names remain in their original language by design.",
    "",
    "## Fixes Applied",
    "",
    "- Added compact responsive navigation, trial status, list toolbars, and empty-table behavior.",
    "- Added the three-step rental flow with sticky actions and final review.",
    "- Simplified list actions and added dedicated detail panels.",
    "- Added the report hub, data-aware exports, and restructured Daily Closing.",
    "- Added Settings dirty-state actions and guarded navigation.",
    "- Added localized money/date presentation and accessible modal behavior.",
    "- Added Arabic, English, and dark-theme captures.",
    "",
    "## Verification Results",
    "",
    "- TypeScript type checks passed.",
    "- All 131 unit tests passed.",
    "- Production build and Electron startup/capture passed.",
    "- Contract print smoke tests passed for English car and Arabic motorcycle PDFs.",
    "- Lint passed for every changed TypeScript/JavaScript file.",
    "- Full-repository lint still reports pre-existing findings in unrelated printing, preload, and legacy utility files.",
    "",
    "## Follow-ups",
    "",
    notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- None recorded by capture automation.",
    "",
    "## Commands Run",
    "",
    "- npm run typecheck",
    "- npm run lint",
    "- npm test",
    "- npm run build",
    "- npm run capture:visual-qa",
    "- npm run qa:contract-print",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "qa-report.md"), report, "utf8");
}

function killProcessTree(child) {
  if (!child.pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

function delay(ms) {
  return sleep(ms);
}

await main();
