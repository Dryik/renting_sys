import { describe, expect, it } from "vitest";
import {
  emptyVehicleFormValues,
  formatVehicleStatus,
  vehicleFormSchema,
} from "./vehicles";

describe("vehicle form defaults", () => {
  it("defaults new vehicles to motorcycles for the current rental focus", () => {
    expect(emptyVehicleFormValues.type).toBe("motorcycle");
  });

  it("keeps vehicle document and oil change fields nullable", () => {
    const parsed = vehicleFormSchema.parse({
      ...emptyVehicleFormValues,
      brand: "Yamaha",
      model: "NMAX",
      plateNumber: "MC-1099",
      dailyPrice: "45",
    });

    expect(parsed.technicalInspectionExpiryDate).toBeNull();
    expect(parsed.lastOilChangeDate).toBeNull();
    expect(parsed.lastOilChangeMileage).toBeNull();
    expect(parsed.chassisNumber).toBeNull();
  });

  it("parses provided chassis number correctly", () => {
    const parsed = vehicleFormSchema.parse({
      ...emptyVehicleFormValues,
      brand: "Toyota",
      model: "Camry",
      plateNumber: "CAR-7788",
      dailyPrice: "100",
      chassisNumber: "WBA33AY0401234567",
    });

    expect(parsed.chassisNumber).toBe("WBA33AY0401234567");
  });

  it("formats the derived sold display status without adding a DB status", () => {
    expect(formatVehicleStatus("sold", "en")).toBe("Sold");
    expect(() =>
      vehicleFormSchema.parse({
        ...emptyVehicleFormValues,
        brand: "Toyota",
        model: "Corolla",
        plateNumber: "11-222",
        dailyPrice: "80",
        status: "sold",
      }),
    ).toThrow();
  });
});
