# Project: Local Vehicle Rental Desktop App

This is a Windows desktop application for small car and motorcycle rental shops.

The users are non-technical staff. The app must be simple, local, fast, and reliable. Do not design for enterprise scale.

## Tech Stack

- Electron
- React
- TypeScript
- SQLite
- Drizzle ORM
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Electron Builder

## Product Scope

A local-only rental management app. Current release: **v0.4.0**, in front of
real shops with real customer data.

Modules that exist today, as feature folders under `src/features`:

- Dashboard, Vehicles, Customers, Rentals (returns handled inside the rental)
- Payments, Maintenance, Reports, Search, Settings, Backup and Restore
- Accounting — expenses, cash movements between money locations, adjustments,
  daily closings. Simple, single-entry.
- Accessories, commissions, employee loans, vehicle sales
- Users, roles and audit — five fixed roles with explicit permissions
- Offline licensing with read-only enforcement, and in-app updates

Some of these were forbidden by an earlier version of this file, which was never
updated as the product grew. The list above is what the code actually contains;
see `PROJECT_SCOPE.md` for detail.

Do not add:
- Cloud sync
- Online booking
- GPS tracking
- Multi-branch architecture
- Double-entry accounting, VAT/tax engine, payroll
- Complex inventory
- CRM
- Marketing tools
- Multi-tenant SaaS logic

Do not widen scope on your own. If a task seems to need one of the above, say so
and stop.

## Main Business Rules

A vehicle can have one of these statuses:
- available
- rented
- maintenance
- inactive

A rental can have one of these statuses:
- draft
- active
- returned
- cancelled
- overdue

A vehicle cannot be rented if its status is not available.

A vehicle cannot have two active rentals at the same time.

When a rental becomes active, the vehicle status becomes rented.

When a rental is returned, the vehicle status becomes available unless the user marks it for maintenance.

Cancelled rentals should not count as active.

Overdue means an active rental where expected return datetime is before now.

### Counting days

These two are deliberately different. Do not "fix" one to match the other.

- **A rental day is a 24-hour period, and any part of one is charged in full.**
  Collected at 09:00 Monday and returned at 10:00 Wednesday is three days, not
  two. This is `calculateRentalDays`, and it is the standard vehicle-rental
  convention.
- **A late day is a calendar day.** This is `calculateLateDays`.

Counting rental days by calendar date instead drops a day from every contract
whose return time of day is later than its pickup time of day — the ordinary
shape of a rental — and silently reprices contracts that have already been
signed and printed, because the total is recalculated whenever a rental is
edited, extended or returned. It was changed to calendar dates once and
reverted for exactly that reason.

Tests that need an exact span must anchor both ends to one timestamp; see
`rentalWindow` in `electron/db/database-test-harness.ts`. A fixture built from
two separate `Date.now()` calls is "N days and a few milliseconds", which a
whole-day rate correctly bills as N+1. Fix the fixture, never the rounding.

Payments must be simple:
- rent
- deposit
- extra_charge
- refund

Do not build double-entry accounting.

## UX Rules

The app is for small shops and non-technical staff.

Every screen must be simple.
Use large buttons.
Use clear labels.
Avoid hidden workflows.
Avoid complicated filters.
Avoid excessive settings.
Avoid enterprise-style dashboards.

Important actions must have confirmation dialogs:
- deleting records
- cancelling rental
- restoring backup
- marking vehicle returned

Search must be available for:
- vehicles by plate number, brand, model
- customers by name, phone, ID number
- rentals by contract number, customer name, plate number

Use simple labels like:
- New Rental
- Return Vehicle
- Record Payment
- Print Contract
- Print Receipt
- Mark Maintenance

Avoid enterprise labels like:
- Transaction Lifecycle
- Fleet Utilization
- Contract Settlement
- Revenue Recognition
- Asset Management

## Data Safety Rules

Never delete important business records permanently by default.
Prefer soft delete or inactive status.

Backup and restore are mandatory before client delivery.

The SQLite database must live in the Electron app data directory using app.getPath("userData").

Uploaded files must be stored locally under the Electron app data directory.

Never store production customer data, vehicle data, contracts, or uploaded files inside the project directory.

## Coding Rules

Use TypeScript strictly.
Avoid `any` unless there is a clear reason.
Use Zod for form validation.
Use Drizzle for database schema and queries.
Keep database logic out of React components.
Keep business calculations in pure functions.
Write reusable components for forms, tables, status badges, and dialogs.
Do not change unrelated files.
Do not refactor working modules unless required.
Do not add features outside the active task.
Do not introduce new dependencies without explaining why.

## Testing Rules

Do not overbuild tests.

Write unit tests for business logic only:
- rental day calculation
- late fee calculation
- payment balance calculation
- vehicle availability rule
- return workflow status changes
- backup/restore core logic if practical

Do not add complex UI tests or E2E tests in the first version unless explicitly requested.

## Verification

After every change:
- run typecheck
- run lint if available
- run tests if available
- manually verify the changed workflow

A task is not complete unless:
- the app starts successfully
- the changed screen works
- no TypeScript errors remain
- no obvious broken UI remains

## Architecture and Invariants (v0.4.0)

React feature screens → the typed API in `src/data/rental-app-api.ts` →
sandboxed preload/IPC → permission-guarded services in `electron/db/*.service.ts`
→ Drizzle/SQLite. Business rules and Zod schemas live in `src/shared`.

**The renderer's only backend gateway is `src/data/rental-app-api.ts`.** React
components must never touch SQLite or `ipcRenderer` directly.

**Money is stored as integer minor units.** Every monetary column is a pair: the
original `REAL` column and an integer `_minor` column beside it — 29 pairs and
58 database triggers, both asserted by tests. Conversion is half away from zero
(`src/shared/money.ts`). Migration 12 deliberately leaves historical `REAL`
values alone, so `legacy === minor / 100` is **false** for old rows and must
never be asserted. Details in `DATABASE_DESIGN.md`.

**Migrations write a verified safety backup first** and refuse to run if it
cannot be written. Schema version is 12.

**The audit log is append-only.** Rows may be added; existing rows must survive
every upgrade.

## Before Trusting a Test, Make It Fail

At v0.4.0 three separate checks were found reporting success while asserting
nothing: queries naming columns that do not exist and comparing an error against
the identical error, version checks reading a field the IPC bridge does not
return, and a `select *` that read a migration's own new columns as drift.

A green check is not evidence. Break the thing on purpose, watch the guard fail,
then fix it. If a guard cannot be made to fail, it is not a guard.

## Upgrade Rehearsal

`.github/workflows/upgrade-rehearsal.yml` installs the previous release, seeds it
through its own IPC bridge, upgrades it, and compares every row, monetary total
and uploaded file across the boundary.

Two things will trip you up:

1. **The `updater` job fails on purpose**, for the reason documented in
   `TASKS.md`. It is a limitation of the rehearsal's feed redirection, not a
   defect in the application. Do not make CI green by weakening the rehearsal or
   changing product code.
2. **The seed runs against the previous release**, so every literal it sends must
   satisfy *that* release's Zod schemas, not `main`'s. It reports only its first
   bad step, so each mismatch costs a full run to find. Check
   `git show v0.3.9:src/shared/<area>.ts` before editing
   `scripts/upgrade-rehearsal/seed.mjs`, and add a fast unit-test guard.

On hosted Windows the unit suite runs with `--maxWorkers=1`; real SQLite
migrations and verified ZIP backups contend badly in parallel and fail on the
clock with no assertion failure behind them.

## Release & Auto-Updater Rules

When creating a new application release:

1. **Artifact Naming**: `package.json` MUST use hyphenated `artifactName` (`ARAK-Rental-Desk-Setup-${version}.${ext}`). Do NOT use spaces in `artifactName`. Spaces cause GitHub CLI to sanitize asset filenames differently than `latest.yml`, which breaks `electron-updater` with HTTP 404 errors (`is the repository private or release draft?`).
2. **Release Assets**: Every GitHub Release MUST publish 3 exact matching assets:
   - `ARAK-Rental-Desk-Setup-${version}.exe`
   - `ARAK-Rental-Desk-Setup-${version}.exe.blockmap`
   - `latest.yml`
3. **Verification**: Always verify asset filenames on GitHub (`gh release view v${version}`) match the `url` and `path` entries in `latest.yml` character-for-character before declaring a release finished. Also confirm the SHA-512 and size in `latest.yml` match the built `.exe`.
4. **Releases are built and published locally.** There is no release workflow; the upgrade rehearsal never publishes and never tags.
5. **`npm run dist` deletes the whole `release/` directory.** Copy out anything you need from there first.
6. **Known local build failure**: `electron-builder` aborts while extracting its `winCodeSign` cache, because two macOS `.dylib` symlinks need a privilege Windows withholds (`A required privilege is not held by the client`). The tools do extract; only the final rename is skipped. Copy the extracted directory to `…/AppData/Local/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0` and rebuild.
