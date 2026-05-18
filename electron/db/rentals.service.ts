import { and, asc, desc, eq, inArray, like, lt, or } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateReturnSummary,
  calculateRentalSummary,
  type RentalActivationInput,
  type RentalFormOptions,
  type RentalListRecord,
  rentalActivationInputSchema,
  rentalReturnInputSchema,
} from "../../src/shared/rentals";
import { customers, rentals, vehicles } from "./schema";
import { getDatabase } from "./database";

const activeRentalStatuses = ["active", "overdue"] as const;

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

export function listRentals(search = ""): RentalListRecord[] {
  refreshOverdueRentals();

  const db = getDatabase();
  const trimmedSearch = search.trim();

  if (trimmedSearch === "") {
    return db
      .select(rentalListFields)
      .from(rentals)
      .innerJoin(customers, eq(rentals.customerId, customers.id))
      .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
      .orderBy(desc(rentals.createdAt))
      .all();
  }

  const term = `%${trimmedSearch}%`;

  return db
    .select(rentalListFields)
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(
      or(
        like(rentals.contractNo, term),
        like(customers.fullName, term),
        like(vehicles.plateNumber, term),
      ),
    )
    .orderBy(desc(rentals.createdAt))
    .all();
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
      .where(eq(vehicles.status, "available"))
      .orderBy(asc(vehicles.plateNumber))
      .all(),
  };
}

export function activateRental(input: unknown): RentalListRecord {
  const values = rentalActivationInputSchema.parse(input);
  const now = new Date().toISOString();
  const { totalAmount } = calculateRentalSummary(
    values.startDatetime,
    values.expectedReturnDatetime,
    values.dailyPrice,
  );

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

      const insertedRental = tx
        .insert(rentals)
        .values(toRentalInsert(values, now, totalAmount))
        .returning({ id: rentals.id })
        .get();

      tx.update(vehicles)
        .set({
          status: "rented",
          updatedAt: now,
        })
        .where(eq(vehicles.id, values.vehicleId))
        .run();

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

export function returnRental(input: unknown): RentalListRecord {
  const values = rentalReturnInputSchema.parse(input);
  const now = new Date().toISOString();

  try {
    const returnedRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          vehicleId: rentals.vehicleId,
          status: rentals.status,
          startDatetime: rentals.startDatetime,
          expectedReturnDatetime: rentals.expectedReturnDatetime,
          totalAmount: rentals.totalAmount,
          paidAmount: rentals.paidAmount,
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
          updatedAt: now,
        })
        .where(eq(rentals.id, values.rentalId))
        .run();

      tx.update(vehicles)
        .set({
          status: values.vehicleStatus,
          updatedAt: now,
        })
        .where(eq(vehicles.id, rental.vehicleId))
        .run();

      return rental.id;
    });

    const rental = getRentalById(returnedRentalId);

    if (!rental) {
      throw new Error("Rental was returned but could not be loaded.");
    }

    return rental;
  } catch (error) {
    throw normalizeRentalServiceError(error);
  }
}

function getRentalById(id: number): RentalListRecord | undefined {
  return getDatabase()
    .select(rentalListFields)
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.id, id))
    .get();
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

function toRentalInsert(
  values: RentalActivationInput,
  now: string,
  totalAmount: number,
) {
  return {
    contractNo: createContractNumber(now),
    customerId: values.customerId,
    vehicleId: values.vehicleId,
    status: "active" as const,
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
    paidAmount: 0,
    remainingAmount: totalAmount,
    createdAt: now,
    updatedAt: now,
  };
}

function createContractNumber(now: string): string {
  const date = new Date(now);
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  const suffix = Math.floor(100 + Math.random() * 900);

  return `R-${stamp}-${suffix}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
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
