import { and, count, desc, eq, isNotNull, isNull, like, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  getVehicleStatusAfterMaintenanceChange,
  type MaintenanceInput,
  type MaintenanceListRequest,
  type MaintenanceRecord,
  type MaintenanceRecordWithVehicle,
} from "../../src/shared/maintenance";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { maintenanceRecords, vehicles } from "./schema";
import { getCurrentUserForService, requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";

export function listMaintenance(
  request?: MaintenanceListRequest | string,
): PageResult<MaintenanceRecordWithVehicle> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const listRequest = typeof request === "object" && request !== null ? request : {};
  const state = listRequest.state ?? "all";
  const conditions: SQL[] = [eq(maintenanceRecords.isArchived, false)];

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search);

    const searchFilter = or(
      like(maintenanceRecords.title, term),
      like(vehicles.plateNumber, term),
      like(vehicles.brand, term),
      like(vehicles.model, term),
    );

    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  if (state === "ongoing") {
    conditions.push(isNull(maintenanceRecords.endDate));
  }

  if (state === "completed") {
    conditions.push(isNotNull(maintenanceRecords.endDate));
  }

  const whereFilter = and(...conditions);
  const total = db
    .select({ count: count() })
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(maintenanceRecords.vehicleId, vehicles.id))
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select({
      id: maintenanceRecords.id,
      vehicleId: maintenanceRecords.vehicleId,
      title: maintenanceRecords.title,
      description: maintenanceRecords.description,
      cost: maintenanceRecords.cost,
      startDate: maintenanceRecords.startDate,
      endDate: maintenanceRecords.endDate,
      isArchived: maintenanceRecords.isArchived,
      createdAt: maintenanceRecords.createdAt,
      updatedAt: maintenanceRecords.updatedAt,
      vehiclePlateNumber: vehicles.plateNumber,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
    })
    .from(maintenanceRecords)
    .innerJoin(vehicles, eq(maintenanceRecords.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(desc(maintenanceRecords.startDate), desc(maintenanceRecords.id))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function createMaintenance(input: MaintenanceInput): MaintenanceRecord {
  requirePermissionForCurrentSession("maintenance.create");
  const values = parseMaintenanceInput(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const vehicle = tx
        .select({
          id: vehicles.id,
          status: vehicles.status,
        })
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      if (!values.endDate && vehicle.status === "rented") {
        throw new Error("A rented vehicle cannot be marked for maintenance.");
      }

      const record = tx
        .insert(maintenanceRecords)
        .values({
          ...values,
          isArchived: false,
          createdByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      syncVehicleMaintenanceStatus(tx, values.vehicleId, now);
      logAuditEvent(tx, {
        action: "maintenance.created",
        entityType: "maintenance",
        entityId: record.id,
        entityLabel: record.title,
        summaryAr: `تم تسجيل صيانة ${record.title}`,
        summaryEn: `Maintenance ${record.title} was created.`,
        after: record,
      });

      return record;
    });
  } catch (error) {
    throw normalizeMaintenanceServiceError(error);
  }
}

export function updateMaintenance(
  id: number,
  input: MaintenanceInput,
): MaintenanceRecord {
  const maintenanceId = parseMaintenanceId(id);
  const values = parseMaintenanceInput(input);
  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    return getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, maintenanceId),
            eq(maintenanceRecords.isArchived, false),
          ),
        )
        .get();

      if (!existing) {
        throw new Error("Maintenance record was not found.");
      }

      if (!existing.endDate && values.endDate) {
        requirePermissionForCurrentSession("maintenance.complete");
      } else {
        requirePermissionForCurrentSession("maintenance.edit");
      }

      if (existing.vehicleId !== values.vehicleId) {
        throw new Error("Vehicle cannot be changed after maintenance is recorded.");
      }

      const vehicle = tx
        .select({
          id: vehicles.id,
          status: vehicles.status,
        })
        .from(vehicles)
        .where(eq(vehicles.id, values.vehicleId))
        .get();

      if (!vehicle) {
        throw new Error("Vehicle was not found.");
      }

      if (!values.endDate && vehicle.status === "rented") {
        throw new Error("A rented vehicle cannot be marked for maintenance.");
      }

      const updated = tx
        .update(maintenanceRecords)
        .set({
          ...values,
          completedByUserId:
            !existing.endDate && values.endDate ? actor?.id ?? null : existing.completedByUserId,
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(maintenanceRecords.id, maintenanceId))
        .returning()
        .get();

      syncVehicleMaintenanceStatus(tx, values.vehicleId, now);
      logAuditEvent(tx, {
        action:
          !existing.endDate && values.endDate
            ? "maintenance.completed"
            : "maintenance.updated",
        entityType: "maintenance",
        entityId: updated.id,
        entityLabel: updated.title,
        summaryAr:
          !existing.endDate && values.endDate
            ? `تم إكمال صيانة ${updated.title}`
            : `تم تحديث صيانة ${updated.title}`,
        summaryEn:
          !existing.endDate && values.endDate
            ? `Maintenance ${updated.title} was completed.`
            : `Maintenance ${updated.title} was updated.`,
        before: existing,
        after: updated,
      });

      return updated;
    });
  } catch (error) {
    throw normalizeMaintenanceServiceError(error);
  }
}

export function archiveMaintenance(id: unknown): void {
  requirePermissionForCurrentSession("maintenance.archive");
  const maintenanceId =
    typeof id === "object" && id !== null
      ? parseMaintenanceId((id as { maintenanceId?: unknown }).maintenanceId)
      : parseMaintenanceId(id);
  const reason =
    typeof id === "object" &&
    id !== null &&
    typeof (id as { reason?: unknown }).reason === "string"
      ? (id as { reason: string }).reason.trim()
      : "";

  if (!reason) {
    throw new Error("Reason is required.");
  }

  const now = new Date().toISOString();
  const actor = getCurrentUserForService();

  try {
    getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(maintenanceRecords)
        .where(
          and(
            eq(maintenanceRecords.id, maintenanceId),
            eq(maintenanceRecords.isArchived, false),
          ),
        )
        .get();

      if (!existing) {
        throw new Error("Maintenance record was not found.");
      }

      tx.update(maintenanceRecords)
        .set({
          isArchived: true,
          archivedByUserId: actor?.id ?? null,
          lastUpdatedByUserId: actor?.id ?? null,
          updatedAt: now,
        })
        .where(eq(maintenanceRecords.id, maintenanceId))
        .run();

      syncVehicleMaintenanceStatus(tx, existing.vehicleId, now);
      logAuditEvent(tx, {
        action: "maintenance.archived",
        entityType: "maintenance",
        entityId: maintenanceId,
        entityLabel: existing.title,
        summaryAr: `تمت أرشفة صيانة ${existing.title}`,
        summaryEn: `Maintenance ${existing.title} was archived.`,
        before: existing,
        after: { ...existing, isArchived: true },
        reason,
      });
    });
  } catch (error) {
    throw normalizeMaintenanceServiceError(error);
  }
}

type MaintenanceTx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

function syncVehicleMaintenanceStatus(
  tx: MaintenanceTx,
  vehicleId: number,
  updatedAt: string,
): void {
  const vehicle = tx
    .select({
      status: vehicles.status,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .get();

  if (!vehicle) {
    return;
  }

  const activeMaintenanceCount = tx
    .select({ id: maintenanceRecords.id })
    .from(maintenanceRecords)
    .where(
      and(
        eq(maintenanceRecords.vehicleId, vehicleId),
        eq(maintenanceRecords.isArchived, false),
        isNull(maintenanceRecords.endDate),
      ),
    )
    .all().length;

  const nextStatus = getVehicleStatusAfterMaintenanceChange(
    vehicle.status,
    activeMaintenanceCount,
  );

  if (nextStatus === vehicle.status) {
    return;
  }

  tx.update(vehicles)
    .set({
      status: nextStatus,
      updatedAt,
    })
    .where(eq(vehicles.id, vehicleId))
    .run();
}

function parseMaintenanceId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Maintenance ID is invalid.");
  }

  return parsedId;
}

function parseMaintenanceInput(input: MaintenanceInput): MaintenanceInput {
  if (!Number.isInteger(input.vehicleId) || input.vehicleId <= 0) {
    throw new Error("Vehicle is required.");
  }

  if (input.title.trim() === "") {
    throw new Error("Service title is required.");
  }

  if (!Number.isFinite(input.cost) || input.cost < 0) {
    throw new Error("Cost must be zero or more.");
  }

  if (input.startDate.trim() === "") {
    throw new Error("Start date is required.");
  }

  return {
    vehicleId: input.vehicleId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    cost: input.cost,
    startDate: input.startDate,
    endDate: input.endDate?.trim() || null,
  };
}

function normalizeMaintenanceServiceError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the maintenance details.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Maintenance record could not be saved.");
}
