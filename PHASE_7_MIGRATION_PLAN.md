# Phase 7 Migration Plan: Postgres (Neon) data layer

**Author:** Claude Code (Opus 4.7)
**Date:** 2026-05-23
**Status:** Part 1 deliverable. HARD PAUSE for Anish review before any code, database, or seed.

## 0. TL;DR

The application persists 40 entity datasets and 2 counter singletons as JSON files in `src/data/`. Reads are direct ES imports. Writes go through `enqueueUpdate` to a queue file, drained every 5 minutes by a GitHub Actions cron. This produces the 5-minute write lag, the EROFS risk on Vercel's ephemeral filesystem, and the silent-save bug class (Phase 6H).

Phase 7 moves the data layer to PostgreSQL on Neon. The proposal:

1. **Schema:** one Postgres table per entity, natural string IDs preserved (no UUID rewrite), foreign-key constraints, JSONB columns for nested arrays (`audit_log`, `lineItems`, `allocations`, etc.). Two counter rows in a small `counters` table.
2. **Access library:** `postgres.js` (Porsager). Thin, typed, tagged-template SQL. No ORM.
3. **Abstraction:** repo modules at `src/lib/db/repos/<entity>.ts` mirroring the existing JSON-access shape. Call sites change one import, not their logic.
4. **Cutover:** controlled by `DATA_BACKEND=json|postgres` env var. JSON stays the default until explicit Anish-driven flip. Rollback is a single env flip back to `json` + redeploy; JSON files remain frozen in the repo as the canonical pre-cutover snapshot.

Migration is non-destructive: nothing in `src/data/*.json` is modified by this gate. The queue + drain machinery (`pendingUpdates.ts`, `drainQueue.ts`, `sync-queue-cron.yml`) stays in place during the transition; it becomes obsolete once the cutover is proven stable and gets removed in a follow-up.

## 1. Current state inventory

This section is the read-only research output. Schema design in §2 onwards refers back to it.

### 1.1 Entity files (40 total + 1 backup, ignored)

`src/data/pi_counter_map.before-6b.json` is a pre-Phase-6B snapshot and is not migrated.

| File | Shape | Rows | Key | FKs (selected) | Audit log | Write path |
|---|---|---:|---|---|---|---|
| `mous.json` | array | 183 | `id` text | `schoolId`→school, `schoolGroupId`→schoolGroup, `salesPersonId`→sales_team | yes | enqueue + `backfill-mou-products.mjs` direct-write |
| `payments.json` | array | 15030 | `id` text (`<mouId>-i<seq>`) | `mouId`→mou | yes | enqueue + bulk-import route |
| `payment_logs.json` | array | 30-50 | `id` text (`PL-<short-uuid>`) | `salesPersonId`→sales_team, `matchedInstallmentIds` (array)→payment | yes | enqueue (`/api/finance/payment/log`) |
| `schools.json` | array | 4811 | `id` text | none | yes | enqueue |
| `school_groups.json` | array | 3-5 | `id` text | `memberSchoolIds` array→school, `groupMouId`→mou | yes | enqueue |
| `school_spocs.json` | array | 150-200 | `id` text | `schoolId`→school | yes | enqueue + `w4e-spoc-import-mutation.mjs` (enqueue) |
| `sales_team.json` | array | 10-15 | `id` text | none | nominal | enqueue |
| `users.json` | array | 210 | `id` text | none | yes | enqueue + `seed-dev.mjs` direct-write (dev only) |
| `dispatches.json` | array | 1518 | `id` text | `mouId`→mou, `schoolId`→school, `requestId`→dispatch_request | yes | enqueue (multiple routes) |
| `dispatch_requests.json` | array | 10-20 | `id` text | `mouId`→mou, `schoolId`→school, `requestedBy`→user, `conversionDispatchId`→dispatch | yes | enqueue |
| `kit_dispatches.json` | array | 50-100 | `id` text (`DISPATCH-<mouId>`) | `mouId`→mou, `schoolId`→school | yes | enqueue (5 routes) |
| `intake_records.json` | array | 1115 | `id` text | `mouId`→mou | yes | enqueue + `w4c-backfill-intake.mjs` |
| `inventory_items.json` | array | 18-21 | `id` text (`INV-...`) | none | yes | enqueue + `w4g-import-mutation.mjs` (enqueue) |
| `communications.json` | array | 355 | `id` text | `schoolId`→school, `mouId`→mou, `magicLinkTokenId`→magic_link_tokens | yes | enqueue (6 sites) |
| `communication_templates.json` | array | 5-10 | `id` text | none | yes | enqueue |
| `escalations.json` | array | 321 | `id` text (`ESC-...`) | `schoolId`→school, `mouId`→mou, `assignedTo`→user, `originId`→feedback or dispatch | yes (+ inline `comments[]`) | enqueue |
| `feedback.json` | array | 274 | `id` text | `schoolId`→school, `mouId`→mou, `magicLinkTokenId`→magic_link_tokens | yes | enqueue (`/api/feedback/submit`) |
| `notifications.json` | array | 786 | `id` text | `recipientUserId`→user, `senderUserId`→user | yes | enqueue (`createNotification` + workflow triggers) |
| `magic_link_tokens.json` | array | 30 | `id` text (`tokenId`) | `mouId`→mou, `communicationId`→communication | no (Communication is the audit anchor) | enqueue |
| `cc_rules.json` | array | 10-20 | `id` text | `ccUserIds[]`→user OR sales_team | yes | enqueue |
| `lifecycle_rules.json` | array | 7 | composite (`stageFromKey`+`stageToKey`) | none | yes | enqueue |
| `stage_responsibility.json` | array | 10 | `stage` text (synthesised as `id` on drain) | `responsibleUserId`→user | yes (field is `audit`, not `auditLog`) | enqueue |
| `adjustments.json` | array | 1 | `id` text (`ADJ-...`) | `mouId`→mou, `schoolId`→school, `originalInstallmentId`→payment, `appliedToInstallmentId`→payment | none (audit on parent MOU) | enqueue |
| `signed_values.json` | array | 0-low | `mouId` text (one-to-one with MOU) | `mouId`→mou | none | enqueue |
| `student_count_events.json` | array (append-only) | low | `id` text (`SCE-...`) | `mouId`→mou, `relatedInstallmentId`→payment | yes | enqueue (`/api/mou/[mouId]/student-count`) |
| `sales_opportunities.json` | array | 5-10 | `id` text | `schoolId`→school, `salesRepId`→sales_team | yes | enqueue |
| `mou_import_review.json` | array | 5-15 | composite (no single id; `queuedAt` + `rawRecord.id`) | `candidates[].schoolId`→school | none | enqueue + import scripts |
| `agreements.json` | array | 30 | `id` text | `vendorId`→vendor (when type=`Vendor`) | yes | enqueue |
| `vendors.json` | array | 5-10 | `id` text | none | yes | enqueue |
| `vex_pis.json` | array | 306 | `id` text | none top-level; `paymentLogIds[]`→payment_logs | yes | enqueue |
| `vex_dispatches.json` | array | 161 | `id` text | `piId`→vex_pis | yes | enqueue |
| `vex_orders.json` | array | 5048 | `id` text | `schoolId`→school, `salesPersonId`→sales_team | yes | Tally-import direct-write (legacy archive) |
| `vex_products.json` | array | ~28 active (170 historical) | `partNumber` text | none | none | enqueue |
| `homepage_action_log.json` | array (append-only) | low | composite (`date`+`userId`+`itemId`) | `userId`→user (string FK) | no | enqueue (`homepageActionLog`) |
| `feedback.json` | array | 274 | `id` text | (above) | (above) | (above) |
| `chain_dismissals.json` | array | 0 / unknown | unknown | unknown | unknown | not currently read or written; **propose to skip in Phase 7**, revisit if Phase 1.1 picks it up |
| `reminder_thresholds.json` | object (config) | n/a | n/a | none | n/a | not currently read or written; **propose to skip**, store equivalent config in code or a small `app_config` table only if needed later |
| `pending_updates.json` | array (queue) | 0 most of the time | `id` UUID | n/a (transient payload) | n/a | written by `enqueueUpdate`, drained every 5 min |
| `sync_health.json` | array (append-only) | 50-100 | `at` timestamp (effectively) | none | n/a | written by `drainQueue` + import-tick routes |

### 1.2 Counter singletons

- `pi_counter.json` — `{ fiscalYear, next, prefix }`. Atomically mutated by `src/lib/pi/issuePiNumberAtomic.ts` (ETag-based via GitHub Contents API, never via `enqueueUpdate`).
- `pi_counter_map.json` — `{ fiscalYear, entities: { MH: { next }, UP: { next } }, priorFiscalYears: { ... } }`. Same atomic-mutation pattern.

### 1.3 Direct-write outliers (scripts that bypass the queue)

Confirmed direct `fs.writeFileSync` or `atomicUpdateJson` writes that do NOT route through `enqueueUpdate`:

- `scripts/seed-dev.mjs` — copies fixtures + bcrypts passwords on local dev. Dev-only.
- `scripts/backfill-mou-products.mjs` — Phase 6E `--apply` mode writes directly to `mous.json` (one-shot).
- `scripts/backfill-yp2526-due-dates.mjs` — Phase 6D one-shot `payments.json` write.
- `scripts/import-week3.mjs`, `scripts/import-fy2627.mjs`, `scripts/import-pranav-refresh.mjs`, `scripts/w4c-backfill-intake.mjs` — bulk import / refresh scripts (mix of direct-write and enqueue).
- `scripts/w4e-spoc-import-mutation.mjs`, `scripts/w4g-import-mutation.mjs` — bulk import via enqueue (not direct-write).
- `src/lib/pi/issuePiNumberAtomic.ts` — atomic counter increment via GitHub Contents API (not `fs`, but bypasses the queue).

In a Postgres world, these scripts all become straight `INSERT ... ON CONFLICT` or `UPDATE ... RETURNING` SQL. Same intent, no atomic-write gymnastics, no 5-minute lag.

### 1.4 Audit log pattern

Every persistent entity record (except `magic_link_tokens`, `mou_import_review`, `signed_values`, `vex_products`, `adjustments`, `homepage_action_log`, `vex_orders`-on-Tally-import) carries an `auditLog: AuditEntry[]` field. AuditEntry shape:

```ts
interface AuditEntry {
  timestamp: string  // ISO
  user: string       // User.id or 'system' / 'system-<gate-id>'
  action: string     // free-form verb-noun: 'create' | 'update' | 'pi-issued' | 'kanban-stage-transition' | ...
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  notes?: string
}
```

Audit entries are always appended; never edited or deleted.

## 2. Postgres schema design

### 2.1 Foundational decisions

1. **Natural keys preserved.** Existing IDs (`MOU-STEAM-2627-001`, `INV-CRETILE-G10`, `ESC-001`, ...) become `TEXT PRIMARY KEY`. We do NOT generate new UUIDs. Seeding becomes idempotent (`ON CONFLICT (id) DO NOTHING`), rollback stays trivial (the JSON id matches the Postgres id), and call-site code is unchanged.
2. **Nested arrays → JSONB columns.** `auditLog`, `lineItems`, `allocations`, `gradewiseDistribution`, `partialPayments`, `comments`, `ratings`, `paymentLogIds`, `studentCountEventIds`, `memberSchoolIds`, `matchedInstallmentIds`, `territories`, `programmes`, `notifiedEmails`, `ccEmails`, `dispatchSummary`, `shipmentTracking`, `pod`, `paymentSchedule`, `paymentSchedules`, `yearlyPricing`, `billingBlock`, `draftVariables`, `dispatchOverride`, `recalcImpact` — all become `JSONB` on the parent row. Reasoning: normalising 40+ entities × their nested arrays would create 80+ child tables for marginal query benefit, and would force callers to do joins for what is currently a single read. JSONB keeps queries cheap, supports GIN indexes when we need them, and matches the existing TypeScript shape exactly. The cost is that audit-action analytics across all entities is harder (one query per entity table instead of a single SELECT across one audit table) — flagged as a follow-up if Anish wants that, not blocking.
3. **String enums kept as TEXT with CHECK constraints**, not Postgres ENUM types. ENUMs are awkward to migrate. `CHECK (status IN ('Pending', 'Active', ...))` is enough.
4. **Timestamps → `TIMESTAMPTZ`.** Existing ISO strings round-trip via `to_timestamp` / `to_jsonb`. UTC throughout.
5. **Financials → `NUMERIC(14, 2)`.** Never use `FLOAT`/`DOUBLE` for currency. We deal with rupees, lakhs, crores; the existing code is already integer-or-2dp.
6. **Foreign keys → real `REFERENCES` constraints with `ON DELETE RESTRICT`.** The data is precious; we never want a cascade delete. A bad delete attempt errors loudly and lands on `/admin`.
7. **Counters → one small `counters` table.** Atomic increments via `UPDATE counters SET value = ... WHERE key = $1 RETURNING value`. PostgreSQL handles the atomicity natively; no ETag gymnastics.
8. **`pending_updates` queue table — drop in Phase 7.** Writes become synchronous SQL statements; the queue is redundant. `sync_health` is retained as an optional health-audit table; it stops being load-bearing.
9. **Indexes added per access pattern in §1.1**, not speculatively. Examples: `payments(mouId, status)`, `dispatches(mouId)`, `escalations(status, lane)`, `schools(active, region)`, `notifications(recipientUserId, readAt)`. Each justified by a real query in `src/`.

### 2.2 Tables

DDL is given per table. All tables include `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` where the entity has a corresponding semantic. JSONB defaults to `'[]'` for arrays, `'{}'` for objects.

#### 2.2.1 Identity & access

```sql
CREATE TABLE users (
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
CREATE INDEX users_active_role_idx ON users (active, role);
CREATE INDEX users_azure_ad_object_id_idx ON users (azure_ad_object_id) WHERE azure_ad_object_id IS NOT NULL;

CREATE TABLE sales_team (
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
```

#### 2.2.2 Core domain

```sql
CREATE TABLE schools (
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
CREATE INDEX schools_active_region_idx ON schools (active, region);
CREATE INDEX schools_gst_number_idx ON schools (gst_number) WHERE gst_number IS NOT NULL;

CREATE TABLE school_groups (
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
  -- group_mou_id FK added in a second pass after mous table exists
);

CREATE TABLE school_spocs (
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
CREATE INDEX school_spocs_school_id_idx ON school_spocs (school_id, active);

CREATE TABLE mous (
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
  -- Nested JSONB columns (preserve existing TypeScript shape verbatim)
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
CREATE INDEX mous_school_id_idx ON mous (school_id);
CREATE INDEX mous_cohort_status_idx ON mous (cohort_status, status);
CREATE INDEX mous_sales_person_id_idx ON mous (sales_person_id);
CREATE INDEX mous_programme_idx ON mous (programme);

-- Deferred FK: school_groups.group_mou_id → mous(id)
ALTER TABLE school_groups
  ADD CONSTRAINT school_groups_group_mou_id_fk
  FOREIGN KEY (group_mou_id) REFERENCES mous(id) ON DELETE RESTRICT;

CREATE TABLE payments (
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
CREATE INDEX payments_mou_id_idx ON payments (mou_id);
CREATE INDEX payments_status_idx ON payments (status);
CREATE INDEX payments_due_date_idx ON payments (due_date_iso) WHERE due_date_iso IS NOT NULL;
CREATE INDEX payments_pi_number_idx ON payments (pi_number) WHERE pi_number IS NOT NULL;
```

#### 2.2.3 Dispatch + intake + inventory

```sql
CREATE TABLE inventory_items (
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
CREATE INDEX inventory_items_active_category_idx ON inventory_items (active, category);

CREATE TABLE dispatch_requests (
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

CREATE TABLE dispatches (
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
CREATE INDEX dispatches_mou_id_idx ON dispatches (mou_id);
CREATE INDEX dispatches_stage_idx ON dispatches (stage);

-- Back-FK so a dispatch_request can point at its conversion dispatch:
ALTER TABLE dispatch_requests
  ADD CONSTRAINT dispatch_requests_conversion_dispatch_id_fk
  FOREIGN KEY (conversion_dispatch_id) REFERENCES dispatches(id) ON DELETE RESTRICT;

CREATE TABLE kit_dispatches (
  id TEXT PRIMARY KEY,                      -- 'DISPATCH-<mouId>'
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
CREATE INDEX kit_dispatches_status_idx ON kit_dispatches (dispatch_status);

CREATE TABLE intake_records (
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
CREATE INDEX intake_records_mou_id_idx ON intake_records (mou_id);
```

#### 2.2.4 Communications, escalations, feedback

```sql
CREATE TABLE magic_link_tokens (
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
  communication_id TEXT NULL          -- FK added below
);

CREATE TABLE communications (
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
CREATE INDEX communications_mou_idx ON communications (mou_id);
CREATE INDEX communications_school_idx ON communications (school_id);
CREATE INDEX communications_status_idx ON communications (status);

ALTER TABLE magic_link_tokens
  ADD CONSTRAINT magic_link_tokens_communication_id_fk
  FOREIGN KEY (communication_id) REFERENCES communications(id) ON DELETE RESTRICT;

CREATE TABLE communication_templates (
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

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  mou_id TEXT NOT NULL REFERENCES mous(id) ON DELETE RESTRICT,
  instalment_seq INTEGER NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  submitted_by TEXT NOT NULL,                  -- 'spoc' | 'ops-on-behalf'
  submitter_email TEXT NULL,
  ratings JSONB NOT NULL DEFAULT '[]'::jsonb,  -- FeedbackRating[]
  overall_comment TEXT NULL,
  magic_link_token_id TEXT NULL REFERENCES magic_link_tokens(id) ON DELETE RESTRICT,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX feedback_mou_idx ON feedback (mou_id);

CREATE TABLE escalations (
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
CREATE INDEX escalations_status_idx ON escalations (status, lane);
CREATE INDEX escalations_assigned_to_idx ON escalations (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX escalations_school_idx ON escalations (school_id);

CREATE TABLE notifications (
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
CREATE INDEX notifications_recipient_unread_idx ON notifications (recipient_user_id, read_at);
```

#### 2.2.5 Finance + adjustments

```sql
CREATE TABLE payment_logs (
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
CREATE INDEX payment_logs_unmatched_idx ON payment_logs (unmatched, date);

CREATE TABLE adjustments (
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

CREATE TABLE signed_values (
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

CREATE TABLE student_count_events (
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
CREATE INDEX student_count_events_mou_idx ON student_count_events (mou_id, recorded_at);
```

#### 2.2.6 Sales pipeline + import review

```sql
CREATE TABLE sales_opportunities (
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

CREATE TABLE mou_import_review (
  -- No single id in source; use a synthetic surrogate so the row is addressable.
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
```

#### 2.2.7 Operations (vendors, agreements, VEX, SSO)

```sql
CREATE TABLE vendors (
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

CREATE TABLE agreements (
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

CREATE TABLE vex_products (
  part_number TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit_price NUMERIC(14,2) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vex_pis (
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

CREATE TABLE vex_dispatches (
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

CREATE TABLE vex_orders (
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
CREATE INDEX vex_orders_school_idx ON vex_orders (school_id);
```

#### 2.2.8 Config + rules + logs

```sql
CREATE TABLE cc_rules (
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

CREATE TABLE lifecycle_rules (
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

CREATE TABLE stage_responsibility (
  stage TEXT PRIMARY KEY,
  responsible_department TEXT NULL,
  responsible_user_id TEXT NULL REFERENCES users(id) ON DELETE RESTRICT,
  escalation_department TEXT NULL,
  notes TEXT NULL,
  updated_at TIMESTAMPTZ NULL,
  updated_by TEXT NULL,
  audit JSONB NOT NULL DEFAULT '[]'::jsonb     -- this entity uses `audit` not `auditLog`
);

CREATE TABLE homepage_action_log (
  -- composite natural key (date + user_id + item_id) is unique
  date DATE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  item_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NULL,
  actioned_at TIMESTAMPTZ NULL,
  dismissed_at TIMESTAMPTZ NULL,
  promoted_to_overdue BOOLEAN NULL,
  PRIMARY KEY (date, user_id, item_id)
);

CREATE TABLE sync_health (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sync','import','manual')),
  ok BOOLEAN NOT NULL,
  triggered_by TEXT NULL,
  import_summary JSONB NULL,
  health_checks JSONB NULL,
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX sync_health_at_idx ON sync_health (at DESC);
```

#### 2.2.9 Counters

```sql
CREATE TABLE counters (
  key TEXT PRIMARY KEY,                    -- 'pi_counter' | 'pi_counter_map'
  value JSONB NOT NULL,                    -- preserves the existing nested shape verbatim
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Atomic increment via: UPDATE counters SET value = ... WHERE key = $1 RETURNING value;
-- ETag-free atomicity: a row-level lock under SERIALIZABLE / REPEATABLE READ handles concurrent calls.
```

### 2.3 Additional tables added during Anish's double-check (Part 2 prep, 2026-05-23)

The Part 1 inventory mis-identified two files as having no readers. A second-pass grep including static imports + dynamic string references (the check Anish requested before GO) found them load-bearing. Adding the corresponding tables:

```sql
CREATE TABLE chain_dismissals (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE RESTRICT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_by TEXT NULL,
  notes TEXT NULL
);

CREATE TABLE reminder_thresholds (
  kind TEXT PRIMARY KEY CHECK (kind IN ('intake','payment','delivery-ack','feedback-chase')),
  threshold_days INTEGER NOT NULL,
  anchor_event TEXT NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);
```

`chain_dismissals` source shape is `{ _comment, dismissedSchoolIds: string[] }`. Normalised to one row per dismissed school. The read path (`src/app/admin/chain-mou-reconciliation/page.tsx:23` + `src/lib/admin/chainReconciliation.ts`) becomes `SELECT school_id FROM chain_dismissals`. The write path (`src/app/api/admin/chain-reconciliation/dismiss/route.ts:14`) becomes `INSERT ... ON CONFLICT DO NOTHING`. The `_comment` field is doc-only, dropped.

`reminder_thresholds` source shape is `{ intake: {...}, payment: {...}, 'delivery-ack': {...}, 'feedback-chase': {...} }` keyed by reminder kind. Readers: `src/lib/reminders/detectDueReminders.ts:61` and `src/lib/reminders/composeReminder.ts:81`. Each kind becomes one row keyed by the literal kind name. Matches the same low-cardinality config-table pattern as `lifecycle_rules`.

### 2.4 Skipped files (justified)

- `pi_counter_map.before-6b.json`: explicit pre-Phase-6B snapshot file. Reference only; do not migrate.
- `pending_updates.json`: the queue itself. Becomes unnecessary in a synchronous-write world. NOT migrated as a Postgres table.

### 2.5 Schema summary

- **32 tables** for domain entities + counters + housekeeping (sync_health, homepage_action_log, chain_dismissals, reminder_thresholds).
- **8 tables** are append-only or near-append-only (`student_count_events`, `homepage_action_log`, `sync_health`, `vex_orders` for legacy data, `feedback`, `dispatches`, `notifications`, `mou_import_review`).
- **All FK constraints** are `ON DELETE RESTRICT`. No cascade.
- **No Postgres ENUM types** — `TEXT` + `CHECK` constraints throughout.
- **JSONB** for nested arrays and complex sub-structures (audit_log, line_items, allocations, etc.).
- **Indexes** are added only where there is a real query in the existing codebase that needs them.

## 3. Access library choice

**Recommendation: `postgres.js`** (Porsager — https://github.com/porsager/postgres).

Why:

- Tagged template literals make parameterised SQL the default. No accidental string concatenation. `await sql\`SELECT * FROM mous WHERE id = ${mouId}\`` is fully parameterised.
- TypeScript-native. Returns are typed when you provide a generic.
- Built-in connection pooling. Works in Vercel serverless environments without extra config.
- Tiny: zero runtime dependencies. Bundles cleanly.
- Mature: used by many Vercel-recommended templates; ~7k GitHub stars at time of writing; well-maintained.
- Streaming async-iterator support (helpful if we want to stream large tables for batch jobs later).

**Alternatives considered + rejected:**

- **`pg`** (`node-postgres`): more mature but verbose API. Would need a wrapper to match the `postgres.js` ergonomics — at which point we just use `postgres.js`.
- **Prisma**: heavy. The migration surface includes a `schema.prisma`, generated client (which has runtime side-effects on Vercel cold-starts), connection management quirks, and a schema-coupled migration tool. Adds complexity, hides queries.
- **Drizzle**: lighter than Prisma but still a query-builder layer between us and SQL. For a project that already has clear SQL it doesn't help; for a project that wants type-safety, `postgres.js` with generics gives us 80% of the benefit at 0% of the migration cost.
- **Kysely**: same family as Drizzle. Same reasoning.

Karpathy fit: minimum surface, queries inspectable, no abstraction we have to reverse-engineer when something goes wrong.

## 4. Abstraction boundary

### 4.1 Goal

Today, call sites look like:

```ts
import mousJson from '@/data/mous.json'
const allMous = mousJson as unknown as MOU[]
const mou = allMous.find((m) => m.id === mouId)
```

After Phase 7 they should look like:

```ts
import { mouRepo } from '@/lib/db/repos/mou'
const mou = await mouRepo.findById(mouId)
```

Two import changes per call site, no other logic change. The repo handles both backends.

### 4.2 Layout

```
src/lib/db/
├── client.ts              # postgres.js connection (lazy-init, single instance per server lifecycle)
├── backend.ts             # reads DATA_BACKEND env, exports BACKEND: 'json' | 'postgres'
├── repos/
│   ├── mou.ts             # mouRepo: findAll, findById, findBySchoolId, create, update, appendAudit
│   ├── payment.ts         # paymentRepo: findAll, findByMouId, findById, create, update, ...
│   ├── school.ts
│   ├── schoolGroup.ts
│   ├── salesTeam.ts
│   ├── user.ts
│   ├── dispatch.ts
│   ├── dispatchRequest.ts
│   ├── kitDispatch.ts
│   ├── intakeRecord.ts
│   ├── inventoryItem.ts
│   ├── communication.ts
│   ├── communicationTemplate.ts
│   ├── escalation.ts
│   ├── feedback.ts
│   ├── notification.ts
│   ├── magicLinkToken.ts
│   ├── ccRule.ts
│   ├── lifecycleRule.ts
│   ├── stageResponsibility.ts
│   ├── adjustment.ts
│   ├── signedValues.ts
│   ├── studentCountEvent.ts
│   ├── salesOpportunity.ts
│   ├── mouImportReview.ts
│   ├── paymentLog.ts
│   ├── schoolSpoc.ts
│   ├── agreement.ts
│   ├── vendor.ts
│   ├── vexPi.ts
│   ├── vexDispatch.ts
│   ├── vexOrder.ts
│   ├── vexProduct.ts
│   ├── homepageActionLog.ts
│   ├── syncHealth.ts
│   └── counter.ts         # piCounterRepo: read, atomicIncrement
└── audit.ts               # appendAuditEntry(table, id, entry) helper (server-side, no read-modify-write race)
```

### 4.3 Repo shape

Each repo follows the same contract:

```ts
// src/lib/db/repos/mou.ts
import type { MOU } from '@/lib/types'
import { BACKEND } from '../backend'
import { sql } from '../client'
import mousJson from '@/data/mous.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const jsonMous = mousJson as unknown as MOU[]

export const mouRepo = {
  async findAll(): Promise<MOU[]> {
    if (BACKEND === 'postgres') {
      return await sql<MOU[]>`SELECT * FROM mous ORDER BY id`
    }
    return jsonMous
  },

  async findById(id: string): Promise<MOU | null> {
    if (BACKEND === 'postgres') {
      const rows = await sql<MOU[]>`SELECT * FROM mous WHERE id = ${id}`
      return rows[0] ?? null
    }
    return jsonMous.find((m) => m.id === id) ?? null
  },

  async findBySchoolId(schoolId: string): Promise<MOU[]> { /* ... */ },
  async findActiveCohort(): Promise<MOU[]> { /* ... */ },

  async update(mou: MOU): Promise<void> {
    if (BACKEND === 'postgres') {
      await sql`
        UPDATE mous SET
          school_id = ${mou.schoolId},
          school_name = ${mou.schoolName},
          ...
          audit_log = ${sql.json(mou.auditLog ?? [])}::jsonb
        WHERE id = ${mou.id}
      `
      return
    }
    // JSON backend: enqueue the existing way; no behaviour change.
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'mou',
      operation: 'update',
      payload: mou as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (BACKEND === 'postgres') {
      // Server-side append avoids the read-modify-write race that the
      // JSON queue created.
      await sql`
        UPDATE mous
        SET audit_log = audit_log || ${sql.json([entry])}::jsonb
        WHERE id = ${id}
      `
      return
    }
    // JSON: have to read-modify-write through the queue, which is the
    // pre-Phase-7 behaviour.
    const mou = jsonMous.find((m) => m.id === id)
    if (!mou) return
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'mou',
      operation: 'update',
      payload: {
        ...mou,
        auditLog: [...(mou.auditLog ?? []), entry],
      } as unknown as Record<string, unknown>,
    })
  },
}
```

The key property: when `DATA_BACKEND=json` (the default), the repo is a thin wrapper around the existing import + enqueue path. Existing tests pass unchanged. When `DATA_BACKEND=postgres`, the repo hits the database directly.

### 4.4 Call-site migration order

Step-by-step migration during Part 4 (after the schema lands and the repos exist):

1. Read-heavy hot paths first: `/mous`, `/mous/[id]`, `/dashboard`, `/today`. These call `findAll`, `findById`, `findBySchoolId`. Pure read, no risk.
2. Then write paths: route handlers calling `enqueueUpdate(entity: 'mou', ...)` swap to `mouRepo.update(...)`. Same pattern across entities.
3. Lib helpers (`src/lib/dispatch/raiseDispatch.ts`, `src/lib/pi/generatePi.ts`, etc.) come last, since they fan out to many entity types per operation.
4. Each step keeps `DATA_BACKEND=json` as the default and tests must stay green.

### 4.5 Boundary outside `src/lib/db/`

Scripts under `scripts/` that currently do direct `fs.writeFileSync` (seed-dev, backfills) keep their direct-write path for the `json` backend. For the `postgres` backend they are either:
- Skipped (`seed-dev.mjs` is dev-only; never used in production)
- Re-implemented to talk to Postgres (`backfill-mou-products.mjs` becomes a SQL script — but this is a one-shot that was already run in Phase 6E, so it does not need a Postgres equivalent).

The one-shot backfill scripts are historical artefacts; they don't need to keep working post-cutover.

## 5. Migration plan

### 5.1 Database provisioning (Part 2)

1. Use the Neon project (Anish provides the API key).
2. Create a `phase-7-staging` branch off `main`. This is destructive territory — the seed will be reset many times during testing.
3. Apply the DDL from §2 to the staging branch. Run as one transaction so a partial schema does not land.
4. Store the staging connection string as `DATABASE_URL` in `.env.local` (gitignored). For Vercel, add it as a Preview-only env var initially. **Production `DATABASE_URL` is set only at cutover (Part 6).**
5. Smoke test: a script `scripts/db-ping.mjs` runs `SELECT 1` against the connection. Confirms connectivity from the same runtime context the app will use.

Connection string is never echoed in the final report; only the redacted host (e.g. `ep-morning-dew-xxxx.aws.neon.tech`) is shown.

### 5.2 Seed script (Part 3)

`scripts/seed-postgres.mjs`:

1. Reads every `src/data/<entity>.json` into memory.
2. INSERT in dependency order:
   1. `users`, `sales_team`, `schools`, `vendors`, `inventory_items`, `vex_products`, `communication_templates`, `lifecycle_rules`, `stage_responsibility`, `cc_rules` — independents, can be parallel.
   2. `school_groups` (no FK yet to mous), `school_spocs` (FK to schools).
   3. `mous` (FK to schools, school_groups, sales_team).
   4. `payments` (FK to mous), `signed_values` (FK to mous), `student_count_events` (FK to mous + payments).
   5. `dispatch_requests` (FK to mous, schools, users), `dispatches` (FK to mous, schools, dispatch_requests), `kit_dispatches` (FK to mous, schools), `intake_records` (FK to mous).
   6. `communications` (FK to schools, mous), `magic_link_tokens` (FK to mous, communications). Note: communications has FK to magic_link_tokens via `magic_link_token_id`; insert tokens first, then communications. Resolve by deferring the magic_link FK with `INITIALLY DEFERRED` if cycles exist.
   7. `feedback` (FK to schools, mous, magic_link_tokens).
   8. `escalations` (FK to schools, mous, users).
   9. `notifications` (FK to users).
   10. `payment_logs` (FK to sales_team), `adjustments` (FK to mous, schools, payments).
   11. `vex_pis`, `vex_dispatches` (FK to vex_pis), `vex_orders` (FK to schools, sales_team).
   12. `agreements` (FK to vendors), `sales_opportunities` (FK to schools, sales_team, mous), `mou_import_review` (no FK; uses surrogate id).
   13. `homepage_action_log`, `sync_health`.
   14. `counters` (pi_counter, pi_counter_map) — UPSERT.
3. Uses `ON CONFLICT (id) DO NOTHING` for idempotency. Re-running the seed against an already-seeded database is a no-op.
4. `--dry-run` mode prints per-table row counts and FK-constraint failures without committing the transaction.
5. Reports the known data-quality flags from prior gates so Anish sees them in the dry-run output: the BAPUJI over-pay, the merged-PI-number row, orphan payments (if any), null-product MOUs (the 161 that Phase 6E did not backfill), null-gradewiseDistribution MOUs.

### 5.3 Cutover (Part 6 — HARD PAUSE BEFORE)

This part is Anish-controlled and lives entirely behind the `DATA_BACKEND` env flag.

1. Create the Neon `main` branch (production). Apply the DDL.
2. Run the seed script against the production branch from the current JSON. This captures any drift since the staging seed.
3. Set `DATABASE_URL` (production) on Vercel.
4. Set `DATA_BACKEND=postgres` on Vercel (production environment).
5. Redeploy.
6. Walk every major surface with `verify-deploy.mjs`. The instant-write proof is the key acceptance test: save something, reload immediately, confirm persistence. Pre-cutover this was impossible (5-min lag); post-cutover it is the standard.

### 5.4 Rollback

The rollback procedure is one env flip:

```
1. On Vercel:    set DATA_BACKEND=json (or remove the env var entirely)
2. Redeploy.    Vercel builds in ~60-90s.
3. Done.        The app is back on the JSON backend, reading the frozen src/data/ files.
```

**No data loss** because the JSON files in `src/data/` were never modified by Phase 7. They represent the pre-cutover snapshot. Any writes that occurred between cutover and rollback live in Postgres and are NOT rolled into JSON — those mutations are temporarily lost from the active app but recoverable by re-cutting-over later or by an ad-hoc Postgres-to-JSON dump.

Important: rollback is **trivial only if it happens within the first hour or so of cutover**. Beyond that, writes against Postgres accumulate; rolling back means losing them. The runbook entry for this case is: "Before rolling back after the first hour, decide whether you want to capture the Postgres-only writes (run `scripts/dump-postgres-to-json.mjs` if it exists) or accept the loss."

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| DDL has a bug that crashes the seed | Medium | Dry-run mode + transaction wrapping. Failed seed leaves the DB empty, not partial. |
| JSONB column shape drifts from TypeScript type | Low | TypeScript types stay the canonical schema. Repo writes go through `as unknown as Record<string, unknown>` only when needed; everywhere else the type checks. |
| FK constraint violations during seed (orphan payment, missing school) | Medium | Dry-run reports them. Anish decides per row whether to fix the JSON before seeding or relax the FK. |
| Postgres query is slower than the JSON in-memory scan for some hot path | Low | Indexes added per access pattern. If a query is slow, the fix is an index, not a query rewrite. |
| Connection pool exhaustion on Vercel serverless | Low | `postgres.js` defaults to `max: 10` and lazy-init; with Neon's connection pooler this is fine. If we see pool exhaustion, swap to Neon serverless-compatible pooled URL (the `-pooler` variant in the connection string already supplied). |
| Auth.js v5 still expects file-backed users | Already handled | The SSO callback already enqueues via `enqueueUpdate(entity: 'user', ...)`. Post-cutover, `userRepo.upsert(...)` replaces that one call. |
| PI counter atomicity regression | Low | Postgres `UPDATE counters ... RETURNING value` under default isolation is atomic. The ETag mechanism was a workaround for not having a real database; we no longer need it. |
| Cron drain still firing after cutover and trying to write to GitHub | Medium | Disable the GitHub Actions cron at cutover (workflow `.github/workflows/sync-queue-cron.yml` → set `on:` to `workflow_dispatch` only). The drain itself is harmless if it fires — the queue is empty post-cutover — but disabling the cron removes a confusing log line. |

## 7. Pause points

This document is **Part 1** output. The following hard pauses follow:

- **Pause 1 (NOW)**: Anish reviews this plan. Approve / reject / adjust schema. No code, no database, no seed has been touched. GO unlocks Part 2.
- **Pause 2 (after Part 3)**: dry-run seed against the staging branch. Anish reviews row counts and any FK-violation flags. GO unlocks the actual seed.
- **Pause 3 (after Part 5)**: staging is fully verified, instant-writes demonstrated, screenshots delivered. STOP. Anish reviews. GO unlocks Part 6 (production cutover).

No part of Phase 7 ships to production without an explicit Anish GO between every step.

## 8. What this gate is NOT

To prevent scope creep, Phase 7 does not:

- Change any user-visible behaviour. The same UI renders the same data faster.
- Drop the JSON files. They remain in the repo as the rollback snapshot until Anish approves their removal in a follow-up.
- Delete the queue + drain code. `enqueueUpdate`, `drainQueue`, `pending_updates.json`, `sync_health.json`, and `.github/workflows/sync-queue-cron.yml` all stay. They are dead-but-armed when `DATA_BACKEND=postgres`; alive and load-bearing when `DATA_BACKEND=json`. Removal is a Phase 7.1 follow-up after ~2 weeks of stable Postgres operation.
- Change the test suite to require Postgres. JSON-backed tests stay the default. A parallel test pass against Postgres runs in CI to catch backend-divergence, but the default `npm test` keeps using the JSON fixtures.
- Touch the SSO / auth machinery beyond swapping `usersRepo` for the file import.
- Touch the GitHub-Actions cron secret machinery beyond disabling the schedule at cutover.

## 9. Open questions for Anish

These are the design choices where I want explicit GO before proceeding:

1. **JSONB vs separate audit tables.** I recommend JSONB on each entity. Quoted GIN-indexed queries for "all 'pi-issued' audits in the last 30 days" are slower than a normalised audit table would be. For a 5-person internal tool this is fine; for a 200-user analytics platform it would be wrong. Sign-off?
2. **FK semantics `ON DELETE RESTRICT`.** I am proposing zero cascade deletes, anywhere. A `DELETE FROM mous WHERE id = X` will fail if there are payments / dispatches / intakes referencing it. The current JSON code never deletes domain rows (the worst it does is flip `cohortStatus = 'archived'`), so this should match production reality. Confirm we should keep RESTRICT, not switch to CASCADE or SET NULL.
3. **`chain_dismissals.json` + `reminder_thresholds.json`** — I am proposing to skip these in Phase 7 because no code reads or writes them. If they are load-bearing in any way I have missed, flag it and I will add the tables.
4. **`mou_import_review`** has no natural id in the source file. I am proposing a `BIGSERIAL` surrogate primary key. This is the only entity in Phase 7 that introduces a synthetic id. Sign-off?
5. **Counter atomicity.** I am proposing to drop the ETag dance and use Postgres row-level locks via `UPDATE ... RETURNING`. Confirm.
6. **`stage_responsibility`** uses an `audit` field, not `auditLog`. Other entities use `auditLog`. I am keeping the field name to match the existing TypeScript shape. Confirm we are not normalising this field name as part of Phase 7.
7. **Hosting region.** The Neon connection string indicates `ap-southeast-1` (Singapore). Vercel default for `BLR1` is Mumbai. The 30ms round-trip Singapore↔Mumbai is acceptable; if Anish wants to provision a closer region (Frankfurt is no, US-east is no), Neon's free tier currently supports `ap-southeast-1` and we should accept that latency. Confirm.

## 10. Next step

I am stopping here. After your review:

- If everything in §2-§5 looks right: reply GO, I move to Part 2 (provisioning + DDL apply).
- If something needs adjusting (schema field, FK choice, library, layout): flag it inline and I revise this document before any database work.
- If you want to skip pauses (e.g. roll Parts 2 and 3 together): say so and I will.

No working-tree changes have been made by Part 1 except this single file.
