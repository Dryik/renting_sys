import { describe, expect, it } from "vitest";
import { assertIpcAccessAllowed, getIpcAccessPolicy, ipcAccessPolicy } from "./ipc-policy";

describe("IPC license access policy", () => {
  it("keeps read-only channels available without write access", () => {
    expect(getIpcAccessPolicy("auth:login").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("auth:change-password").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("vehicles:list").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("vehicle-sales:list").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("vehicle-sales:print-receipt").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("rentals:get-form-options").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("accounting:get-summary").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("accounting:list-transactions").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("reports:get-vehicle-sales").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("reports:export").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("backup:run-backup").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("license:export-request").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("license:import-license").requiresWriteAccess).toBe(false);
  });

  it("marks write channels as requiring write access", () => {
    expect(getIpcAccessPolicy("vehicles:create").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("vehicle-sales:create").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("vehicle-sales:void").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("customers:update").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("rentals:return").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("payments:create").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("accounting:create-expense").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("accounting:void-cash-movement").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("accounting:create-adjustment").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("accounting:void-adjustment").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("backup:run-restore").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("settings:save").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("users:create").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("users:reset-password").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("security:approve-sensitive-action").requiresWriteAccess).toBe(true);
  });

  it("allows only current-user credential maintenance in read-only mode", () => {
    expect(getIpcAccessPolicy("auth:change-password").requiresWriteAccess).toBe(false);
    expect(getIpcAccessPolicy("users:create").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("users:update").requiresWriteAccess).toBe(true);
    expect(getIpcAccessPolicy("users:reset-password").requiresWriteAccess).toBe(true);
  });

  it("fails closed for unknown channels", () => {
    expect(() => getIpcAccessPolicy("unclassified:channel")).toThrow(
      "IPC channel is not classified",
    );
  });

  it("blocks write channels and allows read channels when licensing is read-only", () => {
    expect(() => assertIpcAccessAllowed("vehicles:create", false)).toThrow(
      "License required",
    );
    expect(() => assertIpcAccessAllowed("rentals:get-form-options", false)).not.toThrow();
    expect(() => assertIpcAccessAllowed("backup:run-backup", false)).not.toThrow();
  });

  it("allows write channels when an active trial or paid license grants write access", () => {
    expect(() => assertIpcAccessAllowed("vehicles:create", true)).not.toThrow();
    expect(() => assertIpcAccessAllowed("backup:run-restore", true)).not.toThrow();
  });

  it("has an explicit boolean policy for every registered channel", () => {
    for (const policy of Object.values(ipcAccessPolicy)) {
      expect(typeof policy.requiresWriteAccess).toBe("boolean");
    }
  });
});
