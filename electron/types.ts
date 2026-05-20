import type { CustomerInput, CustomerListRequest, CustomerRecord } from "../src/shared/customers";
import type { PageResult } from "../src/shared/pagination";
import type { PaymentInput, PaymentListRecord, PaymentListRequest, PaymentRecord } from "../src/shared/payments";
import type {
  RentalActivationInput,
  RentalFormOptions,
  RentalListRequest,
  RentalListRecord,
  RentalListSummary,
  RentalReturnInput,
} from "../src/shared/rentals";
import type { VehicleInput, VehicleListRequest, VehicleRecord } from "../src/shared/vehicles";
import type {
  MaintenanceInput,
  MaintenanceListRequest,
  MaintenanceRecord,
  MaintenanceRecordWithVehicle,
} from "../src/shared/maintenance";
import type {
  CustomerRentalHistoryRequest,
  DailyPaymentRecord,
  DailyPaymentsReportRequest,
  DashboardStats,
  ReturnedRentalsReportRequest,
  VehicleIncomeRecord,
} from "../src/shared/reports";
import type { ShopSettings } from "../src/shared/settings";

export type AppInfo = {
  appVersion: string;
  databasePath: string;
  uploadsPath: string;
};

export type RentalAppApi = {
  getAppInfo: () => Promise<AppInfo>;
  vehicles: {
    list: (request?: VehicleListRequest) => Promise<PageResult<VehicleRecord>>;
    create: (input: VehicleInput) => Promise<VehicleRecord>;
    update: (id: number, input: VehicleInput) => Promise<VehicleRecord>;
  };
  customers: {
    list: (request?: CustomerListRequest) => Promise<PageResult<CustomerRecord>>;
    create: (input: CustomerInput) => Promise<CustomerRecord>;
    update: (id: number, input: CustomerInput) => Promise<CustomerRecord>;
    deactivate: (id: number) => Promise<void>;
  };
  rentals: {
    list: (request?: RentalListRequest) => Promise<PageResult<RentalListRecord, RentalListSummary>>;
    getFormOptions: () => Promise<RentalFormOptions>;
    activate: (input: RentalActivationInput) => Promise<RentalListRecord>;
    return: (input: RentalReturnInput) => Promise<RentalListRecord>;
    cancel: (rentalId: number) => Promise<RentalListRecord>;
    printContract: (rentalId: number, printToPDF: boolean) => Promise<void>;
  };
  payments: {
    list: (request?: PaymentListRequest) => Promise<PageResult<PaymentListRecord>>;
    listForRental: (rentalId: number) => Promise<PaymentRecord[]>;
    create: (input: PaymentInput) => Promise<PaymentRecord>;
    printReceipt: (paymentId: number, printToPDF: boolean) => Promise<void>;
  };
  reports: {
    getDashboardStats: () => Promise<DashboardStats>;
    getActiveRentals: () => Promise<RentalListRecord[]>;
    getOverdueRentals: () => Promise<RentalListRecord[]>;
    getReturnedRentals: (
      request?: ReturnedRentalsReportRequest,
    ) => Promise<PageResult<RentalListRecord>>;
    getCustomerRentalHistory: (
      request: CustomerRentalHistoryRequest,
    ) => Promise<PageResult<RentalListRecord>>;
    getDailyPayments: (
      request: DailyPaymentsReportRequest,
    ) => Promise<PageResult<DailyPaymentRecord>>;
    getVehicleIncome: (
      startDate: string,
      endDate: string,
    ) => Promise<VehicleIncomeRecord[]>;
  };
  backup: {
    runBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
    runRestore: () => Promise<{
      success: boolean;
      safetyBackupPath?: string;
      error?: string;
    }>;
  };
  settings: {
    get: () => Promise<ShopSettings>;
    save: (settings: Partial<ShopSettings>) => Promise<ShopSettings>;
  };
  maintenance: {
    list: (request?: MaintenanceListRequest) => Promise<PageResult<MaintenanceRecordWithVehicle>>;
    create: (input: MaintenanceInput) => Promise<MaintenanceRecord>;
    update: (id: number, input: MaintenanceInput) => Promise<MaintenanceRecord>;
    archive: (id: number) => Promise<void>;
  };
};
