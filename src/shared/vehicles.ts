import { z } from "zod";

export const vehicleTypeValues = ["car", "motorcycle"] as const;
export const vehicleStatusValues = [
  "available",
  "rented",
  "maintenance",
  "inactive",
] as const;

export const vehicleInputSchema = z.object({
  type: z.enum(vehicleTypeValues),
  brand: z.string().trim().min(1, "Brand is required.").max(80),
  model: z.string().trim().min(1, "Model is required.").max(80),
  plateNumber: z
    .string()
    .trim()
    .min(1, "Plate number is required.")
    .max(30)
    .transform((value) => value.toUpperCase()),
  color: z.string().trim().max(40).nullable(),
  year: z
    .number()
    .int("Year must be a whole number.")
    .min(1900, "Year looks too old.")
    .max(new Date().getFullYear() + 1, "Year cannot be far in the future.")
    .nullable(),
  dailyPrice: z
    .number()
    .finite("Daily price must be a valid number.")
    .min(0, "Daily price cannot be negative."),
  depositAmount: z
    .number()
    .finite("Deposit must be a valid number.")
    .min(0, "Deposit cannot be negative."),
  status: z.enum(vehicleStatusValues),
  mileage: z
    .number()
    .int("Mileage must be a whole number.")
    .min(0, "Mileage cannot be negative.")
    .nullable(),
  insuranceExpiryDate: z.string().trim().max(20).nullable(),
  registrationExpiryDate: z.string().trim().max(20).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export type VehicleRecord = VehicleInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export type VehicleFormValues = {
  type: (typeof vehicleTypeValues)[number];
  brand: string;
  model: string;
  plateNumber: string;
  color: string;
  year: string;
  dailyPrice: string;
  depositAmount: string;
  status: (typeof vehicleStatusValues)[number];
  mileage: string;
  insuranceExpiryDate: string;
  registrationExpiryDate: string;
  notes: string;
};

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

const optionalIntegerField = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, context): number | null => {
      if (value === "") {
        return null;
      }

      const numberValue = Number(value);

      if (!Number.isInteger(numberValue)) {
        context.addIssue({
          code: "custom",
          message: `${label} must be a whole number.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });

const requiredMoneyField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue)) {
        context.addIssue({
          code: "custom",
          message: `${label} must be a valid number.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });

export const vehicleFormSchema = z
  .object({
    type: z.enum(vehicleTypeValues),
    brand: z.string().trim().min(1, "Brand is required.").max(80),
    model: z.string().trim().min(1, "Model is required.").max(80),
    plateNumber: z.string().trim().min(1, "Plate number is required.").max(30),
    color: optionalTextField(40),
    year: optionalIntegerField("Year"),
    dailyPrice: requiredMoneyField("Daily price"),
    depositAmount: requiredMoneyField("Deposit"),
    status: z.enum(vehicleStatusValues),
    mileage: optionalIntegerField("Mileage"),
    insuranceExpiryDate: optionalTextField(20),
    registrationExpiryDate: optionalTextField(20),
    notes: optionalTextField(500),
  })
  .transform((values) => vehicleInputSchema.parse(values));

export const emptyVehicleFormValues: VehicleFormValues = {
  type: "car",
  brand: "",
  model: "",
  plateNumber: "",
  color: "",
  year: "",
  dailyPrice: "",
  depositAmount: "0",
  status: "available",
  mileage: "",
  insuranceExpiryDate: "",
  registrationExpiryDate: "",
  notes: "",
};

export function vehicleToFormValues(vehicle: VehicleRecord): VehicleFormValues {
  return {
    type: vehicle.type,
    brand: vehicle.brand,
    model: vehicle.model,
    plateNumber: vehicle.plateNumber,
    color: vehicle.color ?? "",
    year: vehicle.year === null ? "" : String(vehicle.year),
    dailyPrice: String(vehicle.dailyPrice),
    depositAmount: String(vehicle.depositAmount),
    status: vehicle.status,
    mileage: vehicle.mileage === null ? "" : String(vehicle.mileage),
    insuranceExpiryDate: vehicle.insuranceExpiryDate ?? "",
    registrationExpiryDate: vehicle.registrationExpiryDate ?? "",
    notes: vehicle.notes ?? "",
  };
}

export function formatVehicleType(type: VehicleRecord["type"]): string {
  return type === "car" ? "Car" : "Motorcycle";
}

export function formatVehicleStatus(status: VehicleRecord["status"]): string {
  const labels: Record<VehicleRecord["status"], string> = {
    available: "Available",
    rented: "Rented",
    maintenance: "Maintenance",
    inactive: "Inactive",
  };

  return labels[status];
}
