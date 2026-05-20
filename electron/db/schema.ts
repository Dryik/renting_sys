import { relations } from "drizzle-orm";
import {
  integer,
  index,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["car", "motorcycle"] }).notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    plateNumber: text("plate_number").notNull(),
    color: text("color"),
    year: integer("year"),
    dailyPrice: real("daily_price").notNull(),
    depositAmount: real("deposit_amount").notNull().default(0),
    status: text("status", {
      enum: ["available", "rented", "maintenance", "inactive"],
    })
      .notNull()
      .default("available"),
    mileage: integer("mileage"),
    insuranceExpiryDate: text("insurance_expiry_date"),
    registrationExpiryDate: text("registration_expiry_date"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    plateNumberIdx: uniqueIndex("vehicles_plate_number_idx").on(
      table.plateNumber,
    ),
    statusIdx: index("vehicles_status_idx").on(table.status),
    typeIdx: index("vehicles_type_idx").on(table.type),
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
    fullNameIdx: index("customers_full_name_idx").on(table.fullName),
    phoneIdx: index("customers_phone_idx").on(table.phone),
    nationalIdIdx: index("customers_national_id_idx").on(table.nationalId),
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
    dailyPrice: real("daily_price").notNull(),
    depositRequired: real("deposit_required").notNull().default(0),
    depositPaid: real("deposit_paid").notNull().default(0),
    mileageOut: integer("mileage_out"),
    mileageIn: integer("mileage_in"),
    fuelOut: text("fuel_out"),
    fuelIn: text("fuel_in"),
    notesOut: text("notes_out"),
    notesIn: text("notes_in"),
    damageNotes: text("damage_notes"),
    extraCharges: real("extra_charges").notNull().default(0),
    discount: real("discount").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    remainingAmount: real("remaining_amount").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    contractNoIdx: uniqueIndex("rentals_contract_no_idx").on(table.contractNo),
    statusIdx: index("rentals_status_idx").on(table.status),
    createdAtIdx: index("rentals_created_at_idx").on(table.createdAt),
    expectedReturnIdx: index("rentals_expected_return_datetime_idx").on(
      table.expectedReturnDatetime,
    ),
    actualReturnIdx: index("rentals_actual_return_datetime_idx").on(
      table.actualReturnDatetime,
    ),
    customerIdIdx: index("rentals_customer_id_idx").on(table.customerId),
    vehicleIdIdx: index("rentals_vehicle_id_idx").on(table.vehicleId),
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
    amount: real("amount").notNull(),
    paymentDate: text("payment_date").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    paymentDateIdx: index("payments_payment_date_idx").on(table.paymentDate),
    typeIdx: index("payments_type_idx").on(table.type),
    rentalIdIdx: index("payments_rental_id_idx").on(table.rentalId),
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
    cost: real("cost").notNull().default(0),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
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

export const customersRelations = relations(customers, ({ many }) => ({
  rentals: many(rentals),
}));

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  rentals: many(rentals),
  maintenanceRecords: many(maintenanceRecords),
}));

export const rentalsRelations = relations(rentals, ({ one, many }) => ({
  customer: one(customers, {
    fields: [rentals.customerId],
    references: [customers.id],
  }),
  vehicle: one(vehicles, {
    fields: [rentals.vehicleId],
    references: [vehicles.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  rental: one(rentals, {
    fields: [payments.rentalId],
    references: [rentals.id],
  }),
}));

export const maintenanceRecordsRelations = relations(
  maintenanceRecords,
  ({ one }) => ({
    vehicle: one(vehicles, {
      fields: [maintenanceRecords.vehicleId],
      references: [vehicles.id],
    }),
  }),
);
