import type Database from "better-sqlite3";
import {
  roleDescriptions,
  roleLabels,
  rolePermissionMap,
  type RoleKey,
} from "../../src/shared/auth";

/**
 * Idempotent reference data, re-applied on every startup rather than pinned to
 * a schema version. Role permissions in particular are defined in code, so an
 * app upgrade that changes rolePermissionMap must re-sync them even when the
 * schema itself has not moved.
 */
export function runIdempotentSeeds(database: Database.Database, now: string): void {
  seedSystemRoles(database, now);
  seedNumberSequences(database, now);
  seedMoneyLocations(database, now);
}

export function seedNumberSequences(database: Database.Database, now: string): void {
  const sequences = [
    { name: "contract", prefix: "CNT", nextNumber: 1, padding: 6 },
    { name: "receipt", prefix: "RCP", nextNumber: 1, padding: 6 },
    { name: "vehicle_sale", prefix: "SALE", nextNumber: 1, padding: 6 },
    { name: "employee_loan", prefix: "LOAN", nextNumber: 1, padding: 6 },
  ];

  for (const sequence of sequences) {
    database
      .prepare(
        `insert into number_sequences (name, prefix, next_number, padding, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(name) do nothing`,
      )
      .run(
        sequence.name,
        sequence.prefix,
        sequence.nextNumber,
        sequence.padding,
        now,
      );
  }

  database
    .prepare(
      `update number_sequences set prefix = 'CNT' where name = 'contract' and prefix = 'ARAK'`,
    )
    .run();
}

export function seedMoneyLocations(database: Database.Database, now: string): void {
  const locations = [
    { key: "cash_drawer", nameAr: "درج النقد", nameEn: "Cash Drawer" },
    { key: "shop_safe", nameAr: "خزنة المحل", nameEn: "Shop Safe" },
    { key: "bank", nameAr: "البنك", nameEn: "Bank" },
  ];

  for (const location of locations) {
    database
      .prepare(
        `insert into money_locations (
          key,
          name_ar,
          name_en,
          is_system,
          created_at,
          updated_at
        )
        values (?, ?, ?, 1, ?, ?)
        on conflict(key) do update set
          name_ar = excluded.name_ar,
          name_en = excluded.name_en,
          is_system = 1,
          updated_at = excluded.updated_at`,
      )
      .run(location.key, location.nameAr, location.nameEn, now, now);
  }
}

export function seedSystemRoles(database: Database.Database, now: string): void {
  const roleKeys = Object.keys(rolePermissionMap) as RoleKey[];

  for (const roleKey of roleKeys) {
    database
      .prepare(
        `insert into roles (
          key,
          name_ar,
          name_en,
          description_ar,
          description_en,
          is_system,
          created_at,
          updated_at
        )
        values (?, ?, ?, ?, ?, 1, ?, ?)
        on conflict(key) do update set
          name_ar = excluded.name_ar,
          name_en = excluded.name_en,
          description_ar = excluded.description_ar,
          description_en = excluded.description_en,
          is_system = 1,
          updated_at = excluded.updated_at`,
      )
      .run(
        roleKey,
        roleLabels[roleKey].ar,
        roleLabels[roleKey].en,
        roleDescriptions[roleKey].ar,
        roleDescriptions[roleKey].en,
        now,
        now,
      );

    database.prepare("delete from role_permissions where role_key = ?").run(roleKey);

    for (const permission of rolePermissionMap[roleKey]) {
      database
        .prepare(
          `insert into role_permissions (role_key, permission)
           values (?, ?)
           on conflict(role_key, permission) do nothing`,
        )
        .run(roleKey, permission);
    }
  }
}
