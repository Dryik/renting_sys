import { asc, eq, like, or } from "drizzle-orm";
import { ZodError } from "zod";
import {
  type VehicleRecord,
  vehicleInputSchema,
} from "../../src/shared/vehicles";
import { getDatabase } from "./database";
import { vehicles } from "./schema";

export function listVehicles(search = ""): VehicleRecord[] {
  const db = getDatabase();
  const trimmedSearch = search.trim();

  if (trimmedSearch === "") {
    return db.select().from(vehicles).orderBy(asc(vehicles.plateNumber)).all();
  }

  const term = `%${trimmedSearch}%`;

  return db
    .select()
    .from(vehicles)
    .where(
      or(
        like(vehicles.plateNumber, term),
        like(vehicles.brand, term),
        like(vehicles.model, term),
      ),
    )
    .orderBy(asc(vehicles.plateNumber))
    .all();
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
