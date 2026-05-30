import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateCancelledRentalBalance,
  calculateInitialRentalBalance,
  calculateReturnSummary,
  calculateRentalSummary,
  getOpenRentalStatusForExpectedReturn,
  validateMileageProgression,
  type RentalActivationInput,
  type RentalActiveUpdateInput,
  type RentalFormOptions,
  type RentalListRequest,
  type RentalListRecord,
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
import type { PageResult } from "../../src/shared/pagination";
import { customers, maintenanceRecords, payments, rentals, vehicleMileageEvents, vehicleSales, vehicles } from "./schema";
import { getDatabase } from "./database";
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
      amount: sql<number>`coalesce(sum(${rentals.totalAmount}), 0)`.mapWith(Number),
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

  return createPageResult(rows, total, pageRequest, {
    total: summaryRow?.total ?? 0,
    active: summaryRow?.active ?? 0,
    overdue: summaryRow?.overdue ?? 0,
    returned: summaryRow?.returned ?? 0,
    amount: summaryRow?.amount ?? 0,
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
        dailyPrice: vehicles.dailyPrice,
        depositAmount: vehicles.depositAmount,
        mileage: vehicles.mileage,
      })
      .from(vehicles)
      .leftJoin(
        vehicleSales,
        and(eq(vehicleSales.vehicleId, vehicles.id), eq(vehicleSales.status, "posted")),
      )
      .where(and(eq(vehicles.status, "available"), isNull(vehicleSales.id)))
      .orderBy(asc(vehicles.plateNumber))
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
  const { totalAmount } = calculateRentalSummary(
    values.startDatetime,
    values.expectedReturnDatetime,
    values.dailyPrice,
  );
  const initialBalance = calculateInitialRentalBalance(
    totalAmount,
    values.depositPaid,
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

      const contractNo = getNextSequenceValue(tx, "contract", "ARAK");
      const insertedRental = tx
        .insert(rentals)
        .values({
          ...toRentalInsert(values, now, contractNo, "active", totalAmount, initialBalance),
          createdByUserId: actor?.id ?? null,
          activatedByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
        })
        .returning({ id: rentals.id })
        .get();

      if (values.depositPaid > 0) {
        const receiptNo = getNextSequenceValue(tx, "receipt", "RCP");
        const depositPayment = tx.insert(payments)
          .values({
            rentalId: insertedRental.id,
            type: "deposit",
            method: "cash",
            receiptNo,
            status: "posted",
            amount: values.depositPaid,
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
        after: { ...values, contractNo, totalAmount },
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
  const { totalAmount } = calculateRentalSummary(
    values.startDatetime,
    values.expectedReturnDatetime,
    values.dailyPrice,
  );
  const initialBalance = calculateInitialRentalBalance(totalAmount, 0);
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

      const contractNo = getNextSequenceValue(tx, "contract", "ARAK");
      const insertedRental = tx
        .insert(rentals)
        .values({
          ...toRentalInsert(values, now, contractNo, "draft", totalAmount, initialBalance),
          createdByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
        })
        .returning({ id: rentals.id })
        .get();

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
        after: { ...values, contractNo, totalAmount },
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
  const { totalAmount } = calculateRentalSummary(
    values.startDatetime,
    values.expectedReturnDatetime,
    values.dailyPrice,
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

      tx.update(rentals)
        .set({
          customerId: values.customerId,
          vehicleId: values.vehicleId,
          startDatetime: values.startDatetime,
          expectedReturnDatetime: values.expectedReturnDatetime,
          dailyPrice: values.dailyPrice,
          depositRequired: values.depositRequired,
          depositPaid: 0,
          mileageOut: values.mileageOut,
          fuelOut: values.fuelOut,
          notesOut: values.notesOut,
          totalAmount,
          paidAmount: 0,
          remainingAmount: totalAmount,
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(rentals.id, rentalId))
        .run();

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
        after: { ...values, totalAmount },
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
          paidAmount: rentals.paidAmount,
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

      const { totalAmount } = calculateRentalSummary(
        rental.startDatetime,
        values.expectedReturnDatetime,
        values.dailyPrice,
      );
      const status = getOpenRentalStatusForExpectedReturn(
        values.expectedReturnDatetime,
        now,
      );

      tx.update(rentals)
        .set({
          status,
          expectedReturnDatetime: values.expectedReturnDatetime,
          dailyPrice: values.dailyPrice,
          depositRequired: values.depositRequired,
          mileageOut: values.mileageOut,
          fuelOut: values.fuelOut,
          notesOut: values.notesOut,
          totalAmount,
          remainingAmount: totalAmount - rental.paidAmount,
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
          remainingAmount,
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
            totalAmount: rentals.totalAmount,
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
          rental.totalAmount,
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

  return rental;
}

function getRentalById(id: number): RentalListRecord | undefined {
  const now = new Date().toISOString();

  return getDatabase()
    .select(getRentalListFields(now))
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.id, id))
    .get();
}

function getPaymentById(id: number): PaymentRecord | undefined {
  return getDatabase().select().from(payments).where(eq(payments.id, id)).get();
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
      totalAmount: rentals.totalAmount,
      paidAmount: rentals.paidAmount,
      mileageOut: rentals.mileageOut,
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

  const summary = calculateReturnSummary({
    expectedReturnDatetime: rental.expectedReturnDatetime,
    actualReturnDatetime: values.actualReturnDatetime,
    baseTotalAmount: rental.totalAmount,
    paidAmount: rental.paidAmount,
    lateFeePerDay: values.lateFeePerDay,
    damageCharge: values.damageCharge,
    discount: values.discount,
  });

  if (summary.finalAmount < 0) {
    throw new Error("Discount cannot be more than the total charges.");
  }

  tx.update(rentals)
    .set({
      status: "returned",
      actualReturnDatetime: values.actualReturnDatetime,
      mileageIn: values.mileageIn,
      fuelIn: values.fuelIn,
      notesIn: values.notesIn,
      damageNotes: values.damageNotes,
      extraCharges: summary.extraCharges,
      discount: values.discount,
      totalAmount: summary.finalAmount,
      remainingAmount: summary.remainingAmount,
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
        cost: 0,
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
      totalAmount: summary.finalAmount,
      remainingAmount: summary.remainingAmount,
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
  values: RentalActivationInput,
  now: string,
  contractNo: string,
  status: "draft" | "active",
  totalAmount: number,
  initialBalance: { paidAmount: number; remainingAmount: number },
) {
  return {
    contractNo,
    customerId: values.customerId,
    vehicleId: values.vehicleId,
    status,
    startDatetime: values.startDatetime,
    expectedReturnDatetime: values.expectedReturnDatetime,
    actualReturnDatetime: null,
    dailyPrice: values.dailyPrice,
    depositRequired: values.depositRequired,
    depositPaid: values.depositPaid,
    mileageOut: values.mileageOut,
    mileageIn: null,
    fuelOut: values.fuelOut,
    fuelIn: null,
    notesOut: values.notesOut,
    notesIn: null,
    damageNotes: null,
    extraCharges: 0,
    discount: 0,
    totalAmount,
    paidAmount: initialBalance.paidAmount,
    remainingAmount: initialBalance.remainingAmount,
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
