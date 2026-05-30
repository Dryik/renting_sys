import { translate } from "./i18n";
import type { LanguageCode } from "./language";
import type { PageRequest } from "./pagination";
import type { VehicleSaleListRecord, VehicleSaleListRequest } from "./vehicle-sales";

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

export type OutstandingBalanceRecord = {
  rentalId: number;
  contractNo: string;
  customerName: string;
  customerPhone: string;
  vehiclePlateNumber: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  expectedReturnDatetime: string;
};

export type OutstandingBalancesReportRequest = PageRequest & {
  includeTotal?: boolean;
};

export type DailyClosingRecord = {
  date: string;
  cashPayments: number;
  cardPayments: number;
  bankTransfers: number;
  otherPayments: number;
  vehicleSales: number;
  refunds: number;
  expenses: number;
  ownerWithdrawals: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  totalCollected: number;
  openBalancesCreatedToday: number;
  returnedRentalsUnpaidToday: number;
};

export type DepositReportRecord = {
  rentalId: number;
  contractNo: string;
  customerName: string;
  vehiclePlateNumber: string;
  status: string;
  depositRequired: number;
  depositPaid: number;
  depositRefunded: number;
  depositHeld: number;
};

export type DepositReportRequest = PageRequest & {
  heldOnly?: boolean;
  includeTotal?: boolean;
};

export type VehicleUtilizationRecord = {
  vehicleId: number;
  plateNumber: string;
  brand: string;
  model: string;
  rentalCount: number;
  rentedDays: number;
  periodDays: number;
  utilizationPercent: number;
};

export type VehicleNetSummaryRecord = {
  vehicleId: number;
  plateNumber: string;
  brand: string;
  model: string;
  rentalIncome: number;
  maintenanceCost: number;
  simpleNet: number;
};

export type ExpiringDocumentRecord = {
  entityType: "vehicle" | "customer";
  entityId: number;
  name: string;
  documentType: ExpiringDocumentType;
  expiryDate: string;
  daysRemaining: number;
};

export const expiringDocumentTypeValues = [
  "insurance",
  "registration",
  "technical_inspection",
  "license",
] as const;

export type ExpiringDocumentType = (typeof expiringDocumentTypeValues)[number];

export function formatExpiringDocumentType(
  type: ExpiringDocumentType,
  language: LanguageCode = "en",
): string {
  const labels: Record<ExpiringDocumentType, string> = {
    insurance: "Mandatory Insurance",
    registration: "Vehicle Circulation License",
    technical_inspection: "Technical Inspection",
    license: "Driver License",
  };

  return translate(language, labels[type]);
}

export type CancelledRentalRecord = {
  rentalId: number;
  contractNo: string;
  customerName: string;
  vehiclePlateNumber: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  totalAmount: number;
};

export type PaymentVoidRecord = {
  paymentId: number;
  receiptNo: string | null;
  contractNo: string;
  customerName: string;
  type: string;
  method: string;
  amount: number;
  voidedAt: string | null;
  voidReason: string | null;
};

export type VehicleSalesReportRequest = VehicleSaleListRequest;
export type VehicleSalesReportRecord = VehicleSaleListRecord;

export type ReportExportType =
  | "activeRentals"
  | "overdueRentals"
  | "returnedRentals"
  | "dailyPayments"
  | "vehicleIncome"
  | "outstandingBalances"
  | "dailyClosing"
  | "deposits"
  | "vehicleUtilization"
  | "vehicleNetSummary"
  | "expiringDocuments"
  | "cancelledRentals"
  | "paymentVoids"
  | "vehicleSales"
  | "accountingTransactions"
  | "expenses";

export type ReportExportRequest = {
  type: ReportExportType;
  format: "csv" | "xlsx";
  date?: string;
  startDate?: string;
  endDate?: string;
  customerId?: number;
  search?: string;
};
