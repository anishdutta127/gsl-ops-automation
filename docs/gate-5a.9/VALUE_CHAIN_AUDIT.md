# VALUE_CHAIN_AUDIT.md
Gate 5A.9 Phase A - Step 2: Value Chain Audit
**Date:** 2026-05-18

## Overview

This audit traces the canonical workflows for five personas testing the system, documenting first-login journeys, daily operations, weekly routines, and friction points. Data sourced from route analysis (src/app), permission gates (src/lib/access.ts), real user records (src/data/users.json), and operational audit (docs/installment-entry-audit.md).

All personas are on Admin role post-2026-04-27 promotion, with scoped departments enforcing EDIT gating. TESTING_OPEN_ACCESS defaults to true (VIEW gates open; EDIT gates strict). Five testers: Pranav (Finance), Misba (Ops), Anita and Anish (Sales / cross-functional), Ameet (Leadership), Ajith (Admin).

---

## Pranav B. - Finance (department: 'finance', 69 instalments pending PI)

### First-30-minutes flow

1. **Login:** `/login` → enter credentials (test password hashed in `src/data/users.json`).
2. **Land on consolidated landing:** `/` renders five zones: Commercial position (revenue pipeline), Operational position (dispatches, kit status), Attention items (overdue escalations), Quick actions, Tile slices (drill-down to `/dashboard/finance`).
3. **Click "Finance" stage in TopNav** or **click the Finance tile** → `/dashboard/finance` (Gate 4.95 rebuild).
4. **Scan the dashboard:** KPI strip (amount due, overdue %, collection %), high-priority alerts (payment blockers), top overdue payments panel, renewal needed, receipt summary, VEX kit orders, programme breakdown. All data pre-computed server-side at request time.
5. **See "Pending PIs" tile** (statcard counting instalments due within 30 days with no PI raised) → click to `/finance/pi/pending`.

**Visible on landing:** Finance-scoped KPIs + "View Finance workspace" primary action CTA.

### Daily workflow

**Task 1: Generate a PI for an overdue instalment**
- Entry point: `/finance/pi/pending` (shortlist of instalments due within next 30 days or past due).
- Path: Click row "Generate PI" CTA → routes to `/mous/[mouId]/installments` (listing of all instalments for that MOU).
- Friction: No direct link to the specific instalment's PI-generation form. Pranav lands on the listing, then must drill in.
- Gate: `canGeneratePI(user)` - Pranav passes; Misba redirected even with Admin role (MM2).
- Done signal: Download completes; flash banner; sync surfaces piNumber within 5 minutes.
- Known friction: 69 rows. Each PI is a click-to-download flow; no bulk generation in Phase 1.

**Task 2: Match a bank receipt to an unpaid instalment**
- Entry point: `/finance/payments/unmatched` OR `/dashboard/finance` → "Unmatched bank entries" card.
- Path: Click row → detail page → "Mark as matched" form.
- Action: `POST /api/mou/installments/mark-receipt` → updates Payment.receivedAmount + status.
- Known friction: Form does not auto-populate matched MOU from list-row context; manual dropdown selection required.

**Task 3: Record an Adjustment (partial payment, refund, credit)**
- Entry point: `/finance/adjustments` or inline "Add adjustment" on `/dashboard/finance`.
- Path: `/finance/adjustments/new` → form → `POST /api/mou/installments/adjustment`.
- Gate: `canEditFinanceData`. Pranav passes.

**Task 4: Edit payment due date or notes for a single instalment**
- Entry point: `/mous/[mouId]/installments` → pencil icon on a row (Finance only).
- Path: → `/mous/[mouId]/installments/[paymentId]/edit` → form → `POST /api/mou/installments/edit`.
- **Critical friction:** Single-row editor is orthogonal to the **schedule editor** (`/mous/[mouId]/installments/schedule-edit`). If Pranav needs to restructure the entire schedule (e.g., change from 4 to 3 instalments), he must navigate by **manually editing the URL** - no UI entry point. This was the surfaced friction that triggered the Gate 5A.9 audit. **Now fixed in Step 1.**

**Task 5: Export instalments for accounting reconciliation**
- No CSV export button on Instalments listing in Phase 1. Manual copy or `/api/data-snapshot` via Anish.

**Task 6: View Tally export readiness**
- Entry point: `/finance/tally-export`. Read-only with GSTIN-gated export button.
- Friction: GSTIN-missing schools block; cross-team coordination needed (Anita).

### Weekly workflow

- **Reconciliation sweep:** Mondays 09:00. `/dashboard/finance` → drill into overdue panels → escalate non-responsive schools.
- **PI-generation batch:** Fridays 14:00. 69 PIs one at a time.
- **Tally export prep:** Wednesdays 10:00. Check green-light status, flag GSTIN-missing schools.

### Edge cases and friction points

1. **Instalment schedule editor undiscoverable** (now wired in Step 1).
2. **Payment-received reconciliation requires manual matching** - no amount+date heuristic.
3. **No audit trail surface for payment records.** Payment.auditLog exists in data but is not rendered.
4. **VEX kit ordering is Ops-only.** Pranav cannot raise; must ask Misba.
5. **No bulk adjustment UI.**

---

## Misba M. - Ops (department: 'ops', 97 orphan dispatches, admin role)

### First-30-minutes flow

1. **Login:** `/login` → credentials.
2. **Land on `/`:** Five-zone surface. TopNav shows Dispatch + Operations stages.
3. **Click Operations** → `/dashboard/ops` (Gate 3.6 rebuild).
4. **Scan Operations dashboard:** DashboardHeader, FilterRow, six StatCards, Recent MOU Updates panel, Action Centre, Orders + Shipment Tracker, Communication Automation, Communication Templates grid.
5. **See "Pending dispatch requests: 2"** → `/admin/dispatch-requests`.

### Daily workflow

**Task 1: Review and approve a dispatch request from Sales**
- Entry: `/admin/dispatch-requests` (Ops queue).
- Path: Click request → detail page with SKU line items → Approve / Reject / Cancel buttons.
- Action: `POST /api/dispatch/review-request`. Notification fires to Sales requester + Finance.
- Gate: `canRaiseDispatch` (Ops + Admin wildcard).

**Task 2: Raise a dispatch directly (bypass Sales request)**
- Entry: `/mous/[mouId]/dispatch`.
- Path: "Direct raise dispatch" form → instalmentSeq dropdown → multi-select SKU → submit.
- Preconditions: Payment for instalment must be Received (gate blocks otherwise). Dispatch template must exist.
- Inventory: Auto-decrement; low-stock fires Escalation auto-broadcast.

**Task 3: Mark a dispatch "Ready to Ship" / "Shipped"**
- Entry: `/mous/[mouId]/dispatch` Existing Dispatches list.
- Path: "Mark Shipped" button → `POST /api/dispatch/[id]/mark-shipped`.
- Gate: `canRaiseDispatch` only.

**Task 4: Process a school escalation**
- Entry: `/escalations` filtered to OPS lane.
- Path: Detail → edit form → status / assignee / notes.
- Known friction: Descriptions free-text, no taxonomy. No bulk re-assignment.

**Task 5: Review school master data and SPOC contacts**
- Entry: `/schools` → filter → drill → edit.
- Gate: `canEditSchool` (department-scoped).

**Task 6: Check inventory stock and reorder thresholds**
- Entry: `/admin/inventory`.
- Gate: `inventory:edit` (OpsHead + Admin). Finance cannot.
- Action: `POST /api/inventory/[id]` → audit logs (stock-edited / threshold-edited).

### Weekly workflow

- **Dispatch health check:** Mondays 08:30. Drill into stuck dispatches.
- **School outreach:** Tuesdays 14:00. SPOC change tracking, kit allotment edits.
- **Escalation review:** Thursdays 10:00. Resolve / reassign.
- **Inventory audit:** Fridays 15:00. Physical count, threshold tuning.

### Edge cases and friction points

1. **97 orphan dispatches with `mouId: null`** - pre-W4-D legacy backfill. Misba cannot edit, re-raise, or re-link via UI. Requires Anish JSON edit. D-043 trigger.
2. **Payment gate blocks dispatch raise.** P2 override requires Leadership (Ameet) authorisation - Misba cannot self-override.
3. **No per-school dispatch audit trail.** Must drill MOU-by-MOU.
4. **Dispatch template render is historical** (raisedBy + date frozen at first render). By design.
5. **Approved dispatch line items are not Misba-editable post-approve.** Requester must cancel and resubmit.

---

## Anita C. and Anish (Sales-function testers; both Admin role)

### First-30-minutes flow

**Anita (Finance dept):**
1. Login → `/` → Finance tile visible (W3-B TESTING_OPEN_ACCESS).
2. Click Finance → `/dashboard/finance`.

**Anish (Admin, dept: null, cross-functional wildcard):**
1. Login → `/` → all five tiles visible.
2. Choice: Operations / Finance / Admin dashboard.

### Daily workflow

**Anita's tasks (Finance dept):**
- Tasks 1-6 identical to Pranav: PI generation, receipt matching, adjustments, instalment edits, Tally export.
- Task 7 (cross-team): Edit school GSTIN via `/schools/[schoolId]/edit` to unblock Tally export.

**Anish's tasks (cross-functional Admin):**
- **System monitoring:** `/admin` sync panel. Manual `POST /api/admin/sync-queue` if stalled.
- **User management:** `/admin/users`. Role / department flips (e.g., temporarily flip Misba's department to null for PI walkthrough).
- **Audit log inspection:** `/admin/audit` filtered queries to verify gate enforcement.
- **Data snapshot export:** `/admin/data-snapshot` tarball download.
- **Communication templates:** `/admin/templates` (docxtemplater mustache syntax).
- **CC rule management:** `/admin/cc-rules`.

### Weekly workflow

- **Anita:** Mirrors Pranav.
- **Anish:** Mondays new-entity scan, Wednesdays data snapshot backup, Fridays user/department drift audit.

### Edge cases and friction points

1. **Anita cannot toggle MOU cohort status** - Admin-only action. Must ask Anish or Ameet to flip via `/admin/mou-status`. D-012 candidate.
2. **Communication template editing is raw textarea, not WYSIWYG.** D-007 candidate.
3. **No bulk user upload** for round-2 onboarding. D-024 candidate (SPOC DB integration).
4. **Data snapshot export is manual** - no automated backup schedule. D-042 candidate.

---

## Ameet Z. - Leadership (department: null, cross-functional wildcard)

### First-30-minutes flow

1. Login → `/` (all tiles visible).
2. Click Reports → `/reports` (6 report surfaces).
3. Or `/dashboard/leadership` (Gate 3.5 rebuild) for aggregated view.

### Daily workflow

**Task 1: Commercial health KPIs** - `/dashboard/leadership` or `/`. Active MOUs, Signed value, Collection %, Pipeline trend. Drill via tile.

**Task 2: Operational health KPIs** - Dispatches in flight, Delivery health, Schools needing action, Escalations by lane / level.

**Task 3: Attention items / anomalies** - Overdue payments, over-escalated schools, contract-end approaching MOUs.

**Task 4: Run dispatch performance report** - `/reports/dispatch-performance`. CSV export.

**Task 5: Run payment aging report** - `/reports/payment-aging`. Buckets by age.

**Task 6: Authorise a P2 dispatch override** - `/admin/dispatch-overrides`. Gate: `dispatch:override-gate` (Leadership only - deliberate split per role-decisions.md 2026-04-28).

**Task 7: Review critical changes (anomaly detection)** - `/` Critical changes zone. Computed by `collectCriticalChanges()`.

### Weekly workflow

- Mondays 08:00: KPI scan + payment-aging report.
- Wednesdays 14:00: Dispatch performance + escalations report.
- Fridays 16:00: Accountability dashboard (Phase 1.1 D-046; today Ameet manually scans `/admin/audit`).

### Edge cases and friction points

1. **Leadership cannot directly edit operational data.** VIEW wildcard, EDIT is department-strict. Must delegate.
2. **No MOU cloning UI.** D-048 candidate.
3. **Reports are read-only, not interactive.** No drill-through from report rows to MOU detail. D-049 candidate.
4. **No scheduled report email delivery.** D-050 candidate.

---

## Ajith N. - Admin (department: null, added 2026-05-12)

### First-30-minutes flow

1. Login → `/` (all tiles visible).
2. Navigate to `/admin` system admin dashboard.

### Daily workflow

**Task 1: Monitor sync queue health** - `/admin` system sync panel. Manual sync if stalled.

**Task 2: Manage users** - `/admin/users` create/deactivate. No password reset UI in Phase 1.

**Task 3: Audit log review** - `/admin/audit` for compliance + anomaly checks.

**Task 4: Troubleshoot data inconsistencies** - `/admin/data-snapshot` export, manual review.

**Task 5: Check queue status** - `/admin/queue-status` (pending_updates.json snapshot).

**Task 6: Emergency JSON edit (no UI surface)** - direct file access via Git for data-corruption recovery.

### Weekly workflow

- Daily 09:00: Sync panel check.
- Mondays 10:00: Queue-status drill.
- Fridays 16:00: Data snapshot consistency review.

### Edge cases and friction points

1. **No password-reset UI.** D-051 candidate.
2. **User creation one-by-one.** D-024 candidate.
3. **No user permission audit trail of authoriser.** Governance layer is out of scope.
4. **Sync queue lag is visible but root-cause access is Anish-gated** (GitHub Actions logs).
5. **No CSV export for major entities.** D-052 candidate.

---

## Cross-cutting friction points

### 1. Navigation and discoverability

- **Instalment schedule editor was undiscoverable** (now fixed Gate 5A.9 Step 1).
- **Dispatch detail page is not reachable from the action bar** of a list-context row.
- **VEX PI creation buried under `/operations/vex/pi/new`** - no cross-departmental request affordance from Finance.

### 2. Bulk operations

- **No bulk PI generation.** 69 click-throughs for Pranav. D-009 candidate.
- **No bulk adjustment.** D-010 candidate.
- **No bulk user creation.** D-024 candidate.
- **No bulk dispatch re-assignment.** D-011 candidate.

### 3. Role / permission gaps

- **Anita cannot archive MOUs.** D-012 candidate.
- **Misba cannot initiate P2 dispatch override.** Cross-team dependency on Ameet.
- **Pranav cannot view Payment audit trail.** D-013 candidate.

### 4. Data entry friction

- **Manual school name / bank-reference matching** for receipts. D-014 candidate.
- **Override-reason ≥10 char free-text** - no templates. D-015 candidate.
- **Escalation descriptions free-text.** No taxonomy. D-016 candidate.

### 5. Performance / visibility

- **1-5 minute write-to-list delay** (sync cron cadence). By design; reduces operator confidence.
- **No audit-trail rendering on entity detail pages.** D-013 candidate.
- **Reports are static.** D-049 candidate.

### 6. Cross-team coordination

- **No in-app messaging.** Email / Slack only. D-053 candidate.
- **Dispatch override = three teams in series.** D-054 candidate.

### 7. Testing mode vs production mode

- **TESTING_OPEN_ACCESS defaults true** (VIEW open, EDIT strict). Pilot-correct; production flip = 1 env var change.

---

## Summary table

| Persona | Landing | Primary dashboard | Key workflows | Top friction |
|---|---|---|---|---|
| Pranav (Finance) | `/` → Finance tile | `/dashboard/finance` | Generate PI (69), match receipts, adjust, edit instalment, Tally | Schedule editor undiscoverable (fixed); 69 PIs one-by-one; no Payment audit trail |
| Misba (Ops) | `/` → Operations tile | `/dashboard/ops` | Approve DRs, raise dispatch, mark shipped, escalations, school data, inventory | 97 orphan dispatches; payment gate; no school dispatch history filter |
| Anita (Finance) | `/` → Finance tile | `/dashboard/finance` | Same as Pranav + school GSTIN edits | Cannot archive MOUs; same as Pranav |
| Anish (Admin, null dept) | `/` → all visible | `/admin` + ops + finance | Sync, user mgmt, audit, exports, templates, CC rules | Manual JSON for corruption; password reset on Anish; no bulk |
| Ameet (Leadership) | `/` → all visible | `/dashboard/leadership` | KPI scan, reports, P2 override, anomaly detection | Cannot directly edit; reports not interactive; no scheduled emails |
| Ajith (Admin, null dept) | `/` → all visible | `/admin` | Sync health, user mgmt, audit, data consistency | No password reset; user creation one-by-one; no CSV exports |

---

## Top Phase 1.1 candidates from this audit

1. **Instalment schedule editor entry-point fix** - DONE in Gate 5A.9 Step 1.
2. **Payment audit trail on detail page (D-013)** - 1 day. Pranav investigates unexpected status changes.
3. **Hyperlinked reports to entity detail (D-049)** - 2 days. Ameet drill-through.
4. **Bulk PI generation + email delivery (D-009)** - 3 days. Reduces Pranav's 69 clicks to 1.
5. **Dispatch relink / rewind for 97 orphans (D-043)** - 2 days. Unblocks Misba.
6. **Self-service password reset (D-051)** - 1 day. Removes Anish bottleneck.
