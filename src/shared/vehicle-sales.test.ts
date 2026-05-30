import { describe, expect, it } from "vitest";
import {
  getDefaultVehicleSaleFormValues,
  vehicleSaleFormSchema,
  vehicleSaleInputSchema,
  vehicleSaleVoidInputSchema,
} from "./vehicle-sales";

describe("vehicle sale validation", () => {
  it("normalizes sale form values into a paid sale input", () => {
    const parsed = vehicleSaleFormSchema.parse({
      ...getDefaultVehicleSaleFormValues(),
      buyerName: "Ali Mansour",
      buyerPhone: "0910000000",
      buyerIdNumber: "",
      saleDate: "2026-05-30T10:15",
      salePrice: "12500",
      paymentMethod: "bank_transfer",
      notes: "",
    });

    expect(parsed).toMatchObject({
      buyerName: "Ali Mansour",
      buyerPhone: "0910000000",
      buyerIdNumber: null,
      salePrice: 12500,
      paymentMethod: "bank_transfer",
      notes: null,
    });
    expect(parsed.saleDate).toMatch(/2026-05-30T\d{2}:15:00\.000Z/);
  });

  it("rejects free or partial-looking sale prices", () => {
    expect(() =>
      vehicleSaleFormSchema.parse({
        ...getDefaultVehicleSaleFormValues(),
        buyerName: "Buyer",
        salePrice: "0",
      }),
    ).toThrow("Sale price must be more than zero.");
  });

  it("keeps API sale inputs strict and requires a void reason", () => {
    expect(() =>
      vehicleSaleInputSchema.parse({
        vehicleId: 1,
        buyerName: "Buyer",
        buyerPhone: null,
        buyerIdNumber: null,
        saleDate: "not-a-date",
        salePrice: 10,
        paymentMethod: "cash",
        notes: null,
      }),
    ).toThrow();

    expect(() =>
      vehicleSaleVoidInputSchema.parse({ saleId: 1, reason: "" }),
    ).toThrow("Void reason is required.");
  });
});
