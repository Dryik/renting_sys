import { describe, expect, it } from "vitest";
import {
  can,
  createUserSchema,
  deactivateUserSchema,
  getPermissionsForRole,
  loginSchema,
  ownerSetupSchema,
  permissionValues,
  requirePermission,
  resetPasswordSchema,
} from "./auth";

describe("auth roles and validation", () => {
  it("grants every permission to owner/admin", () => {
    for (const permission of permissionValues) {
      expect(can("owner_admin", permission)).toBe(true);
    }
  });

  it("keeps staff away from sensitive actions", () => {
    expect(can("staff", "rentals.create")).toBe(true);
    expect(can("staff", "rentals.return")).toBe(true);
    expect(can("staff", "payments.create")).toBe(true);
    expect(can("staff", "payments.refund")).toBe(false);
    expect(can("staff", "payments.void")).toBe(false);
    expect(can("staff", "accounting.view")).toBe(false);
    expect(can("staff", "expenses.create")).toBe(true);
    expect(can("staff", "dailyClosing.staffClose")).toBe(true);
    expect(can("staff", "weeklyIncome.view")).toBe(true);
    expect(can("staff", "accessories.view")).toBe(true);
    expect(can("staff", "employeeLoans.view")).toBe(false);
    expect(can("staff", "cashMovements.create")).toBe(false);
    expect(can("staff", "accountingAdjustments.create")).toBe(false);
    expect(can("staff", "rentals.cancel")).toBe(false);
    expect(can("staff", "vehicles.edit")).toBe(true);
    expect(can("staff", "vehicles.changeStatus")).toBe(false);
    expect(can("staff", "vehicleSales.view")).toBe(false);
    expect(can("staff", "vehicleSales.create")).toBe(false);
    expect(can("staff", "vehicleSales.void")).toBe(false);
    expect(can("staff", "customers.documents.view")).toBe(true);
    expect(can("staff", "customers.documents.create")).toBe(true);
    expect(can("staff", "customers.documents.capturePhoto")).toBe(true);
    expect(can("staff", "customers.documents.archive")).toBe(true);
    expect(can("staff", "vehicles.documents.view")).toBe(true);
    expect(can("staff", "vehicles.documents.create")).toBe(true);
    expect(can("staff", "vehicles.documents.archive")).toBe(true);
    expect(can("staff", "backup.restore")).toBe(false);
    expect(can("staff", "users.view")).toBe(false);
    expect(can("staff", "audit.view")).toBe(false);
  });

  it("allows accountant refund work without rental operations", () => {
    expect(can("accountant", "payments.create")).toBe(true);
    expect(can("accountant", "payments.refund")).toBe(true);
    expect(can("accountant", "accounting.view")).toBe(true);
    expect(can("accountant", "expenses.create")).toBe(true);
    expect(can("accountant", "employeeLoans.view")).toBe(true);
    expect(can("accountant", "employeeLoans.repay")).toBe(true);
    expect(can("accountant", "employeeLoans.create")).toBe(false);
    expect(can("accountant", "cashMovements.create")).toBe(false);
    expect(can("accountant", "accountingAdjustments.create")).toBe(false);
    expect(can("accountant", "dailyClosing.save")).toBe(true);
    expect(can("accountant", "vehicleSales.view")).toBe(true);
    expect(can("accountant", "vehicleSales.create")).toBe(false);
    expect(can("accountant", "vehicleSales.void")).toBe(false);
    expect(can("accountant", "reports.export")).toBe(true);
    expect(can("accountant", "customers.documents.view")).toBe(false);
    expect(can("accountant", "vehicles.documents.view")).toBe(true);
    expect(can("accountant", "rentals.create")).toBe(false);
    expect(can("accountant", "rentals.return")).toBe(false);
    expect(can("accountant", "rentals.cancel")).toBe(false);
  });

  it("keeps viewer read-only", () => {
    expect(can("viewer", "vehicles.view")).toBe(true);
    expect(can("viewer", "vehicleSales.view")).toBe(true);
    expect(can("viewer", "vehicleSales.create")).toBe(false);
    expect(can("viewer", "vehicleSales.void")).toBe(false);
    expect(can("viewer", "customers.view")).toBe(true);
    expect(can("viewer", "customers.documents.view")).toBe(false);
    expect(can("viewer", "vehicles.documents.view")).toBe(true);
    expect(can("viewer", "payments.create")).toBe(false);
    expect(can("viewer", "accounting.view")).toBe(false);
    expect(can("viewer", "expenses.create")).toBe(false);
    expect(can("viewer", "reports.export")).toBe(false);
  });

  it("throws a clear permission error", () => {
    expect(() => requirePermission("staff", "backup.restore")).toThrow(
      "Permission denied.",
    );
  });

  it("validates first owner setup and PIN confirmation", () => {
    expect(
      ownerSetupSchema.parse({
        fullName: "Owner",
        username: "owner",
        password: "1234",
        confirmPassword: "1234",
      }).username,
    ).toBe("owner");

    expect(() =>
      ownerSetupSchema.parse({
        fullName: "Owner",
        username: "owner",
        password: "1234",
        confirmPassword: "4321",
      }),
    ).toThrow();
  });

  it("requires a simple 4-digit local PIN", () => {
    expect(
      ownerSetupSchema.parse({
        fullName: "Owner",
        username: "owner",
        password: "0000",
        confirmPassword: "0000",
      }).password,
    ).toBe("0000");

    expect(() =>
      ownerSetupSchema.parse({
        fullName: "Owner",
        username: "owner",
        password: "12345",
        confirmPassword: "12345",
      }),
    ).toThrow("PIN must be exactly 4 digits.");
  });

  it("normalizes usernames and rejects invalid user inputs", () => {
    expect(
      loginSchema.parse({ username: " STAFF.One ", password: "1234" }).username,
    ).toBe("staff.one");

    expect(() =>
      createUserSchema.parse({
        fullName: "Staff",
        username: "bad name",
        roleKey: "staff",
        password: "1234",
        confirmPassword: "1234",
      }),
    ).toThrow();
  });

  it("requires reason for sensitive user actions", () => {
    expect(() => deactivateUserSchema.parse({ userId: 1, reason: "" })).toThrow();
    expect(() =>
      resetPasswordSchema.parse({
        userId: 1,
        newPassword: "1234",
        confirmPassword: "1234",
        mustChangePassword: true,
        reason: "",
      }),
    ).toThrow();
  });

  it("has no duplicate owner/admin permissions", () => {
    const permissions = getPermissionsForRole("owner_admin");
    expect(new Set(permissions).size).toBe(permissions.length);
  });
});
