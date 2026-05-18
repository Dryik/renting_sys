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
} from "./db/payments.service";
import {
  activateRental,
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
  getDailyPayments,
  getDashboardStats,
  getOverdueRentals,
  getVehicleIncome,
} from "./db/reports.service";
import type { AppInfo } from "./types";

let mainWindow: BrowserWindow | null = null;
let appInfo: AppInfo | null = null;
const isSmokeTest = process.env.RENTAL_APP_SMOKE_TEST === "1";

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: "Local Vehicle Rental",
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

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
  ipcMain.handle("vehicles:list", (_event, search?: string) =>
    listVehicles(search),
  );
  ipcMain.handle("vehicles:create", (_event, input: unknown) =>
    createVehicle(input),
  );
  ipcMain.handle("vehicles:update", (_event, id: unknown, input: unknown) =>
    updateVehicle(id, input),
  );
  ipcMain.handle("customers:list", (_event, search?: string) =>
    listCustomers(search),
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
  ipcMain.handle("rentals:list", (_event, search?: string) =>
    listRentals(search),
  );
  ipcMain.handle("rentals:get-form-options", () => getRentalFormOptions());
  ipcMain.handle("rentals:activate", (_event, input: unknown) =>
    activateRental(input),
  );
  ipcMain.handle("rentals:return", (_event, input: unknown) =>
    returnRental(input),
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
  ipcMain.handle("reports:get-daily-payments", (_event, date: unknown) =>
    getDailyPayments(date as string),
  );
  ipcMain.handle(
    "reports:get-vehicle-income",
    (_event, startDate: unknown, endDate: unknown) =>
      getVehicleIncome(startDate as string, endDate as string),
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
