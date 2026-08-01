import { z } from "zod";
import {
  rentalAccessoryInputSchema,
  rentalAccessoryReturnInputSchema,
  type AccessoryRecord,
  type RentalAccessoryInput,
  type RentalAccessoryRecord,
  type RentalAccessoryReturnInput,
} from "./accessories";
import { translate } from "./i18n";
import type { LanguageCode } from "./language";
import type { PageRequest } from "./pagination";
import { paymentInputSchema, type PaymentInput } from "./payments";
import { approvalTokenSchema } from "./security";

export const rentalStatusValues = [
  "draft",
  "active",
  "returned",
  "cancelled",
  "overdue",
] as const;

export type RentalStatus = (typeof rentalStatusValues)[number];

export const rentalQueueValues = [
  "active",
  "overdue",
  "due_today",
  "returned",
  "cancelled",
  "all",
] as const;

export type RentalQueue = (typeof rentalQueueValues)[number];

export type RentalListRequest = PageRequest & {
  queue?: RentalQueue;
};

export type RentalListSummary = {
  total: number;
  active: number;
  overdue: number;
  returned: number;
  amount: number;
};

export const collateralTypeValues = [
  "passport",
  "id_card",
  "driver_license",
  "cash",
  "other_document",
  "other_item",
] as const;

export type CollateralType = (typeof collateralTypeValues)[number];

export type RentalCollateralStatus = "held" | "returned";

export type RentalCollateralInput = {
  type: CollateralType;
  description: string;
  referenceNumber: string | null;
  estimatedValue: number | null;
  currency: string | null;
  notes: string | null;
};

export type RentalCollateralRecord = RentalCollateralInput & {
  id: number;
  rentalId: number;
  status: RentalCollateralStatus;
  receivedAt: string;
  returnedAt: string | null;
};

export type RentalCollateralReturnInput = {
  collateralId: number;
  status: RentalCollateralStatus;
  notes: string | null;
};

export const rentalCollateralInputSchema = z.object({
  type: z.enum(collateralTypeValues),
  description: z.string().trim().min(1, "Amanat description is required.").max(200),
  referenceNumber: z.string().trim().max(100).nullable(),
  estimatedValue: z.number().finite().min(0).nullable(),
  currency: z.string().trim().max(10).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export const rentalCollateralReturnInputSchema = z.object({
  collateralId: z.number().int().positive("Amanat item is required."),
  status: z.enum(["held", "returned"]),
  notes: z.string().trim().max(500).nullable(),
});

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

      if (!Number.isInteger(numberValue) || numberValue < 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be zero or more.`,
        });

        return z.NEVER;
      }

      return numberValue;
    });

const requiredIntegerField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context): number => {
      const numberValue = Number(value);

      if (!Number.isInteger(numberValue) || numberValue <= 0) {
        context.addIssue({
          code: "custom",
          message: `${label} is required.`,
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

      if (!Number.isFinite(numberValue) || numberValue < 0) {
        context.addIssue({
          code: "custom",
          message: `${label} must be zero or more.`,
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

export const rentalActivationInputSchema = z
  .object({
    customerId: z.number().int().positive("Customer is required."),
    vehicleId: z.number().int().positive("Vehicle is required."),
    startDatetime: z.string().datetime(),
    expectedReturnDatetime: z.string().datetime(),
    dailyPrice: z.number().finite().min(0, "Daily price cannot be negative."),
    depositRequired: z.number().finite().min(0, "Deposit cannot be negative."),
    depositPaid: z.number().finite().min(0, "Deposit paid cannot be negative."),
    mileageOut: z.number().int().min(0).nullable(),
    fuelOut: z.string().trim().max(40).nullable(),
    notesOut: z.string().trim().max(500).nullable(),
    salesUserId: z.number().int().positive().nullable().optional(),
    accessories: z.array(rentalAccessoryInputSchema).default([]),
    collateralItems: z.array(rentalCollateralInputSchema).default([]),
  })
  .superRefine((values, context) => {
    if (
      new Date(values.expectedReturnDatetime).getTime() <=
      new Date(values.startDatetime).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "Expected return must be after the start date and time.",
        path: ["expectedReturnDatetime"],
      });
    }
  });

export type RentalActivationInput = z.infer<
  typeof rentalActivationInputSchema
>;

export type RentalFormValues = {
  customerId: string;
  vehicleId: string;
  startDatetime: string;
  expectedReturnDatetime: string;
  dailyPrice: string;
  depositRequired: string;
  depositPaid: string;
  mileageOut: string;
  fuelOut: string;
  notesOut: string;
  salesUserId: string;
};

export const returnVehicleStatusValues = ["available", "maintenance"] as const;

export type ReturnVehicleStatus = (typeof returnVehicleStatusValues)[number];

export const rentalReturnInputSchema = z
  .object({
    rentalId: z.number().int().positive("Rental is required."),
    actualReturnDatetime: z.string().datetime(),
    lateFeePerDay: z
      .number()
      .finite()
      .min(0, "Late fee per day cannot be negative."),
    damageCharge: z
      .number()
      .finite()
      .min(0, "Damage charges cannot be negative."),
    discount: z.number().finite().min(0, "Discount cannot be negative."),
    mileageIn: z.number().int().min(0).nullable(),
    fuelIn: z.string().trim().max(40).nullable(),
    damageNotes: z.string().trim().max(500).nullable(),
    notesIn: z.string().trim().max(500).nullable(),
    vehicleStatus: z.enum(returnVehicleStatusValues),
    maintenanceTitle: z.string().trim().max(100).nullable().optional(),
    maintenanceDescription: z.string().trim().max(1000).nullable().optional(),
    accessoryReturns: z.array(rentalAccessoryReturnInputSchema).default([]),
    collateralReturns: z.array(rentalCollateralReturnInputSchema).default([]),
  })
  .superRefine((values, context) => {
    if (new Date(values.actualReturnDatetime).getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Actual return cannot be in the future.",
        path: ["actualReturnDatetime"],
      });
    }

    if (
      values.vehicleStatus === "maintenance" &&
      !values.maintenanceTitle?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Maintenance reason is required.",
        path: ["maintenanceTitle"],
      });
    }
  });

export type RentalReturnInput = z.infer<typeof rentalReturnInputSchema>;

export type RentalReturnFormValues = {
  actualReturnDatetime: string;
  lateFeePerDay: string;
  damageCharge: string;
  discount: string;
  mileageIn: string;
  fuelIn: string;
  damageNotes: string;
  notesIn: string;
  vehicleStatus: ReturnVehicleStatus;
  maintenanceTitle: string;
  maintenanceDescription: string;
};

export const rentalReturnFormSchema = z
  .object({
    actualReturnDatetime: datetimeField("Actual return"),
    lateFeePerDay: requiredMoneyField("Late fee per day"),
    damageCharge: requiredMoneyField("Damage charges"),
    discount: requiredMoneyField("Discount"),
    mileageIn: optionalIntegerField("Mileage in"),
    fuelIn: optionalTextField(40),
    damageNotes: optionalTextField(500),
    notesIn: optionalTextField(500),
    vehicleStatus: z.enum(returnVehicleStatusValues),
    maintenanceTitle: optionalTextField(100),
    maintenanceDescription: optionalTextField(1000),
  })
  .superRefine((values, context) => {
    if (new Date(values.actualReturnDatetime).getTime() > Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Actual return cannot be in the future.",
        path: ["actualReturnDatetime"],
      });
    }

    if (
      values.vehicleStatus === "maintenance" &&
      !values.maintenanceTitle?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Maintenance reason is required.",
        path: ["maintenanceTitle"],
      });
    }
  })
  .transform((values) => values);

export type RentalReturnFormInput = z.infer<typeof rentalReturnFormSchema>;

export const rentalFormSchema = z
  .object({
    customerId: requiredIntegerField("Customer"),
    vehicleId: requiredIntegerField("Vehicle"),
    startDatetime: datetimeField("Start date and time"),
    expectedReturnDatetime: datetimeField("Expected return"),
    dailyPrice: requiredMoneyField("Daily price"),
    depositRequired: requiredMoneyField("Deposit"),
    depositPaid: requiredMoneyField("Deposit paid"),
    mileageOut: optionalIntegerField("Mileage out"),
    fuelOut: optionalTextField(40),
    notesOut: optionalTextField(500),
    salesUserId: optionalIntegerField("Sales representative"),
  })
  .transform((values) => rentalActivationInputSchema.parse(values));

export const rentalActiveUpdateInputSchema = z
  .object({
    rentalId: z.number().int().positive("Rental is required."),
    expectedReturnDatetime: z.string().datetime(),
    dailyPrice: z.number().finite().min(0, "Daily price cannot be negative."),
    depositRequired: z.number().finite().min(0, "Deposit cannot be negative."),
    mileageOut: z.number().int().min(0).nullable(),
    fuelOut: z.string().trim().max(40).nullable(),
    notesOut: z.string().trim().max(500).nullable(),
  });

export type RentalActiveUpdateInput = z.infer<
  typeof rentalActiveUpdateInputSchema
>;

export const rentalCancelInputSchema = z.object({
  rentalId: z.number().int().positive("Rental is required."),
  reason: z.string().trim().min(1, "Cancel reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export type RentalCancelInput = z.infer<typeof rentalCancelInputSchema>;

export const rentalReturnWithPaymentInputSchema = z.object({
  returnInput: rentalReturnInputSchema,
  paymentInput: paymentInputSchema.nullable(),
});

export type RentalReturnWithPaymentInput = {
  returnInput: RentalReturnInput;
  paymentInput: PaymentInput | null;
};

export type RentalListRecord = {
  id: number;
  contractNo: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  vehicleId: number;
  vehiclePlateNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  status: RentalStatus;
  startDatetime: string;
  expectedReturnDatetime: string;
  actualReturnDatetime: string | null;
  dailyPrice: number;
  depositRequired: number;
  depositPaid: number;
  mileageOut: number | null;
  mileageIn: number | null;
  fuelOut: string | null;
  fuelIn: string | null;
  notesOut: string | null;
  notesIn: string | null;
  damageNotes: string | null;
  extraCharges: number;
  accessoryCharges: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  salesUserId?: number | null;
  salesUserName?: string | null;
  createdAt: string;
  updatedAt: string;
  accessories?: RentalAccessoryRecord[];
  collateralItems?: RentalCollateralRecord[];
};

export type RentalCustomerOption = {
  id: number;
  fullName: string;
  phone: string;
};

export type RentalVehicleOption = {
  id: number;
  plateNumber: string;
  brand: string;
  model: string;
  dailyPrice: number;
  depositAmount: number;
  mileage: number | null;
};

export type RentalFormOptions = {
  customers: RentalCustomerOption[];
  vehicles: RentalVehicleOption[];
  accessories: AccessoryRecord[];
  salesUsers: { id: number; fullName: string; username: string }[];
};

export function getDefaultRentalFormValues(): RentalFormValues {
  const start = roundToNearestMinutes(new Date(), 15);
  const expected = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    customerId: "",
    vehicleId: "",
    startDatetime: toDatetimeLocalValue(start),
    expectedReturnDatetime: toDatetimeLocalValue(expected),
    dailyPrice: "",
    depositRequired: "0",
    depositPaid: "0",
    mileageOut: "",
    fuelOut: "",
    notesOut: "",
    salesUserId: "",
  };
}

export function getDefaultRentalReturnFormValues(
  rental: RentalListRecord,
  defaultLateFee = rental.dailyPrice,
): RentalReturnFormValues {
  const actualReturn = roundToNearestMinutes(new Date(), 15);

  return {
    actualReturnDatetime: toDatetimeLocalValue(actualReturn),
    lateFeePerDay: String(defaultLateFee),
    damageCharge: "0",
    discount: "0",
    mileageIn: rental.mileageOut === null ? "" : String(rental.mileageOut),
    fuelIn: rental.fuelOut ?? "",
    damageNotes: "",
    notesIn: "",
    vehicleStatus: "available",
    maintenanceTitle: "General inspection",
    maintenanceDescription: rental.damageNotes ?? "",
  };
}

export function calculateRentalDays(
  startDatetime: string | Date,
  expectedReturnDatetime: string | Date,
): number {
  const start = new Date(startDatetime).getTime();
  const expectedReturn = new Date(expectedReturnDatetime).getTime();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  if (!Number.isFinite(start) || !Number.isFinite(expectedReturn)) {
    return 1;
  }

  return Math.max(1, Math.ceil((expectedReturn - start) / millisecondsPerDay));
}

export function calculateRentalTotal(days: number, dailyPrice: number): number {
  if (!Number.isFinite(days) || !Number.isFinite(dailyPrice)) {
    return 0;
  }

  return roundMoney(Math.max(1, days) * Math.max(0, dailyPrice));
}

export function calculateRentalSummary(
  startDatetime: string,
  expectedReturnDatetime: string,
  dailyPrice: number,
  accessoryCharges = 0,
): { days: number; totalAmount: number } {
  const days = calculateRentalDays(startDatetime, expectedReturnDatetime);

  return {
    days,
    totalAmount: roundMoney(
      calculateRentalTotal(days, dailyPrice) + Math.max(0, accessoryCharges),
    ),
  };
}

export function calculateLateDays(
  expectedReturnDatetime: string | Date,
  actualReturnDatetime: string | Date,
): number {
  const expectedReturn = new Date(expectedReturnDatetime).getTime();
  const actualReturn = new Date(actualReturnDatetime).getTime();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  if (!Number.isFinite(expectedReturn) || !Number.isFinite(actualReturn)) {
    return 0;
  }

  return Math.max(0, Math.ceil((actualReturn - expectedReturn) / millisecondsPerDay));
}

export type ReturnSummaryInput = {
  expectedReturnDatetime: string | Date;
  actualReturnDatetime: string | Date;
  baseTotalAmount: number;
  paidAmount: number;
  lateFeePerDay: number;
  damageCharge: number;
  discount: number;
};

export type ReturnSummary = {
  lateDays: number;
  lateFee: number;
  extraCharges: number;
  finalAmount: number;
  remainingAmount: number;
};

export type RentalInitialBalance = {
  paidAmount: number;
  remainingAmount: number;
};

export function calculateInitialRentalBalance(
  totalAmount: number,
  depositPaid: number,
): RentalInitialBalance {
  const paidAmount = roundMoney(Math.max(0, depositPaid));

  return {
    paidAmount,
    remainingAmount: roundMoney(Math.max(0, totalAmount) - paidAmount),
  };
}

export function calculateCancelledRentalBalance(): Pick<
  RentalInitialBalance,
  "remainingAmount"
> {
  return {
    remainingAmount: 0,
  };
}

export function calculateReturnSummary(input: ReturnSummaryInput): ReturnSummary {
  const lateDays = calculateLateDays(
    input.expectedReturnDatetime,
    input.actualReturnDatetime,
  );
  const lateFee = roundMoney(lateDays * Math.max(0, input.lateFeePerDay));
  const extraCharges = roundMoney(
    Math.max(0, lateFee) + Math.max(0, input.damageCharge),
  );
  const finalAmount = roundMoney(
    Math.max(0, input.baseTotalAmount) +
      extraCharges -
      Math.max(0, input.discount),
  );
  const remainingAmount = roundMoney(finalAmount - Math.max(0, input.paidAmount));

  return {
    lateDays,
    lateFee,
    extraCharges,
    finalAmount,
    remainingAmount,
  };
}

export type MileageProgressionInput = {
  mileageIn: number | null;
  mileageOut: number | null;
  currentVehicleMileage: number | null;
};

export function validateMileageProgression(
  input: MileageProgressionInput,
): string | null {
  if (input.mileageIn === null) {
    return null;
  }

  if (!Number.isInteger(input.mileageIn) || input.mileageIn < 0) {
    return "Mileage in must be zero or more.";
  }

  if (input.mileageOut !== null && input.mileageIn < input.mileageOut) {
    return "Mileage in cannot be less than mileage out.";
  }

  if (
    input.mileageOut === null &&
    input.currentVehicleMileage !== null &&
    input.mileageIn < input.currentVehicleMileage
  ) {
    return "Mileage in cannot be less than current vehicle mileage.";
  }

  return null;
}

export function getOpenRentalStatusForExpectedReturn(
  expectedReturnDatetime: string | Date,
  now: string | Date = new Date(),
): Extract<RentalStatus, "active" | "overdue"> {
  return new Date(expectedReturnDatetime).getTime() < new Date(now).getTime()
    ? "overdue"
    : "active";
}

export function formatRentalStatus(
  status: RentalStatus,
  language: LanguageCode = "en",
): string {
  const labels: Record<RentalStatus, string> = {
    draft: "Draft",
    active: "Active",
    returned: "Returned",
    cancelled: "Cancelled",
    overdue: "Overdue",
  };

  return translate(language, labels[status]);
}

export function formatCollateralType(
  type: CollateralType,
  language: LanguageCode = "en",
): string {
  const labels: Record<CollateralType, string> = {
    cash: "Cash Amanat",
    driver_license: "Driver License",
    id_card: "ID Card",
    other_document: "Other Document",
    other_item: "Other Item",
    passport: "Passport",
  };

  return translate(language, labels[type]);
}

export function hasHeldCollateral(
  items: Pick<RentalCollateralRecord, "status">[],
): boolean {
  return items.some((item) => item.status === "held");
}

export type {
  RentalAccessoryInput,
  RentalAccessoryRecord,
  RentalAccessoryReturnInput,
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToNearestMinutes(date: Date, minutes: number): Date {
  const interval = minutes * 60 * 1000;

  return new Date(Math.ceil(date.getTime() / interval) * interval);
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
