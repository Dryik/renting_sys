/**
 * Money columns come in pairs since schema version 12.
 *
 * `*Minor` is an integer count of minor units and is what every calculation,
 * comparison and SQL aggregate uses. `*Legacy` is the original REAL column,
 * kept only as a compatibility mirror for an older installed build; nothing in
 * this app may calculate from it. The `Legacy` suffix is deliberate — it turns
 * an accidental read of the old column into something a reviewer notices and
 * makes the compiler point at every site that still needs converting.
 *
 * See `money-columns.ts` for the audited inventory and the triggers that keep
 * each pair in step.
 */
import { relations } from "drizzle-orm";
import {
  integer,
  index,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const roles = sqliteTable("roles", {
  key: text("key").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key),
    permission: text("permission").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleKey, table.permission] }),
  }),
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordAlgo: text("password_algo").notNull(),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    earnsCommission: integer("earns_commission", { mode: "boolean" })
      .notNull()
      .default(true),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdByUserId: integer("created_by_user_id"),
    deactivatedAt: text("deactivated_at"),
    deactivatedByUserId: integer("deactivated_by_user_id"),
  },
  (table) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
    roleIdx: index("users_role_key_idx").on(table.roleKey),
    activeIdx: index("users_is_active_idx").on(table.isActive),
  }),
);

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["car", "motorcycle"] }).notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    plateNumber: text("plate_number").notNull(),
    chassisNumber: text("chassis_number"),
    color: text("color"),
    year: integer("year"),
    dailyPriceLegacy: real("daily_price").notNull(),
    dailyPriceMinor: integer("daily_price_minor").notNull().default(0),
    depositAmountLegacy: real("deposit_amount").notNull().default(0),
    depositAmountMinor: integer("deposit_amount_minor").notNull().default(0),
    status: text("status", {
      enum: ["available", "rented", "maintenance", "inactive"],
    })
      .notNull()
      .default("available"),
    mileage: integer("mileage"),
    insuranceExpiryDate: text("insurance_expiry_date"),
    registrationExpiryDate: text("registration_expiry_date"),
    technicalInspectionExpiryDate: text("technical_inspection_expiry_date"),
    lastOilChangeDate: text("last_oil_change_date"),
    lastOilChangeMileage: integer("last_oil_change_mileage"),
    notes: text("notes"),
    commissionRateOverrideLegacy: real("commission_rate_override"),
    commissionRateOverrideMinor: integer("commission_rate_override_minor"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    plateNumberIdx: uniqueIndex("vehicles_plate_number_idx").on(
      table.plateNumber,
    ),
    statusIdx: index("vehicles_status_idx").on(table.status),
    statusPlateNumberIdx: index("vehicles_status_plate_number_idx").on(
      table.status,
      table.plateNumber,
    ),
    typeIdx: index("vehicles_type_idx").on(table.type),
  }),
);

export const vehicleSales = sqliteTable(
  "vehicle_sales",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    saleNo: text("sale_no").notNull(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone"),
    buyerIdNumber: text("buyer_id_number"),
    saleDate: text("sale_date").notNull(),
    salePriceLegacy: real("sale_price").notNull(),
    salePriceMinor: integer("sale_price_minor").notNull().default(0),
    paymentMethod: text("payment_method", {
      enum: ["cash", "card", "bank_transfer", "other"],
    }).notNull(),
    status: text("status", { enum: ["posted", "voided"] })
      .notNull()
      .default("posted"),
    previousVehicleStatus: text("previous_vehicle_status", {
      enum: ["available", "inactive"],
    }).notNull(),
    notes: text("notes"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    saleNoIdx: uniqueIndex("vehicle_sales_sale_no_idx").on(table.saleNo),
    vehicleIdx: index("vehicle_sales_vehicle_id_idx").on(table.vehicleId),
    saleDateIdx: index("vehicle_sales_sale_date_idx").on(table.saleDate),
    statusIdx: index("vehicle_sales_status_idx").on(table.status),
    buyerNameIdx: index("vehicle_sales_buyer_name_idx").on(table.buyerName),
  }),
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    secondaryPhone: text("secondary_phone"),
    nationalId: text("national_id"),
    driverLicenseNo: text("driver_license_no"),
    licenseExpiryDate: text("license_expiry_date"),
    address: text("address"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    activeIdx: index("customers_is_active_idx").on(table.isActive),
    activeFullNameIdx: index("customers_is_active_full_name_idx").on(
      table.isActive,
      table.fullName,
    ),
    fullNameIdx: index("customers_full_name_idx").on(table.fullName),
    phoneIdx: index("customers_phone_idx").on(table.phone),
    nationalIdIdx: index("customers_national_id_idx").on(table.nationalId),
    driverLicenseNoIdx: index("customers_driver_license_no_idx").on(
      table.driverLicenseNo,
    ),
  }),
);

export const rentals = sqliteTable(
  "rentals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contractNo: text("contract_no").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    status: text("status", {
      enum: ["draft", "active", "returned", "cancelled", "overdue"],
    })
      .notNull()
      .default("draft"),
    startDatetime: text("start_datetime").notNull(),
    expectedReturnDatetime: text("expected_return_datetime").notNull(),
    actualReturnDatetime: text("actual_return_datetime"),
    dailyPriceLegacy: real("daily_price").notNull(),
    dailyPriceMinor: integer("daily_price_minor").notNull().default(0),
    depositRequiredLegacy: real("deposit_required").notNull().default(0),
    depositRequiredMinor: integer("deposit_required_minor").notNull().default(0),
    depositPaidLegacy: real("deposit_paid").notNull().default(0),
    depositPaidMinor: integer("deposit_paid_minor").notNull().default(0),
    mileageOut: integer("mileage_out"),
    mileageIn: integer("mileage_in"),
    fuelOut: text("fuel_out"),
    fuelIn: text("fuel_in"),
    notesOut: text("notes_out"),
    notesIn: text("notes_in"),
    damageNotes: text("damage_notes"),
    extraChargesLegacy: real("extra_charges").notNull().default(0),
    extraChargesMinor: integer("extra_charges_minor").notNull().default(0),
    accessoryChargesLegacy: real("accessory_charges").notNull().default(0),
    accessoryChargesMinor: integer("accessory_charges_minor").notNull().default(0),
    discountLegacy: real("discount").notNull().default(0),
    discountMinor: integer("discount_minor").notNull().default(0),
    totalAmountLegacy: real("total_amount").notNull().default(0),
    totalAmountMinor: integer("total_amount_minor").notNull().default(0),
    paidAmountLegacy: real("paid_amount").notNull().default(0),
    paidAmountMinor: integer("paid_amount_minor").notNull().default(0),
    remainingAmountLegacy: real("remaining_amount").notNull().default(0),
    remainingAmountMinor: integer("remaining_amount_minor").notNull().default(0),
    cancelledAt: text("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    salesUserId: integer("sales_user_id").references(() => users.id),
    commissionRatePerDayLegacy: real("commission_rate_per_day").notNull().default(0),
    commissionRatePerDayMinor: integer("commission_rate_per_day_minor")
      .notNull()
      .default(0),
    commissionAmountLegacy: real("commission_amount").notNull().default(0),
    commissionAmountMinor: integer("commission_amount_minor").notNull().default(0),
    activatedByUserId: integer("activated_by_user_id").references(() => users.id),
    returnedByUserId: integer("returned_by_user_id").references(() => users.id),
    cancelledByUserId: integer("cancelled_by_user_id").references(() => users.id),
    lastUpdatedByUserId: integer("last_updated_by_user_id").references(
      () => users.id,
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    contractNoIdx: uniqueIndex("rentals_contract_no_idx").on(table.contractNo),
    statusIdx: index("rentals_status_idx").on(table.status),
    createdAtIdx: index("rentals_created_at_idx").on(table.createdAt),
    statusCreatedAtIdx: index("rentals_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
    expectedReturnIdx: index("rentals_expected_return_datetime_idx").on(
      table.expectedReturnDatetime,
    ),
    statusExpectedReturnIdx: index("rentals_status_expected_return_idx").on(
      table.status,
      table.expectedReturnDatetime,
    ),
    actualReturnIdx: index("rentals_actual_return_datetime_idx").on(
      table.actualReturnDatetime,
    ),
    statusActualReturnIdx: index("rentals_status_actual_return_idx").on(
      table.status,
      table.actualReturnDatetime,
      table.createdAt,
    ),
    statusRemainingAmountIdx: index("rentals_status_remaining_amount_idx").on(
      table.status,
      table.remainingAmountMinor,
    ),
    cancelledAtIdx: index("rentals_cancelled_at_idx").on(table.cancelledAt),
    customerIdIdx: index("rentals_customer_id_idx").on(table.customerId),
    vehicleIdIdx: index("rentals_vehicle_id_idx").on(table.vehicleId),
  }),
);

export const accessories = sqliteTable(
  "accessories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    quantityOwned: integer("quantity_owned").notNull().default(0),
    defaultChargeLegacy: real("default_charge").notNull().default(0),
    defaultChargeMinor: integer("default_charge_minor").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex("accessories_name_idx").on(table.name),
    activeIdx: index("accessories_is_active_idx").on(table.isActive),
  }),
);

export const rentalAccessories = sqliteTable(
  "rental_accessories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id),
    accessoryId: integer("accessory_id")
      .notNull()
      .references(() => accessories.id),
    quantity: integer("quantity").notNull(),
    unitChargeLegacy: real("unit_charge").notNull().default(0),
    unitChargeMinor: integer("unit_charge_minor").notNull().default(0),
    returnedQuantity: integer("returned_quantity").notNull().default(0),
    missingQuantity: integer("missing_quantity").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    rentalIdx: index("rental_accessories_rental_id_idx").on(table.rentalId),
    accessoryIdx: index("rental_accessories_accessory_id_idx").on(table.accessoryId),
  }),
);

export const rentalCollateralItems = sqliteTable(
  "rental_collateral_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id),
    type: text("type", {
      enum: [
        "passport",
        "id_card",
        "driver_license",
        "cash",
        "other_document",
        "other_item",
      ],
    }).notNull(),
    description: text("description").notNull(),
    referenceNumber: text("reference_number"),
    estimatedValueLegacy: real("estimated_value"),
    estimatedValueMinor: integer("estimated_value_minor"),
    currency: text("currency"),
    status: text("status", { enum: ["held", "returned"] }).notNull().default("held"),
    receivedAt: text("received_at").notNull(),
    returnedAt: text("returned_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    rentalIdx: index("rental_collateral_items_rental_id_idx").on(table.rentalId),
    statusIdx: index("rental_collateral_items_status_idx").on(table.status),
  }),
);

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id),
    type: text("type", {
      enum: ["rent", "deposit", "extra_charge", "refund"],
    }).notNull(),
    method: text("method", {
      enum: ["cash", "card", "bank_transfer", "other"],
    }).notNull(),
    receiptNo: text("receipt_no"),
    status: text("status", {
      enum: ["posted", "voided"],
    })
      .notNull()
      .default("posted"),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    paymentDate: text("payment_date").notNull(),
    notes: text("notes"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    correctedByPaymentId: integer("corrected_by_payment_id"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    receiptNoIdx: uniqueIndex("payments_receipt_no_idx").on(table.receiptNo),
    paymentDateIdx: index("payments_payment_date_idx").on(table.paymentDate),
    statusIdx: index("payments_status_idx").on(table.status),
    typeIdx: index("payments_type_idx").on(table.type),
    rentalIdIdx: index("payments_rental_id_idx").on(table.rentalId),
    statusTypeRentalIdIdx: index("payments_status_type_rental_id_idx").on(
      table.status,
      table.type,
      table.rentalId,
    ),
    statusTypeRentalAmountIdx: index("payments_status_type_rental_amount_idx").on(
      table.status,
      table.type,
      table.rentalId,
      table.amountMinor,
    ),
  }),
);

export const moneyLocations = sqliteTable("money_locations", {
  key: text("key", {
    enum: ["cash_drawer", "shop_safe", "bank"],
  }).primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category", {
      enum: [
        "fuel",
        "wash",
        "parts",
        "maintenance",
        "insurance",
        "registration",
        "office",
        "other",
      ],
    }).notNull(),
    location: text("location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    })
      .notNull()
      .references(() => moneyLocations.key),
    method: text("method", {
      enum: ["cash", "card", "bank_transfer", "other"],
    }).notNull(),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    expenseDate: text("expense_date").notNull(),
    vendorName: text("vendor_name"),
    vehicleId: integer("vehicle_id").references(() => vehicles.id),
    notes: text("notes"),
    status: text("status", {
      enum: ["posted", "voided"],
    })
      .notNull()
      .default("posted"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    categoryIdx: index("expenses_category_idx").on(table.category),
    dateIdx: index("expenses_expense_date_idx").on(table.expenseDate),
    locationIdx: index("expenses_location_idx").on(table.location),
    statusIdx: index("expenses_status_idx").on(table.status),
    vehicleIdx: index("expenses_vehicle_id_idx").on(table.vehicleId),
  }),
);

export const cashMovements = sqliteTable(
  "cash_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: ["transfer", "owner_withdrawal"],
    }).notNull(),
    fromLocation: text("from_location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    })
      .notNull()
      .references(() => moneyLocations.key),
    toLocation: text("to_location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    }).references(() => moneyLocations.key),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    movementDate: text("movement_date").notNull(),
    notes: text("notes"),
    status: text("status", {
      enum: ["posted", "voided"],
    })
      .notNull()
      .default("posted"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    dateIdx: index("cash_movements_date_idx").on(table.movementDate),
    fromIdx: index("cash_movements_from_location_idx").on(table.fromLocation),
    statusIdx: index("cash_movements_status_idx").on(table.status),
    toIdx: index("cash_movements_to_location_idx").on(table.toLocation),
    typeIdx: index("cash_movements_type_idx").on(table.type),
  }),
);

export const employeeLoans = sqliteTable(
  "employee_loans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loanNo: text("loan_no").notNull(),
    employeeUserId: integer("employee_user_id")
      .notNull()
      .references(() => users.id),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    issuedAt: text("issued_at").notNull(),
    sourceLocation: text("source_location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    }).notNull(),
    remainingAmountLegacy: real("remaining_amount").notNull(),
    remainingAmountMinor: integer("remaining_amount_minor").notNull().default(0),
    status: text("status", { enum: ["open", "paid", "voided"] })
      .notNull()
      .default("open"),
    notes: text("notes"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    loanNoIdx: uniqueIndex("employee_loans_loan_no_idx").on(table.loanNo),
    employeeIdx: index("employee_loans_employee_user_id_idx").on(table.employeeUserId),
    statusIdx: index("employee_loans_status_idx").on(table.status),
    issuedAtIdx: index("employee_loans_issued_at_idx").on(table.issuedAt),
  }),
);

export const employeeLoanPayments = sqliteTable(
  "employee_loan_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loanId: integer("loan_id")
      .notNull()
      .references(() => employeeLoans.id),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    paymentDate: text("payment_date").notNull(),
    method: text("method", {
      enum: ["cash", "card", "bank_transfer", "other"],
    }).notNull(),
    location: text("location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    }).notNull(),
    status: text("status", { enum: ["posted", "voided"] })
      .notNull()
      .default("posted"),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    loanIdx: index("employee_loan_payments_loan_id_idx").on(table.loanId),
    dateIdx: index("employee_loan_payments_payment_date_idx").on(table.paymentDate),
    statusIdx: index("employee_loan_payments_status_idx").on(table.status),
  }),
);

export const accountingAdjustments = sqliteTable(
  "accounting_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    location: text("location", {
      enum: ["cash_drawer", "shop_safe", "bank"],
    })
      .notNull()
      .references(() => moneyLocations.key),
    direction: text("direction", {
      enum: ["increase", "decrease"],
    }).notNull(),
    amountLegacy: real("amount").notNull(),
    amountMinor: integer("amount_minor").notNull().default(0),
    adjustmentDate: text("adjustment_date").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    status: text("status", {
      enum: ["posted", "voided"],
    })
      .notNull()
      .default("posted"),
    voidedAt: text("voided_at"),
    voidedByUserId: integer("voided_by_user_id").references(() => users.id),
    voidReason: text("void_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    dateIdx: index("accounting_adjustments_date_idx").on(table.adjustmentDate),
    directionIdx: index("accounting_adjustments_direction_idx").on(table.direction),
    locationIdx: index("accounting_adjustments_location_idx").on(table.location),
    statusIdx: index("accounting_adjustments_status_idx").on(table.status),
  }),
);

export const maintenanceRecords = sqliteTable(
  "maintenance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    title: text("title").notNull(),
    description: text("description"),
    costLegacy: real("cost").notNull().default(0),
    costMinor: integer("cost_minor").notNull().default(0),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    completedByUserId: integer("completed_by_user_id").references(() => users.id),
    archivedByUserId: integer("archived_by_user_id").references(() => users.id),
    lastUpdatedByUserId: integer("last_updated_by_user_id").references(
      () => users.id,
    ),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    archivedIdx: index("maintenance_is_archived_idx").on(table.isArchived),
    startDateIdx: index("maintenance_start_date_idx").on(table.startDate),
    vehicleIdIdx: index("maintenance_vehicle_id_idx").on(table.vehicleId),
  }),
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const vehicleMileageEvents = sqliteTable(
  "vehicle_mileage_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    rentalId: integer("rental_id").references(() => rentals.id),
    maintenanceRecordId: integer("maintenance_record_id").references(
      () => maintenanceRecords.id,
    ),
    eventType: text("event_type", {
      enum: ["rental_out", "rental_return", "manual_adjustment", "maintenance"],
    }).notNull(),
    mileage: integer("mileage").notNull(),
    previousMileage: integer("previous_mileage"),
    eventDatetime: text("event_datetime").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    vehicleIdIdx: index("vehicle_mileage_events_vehicle_id_idx").on(
      table.vehicleId,
    ),
    rentalIdIdx: index("vehicle_mileage_events_rental_id_idx").on(
      table.rentalId,
    ),
    eventDatetimeIdx: index("vehicle_mileage_events_event_datetime_idx").on(
      table.eventDatetime,
    ),
  }),
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", {
      enum: ["customer", "vehicle", "rental", "maintenance"],
    }).notNull(),
    entityId: integer("entity_id").notNull(),
    originalName: text("original_name").notNull(),
    storedRelativePath: text("stored_relative_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    attachmentType: text("attachment_type").notNull().default("other"),
    documentType: text("document_type").notNull().default("other"),
    title: text("title"),
    originalFileName: text("original_file_name").notNull().default(""),
    storedFileName: text("stored_file_name").notNull().default(""),
    relativePath: text("relative_path").notNull().default(""),
    thumbnailRelativePath: text("thumbnail_relative_path"),
    fileSize: integer("file_size").notNull().default(0),
    sha256: text("sha256").notNull().default(""),
    documentNumber: text("document_number"),
    issueDate: text("issue_date"),
    expiryDate: text("expiry_date"),
    notes: text("notes"),
    capturedByCamera: integer("captured_by_camera", { mode: "boolean" })
      .notNull()
      .default(false),
    cameraDeviceLabelSnapshot: text("camera_device_label_snapshot"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    archivedAt: text("archived_at"),
    archivedByUserId: integer("archived_by_user_id").references(() => users.id),
    archiveReason: text("archive_reason"),
    createdAt: text("created_at").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (table) => ({
    entityIdx: index("attachments_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    documentIdx: index("attachments_document_idx").on(
      table.entityType,
      table.entityId,
      table.documentType,
    ),
    primaryIdx: index("attachments_primary_idx").on(
      table.entityType,
      table.entityId,
      table.documentType,
      table.isPrimary,
    ),
    archivedIdx: index("attachments_is_archived_idx").on(table.isArchived),
  }),
);

export const appEvents = sqliteTable(
  "app_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    severity: text("severity", { enum: ["info", "warning", "danger"] })
      .notNull()
      .default("info"),
    message: text("message").notNull(),
    detailsJson: text("details_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    eventTypeIdx: index("app_events_event_type_idx").on(table.eventType),
    entityIdx: index("app_events_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
    createdAtIdx: index("app_events_created_at_idx").on(table.createdAt),
  }),
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurredAt: text("occurred_at").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id),
    actorUsernameSnapshot: text("actor_username_snapshot"),
    actorFullNameSnapshot: text("actor_full_name_snapshot"),
    actorRoleKeySnapshot: text("actor_role_key_snapshot"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    entityLabel: text("entity_label"),
    summaryAr: text("summary_ar"),
    summaryEn: text("summary_en"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    metadataJson: text("metadata_json"),
    reason: text("reason"),
    sessionId: text("session_id"),
    appVersion: text("app_version"),
  },
  (table) => ({
    occurredAtIdx: index("audit_events_occurred_at_idx").on(table.occurredAt),
    actorIdx: index("audit_events_actor_user_id_idx").on(table.actorUserId),
    actionIdx: index("audit_events_action_idx").on(table.action),
    entityIdx: index("audit_events_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  }),
);

export const maintenanceReminders = sqliteTable(
  "maintenance_reminders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    title: text("title").notNull(),
    dueDate: text("due_date"),
    dueMileage: integer("due_mileage"),
    notes: text("notes"),
    status: text("status", { enum: ["open", "completed", "archived"] })
      .notNull()
      .default("open"),
    completedAt: text("completed_at"),
    completedMaintenanceRecordId: integer(
      "completed_maintenance_record_id",
    ).references(() => maintenanceRecords.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    vehicleIdIdx: index("maintenance_reminders_vehicle_id_idx").on(
      table.vehicleId,
    ),
    statusIdx: index("maintenance_reminders_status_idx").on(table.status),
    dueDateIdx: index("maintenance_reminders_due_date_idx").on(table.dueDate),
    dueMileageIdx: index("maintenance_reminders_due_mileage_idx").on(
      table.dueMileage,
    ),
  }),
);

export const numberSequences = sqliteTable("number_sequences", {
  name: text("name").primaryKey(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(6),
  updatedAt: text("updated_at").notNull(),
});

export const dailyClosings = sqliteTable(
  "daily_closings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    closingDate: text("closing_date").notNull(),
    expectedCashLegacy: real("expected_cash").notNull().default(0),
    expectedCashMinor: integer("expected_cash_minor").notNull().default(0),
    countedCashLegacy: real("counted_cash").notNull().default(0),
    countedCashMinor: integer("counted_cash_minor").notNull().default(0),
    differenceLegacy: real("difference").notNull().default(0),
    differenceMinor: integer("difference_minor").notNull().default(0),
    notes: text("notes"),
    closedAt: text("closed_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    closingDateIdx: uniqueIndex("daily_closings_date_idx").on(
      table.closingDate,
    ),
  }),
);

export const customersRelations = relations(customers, ({ many }) => ({
  rentals: many(rentals),
}));

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  rentals: many(rentals),
  maintenanceRecords: many(maintenanceRecords),
  sales: many(vehicleSales),
}));

export const vehicleSalesRelations = relations(vehicleSales, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [vehicleSales.vehicleId],
    references: [vehicles.id],
  }),
}));

/**
 * The vehicles a contract ran on, in order.
 *
 * Exactly one row per contract until a vehicle is replaced mid-contract. The
 * row with a null `endDatetime` is the vehicle the customer holds now and
 * always agrees with `rentals.vehicleId`; a partial unique index enforces that
 * only one stays open. Each row keeps the rate agreed for its own days, so
 * replacing a bike with a dearer one never reprices the days already ridden.
 */
export const rentalVehicleSegments = sqliteTable(
  "rental_vehicle_segments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    sequence: integer("sequence").notNull(),
    startDatetime: text("start_datetime").notNull(),
    endDatetime: text("end_datetime"),
    dailyPriceLegacy: real("daily_price").notNull().default(0),
    dailyPriceMinor: integer("daily_price_minor").notNull().default(0),
    mileageOut: integer("mileage_out"),
    mileageIn: integer("mileage_in"),
    fuelOut: text("fuel_out"),
    fuelIn: text("fuel_in"),
    reason: text("reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    rentalIdx: index("rental_vehicle_segments_rental_id_idx").on(table.rentalId),
    vehicleIdx: index("rental_vehicle_segments_vehicle_id_idx").on(table.vehicleId),
    rentalSequenceIdx: uniqueIndex("rental_vehicle_segments_rental_sequence_idx").on(
      table.rentalId,
      table.sequence,
    ),
  }),
);

export const rentalVehicleSegmentsRelations = relations(
  rentalVehicleSegments,
  ({ one }) => ({
    rental: one(rentals, {
      fields: [rentalVehicleSegments.rentalId],
      references: [rentals.id],
    }),
    vehicle: one(vehicles, {
      fields: [rentalVehicleSegments.vehicleId],
      references: [vehicles.id],
    }),
  }),
);

export const rentalsRelations = relations(rentals, ({ one, many }) => ({
  customer: one(customers, {
    fields: [rentals.customerId],
    references: [customers.id],
  }),
  vehicle: one(vehicles, {
    fields: [rentals.vehicleId],
    references: [vehicles.id],
  }),
  salesUser: one(users, {
    fields: [rentals.salesUserId],
    references: [users.id],
  }),
  payments: many(payments),
  accessories: many(rentalAccessories),
  collateralItems: many(rentalCollateralItems),
  vehicleSegments: many(rentalVehicleSegments),
}));

export const accessoriesRelations = relations(accessories, ({ many }) => ({
  rentalAssignments: many(rentalAccessories),
}));

export const rentalAccessoriesRelations = relations(rentalAccessories, ({ one }) => ({
  rental: one(rentals, {
    fields: [rentalAccessories.rentalId],
    references: [rentals.id],
  }),
  accessory: one(accessories, {
    fields: [rentalAccessories.accessoryId],
    references: [accessories.id],
  }),
}));

export const rentalCollateralItemsRelations = relations(
  rentalCollateralItems,
  ({ one }) => ({
    rental: one(rentals, {
      fields: [rentalCollateralItems.rentalId],
      references: [rentals.id],
    }),
  }),
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  rental: one(rentals, {
    fields: [payments.rentalId],
    references: [rentals.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  locationRecord: one(moneyLocations, {
    fields: [expenses.location],
    references: [moneyLocations.key],
  }),
  vehicle: one(vehicles, {
    fields: [expenses.vehicleId],
    references: [vehicles.id],
  }),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  fromLocationRecord: one(moneyLocations, {
    fields: [cashMovements.fromLocation],
    references: [moneyLocations.key],
  }),
  toLocationRecord: one(moneyLocations, {
    fields: [cashMovements.toLocation],
    references: [moneyLocations.key],
  }),
}));

export const employeeLoansRelations = relations(employeeLoans, ({ one, many }) => ({
  employee: one(users, {
    fields: [employeeLoans.employeeUserId],
    references: [users.id],
  }),
  payments: many(employeeLoanPayments),
}));

export const employeeLoanPaymentsRelations = relations(
  employeeLoanPayments,
  ({ one }) => ({
    loan: one(employeeLoans, {
      fields: [employeeLoanPayments.loanId],
      references: [employeeLoans.id],
    }),
  }),
);

export const accountingAdjustmentsRelations = relations(
  accountingAdjustments,
  ({ one }) => ({
    locationRecord: one(moneyLocations, {
      fields: [accountingAdjustments.location],
      references: [moneyLocations.key],
    }),
  }),
);

export const maintenanceRecordsRelations = relations(
  maintenanceRecords,
  ({ one }) => ({
    vehicle: one(vehicles, {
      fields: [maintenanceRecords.vehicleId],
      references: [vehicles.id],
    }),
  }),
);

export const vehicleMileageEventsRelations = relations(
  vehicleMileageEvents,
  ({ one }) => ({
    vehicle: one(vehicles, {
      fields: [vehicleMileageEvents.vehicleId],
      references: [vehicles.id],
    }),
    rental: one(rentals, {
      fields: [vehicleMileageEvents.rentalId],
      references: [rentals.id],
    }),
    maintenanceRecord: one(maintenanceRecords, {
      fields: [vehicleMileageEvents.maintenanceRecordId],
      references: [maintenanceRecords.id],
    }),
  }),
);
