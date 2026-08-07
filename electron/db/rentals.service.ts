import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateAccessoryChargeTotalMinor,
  type AccessoryRecord,
  type RentalAccessoryInput,
  type RentalAccessoryRecord,
  type RentalAccessoryReturnInput,
} from "../../src/shared/accessories";
import {
  calculateCancelledRentalBalance,
  calculateInitialRentalBalanceMinor,
  calculateRentalDays,
  calculateReturnSummaryMinor,
  calculateRentalSummaryMinor,
  getOpenRentalStatusForExpectedReturn,
  validateMileageProgression,
  type RentalActivationInput,
  type RentalActiveUpdateInput,
  type RentalCollateralInput,
  type RentalCollateralRecord,
  type RentalCollateralReturnInput,
  type RentalFormOptions,
  type RentalListRequest,
  type RentalListRecord,
  type RentalInitialBalanceMinor,
  type RentalListSummary,
  type RentalQueue,
  type RentalReturnInput,
  type RentalReturnWithPaymentInput,
  rentalActivationInputSchema,
  rentalActiveUpdateInputSchema,
  rentalCancelInputSchema,
  rentalReturnInputSchema,
  rentalReturnWithPaymentInputSchema,
} from "../../src/shared/rentals";
import { paymentInputSchema, type PaymentRecord } from "../../src/shared/payments";
import {
  MONEY_MINOR_ZERO,
  fromMinorUnits,
  fromMinorUnitsOrNull,
  subtractMoney,
  toMinorUnits,
  toMinorUnitsOrNull,
  type MoneyMinor,
} from "../../src/shared/money";
import type { PageResult } from "../../src/shared/pagination";
import {
  columnToMinor,
  moneyColumns,
  nullableColumnToMinor,
  nullableMoneyColumns,
  sumToMinor,
} from "./money-write";
import {
  accessories,
  customers,
  maintenanceRecords,
  payments,
  rentalAccessories,
  rentalCollateralItems,
  rentals,
  users,
  vehicleMileageEvents,
  vehicleSales,
  vehicles,
} from "./schema";
import { calculateCommission } from "./commission";
import { getDatabase, getSqliteDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { getShopSettings } from "./settings.service";
import { getNextSequenceValue } from "./numbering.service";
import { recalculateRentalPaymentState } from "./payments.service";
import { recordAppEvent } from "./events.service";
import { getCurrentUserForService, requireAllPermissionsForCurrentSession, requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { requireSensitiveApproval } from "./security.service";
import { isWriteAccessAllowed } from "../licensing/service";
import { effectiveOverdueRentalFilter, effectiveRentalStatusSql } from "./rental-status";

const activeRentalStatuses = ["active", "overdue"] as const;
type RentalTx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

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
    salesUserId: rentals.salesUserId,
    createdAt: rentals.createdAt,
    updatedAt: rentals.updatedAt,
  };
}

type RentalListRow = Omit<RentalListRecord, RentalMoneyField> & {
  [Key in `${RentalMoneyField}Minor`]: number;
};

type RentalMoneyField =
  | "dailyPrice"
  | "depositRequired"
  | "depositPaid"
  | "extraCharges"
  | "accessoryCharges"
  | "discount"
  | "totalAmount"
  | "paidAmount"
  | "remainingAmount";

/**
 * The one place a listed rental's stored integers become the major-unit
 * numbers the screen, the contract print and the export all read.
 */
function toRentalListRecord(row: RentalListRow): RentalListRecord {
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
    ...rest,
    dailyPrice: rentalMoney(dailyPriceMinor, "daily_price_minor"),
    depositRequired: rentalMoney(depositRequiredMinor, "deposit_required_minor"),
    depositPaid: rentalMoney(depositPaidMinor, "deposit_paid_minor"),
    extraCharges: rentalMoney(extraChargesMinor, "extra_charges_minor"),
    accessoryCharges: rentalMoney(accessoryChargesMinor, "accessory_charges_minor"),
    discount: rentalMoney(discountMinor, "discount_minor"),
    totalAmount: rentalMoney(totalAmountMinor, "total_amount_minor"),
    paidAmount: rentalMoney(paidAmountMinor, "paid_amount_minor"),
    remainingAmount: rentalMoney(remainingAmountMinor, "remaining_amount_minor"),
  };
}

function rentalMoney(value: number, column: string): number {
  return fromMinorUnits(columnToMinor(value, `rentals.${column}`));
}

function assertVehicleHasNoPostedSale(tx: RentalTx, vehicleId: number): void {
  const postedSale = tx
    .select({ id: vehicleSales.id })
    .from(vehicleSales)
    .where(and(eq(vehicleSales.vehicleId, vehicleId), eq(vehicleSales.status, "posted")))
    .get();

  if (postedSale) {
    throw new Error("Sold vehicles cannot be rented.");
  }
}

export function listRentals(
  request?: RentalListRequest | string,
): PageResult<RentalListRecord, RentalListSummary> {
  const now = new Date().toISOString();
  refreshOverdueRentals(now);

  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const listRequest = typeof request === "object" && request !== null ? request : {};
  const queue = isRentalQueue(listRequest.queue) ? listRequest.queue : "active";
  const conditions: SQL[] = [];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);

    const searchFilter = or(
      like(rentals.contractNo, term),
      like(customers.fullName, term),
      like(vehicles.plateNumber, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (queue === "active") {
    conditions.push(inArray(rentals.status, ["active", "overdue"]));
  } else if (queue === "overdue") {
    conditions.push(effectiveOverdueRentalFilter(now));
  } else if (queue === "due_today") {
    const today = getLocalDateRange(toDateInputValue(new Date()));
    const dueTodayFilter = and(
      inArray(rentals.status, ["active", "overdue"]),
      gte(rentals.expectedReturnDatetime, today.start),
      lt(rentals.expectedReturnDatetime, today.end),
    );

    if (dueTodayFilter) {
      conditions.push(dueTodayFilter);
    }
  } else if (queue === "returned") {
    conditions.push(eq(rentals.status, "returned"));
  } else if (queue === "cancelled") {
    conditions.push(eq(rentals.status, "cancelled"));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const effectiveStatus = effectiveRentalStatusSql(now);
  const total = db
    .select({ count: count() })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const summaryRow = db
    .select({
      total: count(),
      active: sql<number>`sum(case when ${effectiveStatus} = 'active' then 1 else 0 end)`.mapWith(Number),
      overdue: sql<number>`sum(case when ${effectiveStatus} = 'overdue' then 1 else 0 end)`.mapWith(Number),
      returned: sql<number>`sum(case when ${rentals.status} = 'returned' then 1 else 0 end)`.mapWith(Number),
      amount: sql<number>`coalesce(sum(${rentals.totalAmountMinor}), 0)`,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get();
  const rows = db
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(
      sql`case ${effectiveStatus} when 'overdue' then 0 when 'active' then 1 when 'draft' then 2 when 'returned' then 3 else 4 end`,
      desc(rentals.createdAt),
    )
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(hydrateRentalRecords(rows), total, pageRequest, {
    total: summaryRow?.total ?? 0,
    active: summaryRow?.active ?? 0,
    overdue: summaryRow?.overdue ?? 0,
    returned: summaryRow?.returned ?? 0,
    amount: fromMinorUnits(
      sumToMinor(summaryRow?.amount, "The rental list total"),
    ),
  });
}

export function getRentalFormOptions(): RentalFormOptions {
  const db = getDatabase();

  return {
    customers: db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        phone: customers.phone,
      })
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.fullName))
      .all(),
    vehicles: db
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        brand: vehicles.brand,
        model: vehicles.model,
        dailyPriceMinor: vehicles.dailyPriceMinor,
        depositAmountMinor: vehicles.depositAmountMinor,
        mileage: vehicles.mileage,
      })
      .from(vehicles)
      .leftJoin(
        vehicleSales,
        and(eq(vehicleSales.vehicleId, vehicles.id), eq(vehicleSales.status, "posted")),
      )
      .where(and(eq(vehicles.status, "available"), isNull(vehicleSales.id)))
      .orderBy(asc(vehicles.plateNumber))
      .all()
      .map(({ dailyPriceMinor, depositAmountMinor, ...vehicle }) => ({
        ...vehicle,
        dailyPrice: fromMinorUnits(
          columnToMinor(dailyPriceMinor, "vehicles.daily_price_minor"),
        ),
        depositAmount: fromMinorUnits(
          columnToMinor(depositAmountMinor, "vehicles.deposit_amount_minor"),
        ),
      })),
    accessories: loadRentalFormAccessories(),
    salesUsers: db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.fullName))
      .all(),
  };
}

export function activateRental(input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.create");
  const parsedValues = rentalActivationInputSchema.parse(input);
  const settings = getShopSettings();
  const values = settings.enableClientDeposit
    ? parsedValues
    : {
        ...parsedValues,
        depositRequired: 0,
        depositPaid: 0,
      };
  const now = new Date().toISOString();
  const accessoryChargesMinor = calculateAccessoryChargeTotalMinor(
    toAccessoryChargeLines(values.accessories),
  );
  const depositPaidMinor = toMinorUnits(values.depositPaid, "Deposit paid");
  const { totalAmountMinor } = calculateRentalSummaryMinor(
    values.startDatetime,
    values.expectedReturnDatetime,
    toMinorUnits(values.dailyPrice, "Daily price"),
    accessoryChargesMinor,
  );
  const initialBalance = calculateInitialRentalBalanceMinor(
    totalAmountMinor,
    depositPaidMinor,
  );
  const actor = getCurrentUserForService();

  try {
    const insertedRentalId = getDatabase().transaction((tx) => {
      const customer = tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, values.customerId))
        .get();

      if (!customer) {
        throw new Error("Customer was not found.");
      }

      const vehicle = tx
        .select({
          id: vehicles.id,
          status: vehicles.status,
          mileage: vehicles.mileage,
        })
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      if (vehicle.status !== "available") {
        throw new Error("Vehicle is not available.");
      }

      assertVehicleHasNoPostedSale(tx, values.vehicleId);
      assertRentalAccessoriesAvailable(tx, values.accessories);

      const existingActiveRental = tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(
          and(
            eq(rentals.vehicleId, values.vehicleId),
            inArray(rentals.status, [...activeRentalStatuses]),
          ),
        )
        .get();

      if (existingActiveRental) {
        throw new Error("This vehicle already has an active rental.");
      }

      if (
        values.mileageOut !== null &&
        vehicle.mileage !== null &&
        values.mileageOut < vehicle.mileage
      ) {
        throw new Error("Mileage out cannot be less than current vehicle mileage.");
      }

      const contractNo = getNextSequenceValue(tx, "contract", "CNT");
      const insertedRental = tx
        .insert(rentals)
        .values({
          ...toRentalInsert(
            tx,
            values,
            now,
            contractNo,
            "active",
            totalAmountMinor,
            accessoryChargesMinor,
            initialBalance,
            actor?.id ?? null,
          ),
          createdByUserId: actor?.id ?? null,
          activatedByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
        })
        .returning({ id: rentals.id })
        .get();

      insertRentalAccessories(tx, insertedRental.id, values.accessories, now);
      insertRentalCollateralItems(tx, insertedRental.id, values.collateralItems, now);

      if (values.depositPaid > 0) {
        const receiptNo = getNextSequenceValue(tx, "receipt", "RCP");
        const depositPayment = tx.insert(payments)
          .values({
            rentalId: insertedRental.id,
            type: "deposit",
            method: "cash",
            receiptNo,
            status: "posted",
            ...moneyColumns("amount", depositPaidMinor),
            paymentDate: now,
            notes: "Deposit paid at rental start.",
            createdByUserId: actor?.id ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();

        logAuditEvent(tx, {
          action: "payment.created",
          entityType: "payment",
          entityId: depositPayment.id,
          entityLabel: depositPayment.receiptNo,
          summaryAr: `تم تسجيل دفعة تأمين ${depositPayment.receiptNo ?? depositPayment.id}`,
          summaryEn: `Deposit payment ${depositPayment.receiptNo ?? depositPayment.id} was recorded.`,
          after: depositPayment,
          metadata: { rentalId: insertedRental.id },
        });
      }

      if (values.mileageOut !== null) {
        tx.insert(vehicleMileageEvents)
          .values({
            vehicleId: values.vehicleId,
            rentalId: insertedRental.id,
            maintenanceRecordId: null,
            eventType: "rental_out",
            mileage: values.mileageOut,
            previousMileage: vehicle.mileage,
            eventDatetime: values.startDatetime,
            notes: "Mileage recorded at rental start.",
            createdAt: now,
          })
          .run();
      }

      tx.update(vehicles)
        .set({
          status: "rented",
          mileage: values.mileageOut ?? vehicle.mileage,
          updatedAt: now,
        })
        .where(eq(vehicles.id, values.vehicleId))
        .run();

      recordAppEvent(tx, {
        eventType: "rental_activated",
        entityType: "rental",
        entityId: insertedRental.id,
        message: "Rental was activated.",
        details: { vehicleId: values.vehicleId, customerId: values.customerId },
      });
      logAuditEvent(tx, {
        action: "rental.activated",
        entityType: "rental",
        entityId: insertedRental.id,
        entityLabel: contractNo,
        summaryAr: `تم تفعيل عقد ${contractNo}`,
        summaryEn: `Rental ${contractNo} was activated.`,
        after: {
          ...values,
          contractNo,
          totalAmount: fromMinorUnits(totalAmountMinor),
          accessoryCharges: fromMinorUnits(accessoryChargesMinor),
        },
        metadata: { vehicleId: values.vehicleId, customerId: values.customerId },
      });

      return insertedRental.id;
    });

    const rental = getRentalById(insertedRentalId);

    if (!rental) {
      throw new Error("Rental was created but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function createDraftRental(input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.create");
  const parsedValues = rentalActivationInputSchema.parse(input);
  const settings = getShopSettings();
  const values = settings.enableClientDeposit
    ? { ...parsedValues, depositPaid: 0 }
    : {
        ...parsedValues,
        depositRequired: 0,
        depositPaid: 0,
      };
  const now = new Date().toISOString();
  const accessoryChargesMinor = calculateAccessoryChargeTotalMinor(
    toAccessoryChargeLines(values.accessories),
  );
  const { totalAmountMinor } = calculateRentalSummaryMinor(
    values.startDatetime,
    values.expectedReturnDatetime,
    toMinorUnits(values.dailyPrice, "Daily price"),
    accessoryChargesMinor,
  );
  // A draft has taken no money yet, so nothing is paid against it.
  const initialBalance = calculateInitialRentalBalanceMinor(
    totalAmountMinor,
    MONEY_MINOR_ZERO,
  );
  const actor = getCurrentUserForService();

  try {
    const insertedRentalId = getDatabase().transaction((tx) => {
      const customer = tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, values.customerId))
        .get();

      if (!customer) {
        throw new Error("Customer was not found.");
      }

      const vehicle = tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      assertRentalAccessoriesKnown(tx, values.accessories);

      const contractNo = getNextSequenceValue(tx, "contract", "CNT");
      const insertedRental = tx
        .insert(rentals)
        .values({
          ...toRentalInsert(
            tx,
            values,
            now,
            contractNo,
            "draft",
            totalAmountMinor,
            accessoryChargesMinor,
            initialBalance,
            actor?.id ?? null,
          ),
          createdByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
        })
        .returning({ id: rentals.id })
        .get();

      insertRentalAccessories(tx, insertedRental.id, values.accessories, now);
      insertRentalCollateralItems(tx, insertedRental.id, values.collateralItems, now);

      recordAppEvent(tx, {
        eventType: "rental_draft_created",
        entityType: "rental",
        entityId: insertedRental.id,
        message: "Draft rental was created.",
      });
      logAuditEvent(tx, {
        action: "rental.created",
        entityType: "rental",
        entityId: insertedRental.id,
        entityLabel: contractNo,
        summaryAr: `تم إنشاء مسودة عقد ${contractNo}`,
        summaryEn: `Draft rental ${contractNo} was created.`,
        after: {
          ...values,
          contractNo,
          totalAmount: fromMinorUnits(totalAmountMinor),
          accessoryCharges: fromMinorUnits(accessoryChargesMinor),
        },
      });

      return insertedRental.id;
    });

    const rental = getRentalById(insertedRentalId);

    if (!rental) {
      throw new Error("Draft rental was created but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function updateDraftRental(id: unknown, input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.create");
  const rentalId = parseRentalId(id);
  const values = rentalActivationInputSchema.parse(input);
  const now = new Date().toISOString();
  const accessoryChargesMinor = calculateAccessoryChargeTotalMinor(
    toAccessoryChargeLines(values.accessories),
  );
  const { totalAmountMinor } = calculateRentalSummaryMinor(
    values.startDatetime,
    values.expectedReturnDatetime,
    toMinorUnits(values.dailyPrice, "Daily price"),
    accessoryChargesMinor,
  );
  const actor = getCurrentUserForService();

  try {
    const updatedRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select({ id: rentals.id, status: rentals.status })
        .from(rentals)
        .where(eq(rentals.id, rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status !== "draft") {
        throw new Error("Only draft rentals can be updated here.");
      }

      assertRentalAccessoriesKnown(tx, values.accessories);

      tx.update(rentals)
        .set({
          customerId: values.customerId,
          vehicleId: values.vehicleId,
          startDatetime: values.startDatetime,
          expectedReturnDatetime: values.expectedReturnDatetime,
          ...moneyColumns("dailyPrice", toMinorUnits(values.dailyPrice, "Daily price")),
          ...moneyColumns(
            "depositRequired",
            toMinorUnits(values.depositRequired, "Deposit required"),
          ),
          ...moneyColumns("depositPaid", MONEY_MINOR_ZERO),
          mileageOut: values.mileageOut,
          fuelOut: values.fuelOut,
          notesOut: values.notesOut,
          ...moneyColumns("accessoryCharges", accessoryChargesMinor),
          ...moneyColumns("totalAmount", totalAmountMinor),
          // A draft has taken no money, so the whole total is still owed.
          ...moneyColumns("paidAmount", MONEY_MINOR_ZERO),
          ...moneyColumns("remainingAmount", totalAmountMinor),
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(rentals.id, rentalId))
        .run();

      replaceRentalAccessories(tx, rentalId, values.accessories, now);
      replaceRentalCollateralItems(tx, rentalId, values.collateralItems, now);

      recordAppEvent(tx, {
        eventType: "rental_draft_updated",
        entityType: "rental",
        entityId: rentalId,
        message: "Draft rental was updated.",
      });
      logAuditEvent(tx, {
        action: "rental.updated",
        entityType: "rental",
        entityId: rentalId,
        summaryAr: "تم تحديث مسودة عقد",
        summaryEn: "Draft rental was updated.",
        before: rental,
        after: {
          ...values,
          totalAmount: fromMinorUnits(totalAmountMinor),
          accessoryCharges: fromMinorUnits(accessoryChargesMinor),
        },
      });

      return rentalId;
    });

    const rental = getRentalById(updatedRentalId);

    if (!rental) {
      throw new Error("Draft rental was updated but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function activateDraftRental(id: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.create");
  const rentalId = parseRentalId(id);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    const activatedRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          vehicleId: rentals.vehicleId,
          status: rentals.status,
          mileageOut: rentals.mileageOut,
          startDatetime: rentals.startDatetime,
        })
        .from(rentals)
        .where(eq(rentals.id, rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status !== "draft") {
        throw new Error("Only draft rentals can be activated.");
      }

      const vehicle = tx
        .select({
          id: vehicles.id,
          status: vehicles.status,
          mileage: vehicles.mileage,
        })
        .from(vehicles)
        .where(eq(vehicles.id, rental.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      if (vehicle.status !== "available") {
        throw new Error("Vehicle is not available.");
      }

      assertVehicleHasNoPostedSale(tx, rental.vehicleId);

      const existingActiveRental = tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(
          and(
            eq(rentals.vehicleId, rental.vehicleId),
            inArray(rentals.status, [...activeRentalStatuses]),
          ),
        )
        .get();

      if (existingActiveRental) {
        throw new Error("This vehicle already has an active rental.");
      }

      if (
        rental.mileageOut !== null &&
        vehicle.mileage !== null &&
        rental.mileageOut < vehicle.mileage
      ) {
        throw new Error("Mileage out cannot be less than current vehicle mileage.");
      }

      assertRentalAccessoriesAvailable(
        tx,
        loadRentalAccessoryInputsForRental(tx, rentalId),
      );

      tx.update(rentals)
        .set({
          status: "active",
          activatedByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(rentals.id, rentalId))
        .run();

      if (rental.mileageOut !== null) {
        tx.insert(vehicleMileageEvents)
          .values({
            vehicleId: rental.vehicleId,
            rentalId,
            maintenanceRecordId: null,
            eventType: "rental_out",
            mileage: rental.mileageOut,
            previousMileage: vehicle.mileage,
            eventDatetime: rental.startDatetime,
            notes: "Mileage recorded when draft was activated.",
            createdAt: now,
          })
          .run();
      }

      tx.update(vehicles)
        .set({
          status: "rented",
          mileage: rental.mileageOut ?? vehicle.mileage,
          updatedAt: now,
        })
        .where(eq(vehicles.id, rental.vehicleId))
        .run();

      recordAppEvent(tx, {
        eventType: "rental_draft_activated",
        entityType: "rental",
        entityId: rentalId,
        message: "Draft rental was activated.",
      });
      logAuditEvent(tx, {
        action: "rental.activated",
        entityType: "rental",
        entityId: rentalId,
        summaryAr: "تم تفعيل مسودة عقد",
        summaryEn: "Draft rental was activated.",
        before: rental,
        after: { status: "active" },
      });

      return rentalId;
    });

    const rental = getRentalById(activatedRentalId);

    if (!rental) {
      throw new Error("Draft rental was activated but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function updateActiveRental(input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.editActive");
  const values: RentalActiveUpdateInput = rentalActiveUpdateInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    const updatedRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          status: rentals.status,
          startDatetime: rentals.startDatetime,
          accessoryChargesMinor: rentals.accessoryChargesMinor,
          paidAmountMinor: rentals.paidAmountMinor,
        })
        .from(rentals)
        .where(eq(rentals.id, values.rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status !== "active" && rental.status !== "overdue") {
        throw new Error("Only active or overdue rentals can be edited.");
      }

      if (
        new Date(values.expectedReturnDatetime).getTime() <=
        new Date(rental.startDatetime).getTime()
      ) {
        throw new Error("Expected return must be after the start date and time.");
      }

      const { totalAmountMinor } = calculateRentalSummaryMinor(
        rental.startDatetime,
        values.expectedReturnDatetime,
        toMinorUnits(values.dailyPrice, "Daily price"),
        columnToMinor(
          rental.accessoryChargesMinor,
          "rentals.accessory_charges_minor",
        ),
      );
      const status = getOpenRentalStatusForExpectedReturn(
        values.expectedReturnDatetime,
        now,
      );
      const totalAmount = fromMinorUnits(totalAmountMinor);

      tx.update(rentals)
        .set({
          status,
          expectedReturnDatetime: values.expectedReturnDatetime,
          ...moneyColumns("dailyPrice", toMinorUnits(values.dailyPrice, "Daily price")),
          ...moneyColumns(
            "depositRequired",
            toMinorUnits(values.depositRequired, "Deposit required"),
          ),
          mileageOut: values.mileageOut,
          fuelOut: values.fuelOut,
          notesOut: values.notesOut,
          ...moneyColumns("totalAmount", totalAmountMinor),
          ...moneyColumns(
            "remainingAmount",
            subtractMoney(
              totalAmountMinor,
              columnToMinor(rental.paidAmountMinor, "rentals.paid_amount_minor"),
            ),
          ),
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(rentals.id, values.rentalId))
        .run();

      recordAppEvent(tx, {
        eventType: "rental_active_updated",
        entityType: "rental",
        entityId: values.rentalId,
        severity: "warning",
        message: "Active rental was edited.",
        details: { totalAmount },
      });
      logAuditEvent(tx, {
        action: "rental.updated",
        entityType: "rental",
        entityId: values.rentalId,
        summaryAr: "تم تحديث عقد نشط",
        summaryEn: "Active rental was updated.",
        before: rental,
        after: { ...values, totalAmount, status },
      });

      return values.rentalId;
    });

    const rental = getRentalById(updatedRentalId);

    if (!rental) {
      throw new Error("Rental was updated but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function cancelRental(input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.cancel");
  const parsed = rentalCancelInputSchema.parse(input);
  requireSensitiveApproval("rentals.cancel", parsed.approvalToken);
  const rentalId = parsed.rentalId;
  const now = new Date().toISOString();
  const { remainingAmount } = calculateCancelledRentalBalance();
  const actor = getCurrentUserForService();

  try {
    const cancelledRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select()
        .from(rentals)
        .where(eq(rentals.id, rentalId))
        .get();

      if (!rental) {
        throw new Error("Rental was not found.");
      }

      if (rental.status !== "active" && rental.status !== "overdue") {
        throw new Error("Only active or overdue rentals can be cancelled.");
      }

      tx.update(rentals)
        .set({
          status: "cancelled",
          // A cancelled rental owes nothing and earns no commission.
          ...moneyColumns("remainingAmount", toMinorUnits(remainingAmount)),
          ...moneyColumns("commissionAmount", MONEY_MINOR_ZERO),
          cancelledAt: now,
          cancelReason: parsed.reason,
          cancelledByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(rentals.id, rentalId))
        .run();

      tx.update(vehicles)
        .set({
          status: "available",
          updatedAt: now,
        })
        .where(eq(vehicles.id, rental.vehicleId))
        .run();

      recordAppEvent(tx, {
        eventType: "rental_cancelled",
        entityType: "rental",
        entityId: rentalId,
        severity: "warning",
        message: "Rental was cancelled.",
        details: { reason: parsed.reason },
      });
      logAuditEvent(tx, {
        action: "rental.cancelled",
        entityType: "rental",
        entityId: rentalId,
        summaryAr: "تم إلغاء عقد تأجير",
        summaryEn: "Rental was cancelled.",
        before: rental,
        after: { status: "cancelled", remainingAmount },
        metadata: { vehicleId: rental.vehicleId },
        reason: parsed.reason,
      });

      return rental.id;
    });

    const rental = getRentalById(cancelledRentalId);

    if (!rental) {
      throw new Error("Rental was cancelled but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function returnRental(input: unknown): RentalListRecord {
  requirePermissionForCurrentSession("rentals.return");
  const values = rentalReturnInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    const returnedRentalId = getDatabase().transaction((tx) =>
      returnRentalInTransaction(tx, values, now),
    );

    const rental = getRentalById(returnedRentalId);

    if (!rental) {
      throw new Error("Rental was returned but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function returnRentalWithPayment(input: unknown): {
  rental: RentalListRecord;
  payment: PaymentRecord | null;
} {
  requireAllPermissionsForCurrentSession(["rentals.return", "payments.create"]);
  const values: RentalReturnWithPaymentInput =
    rentalReturnWithPaymentInputSchema.parse(input);
  if (values.paymentInput?.type === "refund") {
    requirePermissionForCurrentSession("payments.refund");
  }
  const now = new Date().toISOString();
  const settings = getShopSettings();
  const actor = getCurrentUserForService();

  try {
    const result = getDatabase().transaction((tx) => {
      const rentalId = returnRentalInTransaction(tx, values.returnInput, now);
      let paymentId: number | null = null;

      if (values.paymentInput && values.paymentInput.amount > 0) {
        const paymentValues = paymentInputSchema.parse(values.paymentInput);

        if (paymentValues.type === "refund") {
          requirePermissionForCurrentSession("payments.refund");
        }

        if (paymentValues.rentalId !== rentalId) {
          throw new Error("Payment must belong to the returned rental.");
        }

        if (!settings.enableClientDeposit && paymentValues.type === "deposit") {
          throw new Error("Client deposit is disabled in settings.");
        }

        const rental = tx
          .select({
            id: rentals.id,
            status: rentals.status,
            totalAmountMinor: rentals.totalAmountMinor,
          })
          .from(rentals)
          .where(eq(rentals.id, rentalId))
          .get();

        if (!rental) {
          throw new Error("Rental was not found.");
        }

        const receiptNo = getNextSequenceValue(tx, "receipt", "RCP");
        const payment = tx
          .insert(payments)
          .values({
            ...paymentValues,
            ...moneyColumns(
              "amount",
              toMinorUnits(paymentValues.amount, "Payment amount"),
            ),
            receiptNo,
            status: "posted",
            createdByUserId: actor?.id ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();

        recalculateRentalPaymentState(
          tx,
          rental.id,
          columnToMinor(rental.totalAmountMinor, "rentals.total_amount_minor"),
          rental.status,
          now,
        );
        logAuditEvent(tx, {
          action:
            paymentValues.type === "refund" ? "payment.refunded" : "payment.created",
          entityType: "payment",
          entityId: payment.id,
          summaryAr: "تم تسجيل دفعة عند الإرجاع",
          summaryEn: "Payment was recorded during return.",
          entityLabel: payment.receiptNo,
          after: payment,
          metadata: { rentalId },
        });
        paymentId = payment.id;
      }

      return { rentalId, paymentId };
    });

    const rental = getRentalById(result.rentalId);

    if (!rental) {
      throw new Error("Rental was returned but could not be loaded.");
    }

    return {
      rental,
      payment: result.paymentId ? getPaymentById(result.paymentId) ?? null : null,
    };
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

export function findOpenRentalByPlate(plateNumber: unknown): RentalListRecord {
  const normalizedPlate = String(plateNumber ?? "").trim().toUpperCase();

  if (!normalizedPlate) {
    throw new Error("Plate number is required.");
  }

  const now = new Date().toISOString();
  refreshOverdueRentals(now);

  const rental = getDatabase()
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(
      and(
        eq(vehicles.plateNumber, normalizedPlate),
        inArray(rentals.status, [...activeRentalStatuses]),
      ),
    )
    .get();

  if (!rental) {
    throw new Error("No active rental was found for this plate number.");
  }

  return hydrateRentalRecord(rental);
}

function getRentalById(id: number): RentalListRecord | undefined {
  const now = new Date().toISOString();

  const rental = getDatabase()
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.id, id))
    .get();

  return rental ? hydrateRentalRecord(rental) : undefined;
}

function getPaymentById(id: number): PaymentRecord | undefined {
  const row = getDatabase().select().from(payments).where(eq(payments.id, id)).get();

  return row
    ? {
        ...row,
        amount: fromMinorUnits(columnToMinor(row.amountMinor, "payments.amount_minor")),
      }
    : undefined;
}

function hydrateRentalRecord(rental: RentalListRow): RentalListRecord {
  return hydrateRentalRecords([rental])[0] ?? toRentalListRecord(rental);
}

function hydrateRentalRecords(rows: RentalListRow[]): RentalListRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const rentalIds = rows.map((rental) => rental.id);
  const accessoriesByRental = loadRentalAccessoriesForRentals(rentalIds);
  const collateralByRental = loadRentalCollateralForRentals(rentalIds);

  return rows.map((rental) => ({
    ...toRentalListRecord(rental),
    accessories: accessoriesByRental.get(rental.id) ?? [],
    collateralItems: collateralByRental.get(rental.id) ?? [],
  }));
}

function loadRentalAccessoriesForRentals(
  rentalIds: number[],
): Map<number, RentalAccessoryRecord[]> {
  const map = new Map<number, RentalAccessoryRecord[]>();

  if (rentalIds.length === 0) {
    return map;
  }

  const rows = getDatabase()
    .select({
      id: rentalAccessories.id,
      rentalId: rentalAccessories.rentalId,
      accessoryId: rentalAccessories.accessoryId,
      accessoryName: accessories.name,
      quantity: rentalAccessories.quantity,
      unitChargeMinor: rentalAccessories.unitChargeMinor,
      returnedQuantity: rentalAccessories.returnedQuantity,
      missingQuantity: rentalAccessories.missingQuantity,
      notes: rentalAccessories.notes,
    })
    .from(rentalAccessories)
    .innerJoin(accessories, eq(rentalAccessories.accessoryId, accessories.id))
    .where(inArray(rentalAccessories.rentalId, rentalIds))
    .orderBy(asc(accessories.name))
    .all();

  for (const { unitChargeMinor, ...row } of rows) {
    const list = map.get(row.rentalId) ?? [];
    list.push({
      ...row,
      unitCharge: fromMinorUnits(
        columnToMinor(unitChargeMinor, "rental_accessories.unit_charge_minor"),
      ),
    });
    map.set(row.rentalId, list);
  }

  return map;
}

function loadRentalCollateralForRentals(
  rentalIds: number[],
): Map<number, RentalCollateralRecord[]> {
  const map = new Map<number, RentalCollateralRecord[]>();

  if (rentalIds.length === 0) {
    return map;
  }

  const rows = getDatabase()
    .select({
      id: rentalCollateralItems.id,
      rentalId: rentalCollateralItems.rentalId,
      type: rentalCollateralItems.type,
      description: rentalCollateralItems.description,
      referenceNumber: rentalCollateralItems.referenceNumber,
      estimatedValueMinor: rentalCollateralItems.estimatedValueMinor,
      currency: rentalCollateralItems.currency,
      status: rentalCollateralItems.status,
      receivedAt: rentalCollateralItems.receivedAt,
      returnedAt: rentalCollateralItems.returnedAt,
      notes: rentalCollateralItems.notes,
    })
    .from(rentalCollateralItems)
    .where(inArray(rentalCollateralItems.rentalId, rentalIds))
    .orderBy(asc(rentalCollateralItems.id))
    .all();

  for (const { estimatedValueMinor, ...row } of rows) {
    const list = map.get(row.rentalId) ?? [];
    // An item held as security may have no stated value; null stays null.
    list.push({
      ...row,
      estimatedValue: fromMinorUnitsOrNull(
        nullableColumnToMinor(
          estimatedValueMinor,
          "rental_collateral_items.estimated_value_minor",
        ),
      ),
    });
    map.set(row.rentalId, list);
  }

  return map;
}

function loadRentalFormAccessories(): AccessoryRecord[] {
  return getSqliteDatabase()
    .prepare(
      `
        select
          accessories.id,
          accessories.name,
          accessories.quantity_owned as quantityOwned,
          accessories.default_charge_minor as defaultChargeMinor,
          accessories.is_active as isActive,
          accessories.notes,
          accessories.created_at as createdAt,
          accessories.updated_at as updatedAt,
          coalesce(assigned.quantity_assigned, 0) as quantityAssigned,
          max(0, accessories.quantity_owned - coalesce(assigned.quantity_assigned, 0)) as quantityAvailable
        from accessories
        left join (
          select
            rental_accessories.accessory_id,
            coalesce(sum(max(0, rental_accessories.quantity - rental_accessories.returned_quantity - rental_accessories.missing_quantity)), 0) as quantity_assigned
          from rental_accessories
          inner join rentals on rental_accessories.rental_id = rentals.id
          where rentals.status in ('active', 'overdue')
          group by rental_accessories.accessory_id
        ) assigned on assigned.accessory_id = accessories.id
        where accessories.is_active = 1
        order by accessories.name asc
      `,
    )
    .all()
    .map((row) => {
      const value = row as {
        createdAt: string;
        defaultChargeMinor: number;
        id: number;
        isActive: boolean | number;
        name: string;
        notes: string | null;
        quantityAssigned: number;
        quantityAvailable: number;
        quantityOwned: number;
        updatedAt: string;
      };

      return {
        id: Number(value.id),
        name: value.name,
        quantityOwned: Number(value.quantityOwned),
        defaultCharge: fromMinorUnits(
          columnToMinor(value.defaultChargeMinor, "accessories.default_charge_minor"),
        ),
        isActive: Boolean(value.isActive),
        notes: value.notes,
        quantityAssigned: Number(value.quantityAssigned),
        quantityAvailable: Number(value.quantityAvailable),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      };
    });
}

function assertRentalAccessoriesKnown(
  tx: RentalTx,
  rentalAccessoryInputs: RentalAccessoryInput[],
): void {
  assertNoDuplicateRentalAccessories(rentalAccessoryInputs);

  for (const rentalAccessory of rentalAccessoryInputs) {
    const accessory = getAccessoryAvailability(tx, rentalAccessory.accessoryId);

    if (!accessory) {
      throw new Error("Accessory was not found.");
    }

    if (!accessory.isActive) {
      throw new Error(`${accessory.name} is inactive.`);
    }
  }
}

function assertRentalAccessoriesAvailable(
  tx: RentalTx,
  rentalAccessoryInputs: RentalAccessoryInput[],
): void {
  assertNoDuplicateRentalAccessories(rentalAccessoryInputs);

  for (const rentalAccessory of rentalAccessoryInputs) {
    const accessory = getAccessoryAvailability(tx, rentalAccessory.accessoryId);

    if (!accessory) {
      throw new Error("Accessory was not found.");
    }

    if (!accessory.isActive) {
      throw new Error(`${accessory.name} is inactive.`);
    }

    if (rentalAccessory.quantity > accessory.quantityAvailable) {
      throw new Error(
        `${accessory.name} has only ${accessory.quantityAvailable} available.`,
      );
    }
  }
}

function getAccessoryAvailability(
  _tx: RentalTx,
  accessoryId: number,
):
  | {
      id: number;
      isActive: boolean;
      name: string;
      quantityAvailable: number;
      quantityOwned: number;
    }
  | undefined {
  const row = getSqliteDatabase()
    .prepare(
      `
        select
          accessories.id,
          accessories.name,
          accessories.quantity_owned as quantityOwned,
          accessories.is_active as isActive,
          coalesce(assigned.quantity_assigned, 0) as quantityAssigned
        from accessories
        left join (
          select
            rental_accessories.accessory_id,
            coalesce(sum(max(0, rental_accessories.quantity - rental_accessories.returned_quantity - rental_accessories.missing_quantity)), 0) as quantity_assigned
          from rental_accessories
          inner join rentals on rental_accessories.rental_id = rentals.id
          where rentals.status in ('active', 'overdue')
          group by rental_accessories.accessory_id
        ) assigned on assigned.accessory_id = accessories.id
        where accessories.id = ?
      `,
    )
    .get(accessoryId) as
    | {
        id: number;
        isActive: boolean | number;
        name: string;
        quantityAssigned: number;
        quantityOwned: number;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    name: row.name,
    quantityOwned: row.quantityOwned,
    isActive: Boolean(row.isActive),
    quantityAvailable: Math.max(0, row.quantityOwned - row.quantityAssigned),
  };
}

function loadRentalAccessoryInputsForRental(
  tx: RentalTx,
  rentalId: number,
): RentalAccessoryInput[] {
  return tx
    .select({
      accessoryId: rentalAccessories.accessoryId,
      quantity: rentalAccessories.quantity,
      unitChargeMinor: rentalAccessories.unitChargeMinor,
      notes: rentalAccessories.notes,
    })
    .from(rentalAccessories)
    .where(eq(rentalAccessories.rentalId, rentalId))
    .all()
    .map(({ unitChargeMinor, ...row }) => ({
      ...row,
      unitCharge: fromMinorUnits(
        columnToMinor(unitChargeMinor, "rental_accessories.unit_charge_minor"),
      ),
    }));
}

/** Accessory inputs arrive in major units; charges are calculated in minor. */
function toAccessoryChargeLines(
  rentalAccessoryInputs: readonly RentalAccessoryInput[],
) {
  return rentalAccessoryInputs.map((rentalAccessory) => ({
    quantity: rentalAccessory.quantity,
    unitChargeMinor: toMinorUnits(rentalAccessory.unitCharge, "Accessory unit charge"),
  }));
}

function insertRentalAccessories(
  tx: RentalTx,
  rentalId: number,
  rentalAccessoryInputs: RentalAccessoryInput[],
  now: string,
): void {
  if (rentalAccessoryInputs.length === 0) {
    return;
  }

  tx.insert(rentalAccessories)
    .values(
      rentalAccessoryInputs.map((rentalAccessory) => ({
        rentalId,
        accessoryId: rentalAccessory.accessoryId,
        quantity: rentalAccessory.quantity,
        ...moneyColumns(
          "unitCharge",
          toMinorUnits(rentalAccessory.unitCharge, "Accessory unit charge"),
        ),
        returnedQuantity: 0,
        missingQuantity: 0,
        notes: rentalAccessory.notes,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
}

function insertRentalCollateralItems(
  tx: RentalTx,
  rentalId: number,
  collateralInputs: RentalCollateralInput[],
  now: string,
): void {
  if (collateralInputs.length === 0) {
    return;
  }

  tx.insert(rentalCollateralItems)
    .values(
      collateralInputs.map((item) => ({
        rentalId,
        type: item.type,
        description: item.description,
        referenceNumber: item.referenceNumber,
        ...nullableMoneyColumns(
          "estimatedValue",
          toMinorUnitsOrNull(item.estimatedValue, "Estimated value"),
        ),
        currency: item.currency,
        status: "held" as const,
        receivedAt: now,
        returnedAt: null,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
}

function replaceRentalAccessories(
  tx: RentalTx,
  rentalId: number,
  rentalAccessoryInputs: RentalAccessoryInput[],
  now: string,
): void {
  tx.delete(rentalAccessories)
    .where(eq(rentalAccessories.rentalId, rentalId))
    .run();
  insertRentalAccessories(tx, rentalId, rentalAccessoryInputs, now);
}

function replaceRentalCollateralItems(
  tx: RentalTx,
  rentalId: number,
  collateralInputs: RentalCollateralInput[],
  now: string,
): void {
  tx.delete(rentalCollateralItems)
    .where(eq(rentalCollateralItems.rentalId, rentalId))
    .run();
  insertRentalCollateralItems(tx, rentalId, collateralInputs, now);
}

function applyRentalAccessoryReturns(
  tx: RentalTx,
  rentalId: number,
  accessoryReturns: RentalAccessoryReturnInput[],
  now: string,
): void {
  for (const accessoryReturn of accessoryReturns) {
    const existing = tx
      .select()
      .from(rentalAccessories)
      .where(eq(rentalAccessories.id, accessoryReturn.rentalAccessoryId))
      .get();

    if (!existing || existing.rentalId !== rentalId) {
      throw new Error("Returned accessory does not belong to this rental.");
    }

    if (
      accessoryReturn.returnedQuantity + accessoryReturn.missingQuantity >
      existing.quantity
    ) {
      throw new Error("Returned and missing accessory quantities exceed assigned quantity.");
    }

    tx.update(rentalAccessories)
      .set({
        returnedQuantity: accessoryReturn.returnedQuantity,
        missingQuantity: accessoryReturn.missingQuantity,
        notes: accessoryReturn.notes,
        updatedAt: now,
      })
      .where(eq(rentalAccessories.id, accessoryReturn.rentalAccessoryId))
      .run();
  }
}

function applyRentalCollateralReturns(
  tx: RentalTx,
  rentalId: number,
  collateralReturns: RentalCollateralReturnInput[],
  now: string,
): void {
  for (const collateralReturn of collateralReturns) {
    const existing = tx
      .select()
      .from(rentalCollateralItems)
      .where(eq(rentalCollateralItems.id, collateralReturn.collateralId))
      .get();

    if (!existing || existing.rentalId !== rentalId) {
      throw new Error("Amanat item does not belong to this rental.");
    }

    tx.update(rentalCollateralItems)
      .set({
        status: collateralReturn.status,
        returnedAt: collateralReturn.status === "returned" ? now : null,
        notes: collateralReturn.notes,
        updatedAt: now,
      })
      .where(eq(rentalCollateralItems.id, collateralReturn.collateralId))
      .run();
  }
}

function assertNoDuplicateRentalAccessories(
  rentalAccessoryInputs: RentalAccessoryInput[],
): void {
  const seen = new Set<number>();

  for (const rentalAccessory of rentalAccessoryInputs) {
    if (seen.has(rentalAccessory.accessoryId)) {
      throw new Error("Add each accessory only once.");
    }

    seen.add(rentalAccessory.accessoryId);
  }
}

function returnRentalInTransaction(
  tx: RentalTx,
  values: RentalReturnInput,
  now: string,
): number {
  const actor = getCurrentUserForService();
  const rental = tx
    .select({
      id: rentals.id,
      vehicleId: rentals.vehicleId,
      status: rentals.status,
      startDatetime: rentals.startDatetime,
      expectedReturnDatetime: rentals.expectedReturnDatetime,
      totalAmountMinor: rentals.totalAmountMinor,
      paidAmountMinor: rentals.paidAmountMinor,
      mileageOut: rentals.mileageOut,
      salesUserId: rentals.salesUserId,
      commissionRatePerDayMinor: rentals.commissionRatePerDayMinor,
    })
    .from(rentals)
    .where(eq(rentals.id, values.rentalId))
    .get();

  if (!rental) {
    throw new Error("Rental was not found.");
  }

  if (rental.status !== "active" && rental.status !== "overdue") {
    throw new Error("Only active or overdue rentals can be returned.");
  }

  if (
    new Date(values.actualReturnDatetime).getTime() <
    new Date(rental.startDatetime).getTime()
  ) {
    throw new Error("Actual return cannot be before the rental start.");
  }

  const vehicle = tx
    .select({
      id: vehicles.id,
      mileage: vehicles.mileage,
    })
    .from(vehicles)
    .where(eq(vehicles.id, rental.vehicleId))
    .get();

  if (!vehicle) {
    throw new Error("Vehicle was not found.");
  }

  const mileageError = validateMileageProgression({
    mileageIn: values.mileageIn,
    mileageOut: rental.mileageOut,
    currentVehicleMileage: vehicle.mileage,
  });

  if (mileageError) {
    throw new Error(mileageError);
  }

  const summary = calculateReturnSummaryMinor({
    expectedReturnDatetime: rental.expectedReturnDatetime,
    actualReturnDatetime: values.actualReturnDatetime,
    baseTotalAmountMinor: columnToMinor(
      rental.totalAmountMinor,
      "rentals.total_amount_minor",
    ),
    paidAmountMinor: columnToMinor(rental.paidAmountMinor, "rentals.paid_amount_minor"),
    lateFeePerDayMinor: toMinorUnits(values.lateFeePerDay, "Late fee per day"),
    damageChargeMinor: toMinorUnits(values.damageCharge, "Damage charge"),
    discountMinor: toMinorUnits(values.discount, "Discount"),
  });

  if (summary.finalAmountMinor < 0) {
    throw new Error("Discount cannot be more than the total charges.");
  }

  applyRentalAccessoryReturns(tx, rental.id, values.accessoryReturns, now);
  applyRentalCollateralReturns(tx, rental.id, values.collateralReturns, now);

  const salesUserId = rental.salesUserId;
  const salesUserRow = salesUserId
    ? tx
        .select({ earnsCommission: users.earnsCommission })
        .from(users)
        .where(eq(users.id, salesUserId))
        .get()
    : null;
  const actualDays = calculateRentalDays(
    rental.startDatetime,
    values.actualReturnDatetime,
  );
  const updatedCommission = calculateCommission({
    rentedDays: actualDays,
    dailyRateMinor: columnToMinor(
      rental.commissionRatePerDayMinor,
      "rentals.commission_rate_per_day_minor",
    ),
    status: "returned",
    userEarnsCommission: Boolean(salesUserRow?.earnsCommission),
    commissionEnabled: getShopSettings().enableSalesCommission,
  });

  tx.update(rentals)
    .set({
      status: "returned",
      actualReturnDatetime: values.actualReturnDatetime,
      mileageIn: values.mileageIn,
      fuelIn: values.fuelIn,
      notesIn: values.notesIn,
      damageNotes: values.damageNotes,
      ...moneyColumns("extraCharges", summary.extraChargesMinor),
      ...moneyColumns("discount", toMinorUnits(values.discount, "Discount")),
      ...moneyColumns("totalAmount", summary.finalAmountMinor),
      ...moneyColumns("remainingAmount", summary.remainingAmountMinor),
      ...moneyColumns("commissionAmount", updatedCommission.commissionAmountMinor),
      returnedByUserId: actor?.id ?? null,
      lastUpdatedByUserId: actor?.id ?? null,
      updatedAt: now,
    })
    .where(eq(rentals.id, values.rentalId))
    .run();

  tx.update(vehicles)
    .set({
      status: values.vehicleStatus,
      mileage: values.mileageIn ?? vehicle.mileage,
      updatedAt: now,
    })
    .where(eq(vehicles.id, rental.vehicleId))
    .run();

  if (values.mileageIn !== null) {
    tx.insert(vehicleMileageEvents)
      .values({
        vehicleId: rental.vehicleId,
        rentalId: rental.id,
        maintenanceRecordId: null,
        eventType: "rental_return",
        mileage: values.mileageIn,
        previousMileage: vehicle.mileage,
        eventDatetime: values.actualReturnDatetime,
        notes: values.notesIn ?? values.damageNotes ?? "Mileage recorded at return.",
        createdAt: now,
      })
      .run();
  }

  let maintenanceRecordId: number | null = null;

  if (values.vehicleStatus === "maintenance") {
    const title = values.maintenanceTitle?.trim();

    if (!title) {
      throw new Error("Maintenance reason is required.");
    }

    const maintenanceRecord = tx
      .insert(maintenanceRecords)
      .values({
        vehicleId: rental.vehicleId,
        title,
        description:
          values.maintenanceDescription?.trim() ||
          values.damageNotes?.trim() ||
          null,
        ...moneyColumns("cost", MONEY_MINOR_ZERO),
        startDate: toDateInputValue(new Date(values.actualReturnDatetime)),
        endDate: null,
        isArchived: false,
        createdByUserId: actor?.id ?? null,
        lastUpdatedByUserId: actor?.id ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    maintenanceRecordId = maintenanceRecord.id;
    logAuditEvent(tx, {
      action: "maintenance.created",
      entityType: "maintenance",
      entityId: maintenanceRecord.id,
      entityLabel: maintenanceRecord.title,
      summaryAr: `تم تسجيل صيانة ${maintenanceRecord.title}`,
      summaryEn: `Maintenance ${maintenanceRecord.title} was created.`,
      after: maintenanceRecord,
      metadata: { rentalId: rental.id, vehicleId: rental.vehicleId },
    });
  }

  recordAppEvent(tx, {
    eventType: "rental_returned",
    entityType: "rental",
    entityId: rental.id,
    message: "Rental was returned.",
    details: {
      vehicleId: rental.vehicleId,
      vehicleStatus: values.vehicleStatus,
      maintenanceRecordId,
    },
  });
  logAuditEvent(tx, {
    action: "rental.returned",
    entityType: "rental",
    entityId: rental.id,
    summaryAr: "تم إرجاع مركبة",
    summaryEn: "Rental was returned.",
    before: rental,
    after: {
      status: "returned",
      actualReturnDatetime: values.actualReturnDatetime,
      totalAmount: fromMinorUnits(summary.finalAmountMinor),
      remainingAmount: fromMinorUnits(summary.remainingAmountMinor),
      vehicleStatus: values.vehicleStatus,
    },
    metadata: {
      vehicleId: rental.vehicleId,
      vehicleStatus: values.vehicleStatus,
      maintenanceRecordId,
    },
  });

  return rental.id;
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

function toRentalInsert(
  tx: RentalTx,
  values: RentalActivationInput,
  now: string,
  contractNo: string,
  status: "draft" | "active",
  totalAmountMinor: MoneyMinor,
  accessoryChargesMinor: MoneyMinor,
  initialBalance: RentalInitialBalanceMinor,
  actorId: number | null,
) {
  const settings = getShopSettings();
  const salesUserId =
    values.salesUserId && values.salesUserId > 0 ? values.salesUserId : actorId;
  let commissionRatePerDayMinor = MONEY_MINOR_ZERO;
  let commissionAmountMinor = MONEY_MINOR_ZERO;

  if (settings.enableSalesCommission && salesUserId) {
    const userRow = tx
      .select({ earnsCommission: users.earnsCommission })
      .from(users)
      .where(eq(users.id, salesUserId))
      .get();
    if (userRow?.earnsCommission) {
      const vehicleRow = tx
        .select({
          commissionRateOverrideMinor: vehicles.commissionRateOverrideMinor,
        })
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();
      // The shop-wide default rate is a major-unit setting, converted here at
      // the point it enters a calculation.
      const dailyRateMinor =
        nullableColumnToMinor(
          vehicleRow?.commissionRateOverrideMinor,
          "vehicles.commission_rate_override_minor",
        ) ??
        toMinorUnits(
          settings.defaultDailyCommissionRate,
          "Default daily commission rate",
        );
      const calc = calculateCommission({
        rentedDays: calculateRentalDays(
          values.startDatetime,
          values.expectedReturnDatetime,
        ),
        dailyRateMinor,
        status,
        userEarnsCommission: true,
        commissionEnabled: true,
      });
      commissionRatePerDayMinor = calc.commissionRatePerDayMinor;
      commissionAmountMinor = calc.commissionAmountMinor;
    }
  }

  return {
    contractNo,
    customerId: values.customerId,
    vehicleId: values.vehicleId,
    status,
    startDatetime: values.startDatetime,
    expectedReturnDatetime: values.expectedReturnDatetime,
    actualReturnDatetime: null,
    ...moneyColumns("dailyPrice", toMinorUnits(values.dailyPrice, "Daily price")),
    ...moneyColumns(
      "depositRequired",
      toMinorUnits(values.depositRequired, "Deposit required"),
    ),
    ...moneyColumns("depositPaid", toMinorUnits(values.depositPaid, "Deposit paid")),
    mileageOut: values.mileageOut,
    mileageIn: null,
    fuelOut: values.fuelOut,
    fuelIn: null,
    notesOut: values.notesOut,
    notesIn: null,
    damageNotes: null,
    ...moneyColumns("extraCharges", MONEY_MINOR_ZERO),
    ...moneyColumns("accessoryCharges", accessoryChargesMinor),
    ...moneyColumns("discount", MONEY_MINOR_ZERO),
    ...moneyColumns("totalAmount", totalAmountMinor),
    ...moneyColumns("paidAmount", initialBalance.paidAmountMinor),
    ...moneyColumns("remainingAmount", initialBalance.remainingAmountMinor),
    salesUserId,
    ...moneyColumns("commissionRatePerDay", commissionRatePerDayMinor),
    ...moneyColumns("commissionAmount", commissionAmountMinor),
    cancelledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function parseRentalId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Rental ID is invalid.");
  }

  return parsedId;
}

function isRentalQueue(value: unknown): value is RentalQueue {
  return (
    value === "active" ||
    value === "overdue" ||
    value === "due_today" ||
    value === "returned" ||
    value === "cancelled" ||
    value === "all"
  );
}

function normalizeRentalServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the rental details.");
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: rentals.contract_no")
  ) {
    return new Error("Contract number already exists. Please try again.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Rental could not be saved.");
}
