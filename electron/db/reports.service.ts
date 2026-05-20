import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { RentalListRecord } from "../../src/shared/rentals";
import type { PageResult } from "../../src/shared/pagination";
import type {
  CustomerRentalHistoryRequest,
  DailyPaymentRecord,
  DailyPaymentsReportRequest,
  DashboardStats,
  ReturnedRentalsReportRequest,
  VehicleIncomeRecord,
} from "../../src/shared/reports";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest } from "./listing";
import { customers, payments, rentals, vehicles } from "./schema";

export function getDashboardStats(): DashboardStats {
  refreshOverdueRentals();

  const db = getDatabase();
  const todayRange = getLocalDateRange(toDateInputValue(new Date()));

  const availableVehiclesResult = db
    .select({ count: count() })
    .from(vehicles)
    .where(eq(vehicles.status, "available"))
    .get();

  const rentedVehiclesResult = db
    .select({ count: count() })
    .from(vehicles)
    .where(eq(vehicles.status, "rented"))
    .get();

  const overdueRentalsResult = db
    .select({ count: count() })
    .from(rentals)
    .where(eq(rentals.status, "overdue"))
    .get();

  const expectedReturnsTodayResult = db
    .select({ count: count() })
    .from(rentals)
    .where(
      and(
        inArray(rentals.status, ["active", "overdue"]),
        gte(rentals.expectedReturnDatetime, todayRange.start),
        lt(rentals.expectedReturnDatetime, todayRange.end),
      ),
    )
    .get();

  const incomeTodayResult = db
    .select({
      total: netPaymentTotalSql(),
    })
    .from(payments)
    .where(
      and(
        gte(payments.paymentDate, todayRange.start),
        lt(payments.paymentDate, todayRange.end),
      ),
    )
    .get();

  return {
    availableVehicles: availableVehiclesResult?.count ?? 0,
    rentedVehicles: rentedVehiclesResult?.count ?? 0,
    overdueRentals: overdueRentalsResult?.count ?? 0,
    expectedReturnsToday: expectedReturnsTodayResult?.count ?? 0,
    incomeToday: incomeTodayResult?.total ?? 0,
  };
}

const rentalListFields = {
  id: rentals.id,
  contractNo: rentals.contractNo,
  customerId: rentals.customerId,
  customerName: customers.fullName,
  customerPhone: customers.phone,
  vehicleId: rentals.vehicleId,
  vehiclePlateNumber: vehicles.plateNumber,
  vehicleBrand: vehicles.brand,
  vehicleModel: vehicles.model,
  status: rentals.status,
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
  createdAt: rentals.createdAt,
  updatedAt: rentals.updatedAt,
};

export function getActiveRentals(): RentalListRecord[] {
  refreshOverdueRentals();

  return getDatabase()
    .select(rentalListFields)
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.status, "active"))
    .orderBy(desc(rentals.createdAt))
    .all();
}

export function getOverdueRentals(): RentalListRecord[] {
  refreshOverdueRentals();

  return getDatabase()
    .select(rentalListFields)
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.status, "overdue"))
    .orderBy(desc(rentals.createdAt))
    .all();
}

export function getReturnedRentals(
  request: ReturnedRentalsReportRequest = {},
): PageResult<RentalListRecord> {
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
    .select(rentalListFields)
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
    .select(rentalListFields)
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
    .where(and(gte(payments.paymentDate, range.start), lt(payments.paymentDate, range.end)))
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

function refreshOverdueRentals(): void {
  const now = new Date().toISOString();

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
