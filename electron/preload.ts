import { contextBridge, ipcRenderer } from "electron";
import type { RentalAppApi } from "./types";

const api: RentalAppApi = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  vehicles: {
    list: (request) => ipcRenderer.invoke("vehicles:list", request),
    create: (input) => ipcRenderer.invoke("vehicles:create", input),
    update: (id, input) => ipcRenderer.invoke("vehicles:update", id, input),
  },
  customers: {
    list: (request) => ipcRenderer.invoke("customers:list", request),
    create: (input) => ipcRenderer.invoke("customers:create", input),
    update: (id, input) => ipcRenderer.invoke("customers:update", id, input),
    deactivate: (id) => ipcRenderer.invoke("customers:deactivate", id),
  },
  rentals: {
    list: (request) => ipcRenderer.invoke("rentals:list", request),
    getFormOptions: () => ipcRenderer.invoke("rentals:get-form-options"),
    activate: (input) => ipcRenderer.invoke("rentals:activate", input),
    return: (input) => ipcRenderer.invoke("rentals:return", input),
    cancel: (rentalId) => ipcRenderer.invoke("rentals:cancel", rentalId),
    printContract: (rentalId, printToPDF) =>
      ipcRenderer.invoke("rentals:print-contract", rentalId, printToPDF),
  },
  payments: {
    list: (request) => ipcRenderer.invoke("payments:list", request),
    listForRental: (rentalId) =>
      ipcRenderer.invoke("payments:list-for-rental", rentalId),
    create: (input) => ipcRenderer.invoke("payments:create", input),
    printReceipt: (paymentId, printToPDF) =>
      ipcRenderer.invoke("payments:print-receipt", paymentId, printToPDF),
  },
  reports: {
    getDashboardStats: () => ipcRenderer.invoke("reports:get-dashboard-stats"),
    getActiveRentals: () => ipcRenderer.invoke("reports:get-active-rentals"),
    getOverdueRentals: () => ipcRenderer.invoke("reports:get-overdue-rentals"),
    getReturnedRentals: (request) =>
      ipcRenderer.invoke("reports:get-returned-rentals", request),
    getCustomerRentalHistory: (request) =>
      ipcRenderer.invoke("reports:get-customer-rental-history", request),
    getDailyPayments: (request) =>
      ipcRenderer.invoke("reports:get-daily-payments", request),
    getVehicleIncome: (startDate, endDate) =>
      ipcRenderer.invoke("reports:get-vehicle-income", startDate, endDate),
  },
  backup: {
    runBackup: () => ipcRenderer.invoke("backup:run-backup"),
    runRestore: () => ipcRenderer.invoke("backup:run-restore"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings),
  },
  maintenance: {
    list: (request) => ipcRenderer.invoke("maintenance:list", request),
    create: (input) => ipcRenderer.invoke("maintenance:create", input),
    update: (id, input) => ipcRenderer.invoke("maintenance:update", id, input),
    archive: (id) => ipcRenderer.invoke("maintenance:archive", id),
  },
};

contextBridge.exposeInMainWorld("rentalApp", api);
