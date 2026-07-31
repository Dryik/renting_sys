import { desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { normalizeCompactSearchText, normalizeSearchText, type GlobalSearchResult } from "../../src/shared/search";
import { customers, payments, rentals, vehicles } from "./schema";
import { getDatabase } from "./database";
import { effectiveRentalStatusSql } from "./rental-status";

const CUSTOMER_RESULT_LIMIT = 5;
const RELATED_CUSTOMER_LIMIT = 12;
const RELATED_VEHICLE_LIMIT = 12;
const VEHICLE_RESULT_LIMIT = 5;
const RENTAL_RESULT_LIMIT = 8;
const PAYMENT_RESULT_LIMIT = 5;
const MIN_GLOBAL_SEARCH_LENGTH = 2;

export function globalSearch(query: unknown): GlobalSearchResult[] {
  const search = normalizeSearchText(String(query ?? ""));
  const compact = normalizeCompactSearchText(String(query ?? ""));
  const now = new Date().toISOString();

  if (!search || compact.length < MIN_GLOBAL_SEARCH_LENGTH) {
    return [];
  }

  const likeTerm = `%${search}%`;
  const compactLikeTerm = `%${compact}%`;
  const results: GlobalSearchResult[] = [];
  const customerMatches = getCustomerMatches(likeTerm, compactLikeTerm, RELATED_CUSTOMER_LIMIT);
  const customerIds = customerMatches.map((customer) => customer.id);
  const vehicleMatches = getVehicleMatches(likeTerm, compactLikeTerm, VEHICLE_RESULT_LIMIT);
  const vehicleIds = getVehiclePlateMatches(compactLikeTerm, RELATED_VEHICLE_LIMIT).map(
    (vehicle) => vehicle.id,
  );

  for (const vehicle of vehicleMatches) {
    results.push({
      id: `vehicle:${vehicle.id}`,
      group: "vehicles",
      title: vehicle.plateNumber,
      subtitle: `${vehicle.brand} ${vehicle.model} - ${vehicle.status}`,
      entityType: "vehicle",
      entityId: vehicle.id,
      action: vehicle.status === "available" ? "newRental" : undefined,
    });
  }

  for (const customer of customerMatches.slice(0, CUSTOMER_RESULT_LIMIT)) {
    results.push({
      id: `customer:${customer.id}`,
      group: "customers",
      title: customer.fullName,
      subtitle: customer.phone,
      entityType: "customer",
      entityId: customer.id,
      action: "newRental",
    });
  }

  const rentalConditions = compactSearchConditions([
    like(rentals.contractNo, compactLikeTerm),
    customerIds.length > 0 ? inArray(rentals.customerId, customerIds) : undefined,
    vehicleIds.length > 0 ? inArray(rentals.vehicleId, vehicleIds) : undefined,
  ]);

  for (const rental of getDatabase()
    .select({
      id: rentals.id,
      contractNo: rentals.contractNo,
      status: effectiveRentalStatusSql(now),
      customerName: customers.fullName,
      plateNumber: vehicles.plateNumber,
      remainingAmount: rentals.remainingAmount,
    })
    .from(rentals)
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(rentalConditions)
    .orderBy(desc(rentals.createdAt))
    .limit(RENTAL_RESULT_LIMIT)
    .all()) {
    const open = rental.status === "active" || rental.status === "overdue";
    results.push({
      id: `rental:${rental.id}`,
      group: open ? "activeRentals" : "returnedRentals",
      title: rental.contractNo,
      subtitle: `${rental.customerName} - ${rental.plateNumber} - ${rental.status}`,
      entityType: "rental",
      entityId: rental.id,
      action: open ? "returnVehicle" : undefined,
    });
  }

  const paymentConditions = compactSearchConditions([
    like(payments.receiptNo, compactLikeTerm),
    like(rentals.contractNo, compactLikeTerm),
    customerIds.length > 0 ? inArray(rentals.customerId, customerIds) : undefined,
  ]);

  for (const payment of getDatabase()
    .select({
      id: payments.id,
      receiptNo: payments.receiptNo,
      contractNo: rentals.contractNo,
      customerName: customers.fullName,
      status: payments.status,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .innerJoin(customers, eq(rentals.customerId, customers.id))
    .where(paymentConditions)
    .orderBy(desc(payments.paymentDate))
    .limit(PAYMENT_RESULT_LIMIT)
    .all()) {
    results.push({
      id: `payment:${payment.id}`,
      group: "payments",
      title: payment.receiptNo ?? `Payment ${payment.id}`,
      subtitle: `${payment.contractNo} - ${payment.customerName} - ${payment.status}`,
      entityType: "payment",
      entityId: payment.id,
    });
  }

  return results;
}

function getVehicleMatches(
  likeTerm: string,
  compactLikeTerm: string,
  limit: number,
) {
  return getDatabase()
    .select()
    .from(vehicles)
    .where(
      or(
        like(vehicles.plateNumber, compactLikeTerm),
        like(vehicles.chassisNumber, compactLikeTerm),
        like(vehicles.brand, likeTerm),
        like(vehicles.model, likeTerm),
      ),
    )
    .limit(limit)
    .all();
}

function getVehiclePlateMatches(compactLikeTerm: string, limit: number) {
  return getDatabase()
    .select({
      id: vehicles.id,
    })
    .from(vehicles)
    .where(
      or(
        like(vehicles.plateNumber, compactLikeTerm),
        like(vehicles.chassisNumber, compactLikeTerm),
      ),
    )
    .limit(limit)
    .all();
}

function getCustomerMatches(
  likeTerm: string,
  compactLikeTerm: string,
  limit: number,
) {
  return getDatabase()
    .select()
    .from(customers)
    .where(
      or(
        like(customers.fullName, likeTerm),
        like(customers.phone, compactLikeTerm),
        like(customers.nationalId, compactLikeTerm),
        like(customers.driverLicenseNo, compactLikeTerm),
      ),
    )
    .limit(limit)
    .all();
}

function compactSearchConditions(conditions: Array<SQL | undefined>): SQL {
  const activeConditions = conditions.filter((condition): condition is SQL => Boolean(condition));
  const whereFilter = or(...activeConditions);

  if (!whereFilter) {
    throw new Error("Search condition is required.");
  }

  return whereFilter;
}
