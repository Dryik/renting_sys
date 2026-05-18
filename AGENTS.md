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

Build a local-only rental management app.

Allowed modules:
- Dashboard
- Vehicles
- Customers
- Rentals
- Returns inside rental workflow
- Payments
- Maintenance
- Reports
- Settings
- Backup and Restore

Do not add:
- Cloud sync
- Online booking
- GPS tracking
- Multi-branch architecture
- Advanced accounting
- Complex inventory
- CRM
- Marketing tools
- Enterprise permissions
- Multi-tenant SaaS logic

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
