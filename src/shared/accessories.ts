import { z } from "zod";
import type { PageRequest } from "./pagination";

export type AccessoryListRequest = PageRequest & {
  activeOnly?: boolean;
};

export type AccessoryRecord = {
  id: number;
  name: string;
  quantityOwned: number;
  defaultCharge: number;
  isActive: boolean;
  notes: string | null;
  quantityAssigned: number;
  quantityAvailable: number;
  createdAt: string;
  updatedAt: string;
};

export type RentalAccessoryRecord = {
  id: number;
  rentalId: number;
  accessoryId: number;
  accessoryName: string;
  quantity: number;
  unitCharge: number;
  returnedQuantity: number;
  missingQuantity: number;
  notes: string | null;
};

export type RentalAccessoryInput = {
  accessoryId: number;
  quantity: number;
  unitCharge: number;
  notes: string | null;
};

export type RentalAccessoryReturnInput = {
  rentalAccessoryId: number;
  returnedQuantity: number;
  missingQuantity: number;
  notes: string | null;
};

export const accessoryInputSchema = z.object({
  name: z.string().trim().min(1, "Accessory name is required.").max(100),
  quantityOwned: z
    .number()
    .int("Quantity must be a whole number.")
    .min(0, "Quantity cannot be negative."),
  defaultCharge: z.number().finite().min(0, "Default charge cannot be negative."),
  isActive: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
});

export type AccessoryInput = z.infer<typeof accessoryInputSchema>;

export const rentalAccessoryInputSchema = z.object({
  accessoryId: z.number().int().positive("Accessory is required."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be more than zero."),
  unitCharge: z.number().finite().min(0, "Accessory charge cannot be negative."),
  notes: z.string().trim().max(500).nullable(),
});

export const rentalAccessoryReturnInputSchema = z.object({
  rentalAccessoryId: z.number().int().positive("Accessory is required."),
  returnedQuantity: z
    .number()
    .int("Returned quantity must be a whole number.")
    .min(0, "Returned quantity cannot be negative."),
  missingQuantity: z
    .number()
    .int("Missing quantity must be a whole number.")
    .min(0, "Missing quantity cannot be negative."),
  notes: z.string().trim().max(500).nullable(),
});

export const accessoryFormSchema = z
  .object({
    name: z.string().trim().min(1, "Accessory name is required.").max(100),
    quantityOwned: numericIntegerField("Quantity"),
    defaultCharge: numericMoneyField("Default charge"),
    isActive: z.boolean(),
    notes: optionalTextField(500),
  })
  .transform((values) => accessoryInputSchema.parse(values));

export type AccessoryFormValues = {
  name: string;
  quantityOwned: string;
  defaultCharge: string;
  isActive: boolean;
  notes: string;
};

export const emptyAccessoryFormValues: AccessoryFormValues = {
  name: "",
  quantityOwned: "0",
  defaultCharge: "0",
  isActive: true,
  notes: "",
};

export function accessoryToFormValues(accessory: AccessoryRecord): AccessoryFormValues {
  return {
    name: accessory.name,
    quantityOwned: String(accessory.quantityOwned),
    defaultCharge: String(accessory.defaultCharge),
    isActive: accessory.isActive,
    notes: accessory.notes ?? "",
  };
}

export function calculateAccessoryLineTotal(
  quantity: number,
  unitCharge: number,
): number {
  return roundMoney(Math.max(0, quantity) * Math.max(0, unitCharge));
}

export function calculateAccessoryChargeTotal(
  accessories: Array<Pick<RentalAccessoryInput, "quantity" | "unitCharge">>,
): number {
  return roundMoney(
    accessories.reduce(
      (total, accessory) =>
        total + calculateAccessoryLineTotal(accessory.quantity, accessory.unitCharge),
      0,
    ),
  );
}

export function calculateAccessoryAvailable(
  quantityOwned: number,
  assignedQuantity: number,
): number {
  return Math.max(0, quantityOwned - assignedQuantity);
}

function optionalTextField(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === "" ? null : value));
}

function numericIntegerField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isInteger(numberValue) || numberValue < 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be zero or more.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });
}

function numericMoneyField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isFinite(numberValue) || numberValue < 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be zero or more.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
