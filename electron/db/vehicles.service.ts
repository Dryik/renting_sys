import { and, asc, count, eq, inArray, isNotNull, isNull, like, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type VehicleListRequest,
  type VehicleRecord,
  vehicleInputSchema,
} from "../../src/shared/vehicles";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { maintenanceRecords, rentals, vehicleSales, vehicles } from "./schema";
import { getCurrentUserForService, requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";

export function listVehicles(request?: VehicleListRequest | string): PageResult<VehicleRecord> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const listRequest = typeof request === "object" && request !== null ? request : {};
  const type = isVehicleType(listRequest.type) ? listRequest.type : "all";
  const status = isVehicleStatusFilter(listRequest.status) ? listRequest.status : "all";
  const conditions: SQL[] = [];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);

    const searchFilter = or(
      like(vehicles.plateNumber, term),
      like(vehicles.brand, term),
      like(vehicles.model, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (type !== "all") {
    conditions.push(eq(vehicles.type, type));
  }

  if (status === "sold") {
    conditions.push(isNotNull(vehicleSales.id));
  } else if (status === "inactive") {
    conditions.push(eq(vehicles.status, status), isNull(vehicleSales.id));
  } else if (status !== "all") {
    conditions.push(eq(vehicles.status, status));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total = db
    .select({ count: count() })
    .from(vehicles)
    .leftJoin(
      vehicleSales,
      and(eq(vehicleSales.vehicleId, vehicles.id), eq(vehicleSales.status, "posted")),
    )
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select({
      vehicle: vehicles,
      activeSaleId: vehicleSales.id,
      activeSaleNo: vehicleSales.saleNo,
      soldAt: vehicleSales.saleDate,
    })
    .from(vehicles)
    .leftJoin(
      vehicleSales,
      and(eq(vehicleSales.vehicleId, vehicles.id), eq(vehicleSales.status, "posted")),
    )
    .where(whereFilter)
    .orderBy(asc(vehicles.plateNumber))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows.map(toVehicleRecord), total, pageRequest);
}

export function createVehicle(input: unknown): VehicleRecord {
  requirePermissionForCurrentSession("vehicles.create");
  const values = vehicleInputSchema.parse(input);
  const now = new Date().toISOString();

  if (values.status === "rented") {
    throw new Error("Vehicle cannot be manually marked as rented.");
  }

  try {
    return getDatabase().transaction((tx) => {
      const vehicle = tx
      .insert(vehicles)
      .values({
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
      logAuditEvent(tx, {
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        entityLabel: vehicle.plateNumber,
        summaryAr: `تمت إضافة مركبة ${vehicle.plateNumber}`,
        summaryEn: `Vehicle ${vehicle.plateNumber} was created.`,
        after: vehicle,
      });

      return toVehicleRecord({
        vehicle,
        activeSaleId: null,
        activeSaleNo: null,
        soldAt: null,
      });
    });
  } catch (error) {
    throw normalizeVehicleServiceError(error);
  }
}

export function updateVehicle(id: unknown, input: unknown): VehicleRecord {
  const vehicleId = parseVehicleId(id);
  const values = vehicleInputSchema.parse(input);
  const reason =
    typeof (input as { reason?: unknown })?.reason === "string"
      ? ((input as { reason: string }).reason.trim() || null)
      : null;

  try {
    const updatedVehicle = getDatabase().transaction((tx) => {
      const existing = tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).get();

      if (!existing) {
        throw new Error("Vehicle was not found.");
      }

      if (existing.status !== values.status) {
        requirePermissionForCurrentSession("vehicles.changeStatus");
        validateManualStatusChange(tx, vehicleId, values.status);

        if (values.status === "inactive") {
          requirePermissionForCurrentSession("vehicles.deactivate");
          if (!reason) {
            throw new Error("Reason is required.");
          }
        }
      } else {
        requirePermissionForCurrentSession("vehicles.edit");
      }

      const updated = tx
        .update(vehicles)
        .set({
          ...values,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(vehicles.id, vehicleId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action:
          existing.status !== updated.status
            ? updated.status === "inactive"
              ? "vehicle.deactivated"
              : "vehicle.statusChanged"
            : "vehicle.updated",
        entityType: "vehicle",
        entityId: updated.id,
        entityLabel: updated.plateNumber,
        summaryAr: `تم تحديث مركبة ${updated.plateNumber}`,
        summaryEn: `Vehicle ${updated.plateNumber} was updated.`,
        before: existing,
        after: updated,
        metadata: { actor: getCurrentUserForService()?.username ?? null },
        reason: updated.status === "inactive" ? reason : null,
      });

      return toVehicleRecord({
        vehicle: updated,
        ...getActiveSaleSnapshot(tx, updated.id),
      });
    });

    if (!updatedVehicle) {
      throw new Error("Vehicle was not found.");
    }

    return updatedVehicle;
  } catch (error) {
    throw normalizeVehicleServiceError(error);
  }
}

function validateManualStatusChange(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  vehicleId: number,
  nextStatus: VehicleRecord["status"],
): void {
  if (nextStatus === "rented") {
    throw new Error("Vehicle status becomes rented only through rental activation.");
  }

  const postedSale = tx
    .select({ id: vehicleSales.id })
    .from(vehicleSales)
    .where(and(eq(vehicleSales.vehicleId, vehicleId), eq(vehicleSales.status, "posted")))
    .get();

  if (postedSale) {
    throw new Error("Sold vehicles cannot be changed here. Void the vehicle sale first.");
  }

  const openRental = tx
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.vehicleId, vehicleId),
        inArray(rentals.status, ["active", "overdue"]),
      ),
    )
    .get();

  if (openRental) {
    throw new Error("Vehicle status is controlled by its active rental.");
  }

  if (nextStatus === "available") {
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
      throw new Error("Complete or archive open maintenance before marking the vehicle available.");
    }
  }
}

function parseVehicleId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Vehicle ID is invalid.");
  }

  return parsedId;
}

function isVehicleType(value: unknown): value is VehicleRecord["type"] {
  return value === "car" || value === "motorcycle";
}

function isVehicleStatusFilter(
  value: unknown,
): value is NonNullable<VehicleListRequest["status"]> {
  return (
    value === "all" ||
    value === "available" ||
    value === "rented" ||
    value === "maintenance" ||
    value === "inactive" ||
    value === "sold"
  );
}

function toVehicleRecord(row: {
  vehicle: typeof vehicles.$inferSelect;
  activeSaleId: number | null;
  activeSaleNo: string | null;
  soldAt: string | null;
}): VehicleRecord {
  return {
    ...row.vehicle,
    activeSaleId: row.activeSaleId,
    activeSaleNo: row.activeSaleNo,
    displayStatus: row.activeSaleId ? "sold" : row.vehicle.status,
    soldAt: row.soldAt,
  };
}

function getActiveSaleSnapshot(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  vehicleId: number,
): Pick<VehicleRecord, "activeSaleId" | "activeSaleNo" | "soldAt"> {
  const sale = tx
    .select({
      activeSaleId: vehicleSales.id,
      activeSaleNo: vehicleSales.saleNo,
      soldAt: vehicleSales.saleDate,
    })
    .from(vehicleSales)
    .where(and(eq(vehicleSales.vehicleId, vehicleId), eq(vehicleSales.status, "posted")))
    .get();

  return {
    activeSaleId: sale?.activeSaleId ?? null,
    activeSaleNo: sale?.activeSaleNo ?? null,
    soldAt: sale?.soldAt ?? null,
  };
}

function normalizeVehicleServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the vehicle details.");
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: vehicles.plate_number")
  ) {
    return new Error("A vehicle with this plate number already exists.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Vehicle could not be saved.");
}
