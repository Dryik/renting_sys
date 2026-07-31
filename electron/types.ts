import type { CustomerInput, CustomerListRequest, CustomerRecord } from "../src/shared/customers";
import type { PageResult } from "../src/shared/pagination";
import type { PaymentInput, PaymentListRecord, PaymentListRequest, PaymentRecord } from "../src/shared/payments";
import type { PaymentCorrectionInput, PaymentVoidInput } from "../src/shared/payments";
import type {
  VehicleSaleInput,
  VehicleSaleListRecord,
  VehicleSaleListRequest,
  VehicleSaleRecord,
  VehicleSaleVoidInput,
} from "../src/shared/vehicle-sales";
import type {
  AccountingDailyClosingRecord,
  AccountingDailyClosingSaveInput,
  AccountingAdjustmentInput,
  AccountingAdjustmentRecord,
  AccountingListRequest,
  AccountingSummary,
  AccountingSummaryRequest,
  AccountingTransactionRecord,
  AccountingVoidInput,
  CashMovementInput,
  CashMovementRecord,
  ExpenseInput,
  ExpenseListRecord,
  ExpenseRecord,
  StaffDailyClosingInput,
  StaffDailyClosingRecord,
  WeeklyIncomeDayRecord,
} from "../src/shared/accounting";
import type {
  RentalActivationInput,
  RentalActiveUpdateInput,
  RentalCancelInput,
  RentalFormOptions,
  RentalListRequest,
  RentalListRecord,
  RentalListSummary,
  RentalReturnInput,
  RentalReturnWithPaymentInput,
} from "../src/shared/rentals";
import type {
  AccessoryInput,
  AccessoryListRequest,
  AccessoryRecord,
} from "../src/shared/accessories";
import type {
  EmployeeLoanInput,
  EmployeeLoanEmployeeOption,
  EmployeeLoanListRequest,
  EmployeeLoanPaymentRecord,
  EmployeeLoanRecord,
  EmployeeLoanRepaymentInput,
  EmployeeLoanVoidInput,
} from "../src/shared/employee-loans";
import type { VehicleInput, VehicleListRequest, VehicleRecord } from "../src/shared/vehicles";
import type {
  MaintenanceInput,
  MaintenanceListRequest,
  MaintenanceRecord,
  MaintenanceRecordWithVehicle,
} from "../src/shared/maintenance";
import type {
  CustomerRentalHistoryRequest,
  CommissionReportRequest,
  CommissionReportSummary,
  DailyPaymentRecord,
  DailyPaymentsReportRequest,
  DepositReportRequest,
  OutstandingBalancesReportRequest,
  ReturnedRentalsReportRequest,
  VehicleIncomeRecord,
  VehicleSalesReportRequest,
  VehicleSalesReportRecord,
} from "../src/shared/reports";
import type {
  CancelledRentalRecord,
  DailyClosingRecord,
  DepositReportRecord,
  ExpiringDocumentRecord,
  OutstandingBalanceRecord,
  PaymentVoidRecord,
  ReportExportRequest,
  VehicleNetSummaryRecord,
  VehicleUtilizationRecord,
} from "../src/shared/reports";
import type { ShopSettings } from "../src/shared/settings";
import type {
  AttachmentArchiveRequest,
  AttachmentCapturedPhotoRequest,
  AttachmentListRequest,
  AttachmentPreview,
  AttachmentRecord,
  AttachmentReplaceRequest,
  AttachmentUploadRequest,
} from "../src/shared/attachments";
import type { GlobalSearchResult } from "../src/shared/search";
import type { BackupPreview, BackupStatus, BackupVerifyResult } from "../src/shared/backup";
import type { DiagnosticsStatus } from "../src/shared/diagnostics";
import type { DataHealthFixRequest, DataHealthIssue } from "../src/shared/data-health";
import type { OwnerPinSetupInput, SensitiveApproval, SensitiveApprovalInput } from "../src/shared/security";
import type {
  AuthState,
  ChangePasswordInput,
  CreateUserInput,
  DeactivateUserInput,
  LoginInput,
  OwnerSetupInput,
  ReactivateUserInput,
  ResetPasswordInput,
  UnlockInput,
  UpdateUserInput,
  UserListRecord,
} from "../src/shared/auth";
import type { AuditEventRecord, AuditListRequest } from "../src/shared/audit";
import type {
  LicenseImportResult,
  LicenseRequestExportResult,
  LicenseStatus,
} from "../src/shared/license";

export type AppInfo = {
  appVersion: string;
  databasePath: string;
  uploadsPath: string;
};

export type RentalAppApi = {
  auth: {
    getState: () => Promise<AuthState>;
    setupOwner: (input: OwnerSetupInput) => Promise<AuthState>;
    login: (input: LoginInput) => Promise<AuthState>;
    logout: () => Promise<AuthState>;
    lock: () => Promise<AuthState>;
    unlock: (input: UnlockInput) => Promise<AuthState>;
    changePassword: (input: ChangePasswordInput) => Promise<AuthState>;
  };
  users: {
    list: () => Promise<UserListRecord[]>;
    create: (input: CreateUserInput) => Promise<UserListRecord>;
    update: (input: UpdateUserInput) => Promise<UserListRecord>;
    deactivate: (input: DeactivateUserInput) => Promise<void>;
    reactivate: (input: ReactivateUserInput) => Promise<UserListRecord>;
    resetPassword: (input: ResetPasswordInput) => Promise<void>;
  };
  audit: {
    list: (request?: AuditListRequest) => Promise<PageResult<AuditEventRecord>>;
  };
  getAppInfo: () => Promise<AppInfo>;
  license: {
    getStatus: () => Promise<LicenseStatus>;
    exportRequest: () => Promise<LicenseRequestExportResult>;
    importLicense: () => Promise<LicenseImportResult>;
  };
  vehicles: {
    list: (request?: VehicleListRequest) => Promise<PageResult<VehicleRecord>>;
    create: (input: VehicleInput) => Promise<VehicleRecord>;
    update: (id: number, input: VehicleInput) => Promise<VehicleRecord>;
  };
  vehicleSales: {
    list: (request?: VehicleSaleListRequest) => Promise<PageResult<VehicleSaleListRecord>>;
    getForVehicle: (vehicleId: number) => Promise<VehicleSaleListRecord | null>;
    create: (input: VehicleSaleInput) => Promise<VehicleSaleRecord>;
    void: (input: VehicleSaleVoidInput) => Promise<VehicleSaleRecord>;
    printReceipt: (saleId: number, printToPDF: boolean, language?: "ar" | "en" | "both") => Promise<void>;
  };
  customers: {
    list: (request?: CustomerListRequest) => Promise<PageResult<CustomerRecord>>;
    create: (input: CustomerInput) => Promise<CustomerRecord>;
    update: (id: number, input: CustomerInput) => Promise<CustomerRecord>;
    deactivate: (input: number | { customerId: number; reason: string }) => Promise<void>;
  };
  rentals: {
    list: (request?: RentalListRequest) => Promise<PageResult<RentalListRecord, RentalListSummary>>;
    getFormOptions: () => Promise<RentalFormOptions>;
    activate: (input: RentalActivationInput) => Promise<RentalListRecord>;
    createDraft: (input: RentalActivationInput) => Promise<RentalListRecord>;
    updateDraft: (id: number, input: RentalActivationInput) => Promise<RentalListRecord>;
    activateDraft: (id: number) => Promise<RentalListRecord>;
    updateActive: (input: RentalActiveUpdateInput) => Promise<RentalListRecord>;
    return: (input: RentalReturnInput) => Promise<RentalListRecord>;
    returnWithPayment: (input: RentalReturnWithPaymentInput) => Promise<{
      rental: RentalListRecord;
      payment: PaymentRecord | null;
    }>;
    cancel: (input: number | RentalCancelInput) => Promise<RentalListRecord>;
    findOpenByPlate: (plateNumber: string) => Promise<RentalListRecord>;
    printContract: (rentalId: number, printToPDF: boolean, language?: "ar" | "en" | "both") => Promise<void>;
  };
  payments: {
    list: (request?: PaymentListRequest) => Promise<PageResult<PaymentListRecord>>;
    listForRental: (rentalId: number) => Promise<PaymentRecord[]>;
    create: (input: PaymentInput) => Promise<PaymentRecord>;
    void: (input: PaymentVoidInput) => Promise<PaymentRecord>;
    correct: (input: PaymentCorrectionInput) => Promise<PaymentRecord>;
    printReceipt: (paymentId: number, printToPDF: boolean, language?: "ar" | "en" | "both") => Promise<void>;
  };
  accounting: {
    getSummary: (request?: AccountingSummaryRequest) => Promise<AccountingSummary>;
    listTransactions: (
      request?: AccountingListRequest,
    ) => Promise<PageResult<AccountingTransactionRecord>>;
    listExpenses: (
      request?: AccountingListRequest,
    ) => Promise<PageResult<ExpenseListRecord>>;
    createExpense: (input: ExpenseInput) => Promise<ExpenseRecord>;
    voidExpense: (input: AccountingVoidInput) => Promise<ExpenseRecord>;
    createCashMovement: (
      input: CashMovementInput & { approvalToken?: string },
    ) => Promise<CashMovementRecord>;
    voidCashMovement: (input: AccountingVoidInput) => Promise<CashMovementRecord>;
    createAdjustment: (
      input: AccountingAdjustmentInput & { approvalToken?: string },
    ) => Promise<AccountingAdjustmentRecord>;
    voidAdjustment: (input: AccountingVoidInput) => Promise<AccountingAdjustmentRecord>;
    getDailyClosing: (date: string) => Promise<AccountingDailyClosingRecord>;
    saveDailyClosing: (
      input: AccountingDailyClosingSaveInput,
    ) => Promise<AccountingDailyClosingRecord>;
    saveStaffDailyClosing: (
      input: StaffDailyClosingInput,
    ) => Promise<StaffDailyClosingRecord>;
    getWeeklyIncome: (date?: string) => Promise<WeeklyIncomeDayRecord[]>;
  };
  employeeLoans: {
    listEmployees: () => Promise<EmployeeLoanEmployeeOption[]>;
    list: (
      request?: EmployeeLoanListRequest,
    ) => Promise<PageResult<EmployeeLoanRecord>>;
    listPayments: (loanId: number) => Promise<EmployeeLoanPaymentRecord[]>;
    create: (input: EmployeeLoanInput) => Promise<EmployeeLoanRecord>;
    repay: (input: EmployeeLoanRepaymentInput) => Promise<EmployeeLoanRecord>;
    void: (input: EmployeeLoanVoidInput) => Promise<EmployeeLoanRecord>;
  };
  accessories: {
    list: (request?: AccessoryListRequest) => Promise<PageResult<AccessoryRecord>>;
    create: (input: AccessoryInput) => Promise<AccessoryRecord>;
    update: (id: number, input: AccessoryInput) => Promise<AccessoryRecord>;
  };
  reports: {
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
    getOutstandingBalances: () => Promise<OutstandingBalanceRecord[]>;
    listOutstandingBalances: (
      request?: OutstandingBalancesReportRequest,
    ) => Promise<PageResult<OutstandingBalanceRecord>>;
    getDailyClosing: (date: string) => Promise<DailyClosingRecord>;
    getDeposits: () => Promise<DepositReportRecord[]>;
    listDeposits: (
      request?: DepositReportRequest,
    ) => Promise<PageResult<DepositReportRecord>>;
    getVehicleUtilization: (
      startDate: string,
      endDate: string,
    ) => Promise<VehicleUtilizationRecord[]>;
    getVehicleNetSummary: (
      startDate: string,
      endDate: string,
    ) => Promise<VehicleNetSummaryRecord[]>;
    getExpiringDocuments: () => Promise<ExpiringDocumentRecord[]>;
    getCancelledRentals: () => Promise<CancelledRentalRecord[]>;
    getPaymentVoids: () => Promise<PaymentVoidRecord[]>;
    getVehicleSales: (
      request?: VehicleSalesReportRequest,
    ) => Promise<PageResult<VehicleSalesReportRecord>>;
    getCommissions: (
      request?: CommissionReportRequest,
    ) => Promise<CommissionReportSummary>;
    export: (request: ReportExportRequest) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  };
  backup: {
    runBackup: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
    runRestore: (input: { approvalToken?: string; reason: string }) => Promise<{
      success: boolean;
      safetyBackupPath?: string;
      error?: string;
    }>;
    getStatus: () => Promise<BackupStatus>;
    preview: () => Promise<BackupPreview>;
    verify: () => Promise<BackupVerifyResult>;
  };
  settings: {
    get: () => Promise<ShopSettings>;
    save: (settings: Partial<ShopSettings> & { approvalToken?: string; reason?: string }) => Promise<ShopSettings>;
    selectLogo: (input?: { approvalToken?: string }) => Promise<ShopSettings>;
    clearLogo: (input?: { approvalToken?: string }) => Promise<ShopSettings>;
    selectOwnerSignature: (input?: { approvalToken?: string }) => Promise<ShopSettings>;
    clearOwnerSignature: (input?: { approvalToken?: string }) => Promise<ShopSettings>;
  };
  maintenance: {
    list: (request?: MaintenanceListRequest) => Promise<PageResult<MaintenanceRecordWithVehicle>>;
    create: (input: MaintenanceInput) => Promise<MaintenanceRecord>;
    update: (id: number, input: MaintenanceInput) => Promise<MaintenanceRecord>;
    archive: (input: number | { maintenanceId: number; reason: string }) => Promise<void>;
  };
  attachments: {
    list: (request: AttachmentListRequest) => Promise<PageResult<AttachmentRecord>>;
    add: (request: AttachmentUploadRequest) => Promise<AttachmentRecord | null>;
    upload: (request: AttachmentUploadRequest) => Promise<AttachmentRecord | null>;
    saveCapturedPhoto: (request: AttachmentCapturedPhotoRequest) => Promise<AttachmentRecord>;
    replace: (request: AttachmentReplaceRequest) => Promise<AttachmentRecord | null>;
    open: (id: number) => Promise<void>;
    getPreview: (id: number) => Promise<AttachmentPreview>;
    archive: (request: AttachmentArchiveRequest) => Promise<void>;
  };
  search: {
    global: (query: string) => Promise<GlobalSearchResult[]>;
  };
  diagnostics: {
    getStatus: () => Promise<DiagnosticsStatus>;
  };
  dataHealth: {
    scan: () => Promise<DataHealthIssue[]>;
    applyFix: (request: DataHealthFixRequest) => Promise<DataHealthIssue[]>;
  };
  security: {
    setOwnerPin: (input: OwnerPinSetupInput) => Promise<void>;
    clearOwnerPin: (input?: { approvalToken?: string }) => Promise<void>;
    approveSensitiveAction: (input: SensitiveApprovalInput) => Promise<SensitiveApproval>;
  };
};
