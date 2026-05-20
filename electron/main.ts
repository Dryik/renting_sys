import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import {
  createCustomer,
  deactivateCustomer,
  listCustomers,
  updateCustomer,
} from "./db/customers.service";
import { closeDatabase, initializeDatabase } from "./db/database";
import {
  createPayment,
  listPaymentsForRental,
  listPayments,
} from "./db/payments.service";
import {
  activateRental,
  cancelRental,
  getRentalFormOptions,
  listRentals,
  returnRental,
} from "./db/rentals.service";
import {
  createVehicle,
  listVehicles,
  updateVehicle,
} from "./db/vehicles.service";
import {
  getActiveRentals,
  getCustomerRentalHistory,
  getDailyPayments,
  getDashboardStats,
  getOverdueRentals,
  getReturnedRentals,
  getVehicleIncome,
} from "./db/reports.service";
import {
  printRentalContract,
  printPaymentReceipt,
} from "./db/print.service";
import {
  runBackup,
  runRestore,
} from "./db/backup.service";
import {
  getShopSettings,
  saveShopSettings,
} from "./db/settings.service";
import {
  listMaintenance,
  createMaintenance,
  updateMaintenance,
  archiveMaintenance,
} from "./db/maintenance.service";
import type { AppInfo } from "./types";
import type { ShopSettings } from "../src/shared/settings";
import type { CustomerListRequest } from "../src/shared/customers";
import type { MaintenanceInput, MaintenanceListRequest } from "../src/shared/maintenance";
import type { PaymentListRequest } from "../src/shared/payments";
import type { RentalListRequest } from "../src/shared/rentals";
import type {
  CustomerRentalHistoryRequest,
  DailyPaymentsReportRequest,
  ReturnedRentalsReportRequest,
} from "../src/shared/reports";
import type { VehicleListRequest } from "../src/shared/vehicles";

let mainWindow: BrowserWindow | null = null;
let appInfo: AppInfo | null = null;
const isSmokeTest = process.env.RENTAL_APP_SMOKE_TEST === "1";

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: "Rental Desk",
    show: false,
    backgroundColor: "#f7f7f8",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();

  mainWindow.once("ready-to-show", () => {
    if (isSmokeTest) {
      console.log("Rental app smoke test: main window ready.");
      app.quit();
      return;
    }

    mainWindow?.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  const databaseState = initializeDatabase();
  appInfo = {
    appVersion: app.getVersion(),
    ...databaseState,
  };

  ipcMain.handle("app:get-info", () => appInfo);
  ipcMain.handle("vehicles:list", (_event, request: unknown) =>
    listVehicles(request as VehicleListRequest),
  );
  ipcMain.handle("vehicles:create", (_event, input: unknown) =>
    createVehicle(input),
  );
  ipcMain.handle("vehicles:update", (_event, id: unknown, input: unknown) =>
    updateVehicle(id, input),
  );
  ipcMain.handle("customers:list", (_event, request: unknown) =>
    listCustomers(request as CustomerListRequest),
  );
  ipcMain.handle("customers:create", (_event, input: unknown) =>
    createCustomer(input),
  );
  ipcMain.handle("customers:update", (_event, id: unknown, input: unknown) =>
    updateCustomer(id, input),
  );
  ipcMain.handle("customers:deactivate", (_event, id: unknown) =>
    deactivateCustomer(id),
  );
  ipcMain.handle("rentals:list", (_event, request: unknown) =>
    listRentals(request as RentalListRequest),
  );
  ipcMain.handle("rentals:get-form-options", () => getRentalFormOptions());
  ipcMain.handle("rentals:activate", (_event, input: unknown) =>
    activateRental(input),
  );
  ipcMain.handle("rentals:return", (_event, input: unknown) =>
    returnRental(input),
  );
  ipcMain.handle("rentals:cancel", (_event, rentalId: unknown) =>
    cancelRental(rentalId),
  );
  ipcMain.handle("payments:list", (_event, request: unknown) =>
    listPayments(request as PaymentListRequest),
  );
  ipcMain.handle("payments:list-for-rental", (_event, rentalId: unknown) =>
    listPaymentsForRental(rentalId),
  );
  ipcMain.handle("payments:create", (_event, input: unknown) =>
    createPayment(input),
  );
  ipcMain.handle("reports:get-dashboard-stats", () => getDashboardStats());
  ipcMain.handle("reports:get-active-rentals", () => getActiveRentals());
  ipcMain.handle("reports:get-overdue-rentals", () => getOverdueRentals());
  ipcMain.handle("reports:get-returned-rentals", (_event, request: unknown) =>
    getReturnedRentals(request as ReturnedRentalsReportRequest),
  );
  ipcMain.handle("reports:get-customer-rental-history", (_event, request: unknown) =>
    getCustomerRentalHistory(request as CustomerRentalHistoryRequest),
  );
  ipcMain.handle("reports:get-daily-payments", (_event, request: unknown) =>
    getDailyPayments(request as DailyPaymentsReportRequest),
  );
  ipcMain.handle(
    "reports:get-vehicle-income",
    (_event, startDate: unknown, endDate: unknown) =>
      getVehicleIncome(startDate as string, endDate as string),
  );
  ipcMain.handle("rentals:print-contract", (_event, rentalId: unknown, printToPDF: unknown) =>
    printRentalContract(Number(rentalId), Boolean(printToPDF)),
  );
  ipcMain.handle("payments:print-receipt", (_event, paymentId: unknown, printToPDF: unknown) =>
    printPaymentReceipt(Number(paymentId), Boolean(printToPDF)),
  );
  ipcMain.handle("backup:run-backup", () => runBackup());
  ipcMain.handle("backup:run-restore", () => runRestore());
  ipcMain.handle("settings:get", () => getShopSettings());
  ipcMain.handle("settings:save", (_event, settings: unknown) =>
    saveShopSettings(settings as Partial<ShopSettings>),
  );
  ipcMain.handle("maintenance:list", (_event, request: unknown) =>
    listMaintenance(request as MaintenanceListRequest),
  );
  ipcMain.handle("maintenance:create", (_event, input: unknown) =>
    createMaintenance(input as MaintenanceInput),
  );
  ipcMain.handle("maintenance:update", (_event, id: unknown, input: unknown) =>
    updateMaintenance(Number(id), input as MaintenanceInput),
  );
  ipcMain.handle("maintenance:archive", (_event, id: unknown) =>
    archiveMaintenance(Number(id)),
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
  closeDatabase();
});
