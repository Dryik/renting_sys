import { describe, expect, it } from "vitest";
import {
  calculateAccessoryAvailable,
  calculateAccessoryChargeTotal,
  calculateAccessoryLineTotal,
} from "./accessories";
import { calculateRentalSummary } from "./rentals";

describe("accessory helpers", () => {
  it("defaults zero-charge accessories to no extra rental cost", () => {
    const accessoryCharges = calculateAccessoryChargeTotal([
      { quantity: 2, unitCharge: 0 },
      { quantity: 1, unitCharge: 0 },
    ]);

    expect(accessoryCharges).toBe(0);
    expect(
      calculateRentalSummary(
        "2026-05-14T09:00:00.000Z",
        "2026-05-16T09:00:00.000Z",
        50,
        accessoryCharges,
      ).totalAmount,
    ).toBe(100);
  });

  it("adds nonzero accessory charges to the rental total", () => {
    const accessoryCharges = calculateAccessoryChargeTotal([
      { quantity: 2, unitCharge: 5 },
      { quantity: 1, unitCharge: 12.5 },
    ]);

    expect(calculateAccessoryLineTotal(2, 5)).toBe(10);
    expect(accessoryCharges).toBe(22.5);
    expect(
      calculateRentalSummary(
        "2026-05-14T09:00:00.000Z",
        "2026-05-15T09:00:00.000Z",
        50,
        accessoryCharges,
      ).totalAmount,
    ).toBe(72.5);
  });

  it("derives available quantity from owned minus assigned", () => {
    expect(calculateAccessoryAvailable(10, 4)).toBe(6);
    expect(calculateAccessoryAvailable(3, 7)).toBe(0);
  });
});
