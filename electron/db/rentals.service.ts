import { and, asc, count, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { ZodError } from "zod";
import {
  calculateCancelledRentalBalance,
  calculateInitialRentalBalance,
  calculateReturnSummary,
  calculateRentalSummary,
  type RentalActivationInput,
  type RentalFormOptions,
  type RentalListRequest,
  type RentalListRecord,
  type RentalListSummary,
  type RentalQueue,
  rentalActivationInputSchema,
  rentalReturnInputSchema,
} from "../../src/shared/rentals";
import type { PageResult } from "../../src/shared/pagination";
import { customers, payments, rentals, vehicles } from "./schema";
import { getDatabase } from "./database";
import { createPageResult, normalizePageRequest, toLikeTerm } from "./listing";
import { getShopSettings } from "./settings.service";

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

export function listRentals(
  request?: RentalListRequest | string,
): PageResult<RentalListRecord, RentalListSummary> {
  refreshOverdueRentals();

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
    conditions.push(eq(rentals.status, "overdue"));
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
      active: sql<number>`sum(case when ${rentals.status} = 'active' then 1 else 0 end)`.mapWith(Number),
      overdue: sql<number>`sum(case when ${rentals.status} = 'overdue' then 1 else 0 end)`.mapWith(Number),
      returned: sql<number>`sum(case when ${rentals.status} = 'returned' then 1 else 0 end)`.mapWith(Number),
      amount: sql<number>`coalesce(sum(${rentals.totalAmount}), 0)`.mapWith(Number),
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .get();
  const rows = db
    .select(rentalListFields)
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(whereFilter)
    .orderBy(
      sql`case ${rentals.status} when 'overdue' then 0 when 'active' then 1 when 'draft' then 2 when 'returned' then 3 else 4 end`,
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
      .where(eq(vehicles.status, "available"))
      .orderBy(asc(vehicles.plateNumber))
      .all(),
  };
}

export function activateRental(input: unknown): RentalListRecord {
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
        .values(toRentalInsert(values, now, totalAmount, initialBalance))
        .returning({ id: rentals.id })
        .get();

      if (values.depositPaid > 0) {
        tx.insert(payments)
          .values({
            rentalId: insertedRental.id,
            type: "deposit",
            method: "cash",
            amount: values.depositPaid,
            paymentDate: now,
            notes: "Deposit paid at rental start.",
            createdAt: now,
          })
          .run();
      }

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

export function cancelRental(id: unknown): RentalListRecord {
  const rentalId = parseRentalId(id);
  const now = new Date().toISOString();
  const { remainingAmount } = calculateCancelledRentalBalance();

  try {
    const cancelledRentalId = getDatabase().transaction((tx) => {
      const rental = tx
        .select({
          id: rentals.id,
          vehicleId: rentals.vehicleId,
          status: rentals.status,
        })
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
  totalAmount: number,
  initialBalance: { paidAmount: number; remainingAmount: number },
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
    paidAmount: initialBalance.paidAmount,
    remainingAmount: initialBalance.remainingAmount,
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
