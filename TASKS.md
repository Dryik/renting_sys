# Build Tasks

## Milestone 1: App Foundation

- [x] Create Electron + React + TypeScript project
- [x] Add Tailwind
- [x] Add shadcn/ui
- [x] Add SQLite
- [x] Add Drizzle
- [x] Add app layout
- [x] Add navigation
- [x] Add database initialization
- [x] Add typecheck command

## Milestone 2: Vehicles

- [x] Vehicle database schema
- [x] Vehicle list
- [x] Vehicle form
- [x] Vehicle edit
- [x] Vehicle search
- [x] Vehicle status badge

## Milestone 3: Customers

- [x] Customer database schema
- [x] Customer list
- [x] Customer form
- [x] Customer edit
- [x] Customer search

## Milestone 4: Rentals

- [x] Rental database schema
- [x] Create rental form
- [x] Only show available vehicles
- [x] Calculate rental days
- [x] Calculate total amount
- [x] Activate rental
- [x] Mark vehicle rented
- [x] Prevent two active rentals for same vehicle

## Milestone 5: Returns

- [x] Return rental form
- [x] Calculate late fees
- [x] Add damage charges
- [x] Add discount
- [x] Calculate final balance
- [x] Mark rental returned
- [x] Mark vehicle available or maintenance

## Milestone 6: Payments

- [x] Add payment form
- [x] Payment list per rental
- [x] Update paid amount
- [x] Update remaining amount
- [x] Record initial deposit payment during rental activation
- [x] Preserve payment history when rental is cancelled

## Milestone 7: Maintenance

- [x] Maintenance database schema
- [x] Maintenance list
- [x] Maintenance form
- [x] Maintenance edit
- [x] Maintenance search
- [x] Mark maintenance complete
- [x] Archive maintenance records without permanent delete
- [x] Update vehicle status for active maintenance

## Milestone 8: Dashboard and Reports

- [x] Dashboard cards
- [x] Active rentals report
- [x] Overdue rentals report
- [x] Returned rentals report
- [x] Daily payments report
- [x] Vehicle income report
- [x] Customer rental history report

## Milestone 9: PDF and Printing

- [x] Rental contract PDF
- [x] Payment receipt PDF
- [x] Print contract
- [x] Print receipt
- [x] Escape printable customer and notes text

## Milestone 10: Backup and Installer

- [x] Manual backup
- [x] Restore backup
- [x] Restore safety backup before data replacement
- [x] Restore ZIP validation and staged replacement
- [x] Windows installer
- [x] Final smoke test

## Milestone 11: ARAK Branding and Localization

- [x] Product renamed to ARAK Rental Desk
- [x] ARAK logo asset added to the app shell
- [x] Windows installer icon generated
- [x] Installer artifact renamed for ARAK Rental Desk
- [x] ARAK blue/cyan theme applied
- [x] Arabic set as the default app language
- [x] English language option retained in Settings
- [x] RTL direction applied to the app shell
- [x] Visible app screens localized through shared i18n helpers
- [x] Status, payment, vehicle, date, and currency formatting localized
- [x] About and support panel added with ARAK contact details
- [x] Rental contract print output localized for Arabic/English
- [x] Payment receipt print output localized for Arabic/English
- [x] Printable dynamic text still escaped before rendering

## Audit Remediation Verification

- [x] TypeScript typecheck
- [x] ESLint
- [x] Unit tests
- [x] Production build
- [x] Electron smoke test
- [x] Windows installer build

## Brand and Localization Verification

- [x] TypeScript typecheck
- [x] ESLint
- [x] Unit tests
- [x] Production build
- [x] Electron smoke test with temporary user data
- [x] Windows installer build
