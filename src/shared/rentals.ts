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
import {
  MONEY_MINOR_ZERO,
  addMoney,
  fromMinorUnits,
  maxMoney,
  multiplyMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  type MoneyMinor,
} from "./money";
import type { PageRequest } from "./pagination";
import {
  paymentInputSchema,
  paymentMethodValues,
  type PaymentInput,
  type PaymentMethod,
} from "./payments";
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
  "draft",
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
  draft: number;
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

const optionalMoneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, context): number => {
      if (!value) return 0;
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
      const normalized = normalizeToCalendarDate(value);

      if (Number.isNaN(normalized.getTime())) {
        context.addIssue({
          code: "custom",
          message: `${label} must be a valid date.`,
        });

        return z.NEVER;
      }

      return normalized.toISOString();
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
      normalizeToCalendarDate(values.expectedReturnDatetime).getTime() <
      normalizeToCalendarDate(values.startDatetime).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "Expected return cannot be before the start date.",
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
    recalculateForActualDays: z.boolean().default(false),
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
    if (
      normalizeToCalendarDate(values.actualReturnDatetime).getTime() >
      normalizeToCalendarDate(new Date()).getTime()
    ) {
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
  recalculateForActualDays: boolean;
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
    recalculateForActualDays: z.boolean(),
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
    if (
      normalizeToCalendarDate(values.actualReturnDatetime).getTime() >
      normalizeToCalendarDate(new Date()).getTime()
    ) {
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

export const rentalExtendInputSchema = z
  .object({
    rentalId: z.number().int().positive("Rental is required."),
    newExpectedReturnDatetime: z.string().datetime(),
    // No daily price. Extending moves the return date; it does not renegotiate
    // the rate. Because the total is recalculated over the whole contract, a
    // rate sent here would silently reprice days the customer already paid for
    // at the agreed rate. Changing a rate is updateActiveRental's job, which is
    // permissioned and audited as the separate decision it is.
    recordPayment: z.boolean().default(false),
    paymentAmount: z.number().finite().min(0, "Payment amount cannot be negative.").optional(),
    paymentMethod: z.enum(paymentMethodValues).optional(),
    paymentNotes: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  // The form enforces this too, but the form is convenience and this is the
  // trust boundary. Without it a request asking for a payment is accepted and
  // then quietly ignored, returning success with no payment attached.
  .superRefine((values, context) => {
    if (values.recordPayment && !(values.paymentAmount && values.paymentAmount > 0)) {
      context.addIssue({
        code: "custom",
        message: "Payment amount must be greater than zero.",
        path: ["paymentAmount"],
      });
    }
  });

export type RentalExtendInput = z.infer<typeof rentalExtendInputSchema>;

export type RentalExtendFormValues = {
  newExpectedReturnDatetime: string;
  recordPayment: boolean;
  paymentAmount: string;
  paymentMethod: PaymentMethod;
  paymentNotes: string;
  notes: string;
  printFirstPageOnly: boolean;
};

export const rentalExtendFormSchema = z
  .object({
    newExpectedReturnDatetime: datetimeField("New return date"),
    recordPayment: z.boolean(),
    paymentAmount: optionalMoneyField("Payment amount"),
    paymentMethod: z.enum(paymentMethodValues),
    paymentNotes: optionalTextField(500),
    notes: optionalTextField(500),
    printFirstPageOnly: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.recordPayment) {
      const amount = Number(values.paymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        context.addIssue({
          code: "custom",
          message: "Payment amount must be greater than zero.",
          path: ["paymentAmount"],
        });
      }
    }
  });

export type RentalExtendFormInput = z.infer<typeof rentalExtendFormSchema>;

/**
 * Moving a customer onto a different vehicle without ending the contract.
 *
 * The everyday case is a breakdown: the bike fails, the shop hands over
 * another, and the contract, its number, its deposit and its collateral all
 * carry on. Closing the contract and writing a new one would make the customer
 * sign twice, split their history in two, and settle a deposit that never
 * needed settling.
 */
export const rentalVehicleReplaceInputSchema = z
  .object({
    rentalId: z.number().int().positive("Rental is required."),
    replacementVehicleId: z
      .number()
      .int()
      .positive("Replacement vehicle is required."),
    replacedAtDatetime: z.string().datetime(),
    // The replacement's own rate, applied from this day on. The days already
    // ridden keep the rate they were agreed at, which is why the rate lives on
    // the segment rather than only on the contract.
    newDailyPrice: z.number().finite().min(0, "Daily price cannot be negative."),
    reason: z
      .string()
      .trim()
      .min(3, "Reason for the replacement is required.")
      .max(500),
    outgoingMileageIn: z.number().int().min(0).nullable(),
    outgoingFuelIn: z.string().trim().max(40).nullable(),
    outgoingVehicleStatus: z.enum(returnVehicleStatusValues),
    maintenanceTitle: z.string().trim().max(100).nullable().optional(),
    maintenanceDescription: z.string().trim().max(1000).nullable().optional(),
    incomingMileageOut: z.number().int().min(0).nullable(),
    incomingFuelOut: z.string().trim().max(40).nullable(),
    notes: z.string().trim().max(500).nullable().optional(),
    // This is a correction, not an ordinary mid-hire replacement. It is only
    // accepted by the service while the contract still has its first vehicle
    // period, so real vehicle history cannot be rewritten later.
    originalVehicleNotHandedOver: z.boolean().default(false),
  })
  .superRefine((values, context) => {
    if (
      normalizeToCalendarDate(values.replacedAtDatetime).getTime() >
      normalizeToCalendarDate(new Date()).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "A replacement cannot be recorded for a future date.",
        path: ["replacedAtDatetime"],
      });
    }

    if (
      values.outgoingVehicleStatus === "maintenance" &&
      !values.maintenanceTitle?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Maintenance reason is required.",
        path: ["maintenanceTitle"],
      });
    }
  });

export type RentalVehicleReplaceInput = z.infer<
  typeof rentalVehicleReplaceInputSchema
>;

export type RentalVehicleReplaceFormValues = {
  replacementVehicleId: string;
  replacedAtDatetime: string;
  newDailyPrice: string;
  reason: string;
  outgoingMileageIn: string;
  outgoingFuelIn: string;
  outgoingVehicleStatus: ReturnVehicleStatus;
  maintenanceTitle: string;
  maintenanceDescription: string;
  incomingMileageOut: string;
  incomingFuelOut: string;
  notes: string;
  originalVehicleNotHandedOver: boolean;
  printContract: boolean;
};

export const rentalVehicleReplaceFormSchema = z
  .object({
    replacementVehicleId: requiredIntegerField("Replacement vehicle"),
    replacedAtDatetime: datetimeField("Replacement date"),
    newDailyPrice: requiredMoneyField("Daily price"),
    reason: z.string().trim().min(3, "Reason for the replacement is required.").max(500),
    outgoingMileageIn: optionalIntegerField("Mileage in"),
    outgoingFuelIn: optionalTextField(40),
    outgoingVehicleStatus: z.enum(returnVehicleStatusValues),
    maintenanceTitle: optionalTextField(100),
    maintenanceDescription: optionalTextField(1000),
    incomingMileageOut: optionalIntegerField("Mileage out"),
    incomingFuelOut: optionalTextField(40),
    notes: optionalTextField(500),
    originalVehicleNotHandedOver: z.boolean(),
    printContract: z.boolean(),
  })
  .superRefine((values, context) => {
    if (
      normalizeToCalendarDate(values.replacedAtDatetime).getTime() >
      normalizeToCalendarDate(new Date()).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "A replacement cannot be recorded for a future date.",
        path: ["replacedAtDatetime"],
      });
    }

    if (
      values.outgoingVehicleStatus === "maintenance" &&
      !values.maintenanceTitle?.trim()
    ) {
      context.addIssue({
        code: "custom",
        message: "Maintenance reason is required.",
        path: ["maintenanceTitle"],
      });
    }
  });

export type RentalVehicleReplaceFormInput = z.infer<
  typeof rentalVehicleReplaceFormSchema
>;

/**
 * One vehicle's stretch of a contract, as the screens and the contract print
 * read it. `days` is that vehicle's share of the contract's own day count.
 */
export type RentalVehicleSegmentRecord = {
  id: number;
  rentalId: number;
  vehicleId: number;
  vehiclePlateNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  sequence: number;
  startDatetime: string;
  endDatetime: string | null;
  dailyPrice: number;
  days: number;
  rentAmount: number;
  mileageOut: number | null;
  mileageIn: number | null;
  fuelOut: string | null;
  fuelIn: string | null;
  reason: string | null;
  createdAt: string;
};

export const rentalCancelInputSchema = z.object({
  rentalId: z.number().int().positive("Rental is required."),
  reason: z.string().trim().min(1, "Cancel reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export type RentalCancelInput = z.infer<typeof rentalCancelInputSchema>;

/**
 * Removing a cancelled contract that never took any money.
 *
 * The everyday case is a mistake: a contract raised in error, or one the
 * customer walked away from before paying anything. Nothing financial ever
 * happened, so there is no history worth keeping and the shop would rather not
 * scroll past it forever. A contract that took so much as one payment is not
 * eligible — that is a record, and records are kept.
 */
export const rentalDeleteInputSchema = z.object({
  rentalId: z.number().int().positive("Rental is required."),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
  approvalToken: approvalTokenSchema.optional(),
});

export type RentalDeleteInput = z.infer<typeof rentalDeleteInputSchema>;

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
  /**
   * The vehicles this contract ran on, oldest first. Always at least one, and
   * more than one only after a mid-contract replacement.
   */
  vehicleSegments?: RentalVehicleSegmentRecord[];
};

/**
 * A contract's stored vehicle history, ready for the pricing functions.
 *
 * The screens hold major-unit records because that is what they display; the
 * calculations take minor units. Converting in one place keeps a screen's
 * preview and the service's write agreeing on the total.
 */
export function toRentSegmentPeriods(
  segments: readonly RentalVehicleSegmentRecord[] | undefined,
): RentSegmentPeriod[] | undefined {
  if (!segments || segments.length === 0) {
    return undefined;
  }

  return segments.map((segment) => ({
    startDatetime: segment.startDatetime,
    endDatetime: segment.endDatetime,
    dailyPriceMinor: toMinorUnits(segment.dailyPrice, "Daily price"),
  }));
}

export type VehicleReplacementSummary = {
  /** Days billed to the vehicles the contract has already been on. */
  outgoingDays: number;
  /** Days the replacement will carry, to the booked return date. */
  incomingDays: number;
  newTotalAmount: number;
  /** How much the contract's total moves. Negative when it falls. */
  difference: number;
  newRemainingAmount: number;
  correctedStartDatetime: string | null;
  correctedExpectedReturnDatetime: string | null;
};

/**
 * Moves an issued contract to the moment the customer actually received a
 * vehicle while preserving the exact duration that was originally promised.
 */
export function shiftRentalWindowToActualHandover(
  startDatetime: string,
  expectedReturnDatetime: string,
  actualHandoverDatetime: string,
): { startDatetime: string; expectedReturnDatetime: string } {
  const originalStart = new Date(startDatetime);
  const originalReturn = new Date(expectedReturnDatetime);
  const actualHandover = new Date(actualHandoverDatetime);
  const originalStartMs = originalStart.getTime();
  const originalReturnMs = originalReturn.getTime();
  const actualHandoverMs = actualHandover.getTime();

  if (
    Number.isNaN(originalStartMs) ||
    Number.isNaN(originalReturnMs) ||
    Number.isNaN(actualHandoverMs)
  ) {
    throw new Error("Rental dates must be valid.");
  }

  if (originalReturnMs <= originalStartMs) {
    throw new Error("Expected return must be after the start date and time.");
  }

  if (actualHandoverMs < originalStartMs) {
    throw new Error("Actual handover cannot be before the rental started.");
  }

  return {
    startDatetime: actualHandover.toISOString(),
    expectedReturnDatetime: new Date(
      actualHandoverMs + (originalReturnMs - originalStartMs),
    ).toISOString(),
  };
}

/**
 * What a contract will total once a replacement vehicle is recorded.
 *
 * This is the number the counter reads before agreeing the swap with the
 * customer, so it is worked out by the same day-splitting the service writes
 * with rather than by a second rule that could disagree with the receipt.
 */
export function calculateVehicleReplacementSummary(input: {
  startDatetime: string;
  expectedReturnDatetime: string;
  segments: readonly RentalVehicleSegmentRecord[] | undefined;
  replacedAtDatetime: string;
  newDailyPrice: number;
  accessoryCharges: number;
  currentTotalAmount: number;
  paidAmount: number;
  originalVehicleNotHandedOver?: boolean;
}): VehicleReplacementSummary | null {
  const existing = toRentSegmentPeriods(input.segments);

  if (!existing || existing.length === 0) {
    return null;
  }

  const replacedAt = new Date(input.replacedAtDatetime);

  if (Number.isNaN(replacedAt.getTime())) {
    return null;
  }

  const replacedAtIso = replacedAt.toISOString();
  const openIndex = existing.length - 1;
  let effectiveStartDatetime = input.startDatetime;
  let effectiveExpectedReturnDatetime = input.expectedReturnDatetime;
  let correctedStartDatetime: string | null = null;
  let correctedExpectedReturnDatetime: string | null = null;

  if (input.originalVehicleNotHandedOver) {
    if (existing.length !== 1) {
      return null;
    }

    try {
      const correctedWindow = shiftRentalWindowToActualHandover(
        input.startDatetime,
        input.expectedReturnDatetime,
        replacedAtIso,
      );
      effectiveStartDatetime = correctedWindow.startDatetime;
      effectiveExpectedReturnDatetime = correctedWindow.expectedReturnDatetime;
      correctedStartDatetime = correctedWindow.startDatetime;
      correctedExpectedReturnDatetime = correctedWindow.expectedReturnDatetime;
      existing[openIndex] = {
        ...existing[openIndex],
        startDatetime: correctedWindow.startDatetime,
      };
    } catch {
      return null;
    }
  }

  // The open period closes at the swap, and the replacement takes the contract
  // from there to its booked return.
  const projected: RentSegmentPeriod[] = [
    ...existing.slice(0, openIndex),
    { ...existing[openIndex], endDatetime: replacedAtIso },
    {
      startDatetime: replacedAtIso,
      endDatetime: null,
      dailyPriceMinor: toMinorUnits(input.newDailyPrice, "Daily price"),
    },
  ];
  const summary = calculateSegmentedRentalSummaryMinor(
    effectiveStartDatetime,
    effectiveExpectedReturnDatetime,
    projected,
    toMinorUnits(input.accessoryCharges, "Accessory charges"),
  );
  const newTotalAmount = fromMinorUnits(summary.totalAmountMinor);
  const incomingIndex = projected.length - 1;

  return {
    outgoingDays: summary.segmentDays
      .slice(0, incomingIndex)
      .reduce((sum, days) => sum + days, 0),
    incomingDays: summary.segmentDays[incomingIndex] ?? 0,
    newTotalAmount,
    difference: roundMoney(newTotalAmount - input.currentTotalAmount),
    newRemainingAmount: roundMoney(newTotalAmount - input.paidAmount),
    correctedStartDatetime,
    correctedExpectedReturnDatetime,
  };
}

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
  const start = new Date();
  const expected = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return {
    customerId: "",
    vehicleId: "",
    startDatetime: toDateInputValue(start),
    expectedReturnDatetime: toDateInputValue(expected),
    dailyPrice: "",
    depositRequired: "0",
    depositPaid: "0",
    mileageOut: "",
    fuelOut: "",
    notesOut: "",
    salesUserId: "",
  };
}

export function rentalToFormValues(rental: RentalListRecord): RentalFormValues {
  return {
    customerId: String(rental.customerId),
    vehicleId: String(rental.vehicleId),
    startDatetime: toDateInputValue(new Date(rental.startDatetime)),
    expectedReturnDatetime: toDateInputValue(
      new Date(rental.expectedReturnDatetime),
    ),
    dailyPrice: String(rental.dailyPrice),
    depositRequired: String(rental.depositRequired),
    depositPaid: String(rental.depositPaid),
    mileageOut: rental.mileageOut === null ? "" : String(rental.mileageOut),
    fuelOut: rental.fuelOut ?? "",
    notesOut: rental.notesOut ?? "",
    salesUserId: rental.salesUserId ? String(rental.salesUserId) : "",
  };
}

export function getDefaultRentalReturnFormValues(
  rental: RentalListRecord,
  defaultLateFee = rental.dailyPrice,
): RentalReturnFormValues {
  const actualReturn = new Date();
  const actualReturnDateStr = toDateInputValue(actualReturn);
  const bookedDays = calculateRentalDays(
    rental.startDatetime,
    rental.expectedReturnDatetime,
  );
  const actualDays = calculateRentalDays(rental.startDatetime, actualReturnDateStr);
  const isEarly = actualDays < bookedDays;

  return {
    actualReturnDatetime: actualReturnDateStr,
    recalculateForActualDays: isEarly,
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

/**
 * A rental day is a calendar day: the number of dates the vehicle is out.
 *
 * Collected Monday and returned Wednesday is two days whether the customer
 * comes back at 09:00 or at 18:00. Counting 24-hour periods instead charged a
 * whole extra day for the hour a return ran late, which is the ordinary shape
 * of a rental and the thing shops kept having to explain away at the counter.
 *
 * The count is taken from the shop's own calendar, not UTC — see
 * `normalizeToCalendarDate`. A same-day rental is one day, never zero.
 *
 * This matches `calculateLateDays`, which has always counted calendar days, so
 * the two now agree rather than disagreeing by design.
 */
export function calculateRentalDays(
  startDatetime: string | Date,
  expectedReturnDatetime: string | Date,
): number {
  const start = normalizeToCalendarDate(startDatetime);
  const expectedReturn = normalizeToCalendarDate(expectedReturnDatetime);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  if (Number.isNaN(start.getTime()) || Number.isNaN(expectedReturn.getTime())) {
    return 1;
  }

  // Both ends are UTC midnight, so the difference is a whole number of days.
  // Rounding absorbs nothing but floating-point dust.
  const days = Math.round(
    (expectedReturn.getTime() - start.getTime()) / millisecondsPerDay,
  );

  return Math.max(1, days);
}

export type ExtensionSummary = {
  currentDays: number;
  newDays: number;
  addedDays: number;
  currentTotalAmount: number;
  newTotalAmount: number;
  addedRentAmount: number;
  newRemainingAmount: number;
};

export function calculateExtensionSummary({
  startDatetime,
  currentExpectedReturnDatetime,
  newExpectedReturnDatetime,
  dailyPrice,
  segments,
  accessoryCharges = 0,
  paidAmount = 0,
}: {
  startDatetime: string | Date;
  currentExpectedReturnDatetime: string | Date;
  newExpectedReturnDatetime: string | Date;
  dailyPrice: number;
  /**
   * Present once the contract has been swapped. The added days fall inside the
   * open last segment, so they are charged at the rate of the vehicle the
   * customer actually has rather than at whatever the contract started on.
   */
  segments?: readonly RentSegmentPeriod[];
  accessoryCharges?: number;
  paidAmount?: number;
}): ExtensionSummary {
  const startIso = typeof startDatetime === "string" ? startDatetime : startDatetime.toISOString();
  const currentExpectedIso =
    typeof currentExpectedReturnDatetime === "string"
      ? currentExpectedReturnDatetime
      : currentExpectedReturnDatetime.toISOString();
  const newExpectedIso =
    typeof newExpectedReturnDatetime === "string"
      ? newExpectedReturnDatetime
      : newExpectedReturnDatetime.toISOString();

  const summaryTo = (endIso: string): { days: number; totalAmount: number } => {
    if (segments && segments.length > 0) {
      const summary = calculateSegmentedRentalSummaryMinor(
        startIso,
        endIso,
        segments,
        toMinorUnits(accessoryCharges),
      );

      return {
        days: summary.days,
        totalAmount: fromMinorUnits(summary.totalAmountMinor),
      };
    }

    return calculateRentalSummary(startIso, endIso, dailyPrice, accessoryCharges);
  };

  const currentSummary = summaryTo(currentExpectedIso);
  const newSummary = summaryTo(newExpectedIso);

  const currentDays = currentSummary.days;
  const newDays = newSummary.days;
  const addedDays = Math.max(0, newDays - currentDays);
  const addedRentAmount = Math.max(0, newSummary.totalAmount - currentSummary.totalAmount);
  const newRemainingAmount = Math.round((newSummary.totalAmount - paidAmount) * 100) / 100;

  return {
    currentDays,
    newDays,
    addedDays,
    currentTotalAmount: currentSummary.totalAmount,
    newTotalAmount: newSummary.totalAmount,
    addedRentAmount,
    newRemainingAmount,
  };
}

export function getDefaultRentalExtendFormValues(
  rental: RentalListRecord,
  additionalDays = 7,
): RentalExtendFormValues {
  const currentExpected = normalizeToCalendarDate(rental.expectedReturnDatetime);
  const newExpectedDate = new Date(
    currentExpected.getTime() + additionalDays * 24 * 60 * 60 * 1000,
  );
  const newExpectedDateStr = toDateInputValue(newExpectedDate);
  const extensionSummary = calculateExtensionSummary({
    startDatetime: rental.startDatetime,
    currentExpectedReturnDatetime: rental.expectedReturnDatetime,
    newExpectedReturnDatetime: newExpectedDateStr,
    dailyPrice: rental.dailyPrice,
    accessoryCharges: rental.accessoryCharges,
    paidAmount: rental.paidAmount,
  });

  return {
    newExpectedReturnDatetime: newExpectedDateStr,
    // Off by default. A posted payment raises the expected cash on the day's
    // closing, so pre-arming it makes the till read short whenever staff
    // extend a contract and collect later — and that looks like their error.
    // The amount stays filled in, so recording a payment that was actually
    // taken is still one tick.
    recordPayment: false,
    paymentAmount: String(extensionSummary.addedRentAmount),
    paymentMethod: "cash",
    paymentNotes: "",
    notes: "",
    printFirstPageOnly: true,
  };
}

/** Rent for the booked period: a whole-day rate times whole days. */
export function calculateRentalTotalMinor(
  days: number,
  dailyPriceMinor: MoneyMinor,
): MoneyMinor {
  return multiplyMoney(
    maxMoney(dailyPriceMinor, MONEY_MINOR_ZERO),
    Math.max(1, days),
    "the rental total",
  );
}

export function calculateRentalTotal(days: number, dailyPrice: number): number {
  if (!Number.isFinite(days) || !Number.isFinite(dailyPrice)) {
    return 0;
  }

  return fromMinorUnits(
    calculateRentalTotalMinor(Math.ceil(days), toMinorUnits(dailyPrice)),
  );
}

/**
 * One stretch of a contract spent on a single vehicle.
 *
 * A contract that was never swapped has exactly one, running from its start to
 * whenever it ends. `endDatetime` is null for the vehicle the customer
 * currently holds, so the period follows the contract as it is extended or
 * brought back early without anything having to rewrite it.
 */
export type RentSegmentPeriod = {
  startDatetime: string;
  endDatetime: string | null;
  dailyPriceMinor: MoneyMinor;
};

export type SegmentedRent = {
  /** The contract's own day count. Always the sum of `segmentDays`. */
  days: number;
  segmentDays: number[];
  rentMinor: MoneyMinor;
};

/** Whole calendar days between two instants, floored at zero rather than one. */
function calendarDaysBetween(
  from: string | Date | number,
  to: string | Date | number,
): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const start = typeof from === "number" ? from : normalizeToCalendarDate(from).getTime();
  const end = typeof to === "number" ? to : normalizeToCalendarDate(to).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / millisecondsPerDay));
}

/**
 * Rent for a contract whose vehicle changed partway through.
 *
 * Each vehicle is charged its own rate for the days it was actually out, and
 * the day of a swap belongs to the vehicle the customer rides away on.
 *
 * **The contract's day count is the authority, and a swap never changes it.**
 * The parts are measured without the one-day floor `calculateRentalDays`
 * applies, and any difference against the contract's own total is settled on
 * the last segment. Flooring each part instead would bill two days for a bike
 * that broke an hour into a one-day rental — a day for the vehicle that failed
 * and another for the one that replaced it — which is the shop charging a
 * customer for its own breakdown. It also means a same-day swap gives its
 * single day to the replacement, not to the vehicle that never left the yard.
 */
export function calculateSegmentedRentMinor(
  contractStartDatetime: string | Date,
  contractEndDatetime: string | Date,
  segments: readonly RentSegmentPeriod[],
): SegmentedRent {
  if (segments.length === 0) {
    throw new Error("A contract cannot be priced without its vehicle history.");
  }

  const days = calculateRentalDays(contractStartDatetime, contractEndDatetime);
  const contractStart = normalizeToCalendarDate(contractStartDatetime).getTime();
  const contractEnd = normalizeToCalendarDate(contractEndDatetime).getTime();
  const segmentDays = segments.map((segment) => {
    const segmentStart = normalizeToCalendarDate(segment.startDatetime).getTime();
    const segmentEnd =
      segment.endDatetime === null
        ? contractEnd
        : normalizeToCalendarDate(segment.endDatetime).getTime();

    if (Number.isNaN(segmentStart) || Number.isNaN(segmentEnd)) {
      return 0;
    }

    // Clamped into the contract: a period recorded outside it — a swap logged
    // after an overdue contract's due date, say — bills nothing extra.
    return calendarDaysBetween(
      Math.max(contractStart, segmentStart),
      Math.min(contractEnd, segmentEnd),
    );
  });

  reconcileSegmentDays(segmentDays, days);

  return {
    days,
    segmentDays,
    rentMinor: sumMoney(
      segmentDays.map((segmentDay, index) =>
        multiplyMoney(
          maxMoney(segments[index].dailyPriceMinor, MONEY_MINOR_ZERO),
          segmentDay,
          "the rental total",
        ),
      ),
      "the rental total",
    ),
  };
}

/** Forces the parts to add up to the contract's days, settling on the last. */
function reconcileSegmentDays(segmentDays: number[], days: number): void {
  let difference = days - segmentDays.reduce((sum, value) => sum + value, 0);

  if (difference > 0) {
    segmentDays[segmentDays.length - 1] += difference;
    return;
  }

  for (let index = segmentDays.length - 1; index >= 0 && difference < 0; index -= 1) {
    const taken = Math.min(segmentDays[index], -difference);
    segmentDays[index] -= taken;
    difference += taken;
  }
}

/** The segmented rent plus accessories: what a contract's total amount is. */
export function calculateSegmentedRentalSummaryMinor(
  startDatetime: string | Date,
  endDatetime: string | Date,
  segments: readonly RentSegmentPeriod[],
  accessoryChargesMinor: MoneyMinor = MONEY_MINOR_ZERO,
): { days: number; segmentDays: number[]; totalAmountMinor: MoneyMinor } {
  const split = calculateSegmentedRentMinor(startDatetime, endDatetime, segments);

  return {
    days: split.days,
    segmentDays: split.segmentDays,
    totalAmountMinor: addMoney(
      split.rentMinor,
      maxMoney(accessoryChargesMinor, MONEY_MINOR_ZERO),
    ),
  };
}

export function calculateRentalSummaryMinor(
  startDatetime: string,
  expectedReturnDatetime: string,
  dailyPriceMinor: MoneyMinor,
  accessoryChargesMinor: MoneyMinor = MONEY_MINOR_ZERO,
): { days: number; totalAmountMinor: MoneyMinor } {
  // One implied segment, so an unswapped contract and a swapped one are priced
  // by the same code and cannot drift apart.
  const summary = calculateSegmentedRentalSummaryMinor(
    startDatetime,
    expectedReturnDatetime,
    [{ startDatetime, endDatetime: null, dailyPriceMinor }],
    accessoryChargesMinor,
  );

  return { days: summary.days, totalAmountMinor: summary.totalAmountMinor };
}

export function calculateRentalSummary(
  startDatetime: string,
  expectedReturnDatetime: string,
  dailyPrice: number,
  accessoryCharges = 0,
): { days: number; totalAmount: number } {
  const summary = calculateRentalSummaryMinor(
    startDatetime,
    expectedReturnDatetime,
    toMinorUnits(dailyPrice),
    toMinorUnits(accessoryCharges),
  );

  return {
    days: summary.days,
    totalAmount: fromMinorUnits(summary.totalAmountMinor),
  };
}

export function calculateLateDays(
  expectedReturnDatetime: string | Date,
  actualReturnDatetime: string | Date,
): number {
  const expectedReturn = normalizeToCalendarDate(expectedReturnDatetime);
  const actualReturn = normalizeToCalendarDate(actualReturnDatetime);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  if (Number.isNaN(expectedReturn.getTime()) || Number.isNaN(actualReturn.getTime())) {
    return 0;
  }

  const diffDays = Math.round((actualReturn.getTime() - expectedReturn.getTime()) / millisecondsPerDay);
  return Math.max(0, diffDays);
}

export type ReturnSummaryInput = {
  startDatetime?: string | Date;
  expectedReturnDatetime: string | Date;
  actualReturnDatetime: string | Date;
  dailyPrice?: number;
  segments?: readonly RentSegmentPeriod[];
  accessoryCharges?: number;
  recalculateForActualDays?: boolean;
  baseTotalAmount: number;
  paidAmount: number;
  lateFeePerDay: number;
  damageCharge: number;
  discount: number;
};

export type ReturnSummary = {
  bookedDays: number;
  actualDays: number;
  earlyDays: number;
  isEarlyReturn: boolean;
  effectiveBaseAmount: number;
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

export type RentalInitialBalanceMinor = {
  paidAmountMinor: MoneyMinor;
  remainingAmountMinor: MoneyMinor;
};

export function calculateInitialRentalBalanceMinor(
  totalAmountMinor: MoneyMinor,
  depositPaidMinor: MoneyMinor,
): RentalInitialBalanceMinor {
  const paidAmountMinor = maxMoney(depositPaidMinor, MONEY_MINOR_ZERO);

  return {
    paidAmountMinor,
    remainingAmountMinor: subtractMoney(
      maxMoney(totalAmountMinor, MONEY_MINOR_ZERO),
      paidAmountMinor,
    ),
  };
}

export function calculateInitialRentalBalance(
  totalAmount: number,
  depositPaid: number,
): RentalInitialBalance {
  const balance = calculateInitialRentalBalanceMinor(
    toMinorUnits(totalAmount),
    toMinorUnits(depositPaid),
  );

  return {
    paidAmount: fromMinorUnits(balance.paidAmountMinor),
    remainingAmount: fromMinorUnits(balance.remainingAmountMinor),
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

export type ReturnSummaryMinorInput = {
  startDatetime?: string | Date;
  expectedReturnDatetime: string | Date;
  actualReturnDatetime: string | Date;
  dailyPriceMinor?: MoneyMinor;
  accessoryChargesMinor?: MoneyMinor;
  /**
   * The vehicles this contract ran on. Present whenever it was swapped, so an
   * early return reprices the days actually ridden on each rate rather than
   * charging the whole shortened contract at the rate of the last vehicle.
   */
  segments?: readonly RentSegmentPeriod[];
  recalculateForActualDays?: boolean;
  baseTotalAmountMinor: MoneyMinor;
  paidAmountMinor: MoneyMinor;
  lateFeePerDayMinor: MoneyMinor;
  damageChargeMinor: MoneyMinor;
  discountMinor: MoneyMinor;
};

export type ReturnSummaryMinor = {
  bookedDays: number;
  actualDays: number;
  earlyDays: number;
  isEarlyReturn: boolean;
  effectiveBaseAmountMinor: MoneyMinor;
  lateDays: number;
  lateFeeMinor: MoneyMinor;
  extraChargesMinor: MoneyMinor;
  finalAmountMinor: MoneyMinor;
  remainingAmountMinor: MoneyMinor;
};

export function calculateReturnSummaryMinor(
  input: ReturnSummaryMinorInput,
): ReturnSummaryMinor {
  const bookedDays = input.startDatetime
    ? calculateRentalDays(input.startDatetime, input.expectedReturnDatetime)
    : 1;
  const actualDays = input.startDatetime
    ? calculateRentalDays(input.startDatetime, input.actualReturnDatetime)
    : 1;
  const earlyDays = Math.max(0, bookedDays - actualDays);
  const isEarlyReturn = earlyDays > 0;

  const canReprice =
    input.startDatetime !== undefined &&
    (input.segments !== undefined || input.dailyPriceMinor !== undefined);

  let effectiveBaseAmountMinor: MoneyMinor;
  if (input.recalculateForActualDays && isEarlyReturn && canReprice) {
    const accessoryMinor = maxMoney(
      input.accessoryChargesMinor ?? MONEY_MINOR_ZERO,
      MONEY_MINOR_ZERO,
    );
    const startDatetime = input.startDatetime as string | Date;
    effectiveBaseAmountMinor = addMoney(
      input.segments && input.segments.length > 0
        ? calculateSegmentedRentMinor(
            startDatetime,
            input.actualReturnDatetime,
            input.segments,
          ).rentMinor
        : calculateRentalTotalMinor(
            actualDays,
            input.dailyPriceMinor ?? MONEY_MINOR_ZERO,
          ),
      accessoryMinor,
    );
  } else {
    effectiveBaseAmountMinor = maxMoney(
      input.baseTotalAmountMinor,
      MONEY_MINOR_ZERO,
    );
  }

  const lateDays = calculateLateDays(
    input.expectedReturnDatetime,
    input.actualReturnDatetime,
  );
  const lateFeeMinor = multiplyMoney(
    maxMoney(input.lateFeePerDayMinor, MONEY_MINOR_ZERO),
    lateDays,
    "the late fee",
  );
  const extraChargesMinor = addMoney(
    lateFeeMinor,
    maxMoney(input.damageChargeMinor, MONEY_MINOR_ZERO),
  );
  const finalAmountMinor = subtractMoney(
    addMoney(
      effectiveBaseAmountMinor,
      extraChargesMinor,
    ),
    maxMoney(input.discountMinor, MONEY_MINOR_ZERO),
  );

  return {
    bookedDays,
    actualDays,
    earlyDays,
    isEarlyReturn,
    effectiveBaseAmountMinor,
    lateDays,
    lateFeeMinor,
    extraChargesMinor,
    finalAmountMinor,
    remainingAmountMinor: subtractMoney(
      finalAmountMinor,
      maxMoney(input.paidAmountMinor, MONEY_MINOR_ZERO),
    ),
  };
}

export function calculateReturnSummary(input: ReturnSummaryInput): ReturnSummary {
  const summary = calculateReturnSummaryMinor({
    startDatetime: input.startDatetime,
    expectedReturnDatetime: input.expectedReturnDatetime,
    actualReturnDatetime: input.actualReturnDatetime,
    dailyPriceMinor:
      input.dailyPrice !== undefined ? toMinorUnits(input.dailyPrice) : undefined,
    segments: input.segments,
    accessoryChargesMinor:
      input.accessoryCharges !== undefined
        ? toMinorUnits(input.accessoryCharges)
        : undefined,
    recalculateForActualDays: input.recalculateForActualDays,
    baseTotalAmountMinor: toMinorUnits(input.baseTotalAmount),
    paidAmountMinor: toMinorUnits(input.paidAmount),
    lateFeePerDayMinor: toMinorUnits(input.lateFeePerDay),
    damageChargeMinor: toMinorUnits(input.damageCharge),
    discountMinor: toMinorUnits(input.discount),
  });

  return {
    bookedDays: summary.bookedDays,
    actualDays: summary.actualDays,
    earlyDays: summary.earlyDays,
    isEarlyReturn: summary.isEarlyReturn,
    effectiveBaseAmount: fromMinorUnits(summary.effectiveBaseAmountMinor),
    lateDays: summary.lateDays,
    lateFee: fromMinorUnits(summary.lateFeeMinor),
    extraCharges: fromMinorUnits(summary.extraChargesMinor),
    finalAmount: fromMinorUnits(summary.finalAmountMinor),
    remainingAmount: fromMinorUnits(summary.remainingAmountMinor),
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
  const expected = normalizeToCalendarDate(expectedReturnDatetime);
  const current = normalizeToCalendarDate(now);
  return expected.getTime() < current.getTime() ? "overdue" : "active";
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

/**
 * The calendar day something falls on, as UTC midnight so two of them can be
 * subtracted.
 *
 * One basis for both kinds of input. A date with no time is already a calendar
 * day and is taken literally. Anything carrying an instant — an ISO timestamp
 * or a Date — resolves to the day the shop was in when it happened, which is
 * the local day, because a shop saying "the 15th" means its own 15th.
 *
 * The date-only pattern is anchored deliberately. Without the anchor an ISO
 * timestamp matched it too, so `"…T23:00:00Z"` resolved to the UTC day while
 * `new Date("…T23:00:00Z")` resolved to the local one: the same instant landing
 * on two different days depending on which form the caller happened to hold.
 */
export function normalizeToCalendarDate(value: string | Date): Date {
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

    if (dateOnly) {
      return new Date(
        Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      );
    }
  }

  const instant = new Date(value);

  if (Number.isNaN(instant.getTime())) {
    return new Date(NaN);
  }

  return new Date(
    Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate()),
  );
}

/**
 * The return datetime for an extension that keeps the contract's own clock
 * time.
 *
 * Staff pick a date, but a rental ends at a time of day. Taking the date at
 * midnight shortens the last day and leaves a whole-day rate charging a part
 * day in full, so "extend to Wednesday" on a contract due Wednesday 10:00 would
 * bill an extra day for the ten hours it removed. Moving by whole days from the
 * current return instead keeps the time of day, so extending by N days adds
 * exactly N billable days.
 */
export function extendedReturnDatetime(
  currentExpectedReturnDatetime: string | Date,
  chosenDate: string | Date,
): string {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const current = new Date(currentExpectedReturnDatetime);

  if (Number.isNaN(current.getTime())) {
    return new Date(NaN).toISOString();
  }

  const addedDays = Math.round(
    (normalizeToCalendarDate(chosenDate).getTime() -
      normalizeToCalendarDate(currentExpectedReturnDatetime).getTime()) /
      millisecondsPerDay,
  );

  return new Date(current.getTime() + addedDays * millisecondsPerDay).toISOString();
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
