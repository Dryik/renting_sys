import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearCurrentSession, setupFirstOwner } from "./auth.service";
import { closeDatabase, initializeDatabase } from "./database";
import { createCustomer } from "./customers.service";
import { createVehicle } from "./vehicles.service";
import type { VehicleStatus } from "../../src/shared/vehicles";
import type { RentalActivationInput, RentalReturnInput } from "../../src/shared/rentals";

/**
 * Boots a real SQLite database in a throwaway user-data directory so services
 * can be exercised end to end. Only Electron platform APIs and licensing state
 * are mocked by the calling test file; everything below is the real thing.
 */
export type TestDatabase = {
  userDataPath: string;
  previousUserDataPath: string | undefined;
};

export function startTestDatabase(): TestDatabase {
  const previousUserDataPath = process.env.RENTAL_APP_USER_DATA_DIR;
  const userDataPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "rental-workflow-test-"),
  );

  process.env.RENTAL_APP_USER_DATA_DIR = userDataPath;
  initializeDatabase();
  setupFirstOwner({
    fullName: "Test Owner",
    username: "owner",
    password: "1234",
    confirmPassword: "1234",
  });

  return { userDataPath, previousUserDataPath };
}

export function stopTestDatabase(database: TestDatabase): void {
  closeDatabase();
  clearCurrentSession();

  if (database.previousUserDataPath === undefined) {
    delete process.env.RENTAL_APP_USER_DATA_DIR;
  } else {
    process.env.RENTAL_APP_USER_DATA_DIR = database.previousUserDataPath;
  }

  fs.rmSync(database.userDataPath, { recursive: true, force: true });
}

let plateCounter = 0;

export function createTestCustomer(fullName = "Test Customer"): number {
  const customer = createCustomer({
    fullName,
    phone: "0910000000",
    secondaryPhone: null,
    nationalId: null,
    driverLicenseNo: null,
    licenseExpiryDate: null,
    address: null,
    notes: null,
  });

  return customer.id;
}

export function createTestVehicle(
  options: { status?: VehicleStatus; mileage?: number | null; dailyPrice?: number } = {},
): number {
  plateCounter += 1;
  const vehicle = createVehicle({
    type: "car",
    brand: "Toyota",
    model: "Corolla",
    plateNumber: `TEST-${plateCounter}`,
    chassisNumber: null,
    color: "White",
    year: 2020,
    dailyPrice: options.dailyPrice ?? 100,
    depositAmount: 0,
    status: options.status ?? "available",
    mileage: options.mileage ?? 1000,
    insuranceExpiryDate: null,
    registrationExpiryDate: null,
    technicalInspectionExpiryDate: null,
    lastOilChangeDate: null,
    lastOilChangeMileage: null,
    notes: null,
    commissionRateOverride: null,
  });

  return vehicle.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Relative to now, so a rental reads as active rather than effectively overdue. */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

/**
 * A rental window measured from one captured instant.
 *
 * Two separate `daysFromNow` calls each sample the clock, so a "three day"
 * window is really three days plus however long elapsed between them.
 * `calculateRentalDays` rounds up — correctly, since a rental running even a
 * minute into a fourth day is charged for four — and the test intermittently
 * saw 4 where it expected 3.
 *
 * Anchoring both ends to a single `Date.now()` makes the span exact, so a test
 * that means three days gets three days on every run. Production rounding is
 * unchanged; only the fixture is now honest about what it is asking for.
 */
export function rentalWindow(
  startOffsetDays: number,
  endOffsetDays: number,
): { startDatetime: string; expectedReturnDatetime: string } {
  const anchor = Date.now();

  return {
    startDatetime: new Date(anchor + startOffsetDays * DAY_MS).toISOString(),
    expectedReturnDatetime: new Date(anchor + endOffsetDays * DAY_MS).toISOString(),
  };
}

export function buildActivationInput(
  customerId: number,
  vehicleId: number,
  overrides: Partial<RentalActivationInput> = {},
): RentalActivationInput {
  return {
    customerId,
    vehicleId,
    // One anchor for both ends: exactly three days, every run.
    ...rentalWindow(-1, 2),
    dailyPrice: 100,
    depositRequired: 0,
    depositPaid: 0,
    mileageOut: 1000,
    fuelOut: "full",
    notesOut: null,
    salesUserId: null,
    accessories: [],
    collateralItems: [],
    ...overrides,
  };
}

export function buildReturnInput(
  rentalId: number,
  overrides: Partial<RentalReturnInput> = {},
): RentalReturnInput {
  return {
    rentalId,
    // The schema rejects a future return, so stay just behind now.
    actualReturnDatetime: new Date(Date.now() - 1000).toISOString(),
    lateFeePerDay: 0,
    damageCharge: 0,
    discount: 0,
    mileageIn: 1500,
    fuelIn: "half",
    damageNotes: null,
    notesIn: null,
    vehicleStatus: "available",
    maintenanceTitle: null,
    maintenanceDescription: null,
    accessoryReturns: [],
    collateralReturns: [],
    ...overrides,
  };
}
