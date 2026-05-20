export type DashboardStats = {
  availableVehicles: number;
  rentedVehicles: number;
  overdueRentals: number;
  expectedReturnsToday: number;
  incomeToday: number;
};

export type ReturnedRentalsReportRequest = {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type CustomerRentalHistoryRequest = {
  customerId: number;
  page?: number;
  pageSize?: number;
};

export type DailyPaymentsReportRequest = {
  date: string;
  page?: number;
  pageSize?: number;
};

export type DailyPaymentRecord = {
  id: number;
  rentalId: number;
  contractNo: string;
  customerId: number;
  customerName: string;
  type: "rent" | "deposit" | "extra_charge" | "refund";
  method: "cash" | "card" | "bank_transfer" | "other";
  amount: number;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
};

export type VehicleIncomeRecord = {
  vehicleId: number;
  plateNumber: string;
  brand: string;
  model: string;
  totalIncome: number;
  rentalCount: number;
};
