import { z } from "zod";
import {
  paymentMethodValues,
  type PaymentMethod,
} from "./payments";
import type { PageRequest } from "./pagination";
import { approvalTokenSchema } from "./security";
import { translate } from "./i18n";
import type { LanguageCode } from "./language";
import type { VehicleStatus } from "./vehicles";

export const vehicleSaleStatusValues = ["posted", "voided"] as const;

export type VehicleSaleStatus = (typeof vehicleSaleStatusValues)[number];

export type VehicleSaleInput = {
  vehicleId: number;
  buyerName: string;
  buyerPhone: string | null;
  buyerIdNumber: string | null;
  saleDate: string;
  salePrice: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
};

export type VehicleSaleRecord = VehicleSaleInput & {
  id: number;
  saleNo: string;
  status: VehicleSaleStatus;
  previousVehicleStatus: Extract<VehicleStatus, "available" | "inactive">;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleSaleListRecord = VehicleSaleRecord & {
  vehiclePlateNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleType: "car" | "motorcycle";
};

export type VehicleSaleListRequest = PageRequest & {
  dateFrom?: string;
  dateTo?: string;
  status?: "all" | VehicleSaleStatus;
  includeTotal?: boolean;
};

export type VehicleSaleVoidInput = {
  saleId: number;
  reason: string;
  approvalToken?: string;
};

const optionalTextField = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));

const requiredMoneyField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue) || numberValue <= 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be more than zero.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });

const datetimeField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): string => {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        context.addIssue({
          code: "custom",
          message: `${label} must be a valid date and time.`,
        });

        return z.NEVER;
      }

      return date.toISOString();
    });

export const vehicleSaleInputSchema = z.object({
  vehicleId: z.number().int().positive("Vehicle is required."),
  buyerName: z.string().trim().min(1, "Buyer name is required.").max(120),
  buyerPhone: z.string().trim().max(40).nullable(),
  buyerIdNumber: z.string().trim().max(80).nullable(),
  saleDate: z.string().datetime(),
  salePrice: z.number().finite().positive("Sale price must be more than zero."),
  paymentMethod: z.enum(paymentMethodValues),
  notes: z.string().trim().max(500).nullable(),
});

export const vehicleSaleFormSchema = z
  .object({
    buyerName: z.string().trim().min(1, "Buyer name is required.").max(120),
    buyerPhone: optionalTextField(40),
    buyerIdNumber: optionalTextField(80),
    saleDate: datetimeField("Sale date"),
    salePrice: requiredMoneyField("Sale price"),
    paymentMethod: z.enum(paymentMethodValues),
    notes: optionalTextField(500),
  })
  .transform((values) => values);

export type VehicleSaleFormValues = z.input<typeof vehicleSaleFormSchema>;
export type VehicleSaleFormInput = z.output<typeof vehicleSaleFormSchema>;

export const vehicleSaleVoidInputSchema = z.object({
  saleId: z.number().int().positive("Sale is required."),
  reason: z.string().trim().min(1, "Void reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export function getDefaultVehicleSaleFormValues(): VehicleSaleFormValues {
  return {
    buyerName: "",
    buyerPhone: "",
    buyerIdNumber: "",
    saleDate: toDatetimeLocalValue(new Date()),
    salePrice: "",
    paymentMethod: "cash",
    notes: "",
  };
}

export function formatVehicleSaleStatus(
  status: VehicleSaleStatus,
  language: LanguageCode = "en",
): string {
  const labels: Record<VehicleSaleStatus, string> = {
    posted: "Posted",
    voided: "Voided",
  };

  return translate(language, labels[status]);
}

function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
