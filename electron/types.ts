import type { CustomerInput, CustomerRecord } from "../src/shared/customers";
import type { PaymentInput, PaymentRecord } from "../src/shared/payments";
import type {
  RentalActivationInput,
  RentalFormOptions,
  RentalListRecord,
  RentalReturnInput,
} from "../src/shared/rentals";
import type { VehicleInput, VehicleRecord } from "../src/shared/vehicles";
import type {
  DailyPaymentRecord,
  DashboardStats,
  VehicleIncomeRecord,
} from "../src/shared/reports";

export type AppInfo = {
  appVersion: string;
  databasePath: string;
  uploadsPath: string;
};

export type RentalAppApi = {
  getAppInfo: () => Promise<AppInfo>;
  vehicles: {
    list: (search?: string) => Promise<VehicleRecord[]>;
    create: (input: VehicleInput) => Promise<VehicleRecord>;
    update: (id: number, input: VehicleInput) => Promise<VehicleRecord>;
  };
  customers: {
    list: (search?: string) => Promise<CustomerRecord[]>;
    create: (input: CustomerInput) => Promise<CustomerRecord>;
    update: (id: number, input: CustomerInput) => Promise<CustomerRecord>;
    deactivate: (id: number) => Promise<void>;
  };
  rentals: {
    list: (search?: string) => Promise<RentalListRecord[]>;
    getFormOptions: () => Promise<RentalFormOptions>;
    activate: (input: RentalActivationInput) => Promise<RentalListRecord>;
    return: (input: RentalReturnInput) => Promise<RentalListRecord>;
  };
  payments: {
    listForRental: (rentalId: number) => Promise<PaymentRecord[]>;
    create: (input: PaymentInput) => Promise<PaymentRecord>;
  };
  reports: {
    getDashboardStats: () => Promise<DashboardStats>;
    getActiveRentals: () => Promise<RentalListRecord[]>;
    getOverdueRentals: () => Promise<RentalListRecord[]>;
    getDailyPayments: (date: string) => Promise<DailyPaymentRecord[]>;
    getVehicleIncome: (
      startDate: string,
      endDate: string,
    ) => Promise<VehicleIncomeRecord[]>;
  };
};
