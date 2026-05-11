# Admin universal access matrix (Gate 3.5 Step 9)

Per Anish: "don't worry about the role distinction for now, I want the universal platform right now for the Admin user with all functions available." This doc audits the Admin path: every nav surface, every CTA, every action visible / reachable for the Admin user with `department: null` (the cross-functional wildcard) when `TESTING_OPEN_ACCESS=true` (the Gate 1 default).

## Audit run

- **TESTING_OPEN_ACCESS:** unset (defaults to fail-open per `src/lib/access.ts:isTestingOpenAccess`).
- **Admin user shape:** `{ role: 'Admin', department: null, active: true }`. Examples: Anish, Ameet, Gowri.
- **Universal expectation:** every page renders, every nav surface visible, every CTA reachable, every action executable EXCEPT the actions the Gate 1 MM2 decision deliberately blocks at the EDIT gate for Admin-with-explicit-department users (e.g. Misba `role: Admin, department: ops` cannot generate PI per `canGeneratePI(misba) === false`).

## Top nav (6 stages after Gate 3.5 Step 3)

| Stage | Visible | Notes |
|---|---|---|
| MOUs | yes | renamed from Active MOUs in Step 4 |
| Dispatch | yes | |
| Finance | yes | |
| Operations | yes | |
| Reports | yes | |
| Admin | yes | |

Plus wordmark to `/`, Help, Notification bell, Sign out.

Pipeline stage removed in Step 3 (Sales module returns later). Direct URL `/sales-pipeline` still reachable for Admin testing.

## Dashboards

| Surface | Path | Admin sees | Edit affordances |
|---|---|---|---|
| Operations Control Dashboard | `/` | full rich dashboard with KPIs, MOU updates, action centre, orders tracker, comm panel | KPI drill-down links + filter chips + Open Kanban Board CTA |
| Leadership console | `/dashboard/leadership` | three-section overview + Finance/Ops tiles | drill-down to /schools filtered views + tiles to dept dashboards |
| Finance dashboard | `/dashboard/finance` | 3 KPI tiles + Payments-needing-attention + PIs-awaiting-payment + Tally footer | KPI drill-downs + Match buttons + Re-send PI + Run Tally export |
| Ops dashboard | `/dashboard/ops` | redirects to `/` (Step 6) | n/a (redirect) |
| Sales dashboard | `/dashboard/sales` | placeholder banner + 4 cards (Active MOUs, Draft new MOU, Schools, Approve dispatches) | all 4 cards clickable |
| Admin landing | `/admin` | Leadership overview at top + Admin toolbox below (System sync, MOU import review, Inventory, Audit, CC rules, Lifecycle rules, MOU cohort status, PI counter, Schools, SPOCs, Sales team, School groups, Communication templates) | all tiles clickable + System sync trigger buttons |

## Entity surfaces

| Surface | Path | Admin VIEW | Admin EDIT |
|---|---|---|---|
| MOUs list | `/mous` | yes | `+ New MOU` primary CTA, archive view |
| MOU detail | `/mous/[id]` | yes | every section (status notes auto-save, PI generation if lock off, dispatch raise, delivery ack, feedback request, intake, actuals, kits details) |
| MOU draft wizard | `/mous/new/[templateId]` | yes (canEditMOU passes for Admin) | full GeneratorWizard with all fields editable |
| MOU kits details | `/mous/[id]/kits-details` | yes | productSelection + gradewise edit |
| School list | `/schools` | yes | n/a (read-only list; create flow via Admin tile) |
| School detail | `/schools/[id]` | yes | Overview / MOUs / Payments / Dispatches / Activity tabs; Edit affordance in header (canEdit passes for Admin); '+ Draft new MOU' CTA in MOUs tab |
| Escalations | `/escalations`, `/escalations/[id]` | yes | comment, transition, transfer; edit page reachable |
| Dispatch landing | `/dispatch` | yes | raise request, pending review, active dispatches |
| Kits for Dispatch list | `/dispatch/kits` | yes | drill-down to each MOU's dispatch detail |
| Kit dispatch detail | `/dispatch/kits/[mouId]` | yes | allocate (canAllocateKits=Ops+Admin), approve (canApproveDispatch=Sales+Admin), execute (canExecuteDispatch=Finance+Admin), shipment + POD (canUploadPOD=Ops+Admin). Admin-with-null-department clears every gate. |
| Final dispatch summary | `/dispatch/kits/summary` | yes | CSV export |
| Finance landing | `/finance` | yes | drill-down to payments / PIs / adjustments / tally |
| Payment matcher | `/finance/payments` | yes | matcher form (canEditFinanceData=Finance+Admin); Admin null-dept clears |
| Unmatched parked queue | `/finance/payments/unmatched` | yes | match action |
| PI view | `/finance/pi/[paymentId]` | yes (canAccessFinance) | Download button (parallel-build locked today); re-issue (lock-gated) |
| Adjustments | `/finance/adjustments` | yes | reversal (canEditFinanceData) |
| Tally export | `/finance/tally-export` | yes | XML export run |
| Operations stage landing | `/operations` | yes | 6 cards (Schools, Escalations, Inventory, VEX orders, Vendors, Agreements) |
| VEX module | `/operations/vex` + `/operations/vex/pi/new` + `/operations/vex/pi/[id]` | yes | PI create (lock-gated; canEditFinanceData=Finance+Admin), status transitions (Finance for Invoiced, Ops for Request-Raised/Shipped per Gate 2 Step 7 split) |
| Vendors | `/operations/vendors`, `/operations/vendors/[id]` | yes | edit (canEditFinanceData) |
| Agreements | `/operations/agreements`, `/operations/agreements/[id]` | yes | edit (canEditFinanceData) |
| Reports | `/reports` | yes | Gate 1 placeholder; no content yet |
| Inventory | `/admin/inventory` | yes | inward by Finance (canManageInventory=Finance+Admin); outward auto-generated; Admin null-dept can add inward |
| Audit log | `/admin/audit` | yes | read-only |
| CC rules | `/admin/cc-rules` + `[ruleId]` + `new` | yes | toggle + create (Admin only via canManageCcRules / canPerform) |
| Lifecycle rules | `/admin/lifecycle-rules` | yes | edit defaultDays (Admin only) |
| Sales team | `/admin/sales-team`, `/admin/sales-team/new` | yes | create (Admin only) |
| School groups | `/admin/school-groups`, `[groupId]`, `new` | yes | create + edit (Admin only) |
| Admin schools | `/admin/schools`, `/admin/schools/new` | yes | create (Admin only) |
| Admin SPOCs | `/admin/spocs`, `/admin/spocs/new` | yes | create (Admin only) |
| Templates | `/admin/templates`, `/admin/templates/new`, `[id]/edit` | yes | create + edit (Admin only) |
| MOU import review | `/admin/mou-import-review` | yes | accept/reject (Admin only) |
| MOU cohort status | `/admin/mou-status` | yes | flip active/archived (Admin only) |
| PI counter | `/admin/pi-counter` | yes | read-only health view |
| Dispatch requests | `/admin/dispatch-requests`, `[requestId]` | yes | approve / reject (Admin only) |
| Reminders | `/admin/reminders`, `[reminderId]` | yes | mark done / pause (Admin) |
| Data snapshot | `/admin/data-snapshot` | yes | inspect counts; no writes |
| Notifications | `/notifications` | yes | inbox view |

## Auth + portal surfaces (Admin sees)

| Surface | Notes |
|---|---|
| `/login`, `/logout` | unchanged |
| `/help` | yes; quick links + feedback |
| `/feedback/*`, `/portal/status/*` | token-gated; Admin reaches via direct URL with token. Not a typical Admin path. |

## EDIT-gate preservation (Gate 1 MM2 acceptance)

Admin role + `department: 'ops'` (e.g. Misba) still gets BLOCKED on:
- `/api/pi/generate` (canGeneratePI returns false for ops dept; CLAUDE.md "VEX dispatch lifecycle role split" + the MM2 acceptance criterion).
- `/api/operations/vex/pi/create` (canEditFinanceData returns false for ops dept).
- `/api/finance/adjustments/[id]/reverse` (canEditFinanceData false).
- Tally export (canEditFinanceData false).

These preserve the Gate 1 decision: trusted Ops user with PI gates still enforced. Admin role + `department: null` (Anish, Ameet, Gowri) clears all gates as the cross-functional wildcard.

## Production lockdown path

Flip `TESTING_OPEN_ACCESS=false` on Vercel. VIEW gates become strict per department: Sales sees only Sales-aligned stages, Ops sees only Ops-aligned, Finance sees only Finance-aligned. Admin and Leadership remain the only cross-cutting roles. EDIT gates stay strict regardless of testing mode.

One-line env-flip; no code change required.

## Anomalies surfaced

None blocking. Two minor observations for the next gate:

1. `/admin/users` does not exist as a dedicated route today; the Sales team / Schools / SPOCs / School groups pages are the closest analogues. If a unified user management lands, it would surface naturally in the Admin toolbox.
2. The Sales dashboard's "Approve dispatches" tile points at `/dispatch` (the stage landing) rather than a Sales-specific approve queue. Gate 4 status-tracker work could add a `/dispatch/approvals?owner=mine` Sales view.

## Tests

- `src/components/ops/TopNav.test.tsx` (16 tests; Pipeline absent for every role).
- `src/app/dashboard/leadership/page.test.tsx` (9 tests; three sections render).
- `src/app/dashboard/finance/page.test.tsx` (5 tests; KPIs, cards, footer render).
- `src/app/admin/page.test.tsx` (9 tests; existing admin tile coverage; Leadership overview prepended without regression).
- `src/app/schools/[schoolId]/page.test.tsx` (5 tests; tabs render with default Overview active).

No test asserts "Admin cannot see X" because the Admin universal-access is the whole point; the EDIT gate preservation is covered by per-route API tests (e.g. /api/pi/generate canGeneratePI tests).
