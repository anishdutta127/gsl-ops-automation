-- Phase 7 Part 2: initial Postgres schema for the gsl-ops-automation data layer.
--
-- Run this against a fresh Neon branch (the staging branch first; the main branch only at cutover).
-- All statements are idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
--
-- Foreign-key cycles (communications <-> magic_link_tokens, mous <-> school_groups,
-- dispatches <-> dispatch_requests) are resolved by adding the second-direction FK
-- in a follow-up ALTER TABLE at the bottom of this file, after both tables exist.
--
-- Apply as a single transaction so a partial schema does not land:
--   BEGIN; \i 001-init.sql; COMMIT;
--
-- Schema design + decisions documented in PHASE_7_MIGRATION_PLAN.md.

BEGIN;

-- ============================================================================
-- 1. Identity & access
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Admin','SalesHead','SalesRep','OpsHead','OpsEmployee','TrainerHead','Finance','Leadership')),
  department TEXT NULL CHECK (department IN ('sales','ops','finance') OR department IS NULL),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT NULL,
  testing_override BOOLEAN NOT NULL DEFAULT FALSE,
  testing_override_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  azure_ad_object_id TEXT NULL UNIQUE,
  requires_admin_review BOOLEAN NOT NULL DEFAULT FALSE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_active_role_idx ON users (active, role);
CREATE INDEX IF NOT EXISTS users_azure_ad_object_id_idx ON users (azure_ad_object_id) WHERE azure_ad_object_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  territories TEXT[] NOT NULL DEFAULT '{}',
  programmes TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_date DATE NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ============================================================================
-- 2. Core domain
-- ============================================================================

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_entity TEXT NULL,
  city TEXT NULL,
  state TEXT NULL,
  region TEXT NULL,
  pin_code TEXT NULL,
  contact_person TEXT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  billing_name TEXT NULL,
  pan TEXT NULL,
  gst_number TEXT NULL,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS schools_active_region_idx ON schools (active, region);
CREATE INDEX IF NOT EXISTS schools_gst_number_idx ON schools (gst_number) WHERE gst_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS school_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NULL,
  member_school_ids TEXT[] NOT NULL DEFAULT '{}',
  group_mou_id TEXT NULL,
  notes TEXT NULL,
  primary_contact TEXT NULL,
  primary_email TEXT NULL,
  primary_phone TEXT NULL,
  gst_number TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS school_spocs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  designation TEXT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  role TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_sheet TEXT NULL,
  source_row INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS school_spocs_school_id_idx ON school_spocs (school_id, active);

CREATE TABLE IF NOT EXISTS mous (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  school_name TEXT NOT NULL,
  programme TEXT NOT NULL CHECK (programme IN ('STEAM','Young Pioneers','Harvard HBPE','Robotics')),
  programme_sub_type TEXT NULL,
  school_scope TEXT NOT NULL CHECK (school_scope IN ('SINGLE','GROUP')),
  school_group_id TEXT NULL REFERENCES school_groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('Draft','Pending Signature','Active','Completed','Expired','Renewed')),
  cohort_status TEXT NOT NULL CHECK (cohort_status IN ('active','archived')) DEFAULT 'active',
  academic_year TEXT NULL,
  effective_date DATE NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  number_of_years INTEGER NULL,
  students_mou INTEGER NULL,
  students_actual INTEGER NULL,
  students_variance INTEGER NULL,
  students_variance_pct NUMERIC(8,4) NULL,
  sp_without_tax NUMERIC(14,2) NULL,
  sp_with_tax NUMERIC(14,2) NULL,
  contract_value NUMERIC(14,2) NULL,
  received NUMERIC(14,2) NULL,
  tds NUMERIC(14,2) NULL,
  balance NUMERIC(14,2) NULL,
  received_pct NUMERIC(8,4) NULL,
  trainer_model TEXT NULL,
  sales_person_id TEXT NULL REFERENCES sales_team(id) ON DELETE RESTRICT,
  template_version TEXT NULL,
  generated_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  delay_notes TEXT NULL,
  days_to_expiry INTEGER NULL,
  sales_channel TEXT NULL,
  school_crm_id TEXT NULL,
  signed_mou_pdf_path TEXT NULL,
  import_notes TEXT NULL,
  product_selection TEXT NULL CHECK (product_selection IN ('TinkRworks','Cretile','Both') OR product_selection IS NULL),
  payment_schedule JSONB NULL,
  payment_schedules JSONB NULL,
  yearly_pricing JSONB NULL,
  billing_block JSONB NULL,
  draft_variables JSONB NULL,
  dispatch_override JSONB NULL,
  gradewise_distribution JSONB NULL,
  student_count_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS mous_school_id_idx ON mous (school_id);
CREATE INDEX IF NOT EXISTS mous_cohort_status_idx ON mous (cohort_status, status);
CREATE INDEX IF NOT EXISTS mous_sales_person_id_idx ON mous (sales_person_id);
CREATE INDEX IF NOT EXISTS mous_programme_idx ON mous (programme);

-- Deferred FK: school_groups.group_mou_id -> mous(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'school_groups_group_mou_id_fk'
  ) THEN
    ALTER TABLE school_groups
      ADD CONSTRAINT school_groups_group_mou_id_fk
      FOREIGN KEY (group_mou_id) REFERENCES mous(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  school_name TEXT NOT NULL,
  programme TEXT NOT NULL,
  instalment_label TEXT NOT NULL,
  instalment_seq INTEGER NOT NULL,
  total_instalments INTEGER NOT NULL,
  description TEXT NULL,
  due_date_raw TEXT NULL,
  due_date_iso DATE NULL,
  expected_amount NUMERIC(14,2) NOT NULL,
  received_amount NUMERIC(14,2) NULL,
  received_date DATE NULL,
  payment_mode TEXT NULL,
  bank_reference TEXT NULL,
  pi_number TEXT NULL,
  tax_invoice_number TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending','Due Soon','Overdue','PI Sent','Received','Paid','Partial','Cancelled','Skipped')),
  notes TEXT NULL,
  pi_sent_date DATE NULL,
  pi_sent_to TEXT NULL,
  pi_generated_at TIMESTAMPTZ NULL,
  pi_voided_at TIMESTAMPTZ NULL,
  pi_void_reason TEXT NULL,
  student_count_actual INTEGER NULL,
  partial_payments JSONB NOT NULL DEFAULT '[]'::jsonb,
  bank_amount NUMERIC(14,2) NULL,
  tds_amount NUMERIC(14,2) NULL,
  tds_certificate_ref TEXT NULL,
  tds_rate NUMERIC(8,4) NULL,
  percent_share NUMERIC(8,4) NULL,
  nominal_amount NUMERIC(14,2) NULL,
  adjustment_from_locked_installments NUMERIC(14,2) NULL,
  net_due NUMERIC(14,2) NULL,
  locked_at TIMESTAMPTZ NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS payments_mou_id_idx ON payments (mou_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_due_date_idx ON payments (due_date_iso) WHERE due_date_iso IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_pi_number_idx ON payments (pi_number) WHERE pi_number IS NOT NULL;

-- ============================================================================
-- 3. Dispatch + intake + inventory
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  sku_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Cretile','TinkRworks','Hardware','Other')),
  cretile_grade INTEGER NULL,
  mastersheet_source_name TEXT NULL,
  current_stock INTEGER NOT NULL DEFAULT 0,
  reorder_threshold INTEGER NULL,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_updated_at TIMESTAMPTZ NULL,
  last_updated_by TEXT NULL,
  import_notes TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS inventory_items_active_category_idx ON inventory_items (active, category);

CREATE TABLE IF NOT EXISTS dispatch_requests (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL,
  request_reason TEXT NULL,
  instalment_seq INTEGER NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('pending-approval','approved','rejected','cancelled')),
  conversion_dispatch_id TEXT NULL,
  rejection_reason TEXT NULL,
  reviewed_by TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS dispatches (
  id TEXT PRIMARY KEY,
  mou_id TEXT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  instalment_seq INTEGER NULL,
  stage TEXT NOT NULL,
  installment1_paid BOOLEAN NULL,
  override_event JSONB NULL,
  po_raised_at TIMESTAMPTZ NULL,
  dispatched_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledgement_url TEXT NULL,
  notes TEXT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_id TEXT NULL REFERENCES dispatch_requests(id) ON DELETE RESTRICT,
  raised_by TEXT NULL,
  raised_from TEXT NULL CHECK (raised_from IN ('sales-request','ops-direct','pre-w4d') OR raised_from IS NULL),
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS dispatches_mou_id_idx ON dispatches (mou_id);
CREATE INDEX IF NOT EXISTS dispatches_stage_idx ON dispatches (stage);

-- Back-FK so a dispatch_request can point at its conversion dispatch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'dispatch_requests_conversion_dispatch_id_fk'
  ) THEN
    ALTER TABLE dispatch_requests
      ADD CONSTRAINT dispatch_requests_conversion_dispatch_id_fk
      FOREIGN KEY (conversion_dispatch_id) REFERENCES dispatches(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kit_dispatches (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL UNIQUE REFERENCES mous(id) ON DELETE RESTRICT,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  school_name TEXT NOT NULL,
  product_selected TEXT NULL,
  dispatch_status TEXT NOT NULL,
  allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  sales_approval_status TEXT NULL CHECK (sales_approval_status IN ('Pending','Approved','Rejected') OR sales_approval_status IS NULL),
  sales_approved_by TEXT NULL,
  sales_approved_at TIMESTAMPTZ NULL,
  sales_rejection_reason TEXT NULL,
  dispatch_summary JSONB NULL,
  shipment_tracking JSONB NULL,
  pod JSONB NULL,
  import_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS kit_dispatches_status_idx ON kit_dispatches (dispatch_status);

CREATE TABLE IF NOT EXISTS intake_records (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ NOT NULL,
  completed_by TEXT NULL,
  sales_owner_id TEXT NULL REFERENCES sales_team(id) ON DELETE RESTRICT,
  location TEXT NULL,
  grades JSONB NULL,
  recipient_name TEXT NULL,
  recipient_designation TEXT NULL,
  recipient_email TEXT NULL,
  students_at_intake INTEGER NULL,
  duration_years INTEGER NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  physical_submission_status TEXT NULL,
  soft_copy_submission_status TEXT NULL,
  product_confirmed TEXT NULL,
  gsl_training_mode TEXT NULL,
  school_point_of_contact_name TEXT NULL,
  school_point_of_contact_phone TEXT NULL,
  signed_mou_url TEXT NULL,
  thank_you_email_sent_at TIMESTAMPTZ NULL,
  grade_breakdown JSONB NULL,
  rechargeable_batteries INTEGER NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS intake_records_mou_id_idx ON intake_records (mou_id);

-- ============================================================================
-- 4. Communications, escalations, feedback
-- ============================================================================

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('feedback-submit','status-view')),
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  instalment_seq INTEGER NULL,
  spoc_email TEXT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  used_by_ip TEXT NULL,
  last_viewed_at TIMESTAMPTZ NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  communication_id TEXT NULL
);

CREATE TABLE IF NOT EXISTS communications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  mou_id TEXT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  instalment_seq INTEGER NULL,
  channel TEXT NULL,
  subject TEXT NULL,
  body_email TEXT NULL,
  body_whats_app TEXT NULL,
  to_email TEXT NULL,
  to_phone TEXT NULL,
  cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  queued_at TIMESTAMPTZ NOT NULL,
  queued_by TEXT NULL,
  sent_at TIMESTAMPTZ NULL,
  copied_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','queued-for-manual','sent','bounced','failed','draft-copied')),
  bounce_detail TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS communications_mou_idx ON communications (mou_id);
CREATE INDEX IF NOT EXISTS communications_school_idx ON communications (school_id);
CREATE INDEX IF NOT EXISTS communications_status_idx ON communications (status);

-- Back-FK: magic_link_tokens.communication_id -> communications(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'magic_link_tokens_communication_id_fk'
  ) THEN
    ALTER TABLE magic_link_tokens
      ADD CONSTRAINT magic_link_tokens_communication_id_fk
      FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS communication_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  use_case TEXT NOT NULL,
  subject TEXT NULL,
  body_markdown TEXT NOT NULL,
  default_recipient TEXT NULL,
  default_cc_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_edited_by TEXT NULL,
  last_edited_at TIMESTAMPTZ NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  instalment_seq INTEGER NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  submitted_by TEXT NOT NULL,
  submitter_email TEXT NULL,
  ratings JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_comment TEXT NULL,
  magic_link_token_id TEXT NULL REFERENCES magic_link_tokens(id) ON DELETE RESTRICT,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS feedback_mou_idx ON feedback (mou_id);

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NULL,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  mou_id TEXT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  stage TEXT NULL,
  lane TEXT NULL,
  level INTEGER NULL,
  origin TEXT NULL,
  origin_id TEXT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description TEXT NULL,
  assigned_to TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notified_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('WIP','Open','Closed','Transferred','Dispatched','In Transit')),
  category TEXT NULL,
  type TEXT NULL,
  owned_by_department TEXT NULL,
  transferred_from_department TEXT NULL,
  transferred_to_department TEXT NULL,
  transferred_at TIMESTAMPTZ NULL,
  transfer_reason TEXT NULL,
  sla_target_date DATE NULL,
  sla_breached BOOLEAN NULL,
  waiting_on TEXT NULL,
  resolution_notes TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS escalations_status_idx ON escalations (status, lane);
CREATE INDEX IF NOT EXISTS escalations_assigned_to_idx ON escalations (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS escalations_school_idx ON escalations (school_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  sender_user_id TEXT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NULL,
  action_url TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON notifications (recipient_user_id, read_at);

-- ============================================================================
-- 5. Finance + adjustments
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_logs (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  mode TEXT NULL,
  reference TEXT NULL,
  narration TEXT NULL,
  sales_person_id TEXT NULL REFERENCES sales_team(id) ON DELETE RESTRICT,
  matched_installment_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  unmatched BOOLEAN NOT NULL DEFAULT TRUE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS payment_logs_unmatched_idx ON payment_logs (unmatched, date);

CREATE TABLE IF NOT EXISTS adjustments (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  triggered_by_event TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL,
  triggered_by TEXT NULL,
  original_installment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  applied_to_installment_id TEXT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_delta NUMERIC(14,2) NOT NULL,
  reason TEXT NULL,
  before_amount NUMERIC(14,2) NOT NULL,
  after_amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active','Reversed'))
);

CREATE TABLE IF NOT EXISTS signed_values (
  mou_id TEXT PRIMARY KEY REFERENCES mous(id) ON DELETE RESTRICT,
  signed_date DATE NULL,
  signed_by TEXT NULL,
  price_per_student NUMERIC(14,2) NULL,
  student_count INTEGER NULL,
  duration INTEGER NULL,
  signed_scan_url TEXT NULL,
  captured_at TIMESTAMPTZ NULL,
  notes TEXT NULL
);

CREATE TABLE IF NOT EXISTS student_count_events (
  id TEXT PRIMARY KEY,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  new_count INTEGER NOT NULL,
  previous_count INTEGER NULL,
  effective_date DATE NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  recorded_by TEXT NULL,
  reason TEXT NULL,
  related_installment_id TEXT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  notes TEXT NULL,
  recalc_impact JSONB NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS student_count_events_mou_idx ON student_count_events (mou_id, recorded_at);

-- ============================================================================
-- 6. Sales pipeline + import review
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_opportunities (
  id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  school_id TEXT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  city TEXT NULL,
  state TEXT NULL,
  region TEXT NULL,
  sales_rep_id TEXT NOT NULL REFERENCES sales_team(id) ON DELETE RESTRICT,
  programme_proposed TEXT NULL,
  gsl_model TEXT NULL,
  commitments_made TEXT NULL,
  out_of_scope_requirements TEXT NULL,
  recce_status TEXT NULL,
  recce_completed_at TIMESTAMPTZ NULL,
  status TEXT NULL,
  approval_notes TEXT NULL,
  conversion_mou_id TEXT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  loss_reason TEXT NULL,
  school_match_dismissed BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS mou_import_review (
  id BIGSERIAL PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL,
  raw_record JSONB NOT NULL,
  validation_failed TEXT NULL,
  quarantine_reason TEXT NULL,
  candidates JSONB NULL,
  resolved_at TIMESTAMPTZ NULL,
  resolved_by TEXT NULL,
  resolution TEXT NULL CHECK (resolution IN ('imported','rejected','punted-upstream') OR resolution IS NULL),
  rejection_reason TEXT NULL,
  rejection_notes TEXT NULL
);

-- ============================================================================
-- 7. Operations (vendors, agreements, VEX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_entity TEXT NULL,
  category TEXT NULL,
  primary_contact TEXT NULL,
  primary_email TEXT NULL,
  primary_phone TEXT NULL,
  address TEXT NULL,
  pan TEXT NULL,
  gst_number TEXT NULL,
  bank_account TEXT NULL,
  ifsc TEXT NULL,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('Vendor','NDA')),
  party_name TEXT NULL,
  vendor_id TEXT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  nature_of_agreement TEXT NULL,
  product TEXT NULL,
  department TEXT NULL,
  key_terms TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  tenure TEXT NULL,
  notice_period TEXT NULL,
  vendor_location TEXT NULL,
  physical_custody TEXT NULL,
  document_url TEXT NULL,
  days_to_expiry INTEGER NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS vex_products (
  part_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit_price NUMERIC(14,2) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vex_pis (
  id TEXT PRIMARY KEY,
  pi_number TEXT NULL,
  entity_key TEXT NULL CHECK (entity_key IN ('MH','UP') OR entity_key IS NULL),
  issue_date DATE NULL,
  school_name TEXT NULL,
  shipping_address TEXT NULL,
  billing_name TEXT NULL,
  billing_address TEXT NULL,
  school_gst_number TEXT NULL,
  contact_person TEXT NULL,
  contact_no TEXT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(14,2) NULL,
  freight_charges NUMERIC(14,2) NULL,
  taxable_value NUMERIC(14,2) NULL,
  gst_pct NUMERIC(8,4) NULL,
  gst_amount NUMERIC(14,2) NULL,
  total NUMERIC(14,2) NULL,
  status TEXT NULL,
  generated_by TEXT NULL,
  generated_at TIMESTAMPTZ NULL,
  payment_received_amount NUMERIC(14,2) NULL,
  payment_log_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS vex_dispatches (
  id TEXT PRIMARY KEY,
  pi_id TEXT NOT NULL REFERENCES vex_pis(id) ON DELETE RESTRICT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  freight NUMERIC(14,2) NULL,
  mode TEXT NULL,
  status TEXT NULL,
  requested_by TEXT NULL,
  requested_at TIMESTAMPTZ NULL,
  tax_invoice_number TEXT NULL,
  tax_invoice_path TEXT NULL,
  invoiced_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  supporting_doc_path TEXT NULL,
  warehouse_email_sent_at TIMESTAMPTZ NULL,
  warehouse_email_sent_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS vex_orders (
  id TEXT PRIMARY KEY,
  order_date DATE NULL,
  school_id TEXT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  school_name TEXT NULL,
  school_name_normalised TEXT NULL,
  buyer_address TEXT NULL,
  consignee_address TEXT NULL,
  voucher_number TEXT NULL,
  voucher_type TEXT NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(14,2) NULL,
  freight_charges NUMERIC(14,2) NULL,
  sgst NUMERIC(14,2) NULL,
  cgst NUMERIC(14,2) NULL,
  igst NUMERIC(14,2) NULL,
  round_off NUMERIC(14,2) NULL,
  total NUMERIC(14,2) NULL,
  payment_received BOOLEAN NULL,
  payment_date DATE NULL,
  dispatch_status TEXT NULL,
  dispatch_date DATE NULL,
  invoice_date DATE NULL,
  sales_person_id TEXT NULL REFERENCES sales_team(id) ON DELETE RESTRICT,
  imported_from_tally BOOLEAN NOT NULL DEFAULT TRUE,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS vex_orders_school_idx ON vex_orders (school_id);

-- ============================================================================
-- 8. Config, rules, logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS cc_rules (
  id TEXT PRIMARY KEY,
  sheet TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_value TEXT NULL,
  contexts JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_rule_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  disabled_at TIMESTAMPTZ NULL,
  disabled_by TEXT NULL,
  disabled_reason TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS lifecycle_rules (
  stage_from_key TEXT NOT NULL,
  stage_to_key TEXT NOT NULL,
  default_days INTEGER NOT NULL,
  custom_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  last_edited_at TIMESTAMPTZ NULL,
  last_edited_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (stage_from_key, stage_to_key)
);

CREATE TABLE IF NOT EXISTS stage_responsibility (
  stage TEXT PRIMARY KEY,
  responsible_department TEXT NULL,
  responsible_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  escalation_department TEXT NULL,
  notes TEXT NULL,
  updated_at TIMESTAMPTZ NULL,
  updated_by TEXT NULL,
  audit JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS chain_dismissals (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE RESTRICT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_by TEXT NULL,
  notes TEXT NULL
);

CREATE TABLE IF NOT EXISTS reminder_thresholds (
  kind TEXT PRIMARY KEY CHECK (kind IN ('intake','payment','delivery-ack','feedback-chase')),
  threshold_days INTEGER NOT NULL,
  anchor_event TEXT NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

CREATE TABLE IF NOT EXISTS homepage_action_log (
  date DATE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NULL,
  actioned_at TIMESTAMPTZ NULL,
  dismissed_at TIMESTAMPTZ NULL,
  promoted_to_overdue BOOLEAN NULL,
  PRIMARY KEY (date, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS sync_health (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sync','import','manual')),
  ok BOOLEAN NOT NULL,
  triggered_by TEXT NULL,
  import_summary JSONB NULL,
  health_checks JSONB NULL,
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS sync_health_at_idx ON sync_health (at DESC);

-- ============================================================================
-- 9. Counters
-- ============================================================================

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
