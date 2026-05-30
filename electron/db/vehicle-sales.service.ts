import { and, count, desc, eq, gte, inArray, isNull, like, lt, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type VehicleSaleListRecord,
  type VehicleSaleListRequest,
  type VehicleSaleRecord,
  type VehicleSaleVoidInput,
  vehicleSaleInputSchema,
  vehicleSaleVoidInputSchema,
} from "../../src/shared/vehicle-sales";
import type { PageResult } from "../../src/shared/pagination";
import { getPaymentMoneyLocation } from "../../src/shared/accounting";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { maintenanceRecords, rentals, vehicleSales, vehicles } from "./schema";
import { getNextSequenceValue } from "./numbering.service";
import {
  getCurrentUserForService,
  requirePermissionForCurrentSession,
} from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { recordAppEvent } from "./events.service";
import {
  assertAccountingBalanceDeltasAllowed,
} from "./accounting.service";
import { requireSensitiveApproval } from "./security.service";

type VehicleSaleTx = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export function listVehicleSales(
  request?: VehicleSaleListRequest | string,
): PageResult<VehicleSaleListRecord> {
  requirePermissionForCurrentSession("vehicleSales.view");

  return queryVehicleSales(request);
}

export function queryVehicleSales(
  request?: VehicleSaleListRequest | string,
): PageResult<VehicleSaleListRecord> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const listRequest = typeof request === "object" && request !== null ? request : {};
  const status = isVehicleSaleStatusFilter(listRequest.status)
    ? listRequest.status
    : "posted";
  const conditions: SQL[] = [];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);
    const searchFilter = or(
      like(vehicleSales.saleNo, term),
      like(vehicleSales.buyerName, term),
      like(vehicleSales.buyerPhone, term),
      like(vehicleSales.buyerIdNumber, term),
      like(vehicles.plateNumber, term),
      like(vehicles.brand, term),
      like(vehicles.model, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (status !== "all") {
    conditions.push(eq(vehicleSales.status, status));
  }

  if (listRequest.dateFrom) {
    conditions.push(gte(vehicleSales.saleDate, getLocalDateStart(listRequest.dateFrom)));
  }

  if (listRequest.dateTo) {
    conditions.push(lt(vehicleSales.saleDate, getLocalDateEnd(listRequest.dateTo)));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total = listRequest.includeTotal === false
    ? pageRequest.offset + pageRequest.pageSize
    : db
        .select({ count: count() })
        .from(vehicleSales)
        .innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id))
        .where(whereFilter)
        .get()?.count ?? 0;
  const rows = db
    .select(getVehicleSaleListFields())
    .from(vehicleSales)
    .innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(vehicleSales.saleDate), desc(vehicleSales.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function getVehicleSaleForVehicle(
  vehicleId: unknown,
): VehicleSaleListRecord | null {
  requirePermissionForCurrentSession("vehicleSales.view");
  const parsedVehicleId = parseId(vehicleId, "Vehicle");

  return getDatabase()
    .select(getVehicleSaleListFields())
    .from(vehicleSales)
    .innerJoin(vehicles, eq(vehicleSales.vehicleId, vehicles.id))
    .where(and(eq(vehicleSales.vehicleId, parsedVehicleId), eq(vehicleSales.status, "posted")))
    .orderBy(desc(vehicleSales.saleDate), desc(vehicleSales.id))
    .get() ?? null;
}

export function createVehicleSale(input: unknown): VehicleSaleRecord {
  requirePermissionForCurrentSession("vehicleSales.create");
  const values = vehicleSaleInputSchema.parse(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const vehicle = tx
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      if (vehicle.status !== "available" && vehicle.status !== "inactive") {
        throw new Error("Only available or inactive vehicles can be sold.");
      }

      assertVehicleCanBeSold(tx, values.vehicleId);

      const saleNo = getNextSequenceValue(tx, "vehicle_sale", "SALE");
      const sale = tx
        .insert(vehicleSales)
        .values({
          ...values,
          saleNo,
          status: "posted",
          previousVehicleStatus: vehicle.status,
          voidedAt: null,
          voidedByUserId: null,
          voidReason: null,
          createdByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      tx.update(vehicles)
        .set({
          status: "inactive",
          updatedAt: now,
        })
        .where(eq(vehicles.id, values.vehicleId))
        .run();

      recordAppEvent(tx, {
        eventType: "vehicle_sold",
        entityType: "vehicle",
        entityId: values.vehicleId,
        severity: "warning",
        message: "Vehicle was sold.",
        details: { saleId: sale.id, saleNo },
      });
      logAuditEvent(tx, {
        action: "vehicleSale.created",
        entityType: "vehicle_sale",
        entityId: sale.id,
        entityLabel: sale.saleNo,
        summaryAr: `تم بيع مركبة ${vehicle.plateNumber}`,
        summaryEn: `Vehicle ${vehicle.plateNumber} was sold.`,
        after: sale,
        metadata: { vehicleId: values.vehicleId, plateNumber: vehicle.plateNumber },
      });

      return sale;
    });
  } catch (error) {
    throw normalizeVehicleSaleServiceError(error);
  }
}

export function voidVehicleSale(input: unknown): VehicleSaleRecord {
  requirePermissionForCurrentSession("vehicleSales.void");
  const values: VehicleSaleVoidInput = vehicleSaleVoidInputSchema.parse(input);
  requireSensitiveApproval("vehicleSales.void", values.approvalToken);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const sale = tx
        .select()
        .from(vehicleSales)
        .where(eq(vehicleSales.id, values.saleId))
        .get();

      if (!sale) {
        throw new Error("Vehicle sale was not found.");
      }

      if (sale.status === "voided") {
        throw new Error("Vehicle sale is already voided.");
      }

      assertAccountingBalanceDeltasAllowed([
        {
          location: getPaymentMoneyLocation(sale.paymentMethod),
          amount: -sale.salePrice,
        },
      ]);

      const updated = tx
        .update(vehicleSales)
        .set({
          status: "voided",
          voidedAt: now,
          voidedByUserId: actor?.id ?? null,
          voidReason: values.reason,
          updatedAt: now,
        })
        .where(eq(vehicleSales.id, values.saleId))
        .returning()
        .get();

      const restored = restorePreviousVehicleStatusIfSafe(tx, sale.vehicleId, sale.previousVehicleStatus, now);

      recordAppEvent(tx, {
        eventType: "vehicle_sale_voided",
        entityType: "vehicle_sale",
        entityId: sale.id,
        severity: "warning",
        message: "Vehicle sale was voided.",
        details: { vehicleId: sale.vehicleId, restored },
      });
      logAuditEvent(tx, {
        action: "vehicleSale.voided",
        entityType: "vehicle_sale",
        entityId: sale.id,
        entityLabel: sale.saleNo,
        summaryAr: `تم إلغاء بيع مركبة ${sale.saleNo}`,
        summaryEn: `Vehicle sale ${sale.saleNo} was voided.`,
        before: sale,
        after: updated,
        metadata: { vehicleId: sale.vehicleId, restored },
        reason: values.reason,
      });

      return updated;
    });
  } catch (error) {
    throw normalizeVehicleSaleServiceError(error);
  }
}

function getVehicleSaleListFields() {
  return {
    id: vehicleSales.id,
    saleNo: vehicleSales.saleNo,
    vehicleId: vehicleSales.vehicleId,
    buyerName: vehicleSales.buyerName,
    buyerPhone: vehicleSales.buyerPhone,
    buyerIdNumber: vehicleSales.buyerIdNumber,
    saleDate: vehicleSales.saleDate,
    salePrice: vehicleSales.salePrice,
    paymentMethod: vehicleSales.paymentMethod,
    status: vehicleSales.status,
    previousVehicleStatus: vehicleSales.previousVehicleStatus,
    notes: vehicleSales.notes,
    voidedAt: vehicleSales.voidedAt,
    voidReason: vehicleSales.voidReason,
    createdAt: vehicleSales.createdAt,
    updatedAt: vehicleSales.updatedAt,
    vehiclePlateNumber: vehicles.plateNumber,
    vehicleBrand: vehicles.brand,
    vehicleModel: vehicles.model,
    vehicleType: vehicles.type,
  };
}

function assertVehicleCanBeSold(tx: VehicleSaleTx, vehicleId: number): void {
  const conflictingRental = tx
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.vehicleId, vehicleId), inArray(rentals.status, ["draft", "active", "overdue"])))
    .get();

  if (conflictingRental) {
    throw new Error("Vehicle has an open or draft rental and cannot be sold.");
  }

  const openMaintenance = tx
    .select({ id: maintenanceRecords.id })
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.vehicleId, vehicleId),
        eq(maintenanceRecords.isArchived, false),
        isNull(maintenanceRecords.endDate),
      ),
    )
    .get();

  if (openMaintenance) {
    throw new Error("Complete or archive open maintenance before selling this vehicle.");
  }

  const postedSale = tx
    .select({ id: vehicleSales.id })
    .from(vehicleSales)
    .where(and(eq(vehicleSales.vehicleId, vehicleId), eq(vehicleSales.status, "posted")))
    .get();

  if (postedSale) {
    throw new Error("Vehicle is already sold.");
  }
}

function restorePreviousVehicleStatusIfSafe(
  tx: VehicleSaleTx,
  vehicleId: number,
  previousStatus: "available" | "inactive",
  now: string,
): boolean {
  if (previousStatus === "available") {
    const conflictingRental = tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.vehicleId, vehicleId), inArray(rentals.status, ["draft", "active", "overdue"])))
      .get();
    const openMaintenance = tx
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.vehicleId, vehicleId),
          eq(maintenanceRecords.isArchived, false),
          isNull(maintenanceRecords.endDate),
        ),
      )
      .get();

    if (conflictingRental || openMaintenance) {
      return false;
    }
  }

  tx.update(vehicles)
    .set({
      status: previousStatus,
      updatedAt: now,
    })
    .where(eq(vehicles.id, vehicleId))
    .run();

  return true;
}

function isVehicleSaleStatusFilter(
  value: unknown,
): value is NonNullable<VehicleSaleListRequest["status"]> {
  return value === "all" || value === "posted" || value === "voided";
}

function parseId(id: unknown, label: string): number {
  const parsed = Number(id);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} is invalid.`);
  }

  return parsed;
}

function getLocalDateStart(date: string): string {
  return parseDateInput(date).toISOString();
}

function getLocalDateEnd(date: string): string {
  const end = parseDateInput(date);
  end.setDate(end.getDate() + 1);

  return end.toISOString();
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

function normalizeVehicleSaleServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the vehicle sale details.");
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: vehicle_sales.sale_no")
  ) {
    return new Error("A vehicle sale with this number already exists.");
  }

  if (
    error instanceof Error &&
    error.message.includes("vehicle_sales_one_posted_vehicle_idx")
  ) {
    return new Error("Vehicle is already sold.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Vehicle sale could not be saved.");
}
