import { describe, expect, it } from "vitest";
import { getEffectiveRentalStatus } from "./rental-status";

describe("effective rental status", () => {
  it("derives overdue status for active rentals past the expected return time", () => {
    const now = "2026-05-24T12:00:00.000Z";

    expect(
      getEffectiveRentalStatus("active", "2026-05-24T11:59:59.000Z", now),
    ).toBe("overdue");
    expect(
      getEffectiveRentalStatus("active", "2026-05-24T12:00:00.000Z", now),
    ).toBe("active");
    expect(
      getEffectiveRentalStatus("active", "2026-05-24T12:00:01.000Z", now),
    ).toBe("active");
  });

  it("does not change closed or already-overdue statuses", () => {
    const now = "2026-05-24T12:00:00.000Z";

    expect(
      getEffectiveRentalStatus("overdue", "2026-05-25T12:00:00.000Z", now),
    ).toBe("overdue");
    expect(
      getEffectiveRentalStatus("returned", "2026-05-23T12:00:00.000Z", now),
    ).toBe("returned");
    expect(
      getEffectiveRentalStatus("cancelled", "2026-05-23T12:00:00.000Z", now),
    ).toBe("cancelled");
  });
});
