---
name: rental-business-rules
description: Use when implementing rental contracts, vehicle returns, payments, status changes, availability, late fees, deposits, and rental calculations.
---

# Rental Business Rules Skill

The system is for simple car and motorcycle rental shops.

Rules:
- A vehicle can only be rented if status is available.
- Activating a rental changes vehicle status to rented.
- Returning a rental changes rental status to returned.
- Returning a rental changes vehicle status to available unless the user marks it maintenance.
- Cancelled rentals should not count as active.
- Overdue means active rental where expected return datetime is before now.
- Do not allow two active rentals for the same vehicle.
- Payments are simple records, not accounting journal entries.
- Paid amount equals sum of positive payments except refunds.
- Remaining amount equals total amount minus paid amount.
- Deposit refund should be recorded as refund payment type.
- Do not delete completed rentals.

Calculation rules:
- Rental days should be at least 1.
- If return is late, calculate late days according to settings.
- Extra charges are added to total.
- Discount is subtracted from total.
- Remaining balance must be shown with clear labels.

When implementing, put calculations in pure utility functions with tests.
