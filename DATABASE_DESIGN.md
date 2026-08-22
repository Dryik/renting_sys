# Database Design

SQLite through Drizzle ORM, in the Electron `userData` directory. WAL mode,
foreign keys on. **Schema version 13**; 12 was the last version shipped in
v0.4.0.

> An earlier version of this document listed six tables for a much smaller
> product. There are 27 today. It was rewritten at v0.4.0. The authoritative
> definition is [`electron/db/schema.ts`](electron/db/schema.ts); if this file
> disagrees with it, the schema wins.

## Where the truth lives

| Thing | File |
| --- | --- |
| Table definitions | `electron/db/schema.ts` |
| Migration ladder | `electron/db/migrations.ts` |
| Migration runner | `electron/db/migration-runner.ts` |
| Money column registry | `electron/db/money-columns.ts` |
| Per-domain queries | `electron/db/*.service.ts` (23 of them) |

## Tables

**Rental core** — `vehicles`, `customers`, `rentals`, `payments`,
`rental_accessories`, `rental_collateral_items`, `rental_vehicle_segments`,
`accessories`

**Fleet upkeep** — `maintenance_records`, `maintenance_reminders`,
`vehicle_mileage_events`, `vehicle_sales`

**Money** — `expenses`, `cash_movements`, `accounting_adjustments`,
`daily_closings`, `money_locations`, `employee_loans`,
`employee_loan_payments`

**People and safety** — `users`, `roles`, `role_permissions`, `audit_events`,
`app_events`

**Plumbing** — `app_settings`, `attachments`, `number_sequences`

## Money is stored as integer minor units

This is the single most important invariant in the database, and the easiest to
break by accident.

Every monetary column exists as a **pair**: the original `REAL` column and an
integer `_minor` column beside it. There are **30 pairs** and **60 triggers**
(an insert and an update check for each), and both counts are asserted by the
test suite and by the upgrade rehearsal.

Each pair records the schema version that introduced it. Migration 12 converted
everything that existed then and must keep converting exactly that set — it
cannot add a column to a table version 13 introduces — so it asks
`moneyColumnPairsUpTo(12)` rather than reading the registry as it stands today.

Rules:

- The integer column is the source of truth. Compute with it.
- Conversion is **half away from zero** — see `src/shared/money.ts`.
- Migration 12 deliberately **leaves historical `REAL` values alone**. A row
  stored as `100.005` keeps `100.005` while its minor becomes `10001`.
  Therefore `legacy === minor / 100` is **false** for historical rows and must
  never be asserted; dividing back gives `100.01`.
- The triggers reject any mirror that disagrees with its value, so a write that
  updates one side without the other fails loudly.

Adding a money column means adding it to the registry in
`electron/db/money-columns.ts`, which is what generates the triggers and what
the tests count.

## Migrations

An ordered registry, not a folder of loose files. Each entry has a version and
runs inside a transaction.

Before any migration runs, the runner writes a **verified safety backup** and
refuses to migrate if that backup cannot be written or verified. A failing
migration rolls back without recording its version. The database refuses to open
if its version is newer than the application understands.

## Data safety rules

- Never permanently delete business records by default — prefer a `voided`
  status or an inactive flag.
- The database and all uploads live under `app.getPath("userData")`. Never
  inside the project directory.
- The audit log is append-only. Rows may be added; existing rows must survive
  every upgrade.
