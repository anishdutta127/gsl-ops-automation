# Gate 3.5 Step 1: current state audit

Snapshot taken 2026-05-11 before any Gate 3.5 changes. Documents every route, dashboard, and entity detail page in the platform so the consolidation pass (Steps 2-10) has a baseline to refactor against.

**Routes counted:** 90 `page.tsx` files under `src/app/`.

---

## 1. Top nav (NAV_STAGES at `src/components/ops/TopNav.tsx:39-47`)

Seven stages, in nav order:

| # | Label | href | Department | Status |
|---|---|---|---|---|
| 1 | Pipeline | /sales-pipeline | sales | **HIDE per Step 3** |
| 2 | Active MOUs | /mous | cross-functional | **RENAME to "MOUs" per Step 4** |
| 3 | Dispatch | /dispatch | ops | keep |
| 4 | Finance | /finance | finance | keep |
| 5 | Operations | /operations | ops | keep |
| 6 | Reports | /reports | neutral | keep |
| 7 | Admin | /admin | neutral | keep |

Plus the wordmark (link to /), help, logout, notification bell.

---

## 2. Routes by top-nav stage

### Stage 1: Pipeline (HIDE per Step 3)

- `/sales-pipeline` (list)
- `/sales-pipeline/new` (create)
- `/sales-pipeline/[id]` (detail)
- `/sales-pipeline/[id]/edit`
- `/sales-pipeline/[id]/mark-lost`

5 routes. Per Anish: hide entirely from nav; routes stay reachable via direct URL for Admin testing.

### Stage 2: Active MOUs (rename to MOUs per Step 4)

- `/mous` (list)
- `/mous/new` (template picker)
- `/mous/new/[templateId]` (wizard host)
- `/mous/archive` (cohort-archived view)
- `/mous/[mouId]` (detail)
- `/mous/[mouId]/draft` (annexure editor)
- `/mous/[mouId]/actuals` (actuals capture)
- `/mous/[mouId]/installments`
- `/mous/[mouId]/installments/[paymentId]/mark-pi-sent`
- `/mous/[mouId]/pi` (PI generation, lock-gated)
- `/mous/[mouId]/payment-receipt`
- `/mous/[mouId]/signed-values`
- `/mous/[mouId]/intake`
- `/mous/[mouId]/intake/edit`
- `/mous/[mouId]/dispatch`
- `/mous/[mouId]/delivery-ack`
- `/mous/[mouId]/feedback-request`
- `/mous/[mouId]/send-template/[templateId]`
- `/mous/[mouId]/kits-details` (Gate 3 Step 1 surface)

19 routes. Bookmark-stable since Gate 1.

### Stage 3: Dispatch

- `/dispatch` (stage landing with 3 index cards: raise request, pending review, active dispatches)
- `/dispatch/request` (raise new kit dispatch request)
- `/dispatch/kits` (Gate 3 Step 2 list view; Kits for Dispatch)
- `/dispatch/kits/[mouId]` (Gate 3 Step 3-8 detail)
- `/dispatch/kits/summary` (Gate 3 Step 9 final summary view)

5 routes.

### Stage 4: Finance

- `/finance` (stage landing card list)
- `/finance/payments` (single-amount matcher form)
- `/finance/payments/unmatched` (parked-payments triage)
- `/finance/pi/[paymentId]` (PI view + lock-gated download)
- `/finance/adjustments` (list + reversal)
- `/finance/tally-export` (XML export)

6 routes.

### Stage 5: Operations

- `/operations` (stage landing with 6 cards: Schools, Escalations, Inventory, VEX orders, Vendors, Agreements)
- `/operations/vex` (KPI + funnel + PI list + 28-SKU master + dispatches + 141-order tracker)
- `/operations/vex/pi/new` (lock-gated VEX PI form)
- `/operations/vex/pi/[id]` (VEX PI detail with dispatch progression)
- `/operations/vendors` (master list)
- `/operations/vendors/[id]` (detail + edit)
- `/operations/agreements` (NDA + vendor registry)
- `/operations/agreements/[id]` (detail + edit)

8 routes.

### Stage 6: Reports

- `/reports` (Gate 1 placeholder; no real content yet)

1 route.

### Stage 7: Admin

- `/admin` (484-line index with tile grid: dispatch requests, reminders, inventory, MOU import review, communication templates + plain link tiles for Audit, CC rules, Lifecycle rules, MOU cohort status, PI counter, Schools, SPOCs, Sales team, School groups, Data snapshot, Sync panel)
- `/admin/audit`
- `/admin/cc-rules` + `[ruleId]` + `new`
- `/admin/data-snapshot`
- `/admin/dispatch-requests` + `[requestId]`
- `/admin/inventory` + `[id]`
- `/admin/lifecycle-rules`
- `/admin/mou-import-review`
- `/admin/mou-status`
- `/admin/pi-counter`
- `/admin/reminders` + `[reminderId]`
- `/admin/sales-team` + `new`
- `/admin/school-groups` + `[groupId]` + `new`
- `/admin/schools` + `new`
- `/admin/spocs` + `new`
- `/admin/templates` + `new` + `[id]/edit`

23 routes. The Admin index is the densest tile grid in the app.

### Routes outside the top nav

- `/` (Operations Control Dashboard: RICH; the real ops cockpit)
- `/dashboard` (redirect to /)
- `/dashboard/leadership` (Gate 1 skeleton, 59 LOC, 4 primary-action cards)
- `/dashboard/ops` (Gate 1 skeleton, 59 LOC, 4 primary-action cards)
- `/dashboard/finance` (Gate 1 skeleton, 60 LOC, 4 primary-action cards)
- `/dashboard/sales` (Gate 1 skeleton, 59 LOC, 4 primary-action cards)
- `/dashboard/exceptions` (W4 exceptions feed)
- `/overview` (redirect to /)
- `/schools` + `[schoolId]` + `[schoolId]/edit` (the school surface; entered via Admin and links from MOU/Dispatch detail)
- `/escalations` + `[escalationId]` + `[escalationId]/edit` (Gate 1 Step 5 ticketing)
- `/kanban` (W4-I.5 P2C5 separate kanban surface)
- `/notifications` (W4 inbox)
- `/help`
- `/login`, `/logout`
- `/feedback/[tokenId]`, `/feedback/thank-you`, `/feedback/link-expired` (token-gated feedback portal)
- `/portal/status/[tokenId]`, `/portal/status/link-expired` (school status portal)

Important: `/` is the rich Operations Control Dashboard; `/dashboard/ops` is the 59-LOC skeleton. These are not the same page (see flag in §6 below).

---

## 3. Dashboards: CTAs visible at the dashboard tier

### `/` (Operations Control Dashboard, RICH; src/app/page.tsx, 185 LOC composing 8 dashboard sub-components)

Layout top to bottom:
- DashboardHeader: title + "Open Kanban Board" CTA + FY selector + date range + today's date
- DashboardFilterRow: programme chips + Apply / Reset + product chips (W4-I MM7)
- DashboardStatCards: 6 stat cards (Schools active, Pipeline contract value, Receivables, Open escalations, Low-stock SKUs, Pending dispatches)
- DashboardRecentMous (left, lg:col-span-2): table of recently-updated MOUs
- DashboardActionCenter (right): items needing attention
- DashboardOrdersTracker (left, lg:col-span-2): kit orders + dispatch status
- DashboardCommunicationPanel (right): comm-template quick-fire buttons (Send signed MOU, Send PI, Send feedback request, etc.)
- DashboardTemplates: template preview grid
- DashboardSalesPipelineSummary (conditional on user.department !== 'ops'; W4-I MM6); **HIDE per Step 3**
- footer

CTA count visible without scrolling: ~12 (stat cards count as informational, communication buttons + Apply + Open Kanban + filter chips count).

### `/dashboard/leadership` (skeleton, src/app/dashboard/leadership/page.tsx)

Single composition via DepartmentDashboardSkeleton with 4 PrimaryAction cards:
- Reports → /reports
- Operations Control Dashboard → /
- Escalations → /escalations
- Active MOUs → /mous

Plus empty recentActivity feed.

**Rebuild per Step 2.**

### `/dashboard/ops` (skeleton, src/app/dashboard/ops/page.tsx)

4 PrimaryAction cards:
- Raise dispatch → /dispatch
- Operations workspace → /operations
- Escalations → /escalations
- Active MOUs → /mous

**FLAG: ambiguity vs `/` (see §6).**

### `/dashboard/finance` (skeleton, src/app/dashboard/finance/page.tsx)

4 PrimaryAction cards:
- Finance landing → /finance
- Payments → /finance/payments
- PI generation → /finance/pi
- Tally export → /finance/tally-export

**Rebuild per Step 7 (two-card layout: payments needing attention + PIs awaiting payment).**

### `/dashboard/sales` (skeleton, src/app/dashboard/sales/page.tsx)

4 PrimaryAction cards:
- Sales pipeline → /sales-pipeline
- Active MOUs → /mous
- New MOU → /mous/new
- Operations workspace → /operations

**Replace Sales pipeline tile with placeholder per Step 3.**

### `/admin` (rich; src/app/admin/page.tsx, 484 LOC)

Tile grid with ~14 tiles. Counted CTAs in headline:
- StatCard-style tiles (with counts): Dispatch requests pending, Reminders pending, Inventory low-stock, MOU import review, Communication templates
- Plain link tiles: Audit, CC rules, Lifecycle rules, MOU cohort status, PI counter, Schools, SPOCs, Sales team, School groups, Data snapshot
- System sync panel (separate card with status + flash + per-trigger forms)
- Communication templates section

CTA count: ~20+.

**Restructure per Step 8 (combine Leadership three-section overview + Finance/Ops health tiles + Admin toolbox footer).**

---

## 4. Entity detail pages: actions visible at once

### School detail (`/schools/[schoolId]`, 164 LOC)

Actually pretty restrained:
- Header card with metadata + single "Edit" button (canEdit gate)
- Notes section (read-only)
- MOUs section: linked list of school's MOUs
- Audit log panel

**Action count: 1 visible button (Edit).** The brief's "too many actions visible at once" may refer to the lack of structure or the cumulative impression rather than literal button count. Step 5 wants tabs anyway (Overview / MOUs / Payments & PIs / Dispatches / Activity) which adds structure even if it doesn't strip actions.

### MOU detail (`/mous/[mouId]`, 746 LOC)

Multi-section page with conditional sections based on MOU status + user role:
- DetailHeaderCard with status pill + edit
- Status notes textarea (auto-save on blur)
- Communications shortcuts row (Send PI / Send dispatch / Send delivery ack / Send feedback request; gated)
- Installments mini-table with link to /installments
- PI generation card (lock-gated; banner instead of form when locked)
- Dispatch raise card
- Delivery acknowledgement card
- Feedback request card
- Intake capture / edit links
- Actuals capture link
- Kits dispatch details link (Gate 3 Step 1)
- Audit log

Button-count varies by status. Worst case (Active MOU with full role permissions): ~9 action affordances. The brief does not name MOU detail as needing restructure but it is the densest entity detail surface; Step 10 polish should at minimum harmonise spacing + button hierarchy here.

### Escalation detail (`/escalations/[escalationId]`)

Status transition affordances + audit + comment thread. Restrained surface.

### VEX PI detail (`/operations/vex/pi/[id]`)

Line items + dispatch tracker + payment recording + status transitions. Gate 2 Step 7's mirror of mou-system; clean.

### Kit dispatch detail (`/dispatch/kits/[mouId]`)

Multi-section by phase: allocation form / approval action / summary edit / accounts entry / shipment tracking / POD upload. Conditional on dispatch status; operators see only the affordances relevant to the current phase. Gate 3 Steps 3-8.

---

## 5. MOU drafting entry point: current placement audit

`/mous/new` is the template picker → `/mous/new/[templateId]` is the GeneratorWizard host. Surfacing today:

- **`/mous` page header:** check current state (likely a `+ New MOU` link or no link; need to fix per Step 4).
- **`/admin` page:** does not surface "new MOU" prominently; admin tiles point at MOU import review + MOU cohort status, not new-MOU.
- **`/dashboard/sales` skeleton:** has "New MOU → /mous/new" as a primary action card.
- **`/dashboard/ops`, `/dashboard/finance`, `/dashboard/leadership` skeletons:** no new-MOU CTA.
- **`/` Operations Control Dashboard:** no new-MOU CTA (the dashboard is read-most).
- **School detail page:** no new-MOU CTA (would need school pre-filled into wizard).

Step 4 adds: rename Active MOUs to MOUs in nav; `+ New MOU` on `/mous`; tab on school detail with `+ Draft New MOU for this school`; quick links on every dashboard.

---

## 6. Flagged surfaces

### 6.1 Route ambiguity: `/` vs `/dashboard/ops`

The Step 6 brief says "Preserve the existing Ops dashboard structure at `/dashboard/ops`. KPI tiles, recent MOU updates, action centre, orders tracker." But `/dashboard/ops` is a 59-LOC skeleton with 4 plain-link cards; the rich KPI-tile + action-centre + orders-tracker dashboard lives at `/` (Operations Control Dashboard).

Two interpretations:
- **A.** "Preserve" means leave `/` alone (since that's what the Ops team actually uses); the brief's `/dashboard/ops` path is a verbal slip. Sub-agent's Step 6 extends `/` with a Kanban tile and rebuilds `/dashboard/ops` to also surface the rich content (or to redirect to `/`).
- **B.** Build a new rich dashboard at `/dashboard/ops` with KPI tiles + action centre + orders tracker (extracting / re-using the lib helpers from `src/lib/dashboard/dashboardData.ts`), leaving `/` as the existing canonical surface. Then department-routed login eventually sends Ops users to `/dashboard/ops`.

**Needs Anish input before sub-agent starts on Step 6.**

### 6.2 Sales pipeline references to remove (Step 3)

Found in:
- `src/components/ops/TopNav.tsx` (NAV_STAGES entry "Pipeline → /sales-pipeline")
- `src/app/page.tsx` (DashboardSalesPipelineSummary, conditional on user.department !== 'ops')
- `src/components/ops/dashboard/DashboardSalesPipelineSummary.tsx`
- `src/app/dashboard/sales/page.tsx` (primary action card "Sales pipeline → /sales-pipeline")
- `src/components/ops/FilterRail.tsx` (likely a SalesPerson filter dimension)
- `src/app/escalations/[escalationId]/edit/page.tsx` (linked from escalation context)

Plus test files (tests stay; routes stay; only nav surfaces hide).

### 6.3 MOU entry point under-surfacing (Step 4)

Today's surfaces vs target per Step 4:

| Surface | Today | Step 4 target |
|---|---|---|
| Top nav | "Active MOUs" → /mous | "MOUs" → /mous |
| `/mous` list page header | (likely just a header, no CTA) | `+ New MOU` primary CTA |
| `/dashboard/leadership` | (none) | small text link "Recent MOU signed → school name" |
| `/dashboard/ops` | (none) | "Draft new MOU" quick link |
| `/dashboard/finance` | (none) | "Draft new MOU" quick link |
| `/dashboard/sales` | "New MOU → /mous/new" card | preserve / replace via placeholder card |
| school detail | (none) | "+ Draft New MOU for this school" on MOUs tab |

### 6.4 Frontend-design skill missing

The brief instructs reading `/mnt/skills/public/frontend-design/SKILL.md` once at the start of this gate. The file is not present on this Windows filesystem; the `/mnt/skills/public/` mount does not exist locally. Step 10 (visual polish per skill) needs either the skill text or its absence acknowledged before sub-agent / main CC start the polish pass.

**Recommend Anish copies the skill into the repo at `docs/skills/frontend-design.md` (or provides the text inline) before Step 10.**

---

## 7. Conceptual screenshot per dashboard

- **`/` Operations Control Dashboard.** Dense. Header with FY / date range filter. Stat-card row of 6 tiles in greyed pastel. Two two-column rows: MOU updates table next to Action Centre; Orders Tracker next to Communication Panel. Below: Templates grid. Conditionally a Sales Pipeline summary block at the bottom. Footer "Operations Control Dashboard - Internal use only." Feels comprehensive but information-dense. Mobile compresses to single column.
- **`/dashboard/leadership` skeleton.** Header. 4 plain card-links in a 2x2 grid. No data anywhere. Conveys "page exists; nothing to do." Mobile: single column.
- **`/dashboard/ops` skeleton.** Same shape as Leadership skeleton with different action labels.
- **`/dashboard/finance` skeleton.** Same shape.
- **`/dashboard/sales` skeleton.** Same shape.
- **`/admin`.** PageHeader breadcrumb. Stat-card row of ~5 tiles with counts. Plain link grid of ~10 sub-pages. System sync card with status + per-trigger form. Communication templates section. Mobile: each section stacks; the sub-tile grid collapses to 2 columns then 1.

---

## 8. Out of scope for Gate 3.5

- All Gate 3 functionality (Kits for Dispatch flow) stays as-shipped.
- All Gate 2 functionality (MOU drafting, payment matching, PI generation, VEX module) stays as-shipped.
- API routes and lib mutators do NOT change in Gate 3.5; only nav surfaces, dashboard composition, and entity-detail layout.
- Permission gates stay as Gate 1 left them; Step 9 verifies open-access for Admin testers without weakening EDIT correctness.

---

## 9. Inputs needed from Anish before sub-agent launch

1. **§6.1 ambiguity:** Step 6's `/dashboard/ops` -- is the canonical Ops dashboard at `/dashboard/ops` (build it up) or at `/` (extend with Kanban tile, leave `/dashboard/ops` as redirect)?
2. **§6.4 skill availability:** how to access the frontend-design skill for Step 10 polish.

Both are non-blocking for Step 1 (this audit), Step 3 (hide Sales pipeline), and Step 4 (MOU entry points). They block Step 6 (Ops dashboard) and Step 10 (polish).
