# Database Design

Use SQLite with Drizzle ORM.

Keep the schema simple. Do not add extra tables unless needed by the current milestone.

## vehicles

- id
- type: car | motorcycle
- brand
- model
- plate_number
- color
- year
- daily_price
- deposit_amount
- status: available | rented | maintenance | inactive
- mileage
- insurance_expiry_date
- registration_expiry_date
- notes
- created_at
- updated_at

## customers

- id
- full_name
- phone
- secondary_phone
- national_id
- driver_license_no
- license_expiry_date
- address
- notes
- created_at
- updated_at

## rentals

- id
- contract_no
- customer_id
- vehicle_id
- status: draft | active | returned | cancelled | overdue
- start_datetime
- expected_return_datetime
- actual_return_datetime
- daily_price
- deposit_required
- deposit_paid
- mileage_out
- mileage_in
- fuel_out
- fuel_in
- notes_out
- notes_in
- damage_notes
- extra_charges
- discount
- total_amount
- paid_amount
- remaining_amount
- created_at
- updated_at

## payments

- id
- rental_id
- type: rent | deposit | extra_charge | refund
- method: cash | card | bank_transfer | other
- amount
- payment_date
- notes
- created_at

## maintenance_records

- id
- vehicle_id
- title
- description
- cost
- start_date
- end_date
- created_at

## app_settings

- key
- value
