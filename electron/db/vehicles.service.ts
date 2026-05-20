import { and, asc, count, eq, like, or, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type VehicleListRequest,
  type VehicleRecord,
  vehicleInputSchema,
} from "../../src/shared/vehicles";
import type { PageResult } from "../../src/shared/pagination";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { vehicles } from "./schema";

export function listVehicles(request?: VehicleListRequest | string): PageResult<VehicleRecord> {
  const db = getDatabase();
  const pageRequest = normalizePageRequest(request);
  const listRequest = typeof request === "object" && request !== null ? request : {};
  const type = isVehicleType(listRequest.type) ? listRequest.type : "all";
  const status = isVehicleStatus(listRequest.status) ? listRequest.status : "all";
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

  if (status !== "all") {
    conditions.push(eq(vehicles.status, status));
  }

  const whereFilter = conditions.length ? and(...conditions) : undefined;
  const total = db
    .select({ count: count() })
    .from(vehicles)
    .where(whereFilter)
    .get()?.count ?? 0;
  const rows = db
    .select()
    .from(vehicles)
    .where(whereFilter)
    .orderBy(asc(vehicles.plateNumber))
    .limit(pageRequest.pageSize)
    .offset(pageRequest.offset)
    .all();

  return createPageResult(rows, total, pageRequest);
}

export function createVehicle(input: unknown): VehicleRecord {
  const values = vehicleInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    return getDatabase()
      .insert(vehicles)
      .values({
        ...values,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  } catch (error) {
    throw normalizeVehicleServiceError(error);
  }
}

export function updateVehicle(id: unknown, input: unknown): VehicleRecord {
  const vehicleId = parseVehicleId(id);
  const values = vehicleInputSchema.parse(input);

  try {
    const updatedVehicle = getDatabase()
      .update(vehicles)
      .set({
        ...values,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(vehicles.id, vehicleId))
      .returning()
      .get();

    if (!updatedVehicle) {
      throw new Error("Vehicle was not found.");
    }

    return updatedVehicle;
  } catch (error) {
    throw normalizeVehicleServiceError(error);
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

function isVehicleStatus(value: unknown): value is VehicleRecord["status"] {
  return (
    value === "available" ||
    value === "rented" ||
    value === "maintenance" ||
    value === "inactive"
  );
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
