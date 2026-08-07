-- FROZEN FIXTURE — released schema from tag v0.1.0 (schema_version 8).
-- Generated once from that tag's own initializer source and committed as-is.
-- Never regenerate this from the current migration registry: its whole purpose
-- is to be an independent record of what shipped.
-- Tables: 21

CREATE TABLE accounting_adjustments (
      id integer primary key autoincrement,
      location text not null references money_locations(key),
      direction text not null check (direction in ('increase', 'decrease')),
      amount real not null,
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

CREATE TABLE app_events (
      id integer primary key autoincrement,
      event_type text not null,
      entity_type text,
      entity_id integer,
      severity text not null default 'info' check (severity in ('info', 'warning', 'danger')),
      message text not null,
      details_json text,
      created_at text not null
    );

CREATE TABLE app_settings (
      key text primary key,
      value text not null
    );

CREATE TABLE attachments (
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

CREATE TABLE audit_events (
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

CREATE TABLE cash_movements (
      id integer primary key autoincrement,
      type text not null check (type in ('transfer', 'owner_withdrawal')),
      from_location text not null references money_locations(key),
      to_location text references money_locations(key),
      amount real not null,
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

CREATE TABLE customers (
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

CREATE TABLE daily_closings (
      id integer primary key autoincrement,
      closing_date text not null unique,
      expected_cash real not null default 0,
      counted_cash real not null default 0,
      difference real not null default 0,
      notes text,
      closed_at text not null,
      updated_at text not null
    );

CREATE TABLE expenses (
      id integer primary key autoincrement,
      category text not null check (category in ('fuel', 'wash', 'parts', 'maintenance', 'insurance', 'registration', 'office', 'other')),
      location text not null references money_locations(key),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      amount real not null,
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

CREATE TABLE maintenance_records (
      id integer primary key autoincrement,
      vehicle_id integer not null references vehicles(id),
      title text not null,
      description text,
      cost real not null default 0,
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

CREATE TABLE maintenance_reminders (
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

CREATE TABLE money_locations (
      key text primary key check (key in ('cash_drawer', 'shop_safe', 'bank')),
      name_ar text not null,
      name_en text not null,
      is_system integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

CREATE TABLE number_sequences (
      name text primary key,
      prefix text not null,
      next_number integer not null default 1,
      padding integer not null default 6,
      updated_at text not null
    );

CREATE TABLE payments (
      id integer primary key autoincrement,
      rental_id integer not null references rentals(id),
      type text not null check (type in ('rent', 'deposit', 'extra_charge', 'refund')),
      method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
      receipt_no text unique,
      status text not null default 'posted' check (status in ('posted', 'voided')),
      amount real not null,
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

CREATE TABLE rentals (
      id integer primary key autoincrement,
      contract_no text not null unique,
      customer_id integer not null references customers(id),
      vehicle_id integer not null references vehicles(id),
      status text not null default 'draft' check (status in ('draft', 'active', 'returned', 'cancelled', 'overdue')),
      start_datetime text not null,
      expected_return_datetime text not null,
      actual_return_datetime text,
      daily_price real not null,
      deposit_required real not null default 0,
      deposit_paid real not null default 0,
      mileage_out integer,
      mileage_in integer,
      fuel_out text,
      fuel_in text,
      notes_out text,
      notes_in text,
      damage_notes text,
      extra_charges real not null default 0,
      discount real not null default 0,
      total_amount real not null default 0,
      paid_amount real not null default 0,
      remaining_amount real not null default 0,
      cancelled_at text,
      cancel_reason text,
      created_by_user_id integer references users(id),
      activated_by_user_id integer references users(id),
      returned_by_user_id integer references users(id),
      cancelled_by_user_id integer references users(id),
      last_updated_by_user_id integer references users(id),
      created_at text not null,
      updated_at text not null
    );

CREATE TABLE role_permissions (
      role_key text not null references roles(key),
      permission text not null,
      primary key (role_key, permission)
    );

CREATE TABLE roles (
      key text primary key,
      name_ar text not null,
      name_en text not null,
      description_ar text not null,
      description_en text not null,
      is_system integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

CREATE TABLE users (
      id integer primary key autoincrement,
      full_name text not null,
      username text not null unique,
      password_hash text not null,
      password_algo text not null,
      role_key text not null references roles(key),
      is_active integer not null default 1,
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

CREATE TABLE vehicle_mileage_events (
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

CREATE TABLE vehicle_sales (
      id integer primary key autoincrement,
      sale_no text not null unique,
      vehicle_id integer not null references vehicles(id),
      buyer_name text not null,
      buyer_phone text,
      buyer_id_number text,
      sale_date text not null,
      sale_price real not null,
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

CREATE TABLE vehicles (
      id integer primary key autoincrement,
      type text not null check (type in ('car', 'motorcycle')),
      brand text not null,
      model text not null,
      plate_number text not null unique,
      color text,
      year integer,
      daily_price real not null,
      deposit_amount real not null default 0,
      status text not null default 'available' check (status in ('available', 'rented', 'maintenance', 'inactive')),
      mileage integer,
      insurance_expiry_date text,
      registration_expiry_date text,
      technical_inspection_expiry_date text,
      last_oil_change_date text,
      last_oil_change_mileage integer,
      notes text,
      created_at text not null,
      updated_at text not null
    );

CREATE INDEX accounting_adjustments_date_idx on accounting_adjustments(adjustment_date);

CREATE INDEX accounting_adjustments_direction_idx on accounting_adjustments(direction);

CREATE INDEX accounting_adjustments_location_idx on accounting_adjustments(location);

CREATE INDEX accounting_adjustments_status_idx on accounting_adjustments(status);

CREATE INDEX app_events_created_at_idx on app_events(created_at);

CREATE INDEX app_events_entity_idx on app_events(entity_type, entity_id);

CREATE INDEX app_events_event_type_idx on app_events(event_type);

CREATE INDEX attachments_document_idx on attachments(entity_type, entity_id, document_type);

CREATE INDEX attachments_entity_idx on attachments(entity_type, entity_id);

CREATE INDEX attachments_is_archived_idx on attachments(is_archived);

CREATE INDEX attachments_primary_idx on attachments(entity_type, entity_id, document_type, is_primary);

CREATE INDEX audit_events_action_idx on audit_events(action);

CREATE INDEX audit_events_actor_user_id_idx on audit_events(actor_user_id);

CREATE INDEX audit_events_entity_idx on audit_events(entity_type, entity_id);

CREATE INDEX audit_events_occurred_at_idx on audit_events(occurred_at);

CREATE INDEX cash_movements_date_idx on cash_movements(movement_date);

CREATE INDEX cash_movements_from_location_idx on cash_movements(from_location);

CREATE INDEX cash_movements_status_idx on cash_movements(status);

CREATE INDEX cash_movements_to_location_idx on cash_movements(to_location);

CREATE INDEX cash_movements_type_idx on cash_movements(type);

CREATE INDEX customers_driver_license_no_idx on customers(driver_license_no);

CREATE INDEX customers_full_name_idx on customers(full_name);

CREATE INDEX customers_is_active_full_name_idx on customers(is_active, full_name);

CREATE INDEX customers_is_active_idx on customers(is_active);

CREATE INDEX customers_national_id_idx on customers(national_id);

CREATE INDEX customers_phone_idx on customers(phone);

CREATE INDEX expenses_category_idx on expenses(category);

CREATE INDEX expenses_expense_date_idx on expenses(expense_date);

CREATE INDEX expenses_location_idx on expenses(location);

CREATE INDEX expenses_status_idx on expenses(status);

CREATE INDEX expenses_vehicle_id_idx on expenses(vehicle_id);

CREATE INDEX maintenance_is_archived_idx on maintenance_records(is_archived);

CREATE INDEX maintenance_reminders_due_date_idx on maintenance_reminders(due_date);

CREATE INDEX maintenance_reminders_due_mileage_idx on maintenance_reminders(due_mileage);

CREATE INDEX maintenance_reminders_status_idx on maintenance_reminders(status);

CREATE INDEX maintenance_reminders_vehicle_id_idx on maintenance_reminders(vehicle_id);

CREATE INDEX maintenance_start_date_idx on maintenance_records(start_date);

CREATE INDEX maintenance_vehicle_id_idx on maintenance_records(vehicle_id);

CREATE INDEX payments_payment_date_idx on payments(payment_date);

CREATE UNIQUE INDEX payments_receipt_no_idx on payments(receipt_no);

CREATE INDEX payments_rental_id_idx on payments(rental_id);

CREATE INDEX payments_status_idx on payments(status);

CREATE INDEX payments_status_type_rental_amount_idx on payments(status, type, rental_id, amount);

CREATE INDEX payments_status_type_rental_id_idx on payments(status, type, rental_id);

CREATE INDEX payments_type_idx on payments(type);

CREATE INDEX rentals_actual_return_datetime_idx on rentals(actual_return_datetime);

CREATE INDEX rentals_cancelled_at_idx on rentals(cancelled_at);

CREATE INDEX rentals_created_at_idx on rentals(created_at);

CREATE INDEX rentals_customer_id_idx on rentals(customer_id);

CREATE INDEX rentals_expected_return_datetime_idx on rentals(expected_return_datetime);

CREATE UNIQUE INDEX rentals_one_open_vehicle_idx
      on rentals(vehicle_id)
      where status in ('active', 'overdue');

CREATE INDEX rentals_status_actual_return_idx on rentals(status, actual_return_datetime, created_at);

CREATE INDEX rentals_status_created_at_idx on rentals(status, created_at);

CREATE INDEX rentals_status_expected_return_idx on rentals(status, expected_return_datetime);

CREATE INDEX rentals_status_idx on rentals(status);

CREATE INDEX rentals_status_remaining_amount_idx on rentals(status, remaining_amount);

CREATE INDEX rentals_vehicle_id_idx on rentals(vehicle_id);

CREATE INDEX users_is_active_idx on users(is_active);

CREATE INDEX users_role_key_idx on users(role_key);

CREATE INDEX vehicle_mileage_events_event_datetime_idx on vehicle_mileage_events(event_datetime);

CREATE INDEX vehicle_mileage_events_rental_id_idx on vehicle_mileage_events(rental_id);

CREATE INDEX vehicle_mileage_events_vehicle_id_idx on vehicle_mileage_events(vehicle_id);

CREATE INDEX vehicle_sales_buyer_name_idx on vehicle_sales(buyer_name);

CREATE UNIQUE INDEX vehicle_sales_one_posted_vehicle_idx
      on vehicle_sales(vehicle_id)
      where status = 'posted';

CREATE INDEX vehicle_sales_sale_date_idx on vehicle_sales(sale_date);

CREATE UNIQUE INDEX vehicle_sales_sale_no_idx on vehicle_sales(sale_no);

CREATE INDEX vehicle_sales_status_idx on vehicle_sales(status);

CREATE INDEX vehicle_sales_vehicle_id_idx on vehicle_sales(vehicle_id);

CREATE INDEX vehicles_status_idx on vehicles(status);

CREATE INDEX vehicles_status_plate_number_idx on vehicles(status, plate_number);

CREATE INDEX vehicles_type_idx on vehicles(type);


insert into app_settings (key, value) values ('schema_version', '8');
