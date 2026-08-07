import type Database from "better-sqlite3";
import {
  allMoneyMirrorTriggerSql,
  backfillMoneyMinorColumns,
  moneyColumnPairs,
  moneyMinorColumnDefinition,
} from "./money-columns";
import {
  accessoriesTableSql,
  accountingAdjustmentsTableSql,
  appEventsTableSql,
  attachmentsTableSql,
  auditEventsTableSql,
  cashMovementsTableSql,
  dailyClosingsTableSql,
  employeeLoanPaymentsTableSql,
  employeeLoansTableSql,
  expensesTableSql,
  maintenanceRemindersTableSql,
  moneyLocationsTableSql,
  numberSequencesTableSql,
  rentalAccessoriesTableSql,
  rentalCollateralItemsTableSql,
  rolePermissionsTableSql,
  rolesTableSql,
  usersTableSql,
  vehicleMileageEventsTableSql,
  vehicleSalesTableSql,
} from "./table-ddl";

export type Migration = {
  version: number;
  name: string;
  up: (database: Database.Database, now: string) => void;
};

/**
 * Version 1 is the original core schema, so the registry starts at 2. Each
 * entry must be self-sufficient: it creates the tables it introduces as well as
 * altering existing ones, because an upgrade never runs the latest-schema
 * creation. That is what lets a version 1 database reach the current version
 * through migrations alone.
 */
export const migrations: Migration[] = [
  {
    version: 2,
    name: "document numbering and payment voiding",
    up: (database, now) => {
      database.exec(numberSequencesTableSql);

      // These three were previously applied unconditionally on every startup
      // through try/catch ALTERs, outside any version. They belong to the
      // earliest upgrade so a genuine version 1 database still receives them.
      addColumnIfMissing(database, "customers", "is_active", "integer not null default 1");
      addColumnIfMissing(database, "maintenance_records", "is_archived", "integer not null default 0");
      addColumnIfMissing(database, "maintenance_records", "updated_at", "text");
      database.exec(
        "update maintenance_records set updated_at = created_at where updated_at is null;",
      );

      addColumnIfMissing(database, "rentals", "cancelled_at", "text");
      addColumnIfMissing(database, "rentals", "cancel_reason", "text");

      addColumnIfMissing(database, "payments", "receipt_no", "text");
      addColumnIfMissing(database, "payments", "status", "text not null default 'posted'");
      addColumnIfMissing(database, "payments", "voided_at", "text");
      addColumnIfMissing(database, "payments", "void_reason", "text");
      addColumnIfMissing(database, "payments", "corrected_by_payment_id", "integer");
      addColumnIfMissing(database, "payments", "updated_at", `text not null default '${now}'`);
      database.exec(
        "update payments set updated_at = created_at where updated_at = '' or updated_at is null;",
      );
    },
  },
  {
    version: 3,
    name: "users, roles and audit trail",
    up: (database) => {
      database.exec(rolesTableSql);
      database.exec(rolePermissionsTableSql);
      database.exec(usersTableSql);
      database.exec(auditEventsTableSql);

      addColumnIfMissing(database, "rentals", "created_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "rentals", "activated_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "rentals", "returned_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "rentals", "cancelled_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "rentals", "last_updated_by_user_id", "integer references users(id)");

      addColumnIfMissing(database, "payments", "voided_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "payments", "created_by_user_id", "integer references users(id)");

      addColumnIfMissing(database, "maintenance_records", "created_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "maintenance_records", "completed_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "maintenance_records", "archived_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "maintenance_records", "last_updated_by_user_id", "integer references users(id)");
    },
  },
  {
    version: 4,
    name: "attachments and operational events",
    up: (database, now) => {
      database.exec(attachmentsTableSql);
      database.exec(appEventsTableSql);
      database.exec(maintenanceRemindersTableSql);
      database.exec(vehicleMileageEventsTableSql);

      addColumnIfMissing(database, "attachments", "document_type", "text not null default 'other'");
      addColumnIfMissing(database, "attachments", "title", "text");
      addColumnIfMissing(database, "attachments", "original_file_name", "text not null default ''");
      addColumnIfMissing(database, "attachments", "stored_file_name", "text not null default ''");
      addColumnIfMissing(database, "attachments", "relative_path", "text not null default ''");
      addColumnIfMissing(database, "attachments", "thumbnail_relative_path", "text");
      addColumnIfMissing(database, "attachments", "file_size", "integer not null default 0");
      addColumnIfMissing(database, "attachments", "sha256", "text not null default ''");
      addColumnIfMissing(database, "attachments", "document_number", "text");
      addColumnIfMissing(database, "attachments", "issue_date", "text");
      addColumnIfMissing(database, "attachments", "expiry_date", "text");
      addColumnIfMissing(database, "attachments", "captured_by_camera", "integer not null default 0");
      addColumnIfMissing(database, "attachments", "camera_device_label_snapshot", "text");
      addColumnIfMissing(database, "attachments", "is_primary", "integer not null default 0");
      addColumnIfMissing(database, "attachments", "created_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "attachments", "updated_at", `text not null default '${now}'`);
      addColumnIfMissing(database, "attachments", "archived_by_user_id", "integer references users(id)");
      addColumnIfMissing(database, "attachments", "archive_reason", "text");

      database.exec(`
        update attachments
        set
          document_type = case
            when document_type = '' then attachment_type
            else document_type
          end,
          original_file_name = case
            when original_file_name = '' then original_name
            else original_file_name
          end,
          stored_file_name = case
            when stored_file_name = '' then original_name
            else stored_file_name
          end,
          relative_path = case
            when relative_path = '' then 'uploads/' || stored_relative_path
            else relative_path
          end,
          file_size = case
            when file_size = 0 then size_bytes
            else file_size
          end,
          updated_at = case
            when updated_at = '' or updated_at is null then created_at
            else updated_at
          end
      `);
    },
  },
  {
    version: 5,
    name: "cash accounting",
    up: (database) => {
      database.exec(moneyLocationsTableSql);
      database.exec(expensesTableSql);
      database.exec(cashMovementsTableSql);
      database.exec(dailyClosingsTableSql);
    },
  },
  {
    version: 6,
    name: "manual accounting adjustments",
    up: (database) => {
      database.exec(accountingAdjustmentsTableSql);
    },
  },
  {
    version: 7,
    name: "vehicle documents and oil change tracking",
    up: (database) => {
      addColumnIfMissing(database, "vehicles", "technical_inspection_expiry_date", "text");
      addColumnIfMissing(database, "vehicles", "last_oil_change_date", "text");
      addColumnIfMissing(database, "vehicles", "last_oil_change_mileage", "integer");
    },
  },
  {
    version: 8,
    name: "fleet vehicle sales",
    up: (database) => {
      database.exec(vehicleSalesTableSql);
    },
  },
  {
    version: 9,
    name: "employee loans and rental accessories",
    up: (database) => {
      database.exec(employeeLoansTableSql);
      database.exec(employeeLoanPaymentsTableSql);
      database.exec(accessoriesTableSql);
      database.exec(rentalAccessoriesTableSql);
      database.exec(rentalCollateralItemsTableSql);

      addColumnIfMissing(database, "rentals", "accessory_charges", "real not null default 0");
    },
  },
  {
    version: 10,
    name: "vehicle chassis number",
    up: (database) => {
      addColumnIfMissing(database, "vehicles", "chassis_number", "text");
    },
  },
  {
    version: 11,
    name: "sales commission",
    up: (database) => {
      addColumnIfMissing(database, "users", "earns_commission", "integer not null default 1");
      addColumnIfMissing(database, "vehicles", "commission_rate_override", "real");
      addColumnIfMissing(database, "rentals", "sales_user_id", "integer references users(id)");
      addColumnIfMissing(database, "rentals", "commission_rate_per_day", "real not null default 0");
      addColumnIfMissing(database, "rentals", "commission_amount", "real not null default 0");
    },
  },
  {
    version: 12,
    name: "integer minor units for money",
    up: (database) => {
      for (const pair of moneyColumnPairs) {
        addColumnIfMissing(
          database,
          pair.table,
          pair.minorColumn,
          moneyMinorColumnDefinition(pair),
        );
      }

      // These two index the money column their queries filter and order by.
      // `create index if not exists` cannot repoint an existing index, so the
      // version 11 definitions are dropped and rebuilt by `finishSchema`.
      database.exec(`
        drop index if exists rentals_status_remaining_amount_idx;
        drop index if exists payments_status_type_rental_amount_idx;
      `);

      // Runs inside the migration's transaction: any value that cannot convert
      // rolls back the columns, the backfill and the version bump together, so
      // the file stays a valid version 11 next to its safety backup.
      backfillMoneyMinorColumns(database);

      // The guards go on in the same transaction as the backfill and the
      // version bump. A file that records version 12 has never once existed
      // without them, so there is no window where an older build could write a
      // REAL-only amount into it unnoticed. `finishSchema` re-runs the same
      // idempotent statements afterwards purely to repair a file whose triggers
      // were dropped by hand.
      database.exec(allMoneyMirrorTriggerSql);
    },
  },
];

/** The version a freshly created database is stamped with. */
export const LATEST_SCHEMA_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  1,
);

export function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const rows = database.prepare(`pragma table_info(${tableName})`).all() as Array<{
    name: string;
  }>;

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  database.exec(`alter table ${tableName} add column ${columnName} ${definition};`);
}
