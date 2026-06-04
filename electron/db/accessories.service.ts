import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import {
  accessoryInputSchema,
  type AccessoryInput,
  type AccessoryListRequest,
  type AccessoryRecord,
} from "../../src/shared/accessories";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase, getSqliteDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { requirePermissionForCurrentSession } from "./auth.service";
import { logAuditEvent } from "./audit.service";
import { accessories } from "./schema";

export function listAccessories(
  request?: AccessoryListRequest,
): PageResult<AccessoryRecord> {
  requirePermissionForCurrentSession("accessories.view");
  const pageRequest = normalizePageRequest(request);
  const whereParts: string[] = [];
  const params: unknown[] = [];

  if (request?.activeOnly) {
    whereParts.push("accessories.is_active = 1");
  }

  if (pageRequest.search) {
    const term = toLikeTerm(pageRequest.search.toLowerCase());
    whereParts.push(
      "(lower(accessories.name) like ? or lower(coalesce(accessories.notes, '')) like ?)",
    );
    params.push(term, term);
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(" and ")}` : "";
  const total =
    (
      getSqliteDatabase()
        .prepare(`select count(*) as count from accessories ${whereSql}`)
        .get(...params) as { count?: number } | undefined
    )?.count ?? 0;
  const rows = getSqliteDatabase()
    .prepare(
      `
        select
          accessories.id,
          accessories.name,
          accessories.quantity_owned as quantityOwned,
          accessories.default_charge as defaultCharge,
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
        ${whereSql}
        order by accessories.is_active desc, accessories.name asc
        limit ? offset ?
      `,
    )
    .all(...params, pageRequest.pageSize, pageRequest.offset)
    .map(toAccessoryRecord);

  return createPageResult(rows, Number(total), pageRequest);
}

export function createAccessory(input: unknown): AccessoryRecord {
  requirePermissionForCurrentSession("accessories.create");
  const values = accessoryInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    const accessoryId = getDatabase().transaction((tx) => {
      const record = tx
        .insert(accessories)
        .values({
          ...values,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "accessory.created",
        entityType: "accessory",
        entityId: record.id,
        entityLabel: record.name,
        summaryAr: `تمت إضافة ملحق ${record.name}`,
        summaryEn: `Accessory ${record.name} was added.`,
        after: record,
      });

      return record.id;
    });

    return getAccessoryRecordById(accessoryId) ?? toFallbackAccessoryRecord(values, now);
  } catch (error) {
    throw normalizeAccessoryError(error);
  }
}

export function updateAccessory(id: unknown, input: unknown): AccessoryRecord {
  requirePermissionForCurrentSession("accessories.edit");
  const accessoryId = parseAccessoryId(id);
  const values = accessoryInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(accessories)
        .where(eq(accessories.id, accessoryId))
        .get();

      if (!existing) {
        throw new Error("Accessory was not found.");
      }

      const updated = tx
        .update(accessories)
        .set({
          ...values,
          updatedAt: now,
        })
        .where(eq(accessories.id, accessoryId))
        .returning()
        .get();

      logAuditEvent(tx, {
        action: "accessory.updated",
        entityType: "accessory",
        entityId: updated.id,
        entityLabel: updated.name,
        summaryAr: `تم تحديث ملحق ${updated.name}`,
        summaryEn: `Accessory ${updated.name} was updated.`,
        before: existing,
        after: updated,
      });
    });

    const record = getAccessoryRecordById(accessoryId);
    if (!record) {
      throw new Error("Accessory was updated but could not be loaded.");
    }

    return record;
  } catch (error) {
    throw normalizeAccessoryError(error);
  }
}

export function getAccessoryRecordById(id: number): AccessoryRecord | undefined {
  const row = getSqliteDatabase()
    .prepare(
      `
        select
          accessories.id,
          accessories.name,
          accessories.quantity_owned as quantityOwned,
          accessories.default_charge as defaultCharge,
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
        where accessories.id = ?
      `,
    )
    .get(id);

  return row ? toAccessoryRecord(row) : undefined;
}

function toAccessoryRecord(row: unknown): AccessoryRecord {
  const value = row as {
    createdAt: string;
    defaultCharge: number;
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
    defaultCharge: Number(value.defaultCharge),
    isActive: Boolean(value.isActive),
    notes: value.notes,
    quantityAssigned: Number(value.quantityAssigned),
    quantityAvailable: Number(value.quantityAvailable),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function toFallbackAccessoryRecord(
  values: AccessoryInput,
  now: string,
): AccessoryRecord {
  return {
    id: 0,
    ...values,
    quantityAssigned: 0,
    quantityAvailable: values.quantityOwned,
    createdAt: now,
    updatedAt: now,
  };
}

function parseAccessoryId(id: unknown): number {
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new Error("Accessory ID is invalid.");
  }

  return parsedId;
}

function normalizeAccessoryError(error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(error.issues[0]?.message ?? "Check the accessory details.");
  }

  if (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed: accessories.name")
  ) {
    return new Error("An accessory with this name already exists.");
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Accessory could not be saved.");
}
