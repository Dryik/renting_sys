import { contextBridge, ipcRenderer } from "electron";
import type { RentalAppApi } from "./types";

const api: RentalAppApi = {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  vehicles: {
    list: (search) => ipcRenderer.invoke("vehicles:list", search),
    create: (input) => ipcRenderer.invoke("vehicles:create", input),
    update: (id, input) => ipcRenderer.invoke("vehicles:update", id, input),
  },
  customers: {
    list: (search) => ipcRenderer.invoke("customers:list", search),
    create: (input) => ipcRenderer.invoke("customers:create", input),
    update: (id, input) => ipcRenderer.invoke("customers:update", id, input),
    deactivate: (id) => ipcRenderer.invoke("customers:deactivate", id),
  },
  rentals: {
    list: (search) => ipcRenderer.invoke("rentals:list", search),
    getFormOptions: () => ipcRenderer.invoke("rentals:get-form-options"),
    activate: (input) => ipcRenderer.invoke("rentals:activate", input),
    return: (input) => ipcRenderer.invoke("rentals:return", input),
  },
  payments: {
    listForRental: (rentalId) =>
      ipcRenderer.invoke("payments:list-for-rental", rentalId),
    create: (input) => ipcRenderer.invoke("payments:create", input),
  },
  reports: {
    getDashboardStats: () => ipcRenderer.invoke("reports:get-dashboard-stats"),
    getActiveRentals: () => ipcRenderer.invoke("reports:get-active-rentals"),
    getOverdueRentals: () => ipcRenderer.invoke("reports:get-overdue-rentals"),
    getDailyPayments: (date) =>
      ipcRenderer.invoke("reports:get-daily-payments", date),
    getVehicleIncome: (startDate, endDate) =>
      ipcRenderer.invoke("reports:get-vehicle-income", startDate, endDate),
  },
};

contextBridge.exposeInMainWorld("rentalApp", api);
