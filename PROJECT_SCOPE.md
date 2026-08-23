# Product Scope

Current release: **v0.4.3**.

This app is for small car and motorcycle rental shops running one Windows
desktop or laptop. It is local-only: no cloud, no server, no account to sign up
for. The users are non-technical shop staff.

> This file describes what the application **is today**. An earlier version of
> this document described a much smaller "Version 1" that the product has long
> since outgrown; it was rewritten at v0.4.0. Where this file and the code
> disagree, the code wins — and please fix this file.

## What ships today

The renderer is organised as feature modules under `src/features`, one per area
below.

### Core rental workflow

- **Vehicles** — cars and motorcycles, daily price, deposit, plate, mileage,
  status, insurance/registration/inspection expiry, uploaded documents and
  photos, per-vehicle commission override.
- **Customers** — name, phones, ID or passport, driver licence and expiry,
  address, uploaded documents and photos.
- **Rentals** — draft, active, returned, cancelled and overdue contracts;
  mileage and fuel out/in, deposits, extra charges, discounts, collateral items
  with or without a stated value, and printable contracts.
- **Returns** — handled inside the rental, not as a separate screen.
- **Payments** — rent, deposit, extra charge and refund, by cash, card, bank
  transfer or other, with receipts and voiding.
- **Maintenance** — records and reminders, plus vehicle mileage history.

### Added since the original v1 scope

- **Accounting** — expenses, cash movements between money locations
  (cash drawer, shop safe, bank), owner withdrawals, adjustments and daily
  closings. Deliberately *not* double-entry.
- **Accessories** — rentable extras attached to a contract.
- **Commissions** — per-day rate and amount recorded on a rental, with a
  salesperson.
- **Employee loans** — issue and repay, tracked against a user.
- **Vehicle sales** — sell a vehicle out of the fleet and keep the history.
- **Users, roles and audit** — five fixed roles (`owner_admin`, `manager`,
  `staff`, `accountant`, `viewer`) with explicit permissions, and an
  append-only audit log of who did what.
- **Reports** and **global search** across vehicles, customers and rentals.
- **Backup and restore** — automatic scheduled backups and manual ones, as
  verified ZIP archives; restore is atomic and fails closed.
- **Offline licensing** — request/apply flow with read-only enforcement when a
  licence is missing or expired.
- **Updates** — in-app update check and install against the GitHub release.
- **Arabic and English**, right-to-left by default, with dark mode.

## Still excluded

These remain out of scope. Do not add them without an explicit task.

- Online booking, cloud sync, multi-branch, multi-tenant SaaS
- GPS tracking
- Automatic SMS/WhatsApp
- Double-entry accounting, VAT/tax engine, payroll
- CRM and marketing tools
- Mobile app
- Complex inventory

## Product rule

If a feature does not help the shop answer *"who has which vehicle, when is it
due, and how much money is owed?"*, postpone it.

The corollary at this size: prefer making an existing screen clearer over adding
a new one.
