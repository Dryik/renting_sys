import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { RentalListRecord } from "../../src/shared/rentals";
import type { PageResult } from "../../src/shared/pagination";
import type {
  CustomerRentalHistoryRequest,
  CancelledRentalRecord,
  DailyPaymentRecord,
  DailyClosingRecord,
  DailyPaymentsReportRequest,
  DepositReportRequest,
  DepositReportRecord,
  ExpiringDocumentRecord,
  OutstandingBalancesReportRequest,
  OutstandingBalanceRecord,
  PaymentVoidRecord,
  ReturnedRentalsReportRequest,
  VehicleSalesReportRecord,
  VehicleSalesReportRequest,
  VehicleNetSummaryRecord,
  VehicleIncomeRecord,
  VehicleUtilizationRecord,
} from "../../src/shared/reports";
import { getDatabase, getSqliteDatabase } from "./database";
import { createPageResult, normalizePageRequest, type NormalizedPageRequest } from "./listing";
import { customers, maintenanceRecords, payments, rentals, vehicleSales, vehicles } from "./schema";
import { getShopSettings } from "./settings.service";
import { isWriteAccessAllowed } from "../licensing/service";
import {
  effectiveActiveRentalFilter,
  effectiveOverdueRentalFilter,
  effectiveRentalStatusSql,
} from "./rental-status";
import { getDailyClosingAccountingTotals } from "./accounting.service";
import { queryVehicleSales } from "./vehicle-sales.service";

function getRentalListFields(nowIso: string) {
  return {
    id: rentals.id,
    contractNo: rentals.contractNo,
    customerId: rentals.customerId,
    customerName: customers.fullName,
    customerPhone: customers.phone,
    vehicleId: rentals.vehicleId,
    vehiclePlateNumber: vehicles.plateNumber,
    vehicleBrand: vehicles.brand,
    vehicleModel: vehicles.model,
    status: effectiveRentalStatusSql(nowIso),
    startDatetime: rentals.startDatetime,
    expectedReturnDatetime: rentals.expectedReturnDatetime,
    actualReturnDatetime: rentals.actualReturnDatetime,
    dailyPrice: rentals.dailyPrice,
    depositRequired: rentals.depositRequired,
    depositPaid: rentals.depositPaid,
    mileageOut: rentals.mileageOut,
    mileageIn: rentals.mileageIn,
    fuelOut: rentals.fuelOut,
    fuelIn: rentals.fuelIn,
    notesOut: rentals.notesOut,
    notesIn: rentals.notesIn,
    damageNotes: rentals.damageNotes,
    extraCharges: rentals.extraCharges,
    discount: rentals.discount,
    totalAmount: rentals.totalAmount,
    paidAmount: rentals.paidAmount,
    remainingAmount: rentals.remainingAmount,
    cancelledAt: rentals.cancelledAt,
    cancelReason: rentals.cancelReason,
    createdAt: rentals.createdAt,
    updatedAt: rentals.updatedAt,
  };
}

export function getActiveRentals(): RentalListRecord[] {
  const now = new Date().toISOString();
  refreshOverdueRentals(now);

  return getDatabase()
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(effectiveActiveRentalFilter(now))
    .orderBy(desc(rentals.createdAt))
    .all();
}

export function getOverdueRentals(): RentalListRecord[] {
  const now = new Date().toISOString();
  refreshOverdueRentals(now);

  return getDatabase()
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(effectiveOverdueRentalFilter(now))
    .orderBy(desc(rentals.createdAt))
    .all();
}

export function getReturnedRentals(
  request: ReturnedRentalsReportRequest = {},
): PageResult<RentalListRecord> {
  const now = new Date().toISOString();
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const today = new Date();
  const dateFrom =
    request.dateFrom ?? toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
  const dateTo = request.dateTo ?? toDateInputValue(today);
  const range = getLocalDateRange(dateFrom, dateTo);
  const whereFilter = and(
    eq(rentals.status, "returned"),
    gte(rentals.actualReturnDatetime, range.start),
    lt(rentals.actualReturnDatetime, range.end),
  );
  const total = db
    .select({ count: count() })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(rentals.actualReturnDatetime), desc(rentals.createdAt))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function getCustomerRentalHistory(
  request: CustomerRentalHistoryRequest | number,
): PageResult<RentalListRecord> {
  const customerId =
    typeof request === "number" ? request : Number(request.customerId);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new Error("Customer is required.");
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const pageRequest = normalizePageRequest(
    typeof request === "number" ? undefined : request,
  );
  const whereFilter = eq(rentals.customerId, customerId);
  const total = db
    .select({ count: count() })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(rentals.createdAt))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function getDailyPayments(
  request: DailyPaymentsReportRequest | string,
): PageResult<DailyPaymentRecord> {
  const date = typeof request === "string" ? request : request.date;
  const range = getLocalDateRange(date);
  const pageRequest = normalizePageRequest(
    typeof request === "string" ? undefined : request,
  );
  const whereFilter = and(
    eq(payments.status, "posted"),
    gte(payments.paymentDate, range.start),
    lt(payments.paymentDate, range.end),
  );
  const db = getDatabase();
  const total = db
    .select({ count: count() })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .where(whereFilter)
    .get()?.count ?? 0;

  const rows = db
    .select({
      id: payments.id,
      rentalId: payments.rentalId,
      contractNo: rentals.contractNo,
      customerId: rentals.customerId,
      customerName: customers.fullName,
      type: payments.type,
      method: payments.method,
      amount: payments.amount,
      paymentDate: payments.paymentDate,
      notes: payments.notes,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .where(whereFilter)
    .orderBy(desc(payments.paymentDate))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function getVehicleIncome(
  startDate: string,
  endDate: string,
): VehicleIncomeRecord[] {
  const range = getLocalDateRange(startDate, endDate);
  const netIncomeSql = netPaymentTotalSql();

  const results = getDatabase()
    .select({
      vehicleId: vehicles.id,
      plateNumber: vehicles.plateNumber,
      brand: vehicles.brand,
      model: vehicles.model,
      totalIncome: netIncomeSql,
      rentalCount: sql<number>`count(distinct ${rentals.id})`.mapWith(Number),
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(
      and(
        eq(payments.status, "posted"),
        gte(payments.paymentDate, range.start),
        lt(payments.paymentDate, range.end),
      ),
    )
    .groupBy(vehicles.id, vehicles.plateNumber, vehicles.brand, vehicles.model)
    .orderBy(desc(netPaymentTotalSql()))
    .all();

  return results.map((r) => ({
    vehicleId: r.vehicleId,
    plateNumber: r.plateNumber,
    brand: r.brand,
    model: r.model,
    totalIncome: r.totalIncome || 0,
    rentalCount: r.rentalCount || 0,
  }));
}

export function getOutstandingBalances(): OutstandingBalanceRecord[] {
  const now = new Date().toISOString();
  refreshOverdueRentals(now);

  return getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      vehiclePlateNumber: vehicles.plateNumber,
      status: effectiveRentalStatusSql(now),
      totalAmount: rentals.totalAmount,
      paidAmount: rentals.paidAmount,
      remainingAmount: rentals.remainingAmount,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(
      and(
        inArray(rentals.status, ["active", "overdue", "returned"]),
        sql`${rentals.remainingAmount} > 0`,
      ),
    )
    .orderBy(desc(rentals.remainingAmount))
    .all();
}

export function listOutstandingBalances(
  request: OutstandingBalancesReportRequest = {},
): PageResult<OutstandingBalanceRecord> {
  const now = new Date().toISOString();
  refreshOverdueRentals(now);
  const pageRequest = normalizePageRequest(request);
  const whereFilter = outstandingBalanceFilter();
  const total = request.includeTotal === false
    ? undefined
    : getDatabase()
        .select({ count: count() })
        .from(rentals)
        .where(whereFilter)
        .get()?.count ?? 0;
  const rows = getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      vehiclePlateNumber: vehicles.plateNumber,
      status: effectiveRentalStatusSql(now),
      totalAmount: rentals.totalAmount,
      paidAmount: rentals.paidAmount,
      remainingAmount: rentals.remainingAmount,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(rentals.remainingAmount))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(
    rows,
    total ?? pageRequest.offset + rows.length,
    pageRequest,
  );
}

export function getDailyClosing(date: string): DailyClosingRecord {
  const range = getLocalDateRange(date);
  const accountingTotals = getDailyClosingAccountingTotals(date);
  const paymentTotals = getDatabase()
    .select({
      cashPayments: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'cash'
          then ${payments.amount}
          else 0
        end), 0)
      `.mapWith(Number),
      cardPayments: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'card'
          then ${payments.amount}
          else 0
        end), 0)
      `.mapWith(Number),
      bankTransfers: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'bank_transfer'
          then ${payments.amount}
          else 0
        end), 0)
      `.mapWith(Number),
      otherPayments: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'other'
          then ${payments.amount}
          else 0
        end), 0)
      `.mapWith(Number),
      refunds: sql<number>`
        coalesce(sum(case
          when ${payments.type} = 'refund'
          then ${payments.amount}
          else 0
        end), 0)
      `.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, "posted"),
        gte(payments.paymentDate, range.start),
        lt(payments.paymentDate, range.end),
      ),
    )
    .get() ?? {
      cashPayments: 0,
      cardPayments: 0,
      bankTransfers: 0,
      otherPayments: 0,
      refunds: 0,
    };
  const vehicleSaleTotals = getDatabase()
    .select({
      vehicleSales: sql<number>`coalesce(sum(${vehicleSales.salePrice}), 0)`.mapWith(Number),
    })
    .from(vehicleSales)
    .where(
      and(
        eq(vehicleSales.status, "posted"),
        gte(vehicleSales.saleDate, range.start),
        lt(vehicleSales.saleDate, range.end),
      ),
    )
    .get() ?? { vehicleSales: 0 };
  const openBalancesCreatedToday =
    getDatabase()
      .select({ count: count() })
      .from(rentals)
      .where(
        and(
          inArray(rentals.status, ["active", "overdue", "returned"]),
          gte(rentals.expectedReturnDatetime, range.start),
          lt(rentals.expectedReturnDatetime, range.end),
          sql`${rentals.remainingAmount} > 0`,
        ),
      )
      .get()?.count ?? 0;
  const returnedRentalsUnpaidToday =
    getDatabase()
      .select({ count: count() })
      .from(rentals)
      .where(
        and(
          eq(rentals.status, "returned"),
          gte(rentals.actualReturnDatetime, range.start),
          lt(rentals.actualReturnDatetime, range.end),
          sql`${rentals.remainingAmount} > 0`,
        ),
      )
      .get()?.count ?? 0;

  return {
    date,
    ...paymentTotals,
    totalCollected:
      paymentTotals.cashPayments +
      paymentTotals.cardPayments +
      paymentTotals.bankTransfers +
      paymentTotals.otherPayments +
      vehicleSaleTotals.vehicleSales -
      paymentTotals.refunds -
      accountingTotals.expenses,
    vehicleSales: vehicleSaleTotals.vehicleSales,
    expenses: accountingTotals.expenses,
    ownerWithdrawals: accountingTotals.ownerWithdrawals,
    expectedCash: accountingTotals.expectedCash,
    countedCash: accountingTotals.countedCash,
    difference: accountingTotals.difference,
    openBalancesCreatedToday,
    returnedRentalsUnpaidToday,
  };
}

export function getVehicleSales(
  request: VehicleSalesReportRequest = {},
): PageResult<VehicleSalesReportRecord> {
  return queryVehicleSales({
    ...request,
    status: request.status ?? "posted",
  });
}

export function getDeposits(): DepositReportRecord[] {
  const now = new Date().toISOString();
  const refundByRental = getDatabase()
    .select({
      rentalId: payments.rentalId,
      refunded: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(and(eq(payments.status, "posted"), eq(payments.type, "refund")))
    .groupBy(payments.rentalId)
    .all();
  const refundMap = new Map(refundByRental.map((row) => [row.rentalId, row.refunded]));

  return getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
      status: effectiveRentalStatusSql(now),
      depositRequired: rentals.depositRequired,
      depositPaid: rentals.depositPaid,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(inArray(rentals.status, ["active", "overdue", "returned"]))
    .orderBy(desc(rentals.createdAt))
    .all()
    .map((row) => {
      const depositRefunded = refundMap.get(row.rentalId) ?? 0;

      return {
        ...row,
        depositRefunded,
        depositHeld: Math.max(0, row.depositPaid - depositRefunded),
      };
    });
}

export function listDeposits(
  request: DepositReportRequest = {},
): PageResult<DepositReportRecord> {
  const pageRequest = normalizePageRequest(request);

  if (request.heldOnly) {
    return listHeldDeposits(pageRequest, request.includeTotal !== false);
  }

  const now = new Date().toISOString();
  const whereFilter = inArray(rentals.status, ["active", "overdue", "returned"]);
  const total = getDatabase()
    .select({ count: count() })
    .from(rentals)
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
      status: effectiveRentalStatusSql(now),
      depositRequired: rentals.depositRequired,
      depositPaid: rentals.depositPaid,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(rentals.createdAt))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(applyDepositRefunds(rows), total, pageRequest);
}

export function getVehicleUtilization(
  startDate: string,
  endDate: string,
): VehicleUtilizationRecord[] {
  const range = getLocalDateRange(startDate, endDate);
  const periodDays = Math.max(
    1,
    Math.ceil(
      (new Date(range.end).getTime() - new Date(range.start).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  const overlapDays = rentalOverlapDaysSql(range);
  const rows = getDatabase()
    .select({
      vehicleId: vehicles.id,
      plateNumber: vehicles.plateNumber,
      brand: vehicles.brand,
      model: vehicles.model,
      rentalCount: sql<number>`
        coalesce(sum(case when ${overlapDays} > 0 then 1 else 0 end), 0)
      `.mapWith(Number),
      rentedDays: sql<number>`coalesce(sum(${overlapDays}), 0)`.mapWith(Number),
    })
    .from(vehicles)
    .leftJoin(
      rentals,
      and(
        eq(rentals.vehicleId, vehicles.id),
        sql`${rentals.status} != 'cancelled'`,
        lt(rentals.startDatetime, range.end),
        sql`coalesce(${rentals.actualReturnDatetime}, ${rentals.expectedReturnDatetime}, ${range.end}) > ${range.start}`,
      ),
    )
    .groupBy(vehicles.id, vehicles.plateNumber, vehicles.brand, vehicles.model)
    .all();

  return rows
    .map((row) => ({
      ...row,
      periodDays,
      utilizationPercent: Math.round((row.rentedDays / periodDays) * 10000) / 100,
    }))
    .sort((a, b) => b.rentedDays - a.rentedDays);
}

export function getVehicleNetSummary(
  startDate: string,
  endDate: string,
): VehicleNetSummaryRecord[] {
  const income = getVehicleIncome(startDate, endDate);
  const range = getLocalDateRange(startDate, endDate);
  const maintenance = getDatabase()
    .select({
      vehicleId: maintenanceRecords.vehicleId,
      cost: sql<number>`coalesce(sum(${maintenanceRecords.cost}), 0)`.mapWith(Number),
    })
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.isArchived, false),
        gte(maintenanceRecords.startDate, startDate),
        lt(maintenanceRecords.startDate, range.end.slice(0, 10)),
      ),
    )
    .groupBy(maintenanceRecords.vehicleId)
    .all();
  const maintenanceMap = new Map(maintenance.map((row) => [row.vehicleId, row.cost]));

  return income.map((row) => {
    const maintenanceCost = maintenanceMap.get(row.vehicleId) ?? 0;

    return {
      vehicleId: row.vehicleId,
      plateNumber: row.plateNumber,
      brand: row.brand,
      model: row.model,
      rentalIncome: row.totalIncome,
      maintenanceCost,
      simpleNet: row.totalIncome - maintenanceCost,
    };
  });
}

export function getExpiringDocuments(): ExpiringDocumentRecord[] {
  const settings = getShopSettings();
  const today = new Date();
  const rows: ExpiringDocumentRecord[] = [];

  for (const vehicle of getDatabase().select().from(vehicles).all()) {
    addExpiry(rows, {
      entityType: "vehicle",
      entityId: vehicle.id,
      name: `${vehicle.plateNumber} - ${vehicle.brand} ${vehicle.model}`,
      documentType: "insurance",
      expiryDate: vehicle.insuranceExpiryDate,
      warningDays: settings.insuranceWarningDays,
      today,
    });
    addExpiry(rows, {
      entityType: "vehicle",
      entityId: vehicle.id,
      name: `${vehicle.plateNumber} - ${vehicle.brand} ${vehicle.model}`,
      documentType: "registration",
      expiryDate: vehicle.registrationExpiryDate,
      warningDays: settings.registrationWarningDays,
      today,
    });
    addExpiry(rows, {
      entityType: "vehicle",
      entityId: vehicle.id,
      name: `${vehicle.plateNumber} - ${vehicle.brand} ${vehicle.model}`,
      documentType: "technical_inspection",
      expiryDate: vehicle.technicalInspectionExpiryDate,
      warningDays: settings.technicalInspectionWarningDays,
      today,
    });
  }

  for (const customer of getDatabase().select().from(customers).all()) {
    addExpiry(rows, {
      entityType: "customer",
      entityId: customer.id,
      name: customer.fullName,
      documentType: "license",
      expiryDate: customer.licenseExpiryDate,
      warningDays: settings.licenseWarningDays,
      today,
    });
  }

  return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function getCancelledRentals(): CancelledRentalRecord[] {
  return getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
      cancelledAt: rentals.cancelledAt,
      cancelReason: rentals.cancelReason,
      totalAmount: rentals.totalAmount,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.status, "cancelled"))
    .orderBy(desc(rentals.cancelledAt))
    .all();
}

export function getPaymentVoids(): PaymentVoidRecord[] {
  return getDatabase()
    .select({
      paymentId: payments.id,
      receiptNo: payments.receiptNo,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      type: payments.type,
      method: payments.method,
      amount: payments.amount,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .where(eq(payments.status, "voided"))
    .orderBy(desc(payments.voidedAt))
    .all();
}

function rentalOverlapDaysSql(range: { start: string; end: string }) {
  const overlapDays = sql<number>`(
    min(
      julianday(coalesce(${rentals.actualReturnDatetime}, ${rentals.expectedReturnDatetime}, ${range.end})),
      julianday(${range.end})
    ) -
    max(julianday(${rentals.startDatetime}), julianday(${range.start}))
  )`;

  return sql<number>`
    case
      when ${rentals.id} is null or ${overlapDays} <= 0 then 0
      else cast(${overlapDays} as integer) +
        case when ${overlapDays} > cast(${overlapDays} as integer) then 1 else 0 end
    end
  `;
}

function addExpiry(
  rows: ExpiringDocumentRecord[],
  input: {
    entityType: "vehicle" | "customer";
    entityId: number;
    name: string;
    documentType: ExpiringDocumentRecord["documentType"];
    expiryDate: string | null;
    warningDays: number;
    today: Date;
  },
): void {
  if (!input.expiryDate) {
    return;
  }

  let expiryDate: Date;

  try {
    expiryDate = parseDateInput(input.expiryDate);
  } catch {
    return;
  }
  const daysRemaining = Math.ceil(
    (expiryDate.getTime() - input.today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysRemaining > input.warningDays) {
    return;
  }

  rows.push({
    entityType: input.entityType,
    entityId: input.entityId,
    name: input.name,
    documentType: input.documentType,
    expiryDate: input.expiryDate,
    daysRemaining,
  });
}

function refreshOverdueRentals(now = new Date().toISOString()): void {
  if (!isWriteAccessAllowed()) {
    return;
  }

  getDatabase()
    .update(rentals)
    .set({
      status: "overdue",
      updatedAt: now,
    })
    .where(and(eq(rentals.status, "active"), lt(rentals.expectedReturnDatetime, now)))
    .run();
}

function netPaymentTotalSql() {
  return sql<number>`coalesce(sum(CASE WHEN ${payments.type} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)`.mapWith(Number);
}

type DepositBaseRecord = Omit<
  DepositReportRecord,
  "depositRefunded" | "depositHeld"
>;

function applyDepositRefunds(rows: DepositBaseRecord[]): DepositReportRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const rentalIds = rows.map((row) => row.rentalId);
  const refundByRental = getDatabase()
    .select({
      rentalId: payments.rentalId,
      refunded: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        inArray(payments.rentalId, rentalIds),
        eq(payments.status, "posted"),
        eq(payments.type, "refund"),
      ),
    )
    .groupBy(payments.rentalId)
    .all();
  const refundMap = new Map(refundByRental.map((row) => [row.rentalId, row.refunded]));

  return rows.map((row) => {
    const depositRefunded = refundMap.get(row.rentalId) ?? 0;

    return {
      ...row,
      depositRefunded,
      depositHeld: Math.max(0, row.depositPaid - depositRefunded),
    };
  });
}

function outstandingBalanceFilter() {
  return and(
    inArray(rentals.status, ["active", "overdue", "returned"]),
    sql`${rentals.remainingAmount} > 0`,
  );
}

function listHeldDeposits(
  pageRequest: NormalizedPageRequest,
  includeTotal: boolean,
): PageResult<DepositReportRecord> {
  if (!includeTotal) {
    return listHeldDepositsWithoutTotal(pageRequest);
  }

  const now = new Date().toISOString();
  const database = getSqliteDatabase();
  const total = database
    .prepare(`${heldDepositCteSql()} select count(*) as count from (${heldDepositBaseSql()}) deposits where depositHeld > 0`)
    .get(now) as { count?: number } | undefined;
  const rows = database
    .prepare(`
      ${heldDepositCteSql()}
      select
        rentalId,
        contractNo,
        customerName,
        vehiclePlateNumber,
        status,
        depositRequired,
        depositPaid,
        depositRefunded,
        depositHeld
      from (${heldDepositBaseSql()}) deposits
      where depositHeld > 0
      order by createdAt desc
      limit ? offset ?
    `)
    .all(now, pageRequest.pageSize, pageRequest.offset) as DepositReportRecord[];

  return createPageResult(
    rows,
    Number(total?.count ?? 0),
    pageRequest,
  );
}

function listHeldDepositsWithoutTotal(
  pageRequest: NormalizedPageRequest,
): PageResult<DepositReportRecord> {
  const now = new Date().toISOString();
  const database = getSqliteDatabase();
  const rows: DepositReportRecord[] = [];
  const chunkSize = Math.max(pageRequest.pageSize * 4, 32);
  let remainingOffset = pageRequest.offset;
  let scanOffset = 0;

  while (rows.length < pageRequest.pageSize) {
    const candidates = database
      .prepare(`
        select
          rentals.id as rentalId,
          rentals.contract_no as contractNo,
          customers.full_name as customerName,
          vehicles.plate_number as vehiclePlateNumber,
          case
            when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue'
            else rentals.status
          end as status,
          rentals.deposit_required as depositRequired,
          rentals.deposit_paid as depositPaid
        from rentals indexed by rentals_created_at_idx
        inner join customers on rentals.customer_id = customers.id
        inner join vehicles on rentals.vehicle_id = vehicles.id
        where rentals.status in ('active', 'overdue', 'returned')
          and rentals.deposit_paid > 0
        order by rentals.created_at desc
        limit ? offset ?
      `)
      .all(now, chunkSize, scanOffset) as DepositBaseRecord[];

    if (candidates.length === 0) {
      break;
    }

    const heldCandidates = applyDepositRefunds(candidates)
      .filter((row) => row.depositHeld > 0);

    for (const row of heldCandidates) {
      if (remainingOffset > 0) {
        remainingOffset -= 1;
        continue;
      }

      rows.push(row);

      if (rows.length >= pageRequest.pageSize) {
        break;
      }
    }

    scanOffset += candidates.length;
  }

  return createPageResult(rows, pageRequest.offset + rows.length, pageRequest);
}

function heldDepositCteSql(): string {
  return `
    with refund_by_rental as (
      select
        rental_id as rentalId,
        coalesce(sum(amount), 0) as refunded
      from payments
      where status = 'posted' and type = 'refund'
      group by rental_id
    )
  `;
}

function heldDepositBaseSql(): string {
  return `
    select
      rentals.id as rentalId,
      rentals.contract_no as contractNo,
      customers.full_name as customerName,
      vehicles.plate_number as vehiclePlateNumber,
      case
        when rentals.status = 'active' and rentals.expected_return_datetime < ? then 'overdue'
        else rentals.status
      end as status,
      rentals.deposit_required as depositRequired,
      rentals.deposit_paid as depositPaid,
      coalesce(refund_by_rental.refunded, 0) as depositRefunded,
      max(0, rentals.deposit_paid - coalesce(refund_by_rental.refunded, 0)) as depositHeld,
      rentals.created_at as createdAt
    from rentals
    inner join customers on rentals.customer_id = customers.id
    inner join vehicles on rentals.vehicle_id = vehicles.id
    left join refund_by_rental on refund_by_rental.rentalId = rentals.id
    where rentals.status in ('active', 'overdue', 'returned')
      and rentals.deposit_paid > 0
  `;
}

function getLocalDateRange(startDate: string, endDate = startDate) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);

  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Date is invalid.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Date is invalid.");
  }

  return date;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
