import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import fs from "node:fs";
import path from "node:path";

app.setName("ARAK Rental Desk");
import {
  createCustomer,
  deactivateCustomer,
  listCustomers,
  updateCustomer,
} from "./db/customers.service";
import { closeDatabase, initializeDatabase } from "./db/database";
import {
  correctPayment,
  createPayment,
  listPayments,
  listPaymentsForRental,
  voidPayment,
} from "./db/payments.service";
import {
  createAccountingAdjustment,
  createCashMovement,
  createExpense,
  getAccountingDailyClosing,
  getAccountingSummary,
  getWeeklyIncome,
  listAccountingTransactions,
  listExpenses,
  saveAccountingDailyClosing,
  saveStaffDailyClosing,
  voidAccountingAdjustment,
  voidCashMovement,
  voidExpense,
} from "./db/accounting.service";
import {
  activateDraftRental,
  activateRental,
  cancelRental,
  createDraftRental,
  findOpenRentalByPlate,
  getRentalFormOptions,
  listRentals,
  returnRental,
  returnRentalWithPayment,
  updateActiveRental,
  updateDraftRental,
} from "./db/rentals.service";
import {
  createVehicle,
  listVehicles,
  updateVehicle,
} from "./db/vehicles.service";
import {
  createVehicleSale,
  getVehicleSaleForVehicle,
  listVehicleSales,
  voidVehicleSale,
} from "./db/vehicle-sales.service";
import {
  getActiveRentals,
  getCancelledRentals,
  getCommissionReport,
  getCustomerRentalHistory,
  getDailyClosing,
  getDailyPayments,
  getDeposits,
  getExpiringDocuments,
  listOutstandingBalances,
  listDeposits,
  getOutstandingBalances,
  getOverdueRentals,
  getPaymentVoids,
  getReturnedRentals,
  getVehicleIncome,
  getVehicleNetSummary,
  getVehicleSales,
  getVehicleUtilization,
} from "./db/reports.service";
import {
  printRentalContract,
  printPaymentReceipt,
  printVehicleSaleReceipt,
} from "./db/print.service";
import {
  checkAndRunScheduledAutoBackup,
  getBackupStatus,
  previewBackup,
  runBackup,
  runRestore,
  verifyBackup,
} from "./db/backup.service";
import {
  clearOwnerSignature,
  clearShopLogo,
  getShopSettings,
  saveShopSettings,
  selectOwnerSignature,
  selectShopLogo,
} from "./db/settings.service";
import {
  createAccessory,
  listAccessories,
  updateAccessory,
} from "./db/accessories.service";
import {
  createEmployeeLoan,
  listEmployeeLoanEmployees,
  listEmployeeLoanPayments,
  listEmployeeLoans,
  recordEmployeeLoanRepayment,
  voidEmployeeLoan,
} from "./db/employee-loans.service";
import {
  listMaintenance,
  createMaintenance,
  updateMaintenance,
  archiveMaintenance,
} from "./db/maintenance.service";
import {
  addAttachment,
  archiveAttachment,
  getAttachmentPreview,
  listAttachments,
  openAttachment,
  replaceAttachment,
  saveCapturedPhoto,
} from "./db/attachments.service";
import { applyDataHealthFix, scanDataHealth } from "./db/data-health.service";
import { getDiagnosticsStatus } from "./db/diagnostics.service";
import { exportReport } from "./db/export.service";
import { globalSearch } from "./db/search.service";
import { toIpcSafeError } from "./ipc-errors";
import { assertIpcAccessAllowed, getIpcAccessPolicy, type IpcChannel } from "./ipc-policy";
import {
  exportLicenseRequest,
  getLicenseStatus,
  importLicenseFile,
  isWriteAccessAllowed,
} from "./licensing/service";
import { approveSensitiveAction, clearOwnerPin, setOwnerPin } from "./db/security.service";
import {
  changePassword,
  createUser,
  deactivateUser,
  getAuthState,
  listUsers,
  lockApp,
  login,
  logout,
  currentUserCan,
  reactivateUser,
  requireAllPermissionsForCurrentSession,
  requirePermissionForCurrentSession,
  resetUserPassword,
  setAuthAppVersion,
  setupFirstOwner,
  unlockApp,
  updateUser,
} from "./db/auth.service";
import { listAuditEvents } from "./db/audit.service";
import type { AppInfo } from "./types";
import type { Permission } from "../src/shared/auth";
import type { AuditListRequest } from "../src/shared/audit";
import type { ShopSettings } from "../src/shared/settings";
import type { CustomerListRequest } from "../src/shared/customers";
import type { MaintenanceInput, MaintenanceListRequest } from "../src/shared/maintenance";
import type { PaymentListRequest } from "../src/shared/payments";
import type { AccountingListRequest, AccountingSummaryRequest } from "../src/shared/accounting";
import type { RentalListRequest } from "../src/shared/rentals";
import type { AccessoryListRequest } from "../src/shared/accessories";
import type { EmployeeLoanListRequest } from "../src/shared/employee-loans";
import type {
  CustomerRentalHistoryRequest,
  CommissionReportRequest,
  DailyPaymentsReportRequest,
  DepositReportRequest,
  OutstandingBalancesReportRequest,
  ReportExportRequest,
  ReturnedRentalsReportRequest,
  VehicleSalesReportRequest,
} from "../src/shared/reports";
import type { VehicleListRequest } from "../src/shared/vehicles";
import type { VehicleSaleListRequest } from "../src/shared/vehicle-sales";
import type {
  AttachmentArchiveRequest,
  AttachmentCapturedPhotoRequest,
  AttachmentListRequest,
  AttachmentReplaceRequest,
  AttachmentUploadRequest,
} from "../src/shared/attachments";
import type { DataHealthFixRequest } from "../src/shared/data-health";

let mainWindow: BrowserWindow | null = null;
let appInfo: AppInfo | null = null;
let isAppQuitting = false;
const isSmokeTest = process.env.RENTAL_APP_SMOKE_TEST === "1";
const allowMultipleInstancesForTest =
  isSmokeTest || process.env.RENTAL_APP_ALLOW_MULTIPLE_INSTANCES === "1";
const singleInstanceLock =
  allowMultipleInstancesForTest || app.requestSingleInstanceLock();

type TrustedIpcHandler = (
  event: IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown;

function handle(channel: IpcChannel, listener: TrustedIpcHandler): void {
  getIpcAccessPolicy(channel);

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedIpcSender(event);
      assertIpcAccessAllowed(channel, isWriteAccessAllowed());

      return await Promise.resolve(listener(event, ...args));
    } catch (error) {
      throw toIpcSafeError(error);
    }
  });
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();

  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error("Untrusted renderer.");
  }
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === "file:") {
      return true;
    }

    if (!app.isPackaged && (url.protocol === "http:" || url.protocol === "https:")) {
      return isLocalDevHost(url.hostname);
    }
  } catch {
    return false;
  }

  return false;
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function guard(permissions: Permission | Permission[]): void {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  requireAllPermissionsForCurrentSession(list);
}

function guardAny(permissions: Permission[]): void {
  for (const permission of permissions) {
    if (currentUserCan(permission)) {
      return;
    }
  }

  throw new Error("Permission denied.");
}

function getCloseConfirmationCopy(): {
  title: string;
  message: string;
  detail: string;
  cancelLabel: string;
  closeLabel: string;
} {
  try {
    if (getShopSettings().language === "ar") {
      return {
        title: "إغلاق التطبيق؟",
        message: "هل تريد إغلاق التطبيق؟",
        detail: "قد يتم فقدان أي بيانات غير محفوظة في النماذج المفتوحة.",
        cancelLabel: "إلغاء",
        closeLabel: "إغلاق التطبيق",
      };
    }
  } catch {
    // If settings are unavailable during startup or shutdown, use the default English copy.
  }

  return {
    title: "Close Rental Desk?",
    message: "Do you want to close the app?",
    detail: "Any unsaved form changes may be lost.",
    cancelLabel: "Cancel",
    closeLabel: "Close App",
  };
}

function attachCloseConfirmation(window: BrowserWindow): void {
  window.on("close", (event) => {
    if (isSmokeTest || isAppQuitting) {
      return;
    }

    const copy = getCloseConfirmationCopy();
    const response = dialog.showMessageBoxSync(window, {
      type: "question",
      title: copy.title,
      message: copy.message,
      detail: copy.detail,
      buttons: [copy.cancelLabel, copy.closeLabel],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (response !== 1) {
      event.preventDefault();
    }
  });
}

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, "../../build/icon.ico"),
    path.join(__dirname, "../../build/icon.png"),
    path.join(app.getAppPath(), "build/icon.ico"),
    path.join(app.getAppPath(), "build/icon.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(__dirname, "../../build/icon.ico");
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: "ARAK Rental Desk",
    icon: getAppIconPath(),
    show: false,
    backgroundColor: "#f7f7f8",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  attachCloseConfirmation(mainWindow);
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl = details.requestingUrl || webContents.getURL();
      const mediaTypes = "mediaTypes" in details && details.mediaTypes ? details.mediaTypes : [];

      callback(
        permission === "media" &&
          isTrustedRendererUrl(requestingUrl) &&
          mediaTypes.includes("video") &&
          !mediaTypes.includes("audio"),
      );
    },
  );
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    if (isSmokeTest) {
      console.error(`Rental app smoke test: renderer failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (isSmokeTest) {
      console.error(`Rental app smoke test: renderer process gone: ${details.reason}`);
    }
  });

  mainWindow.webContents.on("console-message", (details) => {
    if (isSmokeTest && (details.level === "warning" || details.level === "error")) {
      console.error(`Rental app renderer console: ${details.message}`);
    }
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (isSmokeTest) {
      setTimeout(() => {
        void mainWindow?.webContents
          .executeJavaScript(
            "({ text: document.body.innerText.trim(), hasApi: Boolean(window.rentalApp), rootChildren: document.getElementById('root')?.childElementCount ?? 0 })",
          )
          .then((state: { text: string; hasApi: boolean; rootChildren: number }) => {
            console.log(`Rental app smoke test: renderer ready. hasApi=${state.hasApi} rootChildren=${state.rootChildren} text=${state.text.slice(0, 120)}`);
          })
          .catch((error: unknown) => {
            console.error(`Rental app smoke test: renderer inspection failed: ${String(error)}`);
            process.exitCode = 1;
          })
          .finally(() => {
            app.quit();
          });
      }, 500);
      return;
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (isSmokeTest) {
      return;
    }
    mainWindow?.show();
  });

  if (
    process.env.ELECTRON_RENDERER_URL &&
    !app.isPackaged &&
    isTrustedRendererUrl(process.env.ELECTRON_RENDERER_URL)
  ) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

if (!singleInstanceLock) {
  app.exit(0);
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId("ly.arak.rentaldesk");
  const databaseState = initializeDatabase();
  appInfo = {
    appVersion: app.getVersion(),
    ...databaseState,
  };
  setAuthAppVersion(appInfo.appVersion);
  checkAndRunScheduledAutoBackup();

  let pendingUpdateInfo: { version: string } | null = null;
  let updateState: {
    status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";
    version?: string;
    percent?: number;
    error?: string;
  } = { status: "idle" };

  function broadcastUpdateState(next: typeof updateState) {
    updateState = next;
    mainWindow?.webContents.send("update:status-change", updateState);
  }

  autoUpdater.logger = console;

  if (app.isPackaged && !isSmokeTest) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
      broadcastUpdateState({ status: "checking" });
    });

    autoUpdater.on("update-available", (info) => {
      broadcastUpdateState({ status: "available", version: info.version });
    });

    autoUpdater.on("update-not-available", () => {
      broadcastUpdateState({ status: "idle" });
    });

    autoUpdater.on("download-progress", (progress) => {
      broadcastUpdateState({
        status: "downloading",
        percent: Math.round(progress.percent),
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      pendingUpdateInfo = { version: info.version };
      broadcastUpdateState({ status: "downloaded", version: info.version });
      mainWindow?.webContents.send("update:downloaded", pendingUpdateInfo);
    });

    autoUpdater.on("error", (error) => {
      console.error("AutoUpdater error:", error);
      broadcastUpdateState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    });

    void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      console.warn("AutoUpdater check error:", error);
    });
  }

  handle("app:get-pending-update", () => pendingUpdateInfo);
  handle("app:get-update-state", () => updateState);
  handle("app:check-for-updates", async () => {
    if (!app.isPackaged) {
      return { status: "idle", error: "Auto-updater runs in packaged builds." };
    }
    try {
      broadcastUpdateState({ status: "checking" });
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) {
        broadcastUpdateState({ status: "available", version: result.updateInfo.version });
        void autoUpdater.downloadUpdate().catch((err) => {
          broadcastUpdateState({ status: "error", error: String(err) });
        });
        return { status: "available", version: result.updateInfo.version };
      }
      broadcastUpdateState({ status: "idle" });
      return { status: "idle" };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Manual check-for-updates error:", error);
      broadcastUpdateState({ status: "error", error: errMsg });
      return { status: "error", error: errMsg };
    }
  });

  handle("app:restart-and-install-update", () => {
    isAppQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  });

  handle("auth:get-state", () => getAuthState());
  handle("auth:setup-owner", (_event, input: unknown) =>
    setupFirstOwner(input),
  );
  handle("auth:login", (_event, input: unknown) => login(input));
  handle("auth:logout", () => logout());
  handle("auth:lock", () => lockApp());
  handle("auth:unlock", (_event, input: unknown) => unlockApp(input));
  handle("auth:change-password", (_event, input: unknown) =>
    changePassword(input),
  );
  handle("users:list", () => listUsers());
  handle("users:create", (_event, input: unknown) => createUser(input));
  handle("users:update", (_event, input: unknown) => updateUser(input));
  handle("users:deactivate", (_event, input: unknown) =>
    deactivateUser(input),
  );
  handle("users:reactivate", (_event, input: unknown) =>
    reactivateUser(input),
  );
  handle("users:reset-password", (_event, input: unknown) =>
    resetUserPassword(input),
  );
  handle("audit:list", (_event, request: unknown) => {
    requirePermissionForCurrentSession("audit.view");
    return listAuditEvents(request as AuditListRequest);
  });
  handle("app:get-info", () => {
    guardAny([
      "rentals.view",
      "vehicles.view",
      "customers.view",
      "reports.view",
      "settings.view",
    ]);
    return appInfo;
  });
  handle("license:get-status", () => getLicenseStatus());
  handle("license:export-request", () => exportLicenseRequest());
  handle("license:import-license", () => importLicenseFile());
  handle("vehicles:list", (_event, request: unknown) =>
    (guard("vehicles.view"), listVehicles(request as VehicleListRequest)),
  );
  handle("vehicles:create", (_event, input: unknown) =>
    (guard("vehicles.create"), createVehicle(input)),
  );
  handle("vehicles:update", (_event, id: unknown, input: unknown) =>
    (guard("vehicles.edit"), updateVehicle(id, input)),
  );
  handle("vehicle-sales:list", (_event, request: unknown) =>
    (guard("vehicleSales.view"), listVehicleSales(request as VehicleSaleListRequest)),
  );
  handle("vehicle-sales:get-for-vehicle", (_event, vehicleId: unknown) =>
    (guard("vehicleSales.view"), getVehicleSaleForVehicle(vehicleId)),
  );
  handle("vehicle-sales:create", (_event, input: unknown) =>
    (guard("vehicleSales.create"), createVehicleSale(input)),
  );
  handle("vehicle-sales:void", (_event, input: unknown) =>
    (guard("vehicleSales.void"), voidVehicleSale(input)),
  );
  handle("customers:list", (_event, request: unknown) =>
    (guard("customers.view"), listCustomers(request as CustomerListRequest)),
  );
  handle("customers:create", (_event, input: unknown) =>
    (guard("customers.create"), createCustomer(input)),
  );
  handle("customers:update", (_event, id: unknown, input: unknown) =>
    (guard("customers.edit"), updateCustomer(id, input)),
  );
  handle("customers:deactivate", (_event, id: unknown) =>
    (guard("customers.deactivate"), deactivateCustomer(id)),
  );
  handle("rentals:list", (_event, request: unknown) =>
    (guard("rentals.view"), listRentals(request as RentalListRequest)),
  );
  handle("rentals:get-form-options", () => {
    guard("rentals.view");
    return getRentalFormOptions();
  });
  handle("rentals:activate", (_event, input: unknown) =>
    (guard("rentals.create"), activateRental(input)),
  );
  handle("rentals:create-draft", (_event, input: unknown) =>
    (guard("rentals.create"), createDraftRental(input)),
  );
  handle("rentals:update-draft", (_event, id: unknown, input: unknown) =>
    (guard("rentals.create"), updateDraftRental(id, input)),
  );
  handle("rentals:activate-draft", (_event, id: unknown) =>
    (guard("rentals.create"), activateDraftRental(id)),
  );
  handle("rentals:update-active", (_event, input: unknown) =>
    (guard("rentals.editActive"), updateActiveRental(input)),
  );
  handle("rentals:return", (_event, input: unknown) =>
    (guard("rentals.return"), returnRental(input)),
  );
  handle("rentals:return-with-payment", (_event, input: unknown) =>
    (guard(["rentals.return", "payments.create"]), returnRentalWithPayment(input)),
  );
  handle("rentals:cancel", (_event, input: unknown) =>
    (guard("rentals.cancel"), cancelRental(input)),
  );
  handle("rentals:find-open-by-plate", (_event, plateNumber: unknown) =>
    (guard("rentals.return"), findOpenRentalByPlate(plateNumber)),
  );
  handle("payments:list", (_event, request: unknown) =>
    (guard("payments.view"), listPayments(request as PaymentListRequest)),
  );
  handle("payments:list-for-rental", (_event, rentalId: unknown) =>
    (guard("payments.view"), listPaymentsForRental(rentalId)),
  );
  handle("payments:create", (_event, input: unknown) =>
    (guard("payments.create"), createPayment(input)),
  );
  handle("payments:void", (_event, input: unknown) =>
    (guard("payments.void"), voidPayment(input)),
  );
  handle("payments:correct", (_event, input: unknown) =>
    (guard("payments.void"), correctPayment(input)),
  );
  handle("accounting:get-summary", (_event, request: unknown) =>
    (guard("accounting.view"), getAccountingSummary(request as AccountingSummaryRequest)),
  );
  handle("accounting:list-transactions", (_event, request: unknown) =>
    (guard("accounting.view"), listAccountingTransactions(request as AccountingListRequest)),
  );
  handle("accounting:list-expenses", (_event, request: unknown) =>
    (guard("accounting.view"), listExpenses(request as AccountingListRequest)),
  );
  handle("accounting:create-expense", (_event, input: unknown) =>
    (guard("expenses.create"), createExpense(input)),
  );
  handle("accounting:void-expense", (_event, input: unknown) =>
    (guard("expenses.void"), voidExpense(input)),
  );
  handle("accounting:create-cash-movement", (_event, input: unknown) =>
    (guard("cashMovements.create"), createCashMovement(input)),
  );
  handle("accounting:void-cash-movement", (_event, input: unknown) =>
    (guard("cashMovements.void"), voidCashMovement(input)),
  );
  handle("accounting:create-adjustment", (_event, input: unknown) =>
    (guard("accountingAdjustments.create"), createAccountingAdjustment(input)),
  );
  handle("accounting:void-adjustment", (_event, input: unknown) =>
    (guard("accountingAdjustments.void"), voidAccountingAdjustment(input)),
  );
  handle("accounting:get-daily-closing", (_event, date: unknown) =>
    (guard("accounting.view"), getAccountingDailyClosing(String(date))),
  );
  handle("accounting:save-daily-closing", (_event, input: unknown) =>
    (guard("dailyClosing.save"), saveAccountingDailyClosing(input)),
  );
  handle("accounting:save-staff-daily-closing", (_event, input: unknown) =>
    (guard("dailyClosing.staffClose"), saveStaffDailyClosing(input)),
  );
  handle("accounting:get-weekly-income", (_event, date: unknown) =>
    (guard("weeklyIncome.view"), getWeeklyIncome(typeof date === "string" ? date : undefined)),
  );
  handle("employee-loans:list-employees", () =>
    (guard("employeeLoans.view"), listEmployeeLoanEmployees()),
  );
  handle("employee-loans:list", (_event, request: unknown) =>
    (guard("employeeLoans.view"), listEmployeeLoans(request as EmployeeLoanListRequest)),
  );
  handle("employee-loans:list-payments", (_event, loanId: unknown) =>
    (guard("employeeLoans.view"), listEmployeeLoanPayments(loanId)),
  );
  handle("employee-loans:create", (_event, input: unknown) =>
    (guard("employeeLoans.create"), createEmployeeLoan(input)),
  );
  handle("employee-loans:repay", (_event, input: unknown) =>
    (guard("employeeLoans.repay"), recordEmployeeLoanRepayment(input)),
  );
  handle("employee-loans:void", (_event, input: unknown) =>
    (guard("employeeLoans.void"), voidEmployeeLoan(input)),
  );
  handle("accessories:list", (_event, request: unknown) =>
    (guard("accessories.view"), listAccessories(request as AccessoryListRequest)),
  );
  handle("accessories:create", (_event, input: unknown) =>
    (guard("accessories.create"), createAccessory(input)),
  );
  handle("accessories:update", (_event, id: unknown, input: unknown) =>
    (guard("accessories.edit"), updateAccessory(id, input)),
  );
  handle("reports:get-active-rentals", () =>
    (guard("reports.view"), getActiveRentals()),
  );
  handle("reports:get-overdue-rentals", () =>
    (guard("reports.view"), getOverdueRentals()),
  );
  handle("reports:get-returned-rentals", (_event, request: unknown) =>
    (guard("reports.view"), getReturnedRentals(request as ReturnedRentalsReportRequest)),
  );
  handle("reports:get-customer-rental-history", (_event, request: unknown) =>
    (guard("reports.view"), getCustomerRentalHistory(request as CustomerRentalHistoryRequest)),
  );
  handle("reports:get-daily-payments", (_event, request: unknown) =>
    (guard("reports.view"), getDailyPayments(request as DailyPaymentsReportRequest)),
  );
  handle(
    "reports:get-vehicle-income",
    (_event, startDate: unknown, endDate: unknown) =>
      (guard("reports.view"), getVehicleIncome(startDate as string, endDate as string)),
  );
  handle("reports:get-outstanding-balances", () =>
    (guard("reports.view"), getOutstandingBalances()),
  );
  handle("reports:list-outstanding-balances", (_event, request: unknown) =>
    (guard("reports.view"), listOutstandingBalances(request as OutstandingBalancesReportRequest)),
  );
  handle("reports:get-daily-closing", (_event, date: unknown) =>
    (guard("reports.view"), getDailyClosing(String(date))),
  );
  handle("reports:get-deposits", () =>
    (guard("reports.view"), getDeposits()),
  );
  handle("reports:list-deposits", (_event, request: unknown) =>
    (guard("reports.view"), listDeposits(request as DepositReportRequest)),
  );
  handle(
    "reports:get-vehicle-utilization",
    (_event, startDate: unknown, endDate: unknown) =>
      (guard("reports.view"), getVehicleUtilization(String(startDate), String(endDate))),
  );
  handle(
    "reports:get-vehicle-net-summary",
    (_event, startDate: unknown, endDate: unknown) =>
      (guard("reports.view"), getVehicleNetSummary(String(startDate), String(endDate))),
  );
  handle("reports:get-expiring-documents", () =>
    (guard("reports.view"), getExpiringDocuments()),
  );
  handle("reports:get-cancelled-rentals", () =>
    (guard("reports.view"), getCancelledRentals()),
  );
  handle("reports:get-payment-voids", () =>
    (guard("reports.view"), getPaymentVoids()),
  );
  handle("reports:get-vehicle-sales", (_event, request: unknown) =>
    (guard("reports.view"), getVehicleSales(request as VehicleSalesReportRequest)),
  );
  handle("reports:get-commissions", (_event, request: unknown) =>
    (guard("reports.view"), getCommissionReport(request as CommissionReportRequest)),
  );
  handle("reports:export", (_event, request: unknown) =>
    (guard("reports.export"), exportReport(request as ReportExportRequest)),
  );
  handle("rentals:print-contract", (_event, rentalId: unknown, printToPDF: unknown, language: unknown) =>
    (guard("rentals.view"), printRentalContract(Number(rentalId), Boolean(printToPDF), language as "ar" | "en" | "both" | undefined)),
  );
  handle("payments:print-receipt", (_event, paymentId: unknown, printToPDF: unknown, language: unknown) =>
    (guard("payments.view"), printPaymentReceipt(Number(paymentId), Boolean(printToPDF), language as "ar" | "en" | "both" | undefined)),
  );
  handle("vehicle-sales:print-receipt", (_event, saleId: unknown, printToPDF: unknown, language: unknown) =>
    (guard("vehicleSales.view"), printVehicleSaleReceipt(Number(saleId), Boolean(printToPDF), language as "ar" | "en" | "both" | undefined)),
  );
  handle("backup:run-backup", () =>
    (guard("backup.export"), runBackup()),
  );
  handle("backup:run-restore", (_event, input: unknown) =>
    (guard("backup.restore"), runRestore(input)),
  );
  handle("backup:get-status", () =>
    (guard("backup.export"), getBackupStatus()),
  );
  handle("backup:preview", () =>
    (guard("backup.restore"), previewBackup()),
  );
  handle("backup:verify", () =>
    (guard("backup.restore"), verifyBackup()),
  );
  handle("settings:get", () => getShopSettings());
  handle("settings:save", (_event, settings: unknown) =>
    (guard("settings.edit"), saveShopSettings(settings as Partial<ShopSettings>)),
  );
  handle("settings:select-logo", (_event, input: unknown) =>
    (guard("settings.edit"), selectShopLogo(input)),
  );
  handle("settings:clear-logo", (_event, input: unknown) =>
    (guard("settings.edit"), clearShopLogo(input)),
  );
  handle("settings:select-owner-signature", (_event, input: unknown) =>
    (guard("settings.edit"), selectOwnerSignature(input)),
  );
  handle("settings:clear-owner-signature", (_event, input: unknown) =>
    (guard("settings.edit"), clearOwnerSignature(input)),
  );
  handle("maintenance:list", (_event, request: unknown) =>
    (guard("maintenance.view"), listMaintenance(request as MaintenanceListRequest)),
  );
  handle("maintenance:create", (_event, input: unknown) =>
    (guard("maintenance.create"), createMaintenance(input as MaintenanceInput)),
  );
  handle("maintenance:update", (_event, id: unknown, input: unknown) =>
    (guardAny(["maintenance.edit", "maintenance.complete"]), updateMaintenance(Number(id), input as MaintenanceInput)),
  );
  handle("maintenance:archive", (_event, id: unknown) =>
    (guard("maintenance.archive"), archiveMaintenance(id)),
  );
  handle("attachments:list", (_event, request: unknown) =>
    listAttachments(request as AttachmentListRequest),
  );
  handle("attachments:add", (_event, request: unknown) =>
    addAttachment(request as AttachmentUploadRequest),
  );
  handle("attachments:upload", (_event, request: unknown) =>
    addAttachment(request as AttachmentUploadRequest),
  );
  handle("attachments:save-captured-photo", (_event, request: unknown) =>
    saveCapturedPhoto(request as AttachmentCapturedPhotoRequest),
  );
  handle("attachments:replace", (_event, request: unknown) =>
    replaceAttachment(request as AttachmentReplaceRequest),
  );
  handle("attachments:open", (_event, id: unknown) =>
    openAttachment(Number(id)),
  );
  handle("attachments:get-preview", (_event, id: unknown) =>
    getAttachmentPreview(Number(id)),
  );
  handle("attachments:archive", (_event, request: unknown) =>
    archiveAttachment(request as AttachmentArchiveRequest),
  );
  handle("search:global", (_event, query: unknown) => {
    guardAny([
      "rentals.view",
      "vehicles.view",
      "customers.view",
      "payments.view",
      "accounting.view",
    ]);
    return globalSearch(query);
  });
  handle("diagnostics:get-status", () =>
    (guard("settings.view"), getDiagnosticsStatus()),
  );
  handle("data-health:scan", () =>
    (guard("settings.view"), scanDataHealth()),
  );
  handle("data-health:apply-fix", (_event, request: unknown) =>
    (guard("settings.edit"), applyDataHealthFix(request as DataHealthFixRequest)),
  );
  handle("security:set-owner-pin", (_event, input: unknown) =>
    (guard("settings.edit"), setOwnerPin(input)),
  );
  handle("security:clear-owner-pin", (_event, input: unknown) =>
    (guard("settings.edit"), clearOwnerPin(input)),
  );
  handle("security:approve-sensitive-action", (_event, input: unknown) =>
    approveSensitiveAction(input),
  );

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isAppQuitting = true;
  closeDatabase();
});
