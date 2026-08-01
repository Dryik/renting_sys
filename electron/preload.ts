import { contextBridge, ipcRenderer as electronIpcRenderer } from "electron";
import { normalizeIpcRendererError } from "./ipc-errors";
import type { RentalAppApi } from "./types";

const ipcRenderer = {
  invoke: (...args: Parameters<typeof electronIpcRenderer.invoke>) =>
    electronIpcRenderer.invoke(...args).catch((error: unknown) => {
      throw normalizeIpcRendererError(error);
    }),
};

const api: RentalAppApi = {
  auth: {
    getState: () => ipcRenderer.invoke("auth:get-state"),
    setupOwner: (input) => ipcRenderer.invoke("auth:setup-owner", input),
    login: (input) => ipcRenderer.invoke("auth:login", input),
    logout: () => ipcRenderer.invoke("auth:logout"),
    lock: () => ipcRenderer.invoke("auth:lock"),
    unlock: (input) => ipcRenderer.invoke("auth:unlock", input),
    changePassword: (input) =>
      ipcRenderer.invoke("auth:change-password", input),
  },
  users: {
    list: () => ipcRenderer.invoke("users:list"),
    create: (input) => ipcRenderer.invoke("users:create", input),
    update: (input) => ipcRenderer.invoke("users:update", input),
    deactivate: (input) => ipcRenderer.invoke("users:deactivate", input),
    reactivate: (input) => ipcRenderer.invoke("users:reactivate", input),
    resetPassword: (input) =>
      ipcRenderer.invoke("users:reset-password", input),
  },
  audit: {
    list: (request) => ipcRenderer.invoke("audit:list", request),
  },
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  license: {
    getStatus: () => ipcRenderer.invoke("license:get-status"),
    exportRequest: () => ipcRenderer.invoke("license:export-request"),
    importLicense: () => ipcRenderer.invoke("license:import-license"),
  },
  vehicles: {
    list: (request) => ipcRenderer.invoke("vehicles:list", request),
    create: (input) => ipcRenderer.invoke("vehicles:create", input),
    update: (id, input) => ipcRenderer.invoke("vehicles:update", id, input),
  },
  vehicleSales: {
    list: (request) => ipcRenderer.invoke("vehicle-sales:list", request),
    getForVehicle: (vehicleId) =>
      ipcRenderer.invoke("vehicle-sales:get-for-vehicle", vehicleId),
    create: (input) => ipcRenderer.invoke("vehicle-sales:create", input),
    void: (input) => ipcRenderer.invoke("vehicle-sales:void", input),
    printReceipt: (saleId, printToPDF, language) =>
      ipcRenderer.invoke("vehicle-sales:print-receipt", saleId, printToPDF, language),
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
    createDraft: (input) => ipcRenderer.invoke("rentals:create-draft", input),
    updateDraft: (id, input) => ipcRenderer.invoke("rentals:update-draft", id, input),
    activateDraft: (id) => ipcRenderer.invoke("rentals:activate-draft", id),
    updateActive: (input) => ipcRenderer.invoke("rentals:update-active", input),
    return: (input) => ipcRenderer.invoke("rentals:return", input),
    returnWithPayment: (input) => ipcRenderer.invoke("rentals:return-with-payment", input),
    cancel: (rentalId) => ipcRenderer.invoke("rentals:cancel", rentalId),
    findOpenByPlate: (plateNumber) => ipcRenderer.invoke("rentals:find-open-by-plate", plateNumber),
    printContract: (rentalId, printToPDF, language) =>
      ipcRenderer.invoke("rentals:print-contract", rentalId, printToPDF, language),
  },
  payments: {
    list: (request) => ipcRenderer.invoke("payments:list", request),
    listForRental: (rentalId) =>
      ipcRenderer.invoke("payments:list-for-rental", rentalId),
    create: (input) => ipcRenderer.invoke("payments:create", input),
    void: (input) => ipcRenderer.invoke("payments:void", input),
    correct: (input) => ipcRenderer.invoke("payments:correct", input),
    printReceipt: (paymentId, printToPDF, language) =>
      ipcRenderer.invoke("payments:print-receipt", paymentId, printToPDF, language),
  },
  accounting: {
    getSummary: (request) => ipcRenderer.invoke("accounting:get-summary", request),
    listTransactions: (request) =>
      ipcRenderer.invoke("accounting:list-transactions", request),
    listExpenses: (request) =>
      ipcRenderer.invoke("accounting:list-expenses", request),
    createExpense: (input) => ipcRenderer.invoke("accounting:create-expense", input),
    voidExpense: (input) => ipcRenderer.invoke("accounting:void-expense", input),
    createCashMovement: (input) =>
      ipcRenderer.invoke("accounting:create-cash-movement", input),
    voidCashMovement: (input) =>
      ipcRenderer.invoke("accounting:void-cash-movement", input),
    createAdjustment: (input) =>
      ipcRenderer.invoke("accounting:create-adjustment", input),
    voidAdjustment: (input) =>
      ipcRenderer.invoke("accounting:void-adjustment", input),
    getDailyClosing: (date) =>
      ipcRenderer.invoke("accounting:get-daily-closing", date),
    saveDailyClosing: (input) =>
      ipcRenderer.invoke("accounting:save-daily-closing", input),
    saveStaffDailyClosing: (input) =>
      ipcRenderer.invoke("accounting:save-staff-daily-closing", input),
    getWeeklyIncome: (date) =>
      ipcRenderer.invoke("accounting:get-weekly-income", date),
  },
  employeeLoans: {
    listEmployees: () => ipcRenderer.invoke("employee-loans:list-employees"),
    list: (request) => ipcRenderer.invoke("employee-loans:list", request),
    listPayments: (loanId) =>
      ipcRenderer.invoke("employee-loans:list-payments", loanId),
    create: (input) => ipcRenderer.invoke("employee-loans:create", input),
    repay: (input) => ipcRenderer.invoke("employee-loans:repay", input),
    void: (input) => ipcRenderer.invoke("employee-loans:void", input),
  },
  accessories: {
    list: (request) => ipcRenderer.invoke("accessories:list", request),
    create: (input) => ipcRenderer.invoke("accessories:create", input),
    update: (id, input) => ipcRenderer.invoke("accessories:update", id, input),
  },
  reports: {
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
    getOutstandingBalances: () => ipcRenderer.invoke("reports:get-outstanding-balances"),
    listOutstandingBalances: (request) =>
      ipcRenderer.invoke("reports:list-outstanding-balances", request),
    getDailyClosing: (date) => ipcRenderer.invoke("reports:get-daily-closing", date),
    getDeposits: () => ipcRenderer.invoke("reports:get-deposits"),
    listDeposits: (request) => ipcRenderer.invoke("reports:list-deposits", request),
    getVehicleUtilization: (startDate, endDate) =>
      ipcRenderer.invoke("reports:get-vehicle-utilization", startDate, endDate),
    getVehicleNetSummary: (startDate, endDate) =>
      ipcRenderer.invoke("reports:get-vehicle-net-summary", startDate, endDate),
    getExpiringDocuments: () => ipcRenderer.invoke("reports:get-expiring-documents"),
    getCancelledRentals: () => ipcRenderer.invoke("reports:get-cancelled-rentals"),
    getPaymentVoids: () => ipcRenderer.invoke("reports:get-payment-voids"),
    getVehicleSales: (request) =>
      ipcRenderer.invoke("reports:get-vehicle-sales", request),
    getCommissions: (request) =>
      ipcRenderer.invoke("reports:get-commissions", request),
    export: (request) => ipcRenderer.invoke("reports:export", request),
  },
  backup: {
    runBackup: () => ipcRenderer.invoke("backup:run-backup"),
    runRestore: (input) => ipcRenderer.invoke("backup:run-restore", input),
    getStatus: () => ipcRenderer.invoke("backup:get-status"),
    preview: () => ipcRenderer.invoke("backup:preview"),
    verify: () => ipcRenderer.invoke("backup:verify"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings),
    selectLogo: (input) => ipcRenderer.invoke("settings:select-logo", input),
    clearLogo: (input) => ipcRenderer.invoke("settings:clear-logo", input),
    selectOwnerSignature: (input) =>
      ipcRenderer.invoke("settings:select-owner-signature", input),
    clearOwnerSignature: (input) =>
      ipcRenderer.invoke("settings:clear-owner-signature", input),
  },
  maintenance: {
    list: (request) => ipcRenderer.invoke("maintenance:list", request),
    create: (input) => ipcRenderer.invoke("maintenance:create", input),
    update: (id, input) => ipcRenderer.invoke("maintenance:update", id, input),
    archive: (id) => ipcRenderer.invoke("maintenance:archive", id),
  },
  attachments: {
    list: (request) => ipcRenderer.invoke("attachments:list", request),
    add: (request) => ipcRenderer.invoke("attachments:upload", request),
    upload: (request) => ipcRenderer.invoke("attachments:upload", request),
    saveCapturedPhoto: (request) => ipcRenderer.invoke("attachments:save-captured-photo", request),
    replace: (request) => ipcRenderer.invoke("attachments:replace", request),
    open: (id) => ipcRenderer.invoke("attachments:open", id),
    getPreview: (id) => ipcRenderer.invoke("attachments:get-preview", id),
    archive: (request) => ipcRenderer.invoke("attachments:archive", request),
  },
  search: {
    global: (query) => ipcRenderer.invoke("search:global", query),
  },
  diagnostics: {
    getStatus: () => ipcRenderer.invoke("diagnostics:get-status"),
  },
  dataHealth: {
    scan: () => ipcRenderer.invoke("data-health:scan"),
    applyFix: (request) => ipcRenderer.invoke("data-health:apply-fix", request),
  },
  security: {
    setOwnerPin: (input) => ipcRenderer.invoke("security:set-owner-pin", input),
    clearOwnerPin: (input) => ipcRenderer.invoke("security:clear-owner-pin", input),
    approveSensitiveAction: (input) =>
      ipcRenderer.invoke("security:approve-sensitive-action", input),
  },
  updates: {
    onDownloaded: (callback) => {
      const handler = (
        _event: unknown,
        info: { version: string },
      ) => callback(info);
      electronIpcRenderer.on("update:downloaded", handler);
      return () => electronIpcRenderer.removeListener("update:downloaded", handler);
    },
    onStatusChange: (callback) => {
      const handler = (
        _event: unknown,
        state: any,
      ) => callback(state);
      electronIpcRenderer.on("update:status-change", handler);
      return () => electronIpcRenderer.removeListener("update:status-change", handler);
    },
    restartAndInstall: () => ipcRenderer.invoke("app:restart-and-install-update"),
    getPendingUpdate: () => ipcRenderer.invoke("app:get-pending-update"),
    getUpdateState: () => ipcRenderer.invoke("app:get-update-state"),
    checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
  },
};

contextBridge.exposeInMainWorld("rentalApp", api);
