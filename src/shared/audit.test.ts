import { describe, expect, it } from "vitest";
import {
  auditListRequestSchema,
  redactAuditSnapshot,
  requiresAuditReason,
} from "./audit";

describe("audit helpers", () => {
  it("requires reasons for sensitive actions", () => {
    expect(requiresAuditReason("payment.voided")).toBe(true);
    expect(requiresAuditReason("payment.corrected")).toBe(true);
    expect(requiresAuditReason("rental.cancelled")).toBe(true);
    expect(requiresAuditReason("settings.updated")).toBe(true);
    expect(requiresAuditReason("maintenance.archived")).toBe(true);
    expect(requiresAuditReason("customer.document.replaced")).toBe(true);
    expect(requiresAuditReason("customer.document.archived")).toBe(true);
    expect(requiresAuditReason("vehicle.document.replaced")).toBe(true);
    expect(requiresAuditReason("vehicle.document.archived")).toBe(true);
    expect(requiresAuditReason("customer.document.added")).toBe(false);
    expect(requiresAuditReason("customer.photo.captured")).toBe(false);
    expect(requiresAuditReason("vehicle.photo.added")).toBe(false);
    expect(requiresAuditReason("payment.created")).toBe(false);
  });

  it("redacts password, hash, salt, PIN, and logo payload fields", () => {
    expect(
      redactAuditSnapshot({
        username: "owner",
        password: "secret",
        passwordHash: "hash",
        passwordSalt: "salt",
        ownerPin: "1234",
        shopLogoDataUrl: "data:image/png;base64,abc",
        nested: { pinHash: "hash" },
      }),
    ).toEqual({
      username: "owner",
      password: "[redacted]",
      passwordHash: "[redacted]",
      passwordSalt: "[redacted]",
      ownerPin: "[redacted]",
      shopLogoDataUrl: "[redacted]",
      nested: { pinHash: "[redacted]" },
    });
  });

  it("validates activity log request filters", () => {
    expect(
      auditListRequestSchema.parse({
        page: 1,
        pageSize: 25,
        search: "ARAK",
        dateFrom: "2026-05-01",
        entityType: "rental",
      }),
    ).toMatchObject({
      page: 1,
      pageSize: 25,
      search: "ARAK",
      entityType: "rental",
    });

    expect(() =>
      auditListRequestSchema.parse({ pageSize: 500 }),
    ).toThrow();
  });
});
