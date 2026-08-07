/**
 * One definition per table, grouped by the schema version that introduced it.
 *
 * Both paths execute these same strings: a fresh database creates every table
 * at once, and an upgrade creates only the tables its migrations introduce.
 * Keeping a single copy is what stops the two paths from drifting apart.
 *
 * Every statement is `create table if not exists`, so re-running is harmless.
 * Column additions after a table's introduction belong in a migration, not
 * here — these definitions always describe the current shape.
 *
 * Money: every `*_minor` column is an integer count of minor units and is the
 * value the app calculates with. The REAL column next to it keeps its original
 * name and is a read-only mirror, maintained only so an older installed build
 * still reads a recognisable number. See `money-columns.ts`.
 */

// --- Version 1: the original core -----------------------------------------

export const appSettingsTableSql = `
  create table if not exists app_settings (
    key text primary key,
    value text not null
  );
`;

export const vehiclesTableSql = `
  create table if not exists vehicles (
    id integer primary key autoincrement,
    type text not null check (type in ('car', 'motorcycle')),
    brand text not null,
    model text not null,
    plate_number text not null unique,
    chassis_number text,
    color text,
    year integer,
    daily_price real not null,
    daily_price_minor integer not null default 0,
    deposit_amount real not null default 0,
    deposit_amount_minor integer not null default 0,
    status text not null default 'available' check (status in ('available', 'rented', 'maintenance', 'inactive')),
    mileage integer,
    insurance_expiry_date text,
    registration_expiry_date text,
    technical_inspection_expiry_date text,
    last_oil_change_date text,
    last_oil_change_mileage integer,
    notes text,
    commission_rate_override real,
    commission_rate_override_minor integer,
    created_at text not null,
    updated_at text not null
  );
`;

export const customersTableSql = `
  create table if not exists customers (
    id integer primary key autoincrement,
    full_name text not null,
    phone text not null,
    secondary_phone text,
    national_id text,
    driver_license_no text,
    license_expiry_date text,
    address text,
    notes text,
    is_active integer not null default 1,
    created_at text not null,
    updated_at text not null
  );
`;

export const rentalsTableSql = `
  create table if not exists rentals (
    id integer primary key autoincrement,
    contract_no text not null unique,
    customer_id integer not null references customers(id),
    vehicle_id integer not null references vehicles(id),
    status text not null default 'draft' check (status in ('draft', 'active', 'returned', 'cancelled', 'overdue')),
    start_datetime text not null,
    expected_return_datetime text not null,
    actual_return_datetime text,
    daily_price real not null,
    daily_price_minor integer not null default 0,
    deposit_required real not null default 0,
    deposit_required_minor integer not null default 0,
    deposit_paid real not null default 0,
    deposit_paid_minor integer not null default 0,
    mileage_out integer,
    mileage_in integer,
    fuel_out text,
    fuel_in text,
    notes_out text,
    notes_in text,
    damage_notes text,
    extra_charges real not null default 0,
    extra_charges_minor integer not null default 0,
    accessory_charges real not null default 0,
    accessory_charges_minor integer not null default 0,
    discount real not null default 0,
    discount_minor integer not null default 0,
    total_amount real not null default 0,
    total_amount_minor integer not null default 0,
    paid_amount real not null default 0,
    paid_amount_minor integer not null default 0,
    remaining_amount real not null default 0,
    remaining_amount_minor integer not null default 0,
    cancelled_at text,
    cancel_reason text,
    created_by_user_id integer references users(id),
    sales_user_id integer references users(id),
    commission_rate_per_day real not null default 0,
    commission_rate_per_day_minor integer not null default 0,
    commission_amount real not null default 0,
    commission_amount_minor integer not null default 0,
    activated_by_user_id integer references users(id),
    returned_by_user_id integer references users(id),
    cancelled_by_user_id integer references users(id),
    last_updated_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const paymentsTableSql = `
  create table if not exists payments (
    id integer primary key autoincrement,
    rental_id integer not null references rentals(id),
    type text not null check (type in ('rent', 'deposit', 'extra_charge', 'refund')),
    method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
    receipt_no text unique,
    status text not null default 'posted' check (status in ('posted', 'voided')),
    amount real not null,
    amount_minor integer not null default 0,
    payment_date text not null,
    notes text,
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    corrected_by_payment_id integer,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const maintenanceRecordsTableSql = `
  create table if not exists maintenance_records (
    id integer primary key autoincrement,
    vehicle_id integer not null references vehicles(id),
    title text not null,
    description text,
    cost real not null default 0,
    cost_minor integer not null default 0,
    start_date text not null,
    end_date text,
    is_archived integer not null default 0,
    created_by_user_id integer references users(id),
    completed_by_user_id integer references users(id),
    archived_by_user_id integer references users(id),
    last_updated_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

// --- Version 2: document numbering ----------------------------------------

export const numberSequencesTableSql = `
  create table if not exists number_sequences (
    name text primary key,
    prefix text not null,
    next_number integer not null default 1,
    padding integer not null default 6,
    updated_at text not null
  );
`;

// --- Version 3: users, roles and the audit trail ---------------------------

export const rolesTableSql = `
  create table if not exists roles (
    key text primary key,
    name_ar text not null,
    name_en text not null,
    description_ar text not null,
    description_en text not null,
    is_system integer not null default 1,
    created_at text not null,
    updated_at text not null
  );
`;

export const rolePermissionsTableSql = `
  create table if not exists role_permissions (
    role_key text not null references roles(key),
    permission text not null,
    primary key (role_key, permission)
  );
`;

export const usersTableSql = `
  create table if not exists users (
    id integer primary key autoincrement,
    full_name text not null,
    username text not null unique,
    password_hash text not null,
    password_algo text not null,
    role_key text not null references roles(key),
    is_active integer not null default 1,
    earns_commission integer not null default 1,
    must_change_password integer not null default 0,
    failed_login_count integer not null default 0,
    locked_until text,
    last_login_at text,
    created_at text not null,
    updated_at text not null,
    created_by_user_id integer references users(id),
    deactivated_at text,
    deactivated_by_user_id integer references users(id)
  );
`;

export const auditEventsTableSql = `
  create table if not exists audit_events (
    id integer primary key autoincrement,
    occurred_at text not null,
    actor_user_id integer references users(id),
    actor_username_snapshot text,
    actor_full_name_snapshot text,
    actor_role_key_snapshot text,
    action text not null,
    entity_type text not null,
    entity_id integer,
    entity_label text,
    summary_ar text,
    summary_en text,
    before_json text,
    after_json text,
    metadata_json text,
    reason text,
    session_id text,
    app_version text
  );
`;

// --- Version 4: attachments and operational events -------------------------

export const attachmentsTableSql = `
  create table if not exists attachments (
    id integer primary key autoincrement,
    entity_type text not null check (entity_type in ('customer', 'vehicle', 'rental', 'maintenance')),
    entity_id integer not null,
    original_name text not null,
    stored_relative_path text not null,
    mime_type text not null,
    size_bytes integer not null default 0,
    attachment_type text not null default 'other',
    document_type text not null default 'other',
    title text,
    original_file_name text not null default '',
    stored_file_name text not null default '',
    relative_path text not null default '',
    thumbnail_relative_path text,
    file_size integer not null default 0,
    sha256 text not null default '',
    document_number text,
    issue_date text,
    expiry_date text,
    notes text,
    captured_by_camera integer not null default 0,
    camera_device_label_snapshot text,
    is_primary integer not null default 0,
    is_archived integer not null default 0,
    archived_at text,
    archived_by_user_id integer references users(id),
    archive_reason text,
    created_at text not null,
    created_by_user_id integer references users(id),
    updated_at text not null
  );
`;

export const appEventsTableSql = `
  create table if not exists app_events (
    id integer primary key autoincrement,
    event_type text not null,
    entity_type text,
    entity_id integer,
    severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
    message text not null,
    details_json text,
    created_at text not null
  );
`;

export const maintenanceRemindersTableSql = `
  create table if not exists maintenance_reminders (
    id integer primary key autoincrement,
    vehicle_id integer not null references vehicles(id),
    title text not null,
    due_date text,
    due_mileage integer,
    notes text,
    status text not null default 'open' check (status in ('open', 'completed', 'archived')),
    completed_at text,
    completed_maintenance_record_id integer references maintenance_records(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const vehicleMileageEventsTableSql = `
  create table if not exists vehicle_mileage_events (
    id integer primary key autoincrement,
    vehicle_id integer not null references vehicles(id),
    rental_id integer references rentals(id),
    maintenance_record_id integer references maintenance_records(id),
    event_type text not null check (event_type in ('rental_out', 'rental_return', 'manual_adjustment', 'maintenance')),
    mileage integer not null,
    previous_mileage integer,
    event_datetime text not null,
    notes text,
    created_at text not null
  );
`;

// --- Version 5: cash accounting -------------------------------------------

export const moneyLocationsTableSql = `
  create table if not exists money_locations (
    key text primary key check (key in ('cash_drawer', 'shop_safe', 'bank')),
    name_ar text not null,
    name_en text not null,
    is_system integer not null default 1,
    created_at text not null,
    updated_at text not null
  );
`;

export const expensesTableSql = `
  create table if not exists expenses (
    id integer primary key autoincrement,
    category text not null check (category in ('fuel', 'wash', 'parts', 'maintenance', 'insurance', 'registration', 'office', 'other')),
    location text not null references money_locations(key),
    method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
    amount real not null,
    amount_minor integer not null default 0,
    expense_date text not null,
    vendor_name text,
    vehicle_id integer references vehicles(id),
    notes text,
    status text not null default 'posted' check (status in ('posted', 'voided')),
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const cashMovementsTableSql = `
  create table if not exists cash_movements (
    id integer primary key autoincrement,
    type text not null check (type in ('transfer', 'owner_withdrawal')),
    from_location text not null references money_locations(key),
    to_location text references money_locations(key),
    amount real not null,
    amount_minor integer not null default 0,
    movement_date text not null,
    notes text,
    status text not null default 'posted' check (status in ('posted', 'voided')),
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const dailyClosingsTableSql = `
  create table if not exists daily_closings (
    id integer primary key autoincrement,
    closing_date text not null unique,
    expected_cash real not null default 0,
    expected_cash_minor integer not null default 0,
    counted_cash real not null default 0,
    counted_cash_minor integer not null default 0,
    difference real not null default 0,
    difference_minor integer not null default 0,
    notes text,
    closed_at text not null,
    updated_at text not null
  );
`;

// --- Version 6: manual accounting adjustments ------------------------------

export const accountingAdjustmentsTableSql = `
  create table if not exists accounting_adjustments (
    id integer primary key autoincrement,
    location text not null references money_locations(key),
    direction text not null check (direction in ('increase', 'decrease')),
    amount real not null,
    amount_minor integer not null default 0,
    adjustment_date text not null,
    reason text not null,
    notes text,
    status text not null default 'posted' check (status in ('posted', 'voided')),
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

// --- Version 8: fleet vehicle sales ---------------------------------------

export const vehicleSalesTableSql = `
  create table if not exists vehicle_sales (
    id integer primary key autoincrement,
    sale_no text not null unique,
    vehicle_id integer not null references vehicles(id),
    buyer_name text not null,
    buyer_phone text,
    buyer_id_number text,
    sale_date text not null,
    sale_price real not null,
    sale_price_minor integer not null default 0,
    payment_method text not null check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
    status text not null default 'posted' check (status in ('posted', 'voided')),
    previous_vehicle_status text not null check (previous_vehicle_status in ('available', 'inactive')),
    notes text,
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

// --- Version 9: employee loans and rental accessories ----------------------

export const employeeLoansTableSql = `
  create table if not exists employee_loans (
    id integer primary key autoincrement,
    loan_no text not null unique,
    employee_user_id integer not null references users(id),
    amount real not null,
    amount_minor integer not null default 0,
    issued_at text not null,
    source_location text not null check (source_location in ('cash_drawer', 'shop_safe', 'bank')),
    remaining_amount real not null,
    remaining_amount_minor integer not null default 0,
    status text not null default 'open' check (status in ('open', 'paid', 'voided')),
    notes text,
    voided_at text,
    voided_by_user_id integer references users(id),
    void_reason text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const employeeLoanPaymentsTableSql = `
  create table if not exists employee_loan_payments (
    id integer primary key autoincrement,
    loan_id integer not null references employee_loans(id),
    amount real not null,
    amount_minor integer not null default 0,
    payment_date text not null,
    method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
    location text not null check (location in ('cash_drawer', 'shop_safe', 'bank')),
    status text not null default 'posted' check (status in ('posted', 'voided')),
    notes text,
    created_by_user_id integer references users(id),
    created_at text not null,
    updated_at text not null
  );
`;

export const accessoriesTableSql = `
  create table if not exists accessories (
    id integer primary key autoincrement,
    name text not null unique,
    quantity_owned integer not null default 0,
    default_charge real not null default 0,
    default_charge_minor integer not null default 0,
    is_active integer not null default 1,
    notes text,
    created_at text not null,
    updated_at text not null
  );
`;

export const rentalAccessoriesTableSql = `
  create table if not exists rental_accessories (
    id integer primary key autoincrement,
    rental_id integer not null references rentals(id),
    accessory_id integer not null references accessories(id),
    quantity integer not null,
    unit_charge real not null default 0,
    unit_charge_minor integer not null default 0,
    returned_quantity integer not null default 0,
    missing_quantity integer not null default 0,
    notes text,
    created_at text not null,
    updated_at text not null
  );
`;

export const rentalCollateralItemsTableSql = `
  create table if not exists rental_collateral_items (
    id integer primary key autoincrement,
    rental_id integer not null references rentals(id),
    type text not null check (type in ('passport', 'id_card', 'driver_license', 'cash', 'other_document', 'other_item')),
    description text not null,
    reference_number text,
    estimated_value real,
    estimated_value_minor integer,
    currency text,
    status text not null default 'held' check (status in ('held', 'returned')),
    received_at text not null,
    returned_at text,
    notes text,
    created_at text not null,
    updated_at text not null
  );
`;

/**
 * Every index, applied after tables exist on both the fresh and upgrade paths.
 * All are `if not exists`, so this is idempotent and does not need versioning.
 *
 * The partial unique index on rentals only builds against clean data, so the
 * runner checks for duplicate open rentals before calling this.
 *
 * The two money indexes target `*_minor` columns, because those are what the
 * queries filter and order by. Migration 12 drops their version 11 definitions
 * first — `if not exists` would otherwise keep an index pointing at a REAL
 * column that nothing reads.
 */
export const allIndexSql = `
  create index if not exists vehicles_status_idx on vehicles(status);
  create index if not exists vehicles_status_plate_number_idx on vehicles(status, plate_number);
  create index if not exists vehicles_type_idx on vehicles(type);

  create unique index if not exists vehicle_sales_sale_no_idx on vehicle_sales(sale_no);
  create index if not exists vehicle_sales_vehicle_id_idx on vehicle_sales(vehicle_id);
  create index if not exists vehicle_sales_sale_date_idx on vehicle_sales(sale_date);
  create index if not exists vehicle_sales_status_idx on vehicle_sales(status);
  create index if not exists vehicle_sales_buyer_name_idx on vehicle_sales(buyer_name);
  create unique index if not exists vehicle_sales_one_posted_vehicle_idx
    on vehicle_sales(vehicle_id)
    where status = 'posted';

  create index if not exists users_role_key_idx on users(role_key);
  create index if not exists users_is_active_idx on users(is_active);

  create index if not exists customers_is_active_idx on customers(is_active);
  create index if not exists customers_is_active_full_name_idx on customers(is_active, full_name);
  create index if not exists customers_full_name_idx on customers(full_name);
  create index if not exists customers_phone_idx on customers(phone);
  create index if not exists customers_national_id_idx on customers(national_id);
  create index if not exists customers_driver_license_no_idx on customers(driver_license_no);

  create index if not exists rentals_status_idx on rentals(status);
  create index if not exists rentals_created_at_idx on rentals(created_at);
  create index if not exists rentals_status_created_at_idx on rentals(status, created_at);
  create index if not exists rentals_expected_return_datetime_idx on rentals(expected_return_datetime);
  create index if not exists rentals_status_expected_return_idx on rentals(status, expected_return_datetime);
  create index if not exists rentals_actual_return_datetime_idx on rentals(actual_return_datetime);
  create index if not exists rentals_status_actual_return_idx on rentals(status, actual_return_datetime, created_at);
  create index if not exists rentals_status_remaining_amount_idx on rentals(status, remaining_amount_minor);
  create index if not exists rentals_cancelled_at_idx on rentals(cancelled_at);
  create index if not exists rentals_customer_id_idx on rentals(customer_id);
  create index if not exists rentals_vehicle_id_idx on rentals(vehicle_id);
  create unique index if not exists rentals_one_open_vehicle_idx
    on rentals(vehicle_id)
    where status in ('active', 'overdue');

  create index if not exists accessories_is_active_idx on accessories(is_active);
  create index if not exists rental_accessories_rental_id_idx on rental_accessories(rental_id);
  create index if not exists rental_accessories_accessory_id_idx on rental_accessories(accessory_id);
  create index if not exists rental_collateral_items_rental_id_idx on rental_collateral_items(rental_id);
  create index if not exists rental_collateral_items_status_idx on rental_collateral_items(status);

  create unique index if not exists payments_receipt_no_idx on payments(receipt_no);
  create index if not exists payments_payment_date_idx on payments(payment_date);
  create index if not exists payments_status_idx on payments(status);
  create index if not exists payments_type_idx on payments(type);
  create index if not exists payments_rental_id_idx on payments(rental_id);
  create index if not exists payments_status_type_rental_id_idx on payments(status, type, rental_id);
  create index if not exists payments_status_type_rental_amount_idx on payments(status, type, rental_id, amount_minor);

  create unique index if not exists employee_loans_loan_no_idx on employee_loans(loan_no);
  create index if not exists employee_loans_employee_user_id_idx on employee_loans(employee_user_id);
  create index if not exists employee_loans_status_idx on employee_loans(status);
  create index if not exists employee_loans_issued_at_idx on employee_loans(issued_at);
  create index if not exists employee_loan_payments_loan_id_idx on employee_loan_payments(loan_id);
  create index if not exists employee_loan_payments_payment_date_idx on employee_loan_payments(payment_date);
  create index if not exists employee_loan_payments_status_idx on employee_loan_payments(status);

  create index if not exists expenses_expense_date_idx on expenses(expense_date);
  create index if not exists expenses_status_idx on expenses(status);
  create index if not exists expenses_location_idx on expenses(location);
  create index if not exists expenses_category_idx on expenses(category);
  create index if not exists expenses_vehicle_id_idx on expenses(vehicle_id);

  create index if not exists cash_movements_date_idx on cash_movements(movement_date);
  create index if not exists cash_movements_status_idx on cash_movements(status);
  create index if not exists cash_movements_type_idx on cash_movements(type);
  create index if not exists cash_movements_from_location_idx on cash_movements(from_location);
  create index if not exists cash_movements_to_location_idx on cash_movements(to_location);

  create index if not exists accounting_adjustments_date_idx on accounting_adjustments(adjustment_date);
  create index if not exists accounting_adjustments_status_idx on accounting_adjustments(status);
  create index if not exists accounting_adjustments_location_idx on accounting_adjustments(location);
  create index if not exists accounting_adjustments_direction_idx on accounting_adjustments(direction);

  create index if not exists maintenance_start_date_idx on maintenance_records(start_date);
  create index if not exists maintenance_vehicle_id_idx on maintenance_records(vehicle_id);
  create index if not exists maintenance_is_archived_idx on maintenance_records(is_archived);

  create index if not exists vehicle_mileage_events_vehicle_id_idx on vehicle_mileage_events(vehicle_id);
  create index if not exists vehicle_mileage_events_rental_id_idx on vehicle_mileage_events(rental_id);
  create index if not exists vehicle_mileage_events_event_datetime_idx on vehicle_mileage_events(event_datetime);

  create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);
  create index if not exists attachments_document_idx on attachments(entity_type, entity_id, document_type);
  create index if not exists attachments_primary_idx on attachments(entity_type, entity_id, document_type, is_primary);
  create index if not exists attachments_is_archived_idx on attachments(is_archived);

  create index if not exists app_events_event_type_idx on app_events(event_type);
  create index if not exists app_events_entity_idx on app_events(entity_type, entity_id);
  create index if not exists app_events_created_at_idx on app_events(created_at);

  create index if not exists audit_events_occurred_at_idx on audit_events(occurred_at);
  create index if not exists audit_events_actor_user_id_idx on audit_events(actor_user_id);
  create index if not exists audit_events_action_idx on audit_events(action);
  create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id);

  create index if not exists maintenance_reminders_vehicle_id_idx on maintenance_reminders(vehicle_id);
  create index if not exists maintenance_reminders_status_idx on maintenance_reminders(status);
  create index if not exists maintenance_reminders_due_date_idx on maintenance_reminders(due_date);
  create index if not exists maintenance_reminders_due_mileage_idx on maintenance_reminders(due_mileage);
`;

/** Every table, in dependency order, for creating a fresh database. */
export const allTableSql = [
  appSettingsTableSql,
  rolesTableSql,
  rolePermissionsTableSql,
  usersTableSql,
  vehiclesTableSql,
  customersTableSql,
  rentalsTableSql,
  paymentsTableSql,
  maintenanceRecordsTableSql,
  numberSequencesTableSql,
  auditEventsTableSql,
  attachmentsTableSql,
  appEventsTableSql,
  maintenanceRemindersTableSql,
  vehicleMileageEventsTableSql,
  moneyLocationsTableSql,
  expensesTableSql,
  cashMovementsTableSql,
  dailyClosingsTableSql,
  accountingAdjustmentsTableSql,
  vehicleSalesTableSql,
  employeeLoansTableSql,
  employeeLoanPaymentsTableSql,
  accessoriesTableSql,
  rentalAccessoriesTableSql,
  rentalCollateralItemsTableSql,
].join("\n");
