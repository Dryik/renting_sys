import { z } from "zod";
import { translate } from "./i18n";
import type { LanguageCode } from "./language";
import type { PageRequest } from "./pagination";

export const vehicleTypeValues = ["car", "motorcycle"] as const;
export const vehicleStatusValues = [
  "available",
  "rented",
  "maintenance",
  "inactive",
] as const;

export type VehicleStatus = (typeof vehicleStatusValues)[number];
export type VehicleDisplayStatus = VehicleStatus | "sold";

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
  chassisNumber: z.string().trim().max(50).nullable().default(null),
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
  technicalInspectionExpiryDate: z.string().trim().max(20).nullable().default(null),
  lastOilChangeDate: z.string().trim().max(20).nullable().default(null),
  lastOilChangeMileage: z
    .number()
    .int("Oil change mileage must be a whole number.")
    .min(0, "Oil change mileage cannot be negative.")
    .nullable()
    .default(null),
  notes: z.string().trim().max(500).nullable(),
  commissionRateOverride: z
    .number()
    .finite("Commission rate override must be a valid number.")
    .min(0, "Commission rate override cannot be negative.")
    .nullable()
    .default(null),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

export type VehicleTypeFilter = "all" | (typeof vehicleTypeValues)[number];
export type VehicleStatusFilter = "all" | VehicleDisplayStatus;

export type VehicleListRequest = PageRequest & {
  type?: VehicleTypeFilter;
  status?: VehicleStatusFilter;
};

export type VehicleRecord = VehicleInput & {
  id: number;
  displayStatus: VehicleDisplayStatus;
  activeSaleId: number | null;
  activeSaleNo: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  commissionRateOverride: number | null;
};

export type VehicleFormValues = {
  type: (typeof vehicleTypeValues)[number];
  brand: string;
  model: string;
  plateNumber: string;
  chassisNumber: string;
  color: string;
  year: string;
  dailyPrice: string;
  depositAmount: string;
  status: (typeof vehicleStatusValues)[number];
  mileage: string;
  insuranceExpiryDate: string;
  registrationExpiryDate: string;
  technicalInspectionExpiryDate: string;
  lastOilChangeDate: string;
  lastOilChangeMileage: string;
  notes: string;
  commissionRateOverride: string;
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
    chassisNumber: optionalTextField(50),
    color: optionalTextField(40),
    year: optionalIntegerField("Year"),
    dailyPrice: requiredMoneyField("Daily price"),
    depositAmount: requiredMoneyField("Deposit"),
    status: z.enum(vehicleStatusValues),
    mileage: optionalIntegerField("Mileage"),
    insuranceExpiryDate: optionalTextField(20),
    registrationExpiryDate: optionalTextField(20),
    technicalInspectionExpiryDate: optionalTextField(20),
    lastOilChangeDate: optionalTextField(20),
    lastOilChangeMileage: optionalIntegerField("Oil change mileage"),
    notes: optionalTextField(500),
    commissionRateOverride: z
      .string()
      .trim()
      .transform((value, context): number | null => {
        if (value === "") {
          return null;
        }
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          context.addIssue({
            code: "custom",
            message: "Commission rate override must be a valid number.",
          });
          return z.NEVER;
        }
        return numberValue;
      }),
  })
  .transform((values) => vehicleInputSchema.parse(values));

export const emptyVehicleFormValues: VehicleFormValues = {
  type: "motorcycle",
  brand: "",
  model: "",
  plateNumber: "",
  chassisNumber: "",
  color: "",
  year: "",
  dailyPrice: "",
  depositAmount: "0",
  status: "available",
  mileage: "",
  insuranceExpiryDate: "",
  registrationExpiryDate: "",
  technicalInspectionExpiryDate: "",
  lastOilChangeDate: "",
  lastOilChangeMileage: "",
  notes: "",
  commissionRateOverride: "",
};

export function vehicleToFormValues(vehicle: VehicleRecord): VehicleFormValues {
  return {
    type: vehicle.type,
    brand: vehicle.brand,
    model: vehicle.model,
    plateNumber: vehicle.plateNumber,
    chassisNumber: vehicle.chassisNumber ?? "",
    color: vehicle.color ?? "",
    year: vehicle.year === null ? "" : String(vehicle.year),
    dailyPrice: String(vehicle.dailyPrice),
    depositAmount: String(vehicle.depositAmount),
    status: vehicle.status,
    mileage: vehicle.mileage === null ? "" : String(vehicle.mileage),
    insuranceExpiryDate: vehicle.insuranceExpiryDate ?? "",
    registrationExpiryDate: vehicle.registrationExpiryDate ?? "",
    technicalInspectionExpiryDate: vehicle.technicalInspectionExpiryDate ?? "",
    lastOilChangeDate: vehicle.lastOilChangeDate ?? "",
    lastOilChangeMileage:
      vehicle.lastOilChangeMileage === null ? "" : String(vehicle.lastOilChangeMileage),
    notes: vehicle.notes ?? "",
    commissionRateOverride:
      vehicle.commissionRateOverride === null ? "" : String(vehicle.commissionRateOverride),
  };
}

export function formatVehicleType(
  type: VehicleRecord["type"],
  language: LanguageCode = "en",
): string {
  return translate(language, type === "car" ? "Car" : "Motorcycle");
}

export function formatVehicleStatus(
  status: VehicleDisplayStatus,
  language: LanguageCode = "en",
): string {
  const labels: Record<VehicleDisplayStatus, string> = {
    available: "Available",
    rented: "Rented",
    maintenance: "Maintenance",
    inactive: "Inactive",
    sold: "Sold",
  };

  return translate(language, labels[status]);
}
