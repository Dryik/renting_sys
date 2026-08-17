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
  subtractMoney,
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
 * A rental day is a 24-hour period, and any part of one is charged in full —
 * the standard vehicle-rental convention. Collecting at 09:00 Monday and
 * returning at 10:00 Wednesday is three days, not two.
 *
 * Deliberately not a difference between calendar dates. That reading drops a
 * day from every contract whose return time of day is later than its pickup
 * time of day, which is the ordinary shape of a rental, and it silently
 * reprices contracts that have already been signed and printed whenever they
 * are edited.
 */
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
  accessoryCharges = 0,
  paidAmount = 0,
}: {
  startDatetime: string | Date;
  currentExpectedReturnDatetime: string | Date;
  newExpectedReturnDatetime: string | Date;
  dailyPrice: number;
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

  const currentSummary = calculateRentalSummary(
    startIso,
    currentExpectedIso,
    dailyPrice,
    accessoryCharges,
  );

  const newSummary = calculateRentalSummary(
    startIso,
    newExpectedIso,
    dailyPrice,
    accessoryCharges,
  );

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

export function calculateRentalSummaryMinor(
  startDatetime: string,
  expectedReturnDatetime: string,
  dailyPriceMinor: MoneyMinor,
  accessoryChargesMinor: MoneyMinor = MONEY_MINOR_ZERO,
): { days: number; totalAmountMinor: MoneyMinor } {
  const days = calculateRentalDays(startDatetime, expectedReturnDatetime);

  return {
    days,
    totalAmountMinor: addMoney(
      calculateRentalTotalMinor(days, dailyPriceMinor),
      maxMoney(accessoryChargesMinor, MONEY_MINOR_ZERO),
    ),
  };
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

  let effectiveBaseAmountMinor: MoneyMinor;
  if (
    input.recalculateForActualDays &&
    isEarlyReturn &&
    input.startDatetime !== undefined &&
    input.dailyPriceMinor !== undefined
  ) {
    const accessoryMinor = maxMoney(
      input.accessoryChargesMinor ?? MONEY_MINOR_ZERO,
      MONEY_MINOR_ZERO,
    );
    effectiveBaseAmountMinor = addMoney(
      calculateRentalTotalMinor(actualDays, input.dailyPriceMinor),
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
