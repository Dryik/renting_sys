import { and, eq, inArray, sql } from "drizzle-orm";
import type { DataHealthFixRequest, DataHealthIssue } from "../../src/shared/data-health";
import { getDatabase } from "./database";
import { maintenanceRecords, rentals, vehicles } from "./schema";
import { recordAppEvent } from "./events.service";

export function scanDataHealth(): DataHealthIssue[] {
  const db = getDatabase();
  const issues: DataHealthIssue[] = [];

  for (const vehicle of db.select().from(vehicles).where(eq(vehicles.status, "rented")).all()) {
    const openRental = db
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.vehicleId, vehicle.id), inArray(rentals.status, ["active", "overdue"])))
      .get();

    if (!openRental) {
      issues.push({
        id: `vehicle_rented_without_open_rental:${vehicle.id}`,
        type: "vehicle_rented_without_open_rental",
        severity: "danger",
        title: "Vehicle marked rented without an open rental",
        detail: `${vehicle.plateNumber} is marked rented but has no active contract.`,
        entityType: "vehicle",
        entityId: vehicle.id,
        canAutoFix: true,
      });
    }
  }

  for (const rental of db
    .select({
      id: rentals.id,
      contractNo: rentals.contractNo,
      vehicleId: rentals.vehicleId,
      vehicleStatus: vehicles.status,
      remainingAmount: rentals.remainingAmount,
      status: rentals.status,
    })
    .from(rentals)
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(inArray(rentals.status, ["active", "overdue", "returned"]))
    .all()) {
    if (
      (rental.status === "active" || rental.status === "overdue") &&
      rental.vehicleStatus !== "rented"
    ) {
      issues.push({
        id: `open_rental_vehicle_not_rented:${rental.id}`,
        type: "open_rental_vehicle_not_rented",
        severity: "danger",
        title: "Open rental vehicle is not marked rented",
        detail: `${rental.contractNo} is open but the vehicle status is ${rental.vehicleStatus}.`,
        entityType: "rental",
        entityId: rental.id,
        canAutoFix: true,
      });
    }

    if (rental.status === "returned" && rental.vehicleStatus === "rented") {
      issues.push({
        id: `returned_rental_vehicle_still_rented:${rental.id}`,
        type: "returned_rental_vehicle_still_rented",
        severity: "warning",
        title: "Returned rental vehicle is still marked rented",
        detail: `${rental.contractNo} is returned but the vehicle is still rented.`,
        entityType: "rental",
        entityId: rental.id,
        canAutoFix: true,
      });
    }

    if (rental.remainingAmount < 0) {
      issues.push({
        id: `negative_remaining_balance:${rental.id}`,
        type: "negative_remaining_balance",
        severity: "warning",
        title: "Rental has a negative remaining balance",
        detail: `${rental.contractNo} has a negative remaining balance.`,
        entityType: "rental",
        entityId: rental.id,
        canAutoFix: true,
      });
    }
  }

  for (const vehicle of db.select().from(vehicles).where(eq(vehicles.status, "maintenance")).all()) {
    const openMaintenance = db
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.vehicleId, vehicle.id),
          eq(maintenanceRecords.isArchived, false),
          sql`${maintenanceRecords.endDate} is null`,
        ),
      )
      .get();

    if (!openMaintenance) {
      issues.push({
        id: `maintenance_without_record:${vehicle.id}`,
        type: "maintenance_without_record",
        severity: "warning",
        title: "Vehicle in maintenance without an open record",
        detail: `${vehicle.plateNumber} is marked maintenance without an open maintenance record.`,
        entityType: "vehicle",
        entityId: vehicle.id,
        canAutoFix: false,
      });
    }
  }

  return issues;
}

export function applyDataHealthFix(input: DataHealthFixRequest): DataHealthIssue[] {
  const issue = scanDataHealth().find((item) => item.id === input.issueId);

  if (!issue) {
    throw new Error("Data health issue was not found.");
  }

  if (!issue.canAutoFix) {
    throw new Error("This issue requires manual review.");
  }

  const now = new Date().toISOString();
  getDatabase().transaction((tx) => {
    if (issue.type === "vehicle_rented_without_open_rental") {
      tx.update(vehicles)
        .set({ status: "available", updatedAt: now })
        .where(eq(vehicles.id, issue.entityId))
        .run();
    }

    if (issue.type === "open_rental_vehicle_not_rented") {
      const rental = tx
        .select({ vehicleId: rentals.vehicleId })
        .from(rentals)
        .where(eq(rentals.id, issue.entityId))
        .get();

      if (rental) {
        tx.update(vehicles)
          .set({ status: "rented", updatedAt: now })
          .where(eq(vehicles.id, rental.vehicleId))
          .run();
      }
    }

    if (issue.type === "returned_rental_vehicle_still_rented") {
      const rental = tx
        .select({ vehicleId: rentals.vehicleId })
        .from(rentals)
        .where(eq(rentals.id, issue.entityId))
        .get();

      if (rental) {
        tx.update(vehicles)
          .set({ status: "available", updatedAt: now })
          .where(eq(vehicles.id, rental.vehicleId))
          .run();
      }
    }

    if (issue.type === "negative_remaining_balance") {
      tx.update(rentals)
        .set({ remainingAmount: 0, updatedAt: now })
        .where(eq(rentals.id, issue.entityId))
        .run();
    }

    recordAppEvent(tx, {
      eventType: "data_health_fix_applied",
      entityType: issue.entityType,
      entityId: issue.entityId,
      severity: "warning",
      message: "Data health repair was applied.",
      details: { issueType: issue.type },
    });
  });

  return scanDataHealth();
}
