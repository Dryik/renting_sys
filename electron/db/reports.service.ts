import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  calculateRentalDays,
  calculateSegmentedRentMinor,
  type RentalListRecord,
} from "../../src/shared/rentals";
import type { PageResult } from "../../src/shared/pagination";
import type {
  CommissionReportRecord,
  CommissionReportRequest,
  CommissionReportSummary,
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
import {
  MONEY_MINOR_ZERO,
  allocateMinorByWeights,
  fromMinorUnits,
  maxMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "../../src/shared/money";
import { getDatabase, getSqliteDatabase } from "./database";
import { createPageResult, normalizePageRequest, type NormalizedPageRequest } from "./listing";
import { columnToMinor, sumToMinor } from "./money-write";
import {
  customers,
  maintenanceRecords,
  payments,
  rentalVehicleSegments,
  rentals,
  users,
  vehicleSales,
  vehicles,
} from "./schema";
import { getShopSettings } from "./settings.service";
import { requirePermissionForCurrentSession } from "./auth.service";
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
    dailyPriceMinor: rentals.dailyPriceMinor,
    depositRequiredMinor: rentals.depositRequiredMinor,
    depositPaidMinor: rentals.depositPaidMinor,
    mileageOut: rentals.mileageOut,
    mileageIn: rentals.mileageIn,
    fuelOut: rentals.fuelOut,
    fuelIn: rentals.fuelIn,
    notesOut: rentals.notesOut,
    notesIn: rentals.notesIn,
    damageNotes: rentals.damageNotes,
    extraChargesMinor: rentals.extraChargesMinor,
    accessoryChargesMinor: rentals.accessoryChargesMinor,
    discountMinor: rentals.discountMinor,
    totalAmountMinor: rentals.totalAmountMinor,
    paidAmountMinor: rentals.paidAmountMinor,
    remainingAmountMinor: rentals.remainingAmountMinor,
    cancelledAt: rentals.cancelledAt,
    cancelReason: rentals.cancelReason,
    createdAt: rentals.createdAt,
    updatedAt: rentals.updatedAt,
  };
}

type ReportRentalRow = {
  [Key in keyof ReturnType<typeof getRentalListFields>]: Key extends `${string}Minor`
    ? number
    : unknown;
};

/**
 * Reports show the same major-unit figures as every other screen, so the
 * stored integers are converted once here, on the way out.
 */
function toReportRentalRecord(row: ReportRentalRow): RentalListRecord {
  const {
    dailyPriceMinor,
    depositRequiredMinor,
    depositPaidMinor,
    extraChargesMinor,
    accessoryChargesMinor,
    discountMinor,
    totalAmountMinor,
    paidAmountMinor,
    remainingAmountMinor,
    ...rest
  } = row;

  return {
    ...(rest as Omit<RentalListRecord, RentalReportMoneyField>),
    dailyPrice: reportMoney(dailyPriceMinor, "daily_price_minor"),
    depositRequired: reportMoney(depositRequiredMinor, "deposit_required_minor"),
    depositPaid: reportMoney(depositPaidMinor, "deposit_paid_minor"),
    extraCharges: reportMoney(extraChargesMinor, "extra_charges_minor"),
    accessoryCharges: reportMoney(accessoryChargesMinor, "accessory_charges_minor"),
    discount: reportMoney(discountMinor, "discount_minor"),
    totalAmount: reportMoney(totalAmountMinor, "total_amount_minor"),
    paidAmount: reportMoney(paidAmountMinor, "paid_amount_minor"),
    remainingAmount: reportMoney(remainingAmountMinor, "remaining_amount_minor"),
  };
}

type RentalReportMoneyField =
  | "dailyPrice"
  | "depositRequired"
  | "depositPaid"
  | "extraCharges"
  | "accessoryCharges"
  | "discount"
  | "totalAmount"
  | "paidAmount"
  | "remainingAmount";

function reportMoney(value: number, column: string): number {
  return fromMinorUnits(columnToMinor(value, `rentals.${column}`));
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
    .all()
    .map(toReportRentalRecord);
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
    .all()
    .map(toReportRentalRecord);
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

  return createPageResult(rows.map(toReportRentalRecord), total, pageRequest);
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

  return createPageResult(rows.map(toReportRentalRecord), total, pageRequest);
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
      amountMinor: payments.amountMinor,
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

  return createPageResult(
    rows.map(({ amountMinor, ...row }) => ({
      ...row,
      amount: fromMinorUnits(columnToMinor(amountMinor, "payments.amount_minor")),
    })),
    total,
    pageRequest,
  );
}

/**
 * What each vehicle earned in a period.
 *
 * A contract can run on more than one vehicle — a breakdown mid-hire moves the
 * customer onto another bike without ending the contract — so its money cannot
 * simply be credited to whichever vehicle it happens to be on now. The money a
 * contract took in the period is split across the vehicles that carried it, in
 * proportion to what each one earned: its own days at its own rate. Nothing is
 * lost in the split; the parts always add back to the contract's own total.
 *
 * An unswapped contract has exactly one vehicle, gets one share, and reads
 * exactly as it always did.
 */
export function getVehicleIncome(
  startDate: string,
  endDate: string,
): VehicleIncomeRecord[] {
  const range = getLocalDateRange(startDate, endDate);

  const rentalTotals = getDatabase()
    .select({
      rentalId: rentals.id,
      status: rentals.status,
      startDatetime: rentals.startDatetime,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
      actualReturnDatetime: rentals.actualReturnDatetime,
      netIncome: netPaymentTotalSql(),
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .where(
      and(
        eq(payments.status, "posted"),
        gte(payments.paymentDate, range.start),
        lt(payments.paymentDate, range.end),
      ),
    )
    .groupBy(rentals.id)
    .all();

  if (rentalTotals.length === 0) {
    return [];
  }

  const segmentsByRental = loadSegmentsForRentals(
    rentalTotals.map((row) => row.rentalId),
  );
  const perVehicle = new Map<
    number,
    { incomeMinor: MoneyMinor; rentalIds: Set<number> }
  >();

  for (const rental of rentalTotals) {
    const segments = segmentsByRental.get(rental.rentalId) ?? [];

    if (segments.length === 0) {
      continue;
    }

    const netIncomeMinor = sumToMinor(
      rental.netIncome,
      `Rental ${rental.rentalId} income`,
    );
    // A cancelled contract earned no days; whatever it holds is settled
    // against the vehicle it was on, not spread over a hire that never ran.
    const split =
      rental.status === "cancelled"
        ? { segmentDays: segments.map(() => 0) }
        : calculateSegmentedRentMinor(
            rental.startDatetime,
            rental.actualReturnDatetime ?? rental.expectedReturnDatetime,
            segments.map((segment) => ({
              startDatetime: segment.startDatetime,
              endDatetime: segment.endDatetime,
              dailyPriceMinor: segment.dailyPriceMinor,
            })),
          );
    const weights = segments.map((segment, index) =>
      Math.max(0, split.segmentDays[index] ?? 0) *
      Math.max(0, segment.dailyPriceMinor),
    );
    const shares = allocateMinorByWeights(netIncomeMinor, weights);

    segments.forEach((segment, index) => {
      const entry = perVehicle.get(segment.vehicleId) ?? {
        incomeMinor: MONEY_MINOR_ZERO,
        rentalIds: new Set<number>(),
      };
      entry.incomeMinor = sumMoney(
        [entry.incomeMinor, shares[index] ?? MONEY_MINOR_ZERO],
        `Vehicle ${segment.vehicleId} income`,
      );

      // A vehicle counts the contract when it actually carried it, or when it
      // was given a share of the money.
      if ((split.segmentDays[index] ?? 0) > 0 || shares[index] !== 0) {
        entry.rentalIds.add(rental.rentalId);
      }

      perVehicle.set(segment.vehicleId, entry);
    });
  }

  if (perVehicle.size === 0) {
    return [];
  }

  const vehicleRows = getDatabase()
    .select({
      vehicleId: vehicles.id,
      plateNumber: vehicles.plateNumber,
      brand: vehicles.brand,
      model: vehicles.model,
    })
    .from(vehicles)
    .where(inArray(vehicles.id, [...perVehicle.keys()]))
    .all();

  return vehicleRows
    .map((vehicle) => {
      const entry = perVehicle.get(vehicle.vehicleId);

      return {
        vehicleId: vehicle.vehicleId,
        plateNumber: vehicle.plateNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        totalIncome: fromMinorUnits(entry?.incomeMinor ?? MONEY_MINOR_ZERO),
        rentalCount: entry?.rentalIds.size ?? 0,
      };
    })
    .sort((left, right) => right.totalIncome - left.totalIncome);
}

type RentalSegmentRow = {
  vehicleId: number;
  startDatetime: string;
  endDatetime: string | null;
  dailyPriceMinor: MoneyMinor;
};

function loadSegmentsForRentals(
  rentalIds: number[],
): Map<number, RentalSegmentRow[]> {
  const rows = getDatabase()
    .select({
      rentalId: rentalVehicleSegments.rentalId,
      vehicleId: rentalVehicleSegments.vehicleId,
      startDatetime: rentalVehicleSegments.startDatetime,
      endDatetime: rentalVehicleSegments.endDatetime,
      dailyPriceMinor: rentalVehicleSegments.dailyPriceMinor,
    })
    .from(rentalVehicleSegments)
    .where(inArray(rentalVehicleSegments.rentalId, rentalIds))
    .orderBy(asc(rentalVehicleSegments.sequence))
    .all();
  const grouped = new Map<number, RentalSegmentRow[]>();

  for (const row of rows) {
    const list = grouped.get(row.rentalId) ?? [];
    list.push({
      vehicleId: row.vehicleId,
      startDatetime: row.startDatetime,
      endDatetime: row.endDatetime,
      dailyPriceMinor: columnToMinor(
        row.dailyPriceMinor,
        "rental_vehicle_segments.daily_price_minor",
      ),
    });
    grouped.set(row.rentalId, list);
  }

  return grouped;
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
      totalAmountMinor: rentals.totalAmountMinor,
      paidAmountMinor: rentals.paidAmountMinor,
      remainingAmountMinor: rentals.remainingAmountMinor,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(
      and(
        inArray(rentals.status, ["active", "overdue", "returned"]),
        sql`${rentals.remainingAmountMinor} > 0`,
      ),
    )
    .orderBy(desc(rentals.remainingAmountMinor))
    .all()
    .map(toOutstandingBalanceRecord);
}

function toOutstandingBalanceRecord<
  Row extends {
    totalAmountMinor: number;
    paidAmountMinor: number;
    remainingAmountMinor: number;
  },
>(row: Row) {
  const { totalAmountMinor, paidAmountMinor, remainingAmountMinor, ...rest } = row;

  return {
    ...rest,
    totalAmount: reportMoney(totalAmountMinor, "total_amount_minor"),
    paidAmount: reportMoney(paidAmountMinor, "paid_amount_minor"),
    remainingAmount: reportMoney(remainingAmountMinor, "remaining_amount_minor"),
  };
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
      totalAmountMinor: rentals.totalAmountMinor,
      paidAmountMinor: rentals.paidAmountMinor,
      remainingAmountMinor: rentals.remainingAmountMinor,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(rentals.remainingAmountMinor))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(
    rows.map(toOutstandingBalanceRecord),
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
          then ${payments.amountMinor}
          else 0
        end), 0)
      `,
      cardPayments: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'card'
          then ${payments.amountMinor}
          else 0
        end), 0)
      `,
      bankTransfers: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'bank_transfer'
          then ${payments.amountMinor}
          else 0
        end), 0)
      `,
      otherPayments: sql<number>`
        coalesce(sum(case
          when ${payments.type} != 'refund' and ${payments.method} = 'other'
          then ${payments.amountMinor}
          else 0
        end), 0)
      `,
      refunds: sql<number>`
        coalesce(sum(case
          when ${payments.type} = 'refund'
          then ${payments.amountMinor}
          else 0
        end), 0)
      `,
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
      vehicleSales: sql<number>`coalesce(sum(${vehicleSales.salePriceMinor}), 0)`,
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
          sql`${rentals.remainingAmountMinor} > 0`,
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
          sql`${rentals.remainingAmountMinor} > 0`,
        ),
      )
      .get()?.count ?? 0;

  const cashPaymentsMinor = sumToMinor(paymentTotals.cashPayments, "Cash payments");
  const cardPaymentsMinor = sumToMinor(paymentTotals.cardPayments, "Card payments");
  const bankTransfersMinor = sumToMinor(paymentTotals.bankTransfers, "Bank transfers");
  const otherPaymentsMinor = sumToMinor(paymentTotals.otherPayments, "Other payments");
  const refundsMinor = sumToMinor(paymentTotals.refunds, "Refunds");
  const vehicleSalesMinor = sumToMinor(
    vehicleSaleTotals.vehicleSales,
    "Vehicle sales",
  );
  // Expenses come back from the accounting service already in major units, so
  // they re-enter integer arithmetic here rather than being added as floats.
  const expensesMinor = toMinorUnits(accountingTotals.expenses, "Expenses");

  return {
    date,
    cashPayments: fromMinorUnits(cashPaymentsMinor),
    cardPayments: fromMinorUnits(cardPaymentsMinor),
    bankTransfers: fromMinorUnits(bankTransfersMinor),
    otherPayments: fromMinorUnits(otherPaymentsMinor),
    refunds: fromMinorUnits(refundsMinor),
    totalCollected: fromMinorUnits(
      subtractMoney(
        subtractMoney(
          sumMoney(
            [
              cashPaymentsMinor,
              cardPaymentsMinor,
              bankTransfersMinor,
              otherPaymentsMinor,
              vehicleSalesMinor,
            ],
            "the day's collections",
          ),
          refundsMinor,
        ),
        expensesMinor,
      ),
    ),
    vehicleSales: fromMinorUnits(vehicleSalesMinor),
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
      refunded: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.status, "posted"), eq(payments.type, "refund")))
    .groupBy(payments.rentalId)
    .all();
  const refundMap = new Map(
    refundByRental.map((row) => [
      row.rentalId,
      sumToMinor(row.refunded, `Rental ${row.rentalId} refunds`),
    ]),
  );

  return getDatabase()
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      vehiclePlateNumber: vehicles.plateNumber,
      status: effectiveRentalStatusSql(now),
      depositRequiredMinor: rentals.depositRequiredMinor,
      depositPaidMinor: rentals.depositPaidMinor,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(inArray(rentals.status, ["active", "overdue", "returned"]))
    .orderBy(desc(rentals.createdAt))
    .all()
    .map((row) =>
      toDepositRecord(row, refundMap.get(row.rentalId) ?? MONEY_MINOR_ZERO),
    );
}

/** Held is what was paid less what has been refunded, never below zero. */
function toDepositRecord<
  Row extends { depositRequiredMinor: number; depositPaidMinor: number },
>(row: Row, depositRefundedMinor: MoneyMinor) {
  const { depositRequiredMinor, depositPaidMinor, ...rest } = row;
  const paidMinor = columnToMinor(depositPaidMinor, "rentals.deposit_paid_minor");

  return {
    ...rest,
    depositRequired: reportMoney(depositRequiredMinor, "deposit_required_minor"),
    depositPaid: fromMinorUnits(paidMinor),
    depositRefunded: fromMinorUnits(depositRefundedMinor),
    depositHeld: fromMinorUnits(
      maxMoney(subtractMoney(paidMinor, depositRefundedMinor), MONEY_MINOR_ZERO),
    ),
  };
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
      depositRequiredMinor: rentals.depositRequiredMinor,
      depositPaidMinor: rentals.depositPaidMinor,
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
      cost: sql<number>`coalesce(sum(${maintenanceRecords.costMinor}), 0)`,
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
  const maintenanceMap = new Map(
    maintenance.map((row) => [
      row.vehicleId,
      sumToMinor(row.cost, `Vehicle ${row.vehicleId} maintenance cost`),
    ]),
  );

  return income.map((row) => {
    const maintenanceCostMinor =
      maintenanceMap.get(row.vehicleId) ?? MONEY_MINOR_ZERO;
    // `getVehicleIncome` already converted to major units, so the subtraction
    // returns to integers rather than doing float arithmetic here.
    const rentalIncomeMinor = toMinorUnits(row.totalIncome, "Rental income");

    return {
      vehicleId: row.vehicleId,
      plateNumber: row.plateNumber,
      brand: row.brand,
      model: row.model,
      rentalIncome: row.totalIncome,
      maintenanceCost: fromMinorUnits(maintenanceCostMinor),
      simpleNet: fromMinorUnits(
        subtractMoney(rentalIncomeMinor, maintenanceCostMinor),
      ),
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
      totalAmountMinor: rentals.totalAmountMinor,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.status, "cancelled"))
    .orderBy(desc(rentals.cancelledAt))
    .all()
    .map(({ totalAmountMinor, ...row }) => ({
      ...row,
      totalAmount: reportMoney(totalAmountMinor, "total_amount_minor"),
    }));
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
      amountMinor: payments.amountMinor,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .where(eq(payments.status, "voided"))
    .orderBy(desc(payments.voidedAt))
    .all()
    .map(({ amountMinor, ...row }) => ({
      ...row,
      amount: fromMinorUnits(columnToMinor(amountMinor, "payments.amount_minor")),
    }));
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

/** Posted payments minus posted refunds, summed as integers in SQL. */
function netPaymentTotalSql() {
  return sql<number>`coalesce(sum(CASE WHEN ${payments.type} = 'refund' THEN -${payments.amountMinor} ELSE ${payments.amountMinor} END), 0)`;
}

type DepositBaseRow = Omit<
  DepositReportRecord,
  "depositRefunded" | "depositHeld" | "depositRequired" | "depositPaid"
> & {
  depositRequiredMinor: number;
  depositPaidMinor: number;
};

function applyDepositRefunds(rows: DepositBaseRow[]): DepositReportRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const rentalIds = rows.map((row) => row.rentalId);
  const refundByRental = getDatabase()
    .select({
      rentalId: payments.rentalId,
      refunded: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`,
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
  const refundMap = new Map(
    refundByRental.map((row) => [
      row.rentalId,
      sumToMinor(row.refunded, `Rental ${row.rentalId} refunds`),
    ]),
  );

  return rows.map((row) =>
    toDepositRecord(row, refundMap.get(row.rentalId) ?? MONEY_MINOR_ZERO),
  );
}

function outstandingBalanceFilter() {
  return and(
    inArray(rentals.status, ["active", "overdue", "returned"]),
    sql`${rentals.remainingAmountMinor} > 0`,
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
    .prepare(`${heldDepositCteSql()} select count(*) as count from (${heldDepositBaseSql()}) deposits where depositHeldMinor > 0`)
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
        depositRequiredMinor,
        depositPaidMinor,
        depositRefundedMinor
      from (${heldDepositBaseSql()}) deposits
      where depositHeldMinor > 0
      order by createdAt desc
      limit ? offset ?
    `)
    .all(now, pageRequest.pageSize, pageRequest.offset) as Array<
    DepositBaseRow & { depositRefundedMinor: number }
  >;

  return createPageResult(
    // `depositHeld` is re-derived here rather than read from the query, so the
    // one clamp-at-zero rule lives in a single place.
    rows.map((row) =>
      toDepositRecord(
        row,
        sumToMinor(row.depositRefundedMinor, `Rental ${row.rentalId} refunds`),
      ),
    ),
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
          rentals.deposit_required_minor as depositRequiredMinor,
          rentals.deposit_paid_minor as depositPaidMinor
        from rentals indexed by rentals_created_at_idx
        inner join customers on rentals.customer_id = customers.id
        inner join vehicles on rentals.vehicle_id = vehicles.id
        where rentals.status in ('active', 'overdue', 'returned')
          and rentals.deposit_paid_minor > 0
        order by rentals.created_at desc
        limit ? offset ?
      `)
      .all(now, chunkSize, scanOffset) as DepositBaseRow[];

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
        coalesce(sum(amount_minor), 0) as refunded
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
      rentals.deposit_required_minor as depositRequiredMinor,
      rentals.deposit_paid_minor as depositPaidMinor,
      coalesce(refund_by_rental.refunded, 0) as depositRefundedMinor,
      max(0, rentals.deposit_paid_minor - coalesce(refund_by_rental.refunded, 0)) as depositHeldMinor,
      rentals.created_at as createdAt
    from rentals
    inner join customers on rentals.customer_id = customers.id
    inner join vehicles on rentals.vehicle_id = vehicles.id
    left join refund_by_rental on refund_by_rental.rentalId = rentals.id
    where rentals.status in ('active', 'overdue', 'returned')
      and rentals.deposit_paid_minor > 0
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

export function getCommissionReport(
  request?: CommissionReportRequest,
): CommissionReportSummary {
  requirePermissionForCurrentSession("reports.view");
  const db = getDatabase();
  const conditions = [];

  if (request?.dateFrom) {
    const range = getLocalDateRange(request.dateFrom, request.dateFrom);
    conditions.push(gte(rentals.startDatetime, range.start));
  }
  if (request?.dateTo) {
    const range = getLocalDateRange(request.dateTo, request.dateTo);
    conditions.push(lt(rentals.startDatetime, range.end));
  }
  if (request?.salesUserId) {
    conditions.push(eq(rentals.salesUserId, request.salesUserId));
  }
  if (request?.vehicleType && request.vehicleType !== "all") {
    conditions.push(eq(vehicles.type, request.vehicleType));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select({
      rentalId: rentals.id,
      contractNo: rentals.contractNo,
      customerId: rentals.customerId,
      customerName: customers.fullName,
      vehicleId: rentals.vehicleId,
      vehiclePlateNumber: vehicles.plateNumber,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleType: vehicles.type,
      salesUserId: rentals.salesUserId,
      salesUserName: users.fullName,
      status: rentals.status,
      startDatetime: rentals.startDatetime,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
      actualReturnDatetime: rentals.actualReturnDatetime,
      commissionRatePerDayMinor: rentals.commissionRatePerDayMinor,
      commissionAmountMinor: rentals.commissionAmountMinor,
      createdAt: rentals.createdAt,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .leftJoin(users, eq(rentals.salesUserId, users.id))
    .where(whereFilter)
    .orderBy(desc(rentals.createdAt))
    .all();

  const commissionAmountsMinor = rows.map((r) =>
    columnToMinor(r.commissionAmountMinor, "rentals.commission_amount_minor"),
  );
  const records: CommissionReportRecord[] = rows.map((r) => {
    const endDatetime = r.actualReturnDatetime ?? r.expectedReturnDatetime;
    const rentedDays = calculateRentalDays(r.startDatetime, endDatetime);
    return {
      rentalId: r.rentalId,
      contractNo: r.contractNo,
      customerId: r.customerId,
      customerName: r.customerName,
      vehicleId: r.vehicleId,
      vehiclePlateNumber: r.vehiclePlateNumber,
      vehicleBrand: r.vehicleBrand,
      vehicleModel: r.vehicleModel,
      vehicleType: r.vehicleType as "car" | "motorcycle",
      salesUserId: r.salesUserId,
      salesUserName: r.salesUserName,
      status: r.status,
      startDatetime: r.startDatetime,
      expectedReturnDatetime: r.expectedReturnDatetime,
      actualReturnDatetime: r.actualReturnDatetime,
      rentedDays,
      commissionRatePerDay: reportMoney(
        r.commissionRatePerDayMinor,
        "commission_rate_per_day_minor",
      ),
      commissionAmount: reportMoney(
        r.commissionAmountMinor,
        "commission_amount_minor",
      ),
      createdAt: r.createdAt,
    };
  });

  return {
    records,
    totalRentals: records.length,
    totalDays: records.reduce((acc, r) => acc + r.rentedDays, 0),
    // Summed from the stored integers, not from the converted report rows.
    totalCommission: fromMinorUnits(
      sumMoney(commissionAmountsMinor, "the commission total"),
    ),
  };
}
