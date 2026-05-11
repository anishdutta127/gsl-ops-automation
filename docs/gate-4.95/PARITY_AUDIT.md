# PARITY_AUDIT.md: Gate 4.95

Per-panel feature-parity audit of `gsl-mou-system` vs `gsl-ops-automation`. Source-of-truth comparison so Gate 4.95's build steps + any subsequent gates can scope from a complete inventory rather than rolling discoveries.

Methodology: read every `page.tsx` under `gsl-mou-system/src/app/`, inspect every visible UI block (filter bar, KPI strip, list panel, breakdown row, footer link, modal, side panel). For each block, list its gsl-mou-system shape, the Ops-platform equivalent (if any), and a parity verdict.

**Verdicts:**
- **Full**: equivalent block exists on Ops platform with matching shape + data + behaviour.
- **Partial**: equivalent block exists but is materially narrower (different fields, missing computations, fewer states).
- **Missing**: Ops platform has no equivalent.
- **Replaced**: Ops platform has a deliberately different shape (Karpathy: not all gsl-mou-system patterns should port verbatim).

**Port priority:**
- **P0**: in scope for Gate 4.95.
- **P1**: defer to a Gate 4.95 follow-up session or Gate 5A's Reports module.
- **P2**: leave; Ops platform deliberately diverges or the block is gsl-mou-system-specific (e.g., legacy import flows).

---

## Sidebar / nav inventory

`gsl-mou-system/src/components/layout/Sidebar.tsx` defines this left-rail order:

| # | Label | Href | Ops platform equivalent | Verdict |
|---|---|---|---|---|
| 1 | Dashboard | `/` | `/` consolidated landing (different shape: 5-zone orientation surface, not Finance dashboard) | **Replaced** - landing is deliberately broader; per-dept dashboards live under `/dashboard/{finance,ops,leadership}` |
| 2 | Console | `/console` | none (analytical drill-down) | **Missing** P1 (Gate 5A Reports candidate) |
| 3 | MOU Registry | `/mous` | `/mous` | **Full** (Ops version richer per gates 1-3) |
| 4 | Reconcile | `/reconcile` | `/finance/payments` (PaymentMatcher) + `/finance/payments/unmatched` | **Full** (different UX: gsl-mou-system uses dedicated /reconcile form; Ops merged into /finance/payments) |
| 5 | Payments | `/payments` | `/finance/payments` | **Full** |
| 6 | Unmatched payments | `/payments/unmatched` | `/finance/payments/unmatched` | **Full** |
| 7 | Generate MOU | `/mous/new` | `/mous/new` | **Full** |
| 8 | MOU Pipeline | `/mous/pipeline` | `/kanban` (built per Gate 3.5) + `/mous` filterable | **Partial** - Kanban exists but is not the same as the simple pipeline table; see "MOU Pipeline" section below |
| 9 | VEX Orders | `/vex` | `/operations/vex` | **Full** |
| 10 | Agreements | `/agreements` | `/operations/agreements` | **Full** |
| 11 | Sales Team | `/sales-team` | `/admin/sales-team` | **Full** (Ops keeps it under /admin) |
| 12 | Alerts | `/alerts` | `/escalations` | **Partial** - different vocabulary; see "Alerts" section |
| 13 | Renewals | `/renewals` | none | **Missing** P0 (cited in Gate 4.95 brief amendment) |

---

## 1. Dashboard (`/` on gsl-mou-system, ~596 LOC)

This is the Finance + Leadership overview that prompted Gate 4.95. Lives at `gsl-mou-system/src/app/page.tsx`. Walking it panel by panel:

### 1.1 PageHeader

- gsl-mou-system: title "Dashboard" + subtitle showing either "Filtered view: …" or "As of {today}".
- Ops platform `/dashboard/finance`: title "Finance workspace", subtitle "PIs, payments, adjustments, Tally export in one view."
- **Verdict: Partial.** Header copy differs but isn't the issue; the filter subtitle is meaningful context that the Ops dashboard drops. **P0** to add filter-aware subtitle when the rebuild lands the filter bar.

### 1.2 Filter bar (`DashboardFilters.tsx`)

- gsl-mou-system: top-of-page filter bar with five controls:
  - Financial Year dropdown (current FY + prior + next 2)
  - From + To date pickers (override FY)
  - Programme chips multi-select (STEAM / Young Pioneers / Harvard HBPE)
  - Sales Channel chips multi-select (School Programs (Course) / Bootcamps / Partnerships - Govt Projects / Others)
  - URL-mirrored state (`?p=…&fy=…&from=…&to=…&sc=…`)
- Ops platform `/dashboard/finance`: no filter bar at all.
- **Verdict: Missing.** **P0** rebuild target. Gate 4.95 Step 2 brief specifies this filter bar.

Note: Ops platform's enum is `Programme = 'STEAM' | 'Young Pioneers' | 'Harvard HBPE' | 'Robotics'` (4 values, Robotics added in Gate 2). gsl-mou-system has 3. The Ops filter bar must include Robotics + VEX (VEX flows through `productSelection` rather than `programme` but the brief asks for it on the dashboard filter).

### 1.3 KPI strip - 4 cards

Top-strip 2x2 mobile, 4-up desktop:

| # | Label | Value | Hint | Tone | Ops equivalent |
|---|---|---|---|---|---|
| 1 | Active MOUs | count of non-pipeline-status MOUs | "{N} in pipeline" | lavender | Ops `/dashboard/finance` doesn't surface this; landing `/` Zone 1 has signedContractValueFy but not Active-MOU count tied to filter |
| 2 | Contract value | sum of contractValue | "across {N} schools - click to view" → `/dashboard/schools?…` | slate | Ops `/dashboard/finance` doesn't surface this either; landing Zone 1 has it filterless |
| 3 | Collected | percent | rupee received, with "{balance} open" trend arrow | sage | Ops Zone 1 has it filterless |
| 4 | Open alerts | count | "{N} high · {M} medium" | amber | Ops dashboard has no alerts KPI today |

- **Verdict: Missing** on `/dashboard/finance`. Ops landing `/` has a Commercial-position strip but it's not filter-scoped and lives on a different surface. **P0** rebuild target.

### 1.4 High-priority alerts panel (Section 2 in gsl-mou-system)

- Section header: "High-priority alerts" + "See all alerts" → `/alerts`
- 2-column grid (1-col mobile) of up to 4 alert cards
- Per card: Priority pill + type label + school name + 2-line description + `AlertCircle` icon + click → `actionLink`
- **Verdict: Missing.** Ops platform's nearest equivalent is `/escalations` list and the consolidated landing Zone 3 "Items requiring attention", but neither renders on `/dashboard/finance`. **P0** rebuild target.

### 1.5 Top overdue payments panel (Step 2.5 amendment Row 3.5 LEFT)

- Section header: "Top overdue payments" + "See registry →" → `/mous`
- Subtitle: "{N} payments past due"
- Up to 5 vertically-stacked cards. Each card:
  - Programme pill + PI number (or "(no PI)") on right
  - School name (bold)
  - `{instalmentLabel} · {description} · due {dueDateRaw or '-'}` context line
  - Balance amount in danger-red on right + "balance" label
  - Click → `/mous/{mouId}`
- Sort: descending by balance amount
- **Verdict: Missing.** Ops `/dashboard/finance` has a "Payments needing attention" card (different shape: surfaces unmatched bank entries, not overdue installments). **P0** rebuild target (explicitly called out in brief amendment).

### 1.6 Renewal needed panel (Step 2.5 amendment Row 3.5 RIGHT)

- Section header: "Renewal needed" + "See renewals →" → `/renewals`
- Subtitle: "{N} expired, {M} due in 30 days"
- Up to 5 vertically-stacked cards. Each card:
  - Programme pill + MOU status pill
  - School name (bold)
  - "Ends {DD-MMM-YYYY}" line
  - ExpiryChip on right ("expired Nd ago" / "expires in Nd" / "Active")
  - Click → `/mous/{mouId}`
- Sort: most-expired first
- **Verdict: Missing.** Ops platform has no renewals tracking at all (no `/renewals` route). **P0** rebuild target.

### 1.7 Amount Receipt Summary section

- Section header: "Amount Receipt Summary" + "Open drilldown" → `/dashboard/receipts?…`
- 4 KPI cards (2x2 mobile / 4-up desktop):
  - Total Schools (with instalments due in period)
  - Total Due (instalments due in period)
  - Received (payments logged in period)
  - Pending (Total Due − Received)
- Warning text if receipts > dues: "Receipts exceed dues by {amount}. Excess sits as a credit; surface in the drilldown."
- **Verdict: Missing.** Ops `/dashboard/finance` has neither this strip nor the `/dashboard/receipts` drilldown. **P0** rebuild target. The drilldown route is a P0-sized standalone build; mark for follow-up session within Gate 4.95.

### 1.8 VEX Kit Orders section

- Section header: "VEX kit orders" + "Open VEX" → `/vex`
- 4 KPI cards:
  - VEX schools (count + "{N} PIs in period")
  - Total Pipeline (sum of all VEX PI values)
  - Pending to dispatch (payment received, kits not dispatched)
  - Sales invoice amount (sum of tax-invoiced dispatches: Invoiced + Shipped statuses)
- **Verdict: Missing** on `/dashboard/finance`. Ops platform has `/operations/vex` (the full VEX detail surface) but no VEX summary tile on the Finance dashboard. **P0** rebuild target.

### 1.9 Programme breakdown section

- Section header: "Programme breakdown"
- One row per programme. Per row:
  - Programme pill + "{N} MOUs · {M} students" + rupee value on right
  - Horizontal bar visualising relative MOU count (max across programmes drives the 100% width)
- Footnote when filter active: "Filtered view. Clear the filters above to see every programme."
- **Verdict: Missing** on `/dashboard/finance`. Ops landing `/` Zone 2 has stage-bucketed bar (different metric). **P0** rebuild target.

### 1.10 Footer / trailing context

- No explicit footer beyond Tally export quick link (not present on gsl-mou-system's `/` dashboard).
- Ops `/dashboard/finance` already has Tally export footer.
- **Verdict: N/A** - Ops version is fine. Keep.

---

## 2. Console (`/console`, separate analytical drill-down)

Lives at `gsl-mou-system/src/app/console/page.tsx` + `ConsoleView.tsx`. Reads ConsoleData lib (~252 LOC of computation).

### 2.1 Panels

- ConsoleTopBar (date + share button)
- One-liner narrative paragraph
- Pulse (KPIs strip)
- IntelStrip (insights / "what we noticed" cards)
- CollectionsGapChart + PipelineVelocityChart (2-up)
- RiskRadarTable
- ProgrammeStateGrid + ProgrammeSalesGrid (2-up)
- TrendSmallMultiples
- WhatChangedWidget
- ShareButton (snapshot share link)

### 2.2 Verdict

**Missing.** Ops platform has no `/console` equivalent. The Console is an analytical / insights surface (small-multiples charts, risk radar, what-changed feed) - not transactional Ops work.

**P1**. Defer to Gate 5A's Reports module per the brief: "If analytical drill-down, defer to Gate 5A's Reports module."

---

## 3. Alerts (`/alerts`)

`gsl-mou-system/src/app/alerts/AlertsView.tsx` (~80 LOC visible).

### 3.1 Panels

- Priority filter chips (High / Medium / Low)
- Type filter chips (Payment Overdue / Count Mismatch / Renewal Due / Missing Data)
- Counter "{N} of {M} alerts"
- Sorted alert list (priority order then school name): Priority pill + Type + School name + description + `actionLink`

### 3.2 Ops platform comparison

- Ops `/escalations` list page has similar shape (lane / level / status filters; sorted by severity).
- gsl-mou-system Alert types ('Payment Overdue', 'Count Mismatch', 'Renewal Due', 'Missing Data') vs Ops EscalationCategory ('Dispatch Delay', 'Payment Issue', 'Quality Complaint', 'Training Issue', etc.) - semantically overlapping but not 1:1.
- The gsl-mou-system Alert is a denormalised view of multiple data conditions (overdue payment → alert; expiring MOU → alert). Ops Escalation is a ticket entity created on user / system action.

### 3.3 Verdict

**Replaced** - Ops platform deliberately uses Escalations as the canonical entity. The "alerts" semantic (computed from data conditions, not ticketed) is missing from Ops. However, the consolidated landing Zone 3 + Finance dashboard 1.4 high-priority alerts panel together cover most of the value.

**P0** to ensure the high-priority alerts panel from §1.4 lands on the Finance dashboard rebuild. **P1** to consider a `/alerts` route that computes data-driven conditions (overdue payment, expiring MOU, count mismatch); defer.

---

## 4. Reconcile (`/reconcile`)

`gsl-mou-system/src/app/reconcile/ReconcileForm.tsx`. Single-page candidate-matcher form: enter amount + date + bank ref → ranked candidate list.

### 4.1 Verdict

**Full.** Ops `/finance/payments` has the PaymentMatcher component (the same shape: amount + date + narration + ranked candidates). The Reconcile route on gsl-mou-system is a dedicated landing for this flow; Ops merged it into the payments surface. Functional parity exists. **P2** to add a `/reconcile` alias if Pranav's muscle memory needs it.

---

## 5. Renewals (`/renewals`)

`gsl-mou-system/src/app/renewals/page.tsx` (~163 LOC). Bucketed timeline of MOUs by daysToExpiry:

### 5.1 Panels

- PageHeader with actionable-count subtitle: "{N} MOUs need attention in the next 90 days. Renewals are owned by sales; this view is the accounts-team early warning."
- Five bucket sections:
  - Already expired (daysToExpiry < 0)
  - Expiring this week (0-7 days)
  - Expiring this month (8-30 days)
  - Next 90 days (31-90 days)
  - Beyond 90 days
- Per bucket: header + count badge + per-MOU row card (programme pill + status pill + MOU id + school name + end date + ExpiryChip + contract value)
- Empty state when no actionable MOUs

### 5.2 Verdict

**Missing.** Ops platform has no `/renewals` route. **P0** rebuild target per Gate 4.95 Step 7 amendment. The "Renewal needed" panel on the Finance dashboard (§1.6) links here.

---

## 6. MOU Pipeline (`/mous/pipeline`)

`gsl-mou-system/src/app/mous/pipeline/page.tsx`. Simple table of draft + sent + awaiting-signature MOUs.

### 6.1 Verdict

**Partial.** Ops platform has:
- `/kanban` (the kit-dispatch workflow Kanban from Gate 3.5)
- `/mous?status=pending-signature` (filterable list)

The Kanban is a richer surface but covers the *dispatch* lifecycle, not the MOU drafting pipeline. **P1** to add a `/mous/pipeline` simple-table view if Pranav misses it; the brief's Gate 4.95 Step 6 is the *dispatch* Kanban, not this.

---

## 7. VEX Orders (`/vex`)

Both platforms have a full VEX detail surface. Ops route is `/operations/vex`. gsl-mou-system has `/vex`.

### 7.1 Verdict

**Full.** Ops version is at least as complete. **P2** to add a `/vex` alias redirect if Pranav's muscle memory needs it.

---

## 8. Agreements (`/agreements`)

Both platforms have an agreements registry. Ops at `/operations/agreements`.

### 8.1 Verdict

**Full.** **P2** to add a `/agreements` alias redirect if Pranav's muscle memory needs it.

---

## 9. Sales Team (`/sales-team`)

gsl-mou-system has a full CRUD surface at `/sales-team` with edit + create routes.

### 9.1 Verdict

**Full.** Ops version under `/admin/sales-team`. **P2** to add a `/sales-team` alias redirect if Pranav's muscle memory needs it.

---

## 10. School-wise drilldown (`/dashboard/schools`)

Linked from the Dashboard's "Contract value" KPI (§1.3 #2). Lists every school inside the dashboard's filter set with city/state/programme/MOU id/contract value/received/balance.

### 10.1 Verdict

**Missing.** Ops platform has `/schools` (a general school list) but no filter-scoped drilldown from a Finance dashboard tile. **P0** rebuild target. The drilldown route lands as part of the Finance dashboard rebuild (Step 2) so the "Contract value" KPI's click-through has somewhere to go.

---

## 11. Receipts drilldown (`/dashboard/receipts`)

Linked from the Dashboard's "Amount Receipt Summary" section (§1.7). Probably a school-wise per-period payment breakdown.

### 11.1 Verdict

**Missing.** Ops platform has no equivalent. **P0** rebuild target alongside the Amount Receipt Summary panel.

---

## 12. Payments page (`/payments`)

`gsl-mou-system/src/app/payments/page.tsx`. PaymentLogForm + unmatched queue + recent-matched list.

### 12.1 Verdict

**Full.** Ops `/finance/payments` has the same shape (PaymentMatcher + unmatched queue + recent matched). The gsl-mou-system form is a "log a payment" flow; Ops is a "match an existing bank entry" flow. Functionally the same outcome.

---

## 13. Generate MOU + MOU detail flows

gsl-mou-system has full MOU draft generator + detail pages. Ops platform has same at `/mous/new/[templateId]` and `/mous/[mouId]`.

### 13.1 Verdict

**Full** - Ops gates 1-3 ported these in detail and added more (Kanban transitions, audit log integration, status tracker).

---

## Inventory of UI primitives gsl-mou-system uses that Ops platform must also support

Per-panel rebuild requires these atomic components. Ops platform has equivalents but with different names/shape; the Step 2 build either uses Ops equivalents or ports as needed.

| gsl-mou-system primitive | Use site | Ops equivalent | Action |
|---|---|---|---|
| `KpiCard` (label/value/hint/tone/trend) | Dashboard KPI strip + Amount Receipt + VEX | `<DashboardStatCards>` row primitives + `KpiBlock` in landing | Use the existing Ops `KpiBlock` shape; add `tone` + `trend` props if not present |
| `DataCard` + `SectionHeader` | Every section | inline `<section>` + `<h2>` patterns | Build a tiny `SectionHeader` in `src/components/dashboard/` |
| `ProgrammeBadge` (programme pill) | Alerts / overdue / renewal cards | Programme-accent classes from `landingData` | Build a tiny `ProgrammeBadge` component |
| `MouStatusPill` + `PriorityPill` | Multiple lists | Ops uses `<StatusChip>` already | Reuse `StatusChip` with tone mapping |
| `ExpiryChip` (daysToExpiry → "expired Nd ago" / "expires in Nd") | Renewal panel | none | Build small component |
| `DateChip` (ISO → DD-MMM-YYYY) | Multiple | `formatDate()` helper exists | Use `formatDate` inline |
| `MoneyAmount` (compact rupee formatter) | Everywhere | `formatRs(amount, { compact: true })` | Use existing helper |
| `EmptyState` | Multiple | Exists in `src/components/ops/EmptyState.tsx` | Reuse |
| `DashboardFilters` (filter bar) | Dashboard top | none | Build new component in `src/components/dashboard/` |

---

## Scope decisions for Gate 4.95 build steps

### Confirmed P0 (in scope, Gate 4.95):

1. **Step 2: Finance dashboard rebuild** - covers panels §1.1 through §1.9 plus the Step 2.5 side panels (§1.5 + §1.6).
2. **Step 4: Landing zone reorder** - already in brief.
3. **Step 5: Top nav routing** - already in brief.
4. **Step 6: Kanban view at /dashboard/ops/kanban** - separate from the gsl-mou-system MOU pipeline; Ops-specific dispatch-lifecycle Kanban per Gate 3.5 Step 6.
5. **Step 7 - Renewals route (`/finance/renewals`)** - per §5 verdict. Bucketed timeline.
6. **Step 7 - Schools drilldown (`/dashboard/schools` or similar)** - per §10. So "Contract value" KPI click-through lands somewhere.
7. **Step 7 - Receipts drilldown (`/dashboard/receipts`)** - per §11. So "Amount Receipt Summary" "Open drilldown" link lands.

### Recommended P1 (defer to follow-up session within Gate 4.95 or to Gate 5A):

8. **Console** (§2) - Gate 5A Reports module.
9. **`/alerts` route as a data-driven alerts feed** (§3) - Ops Escalations covers the ticketed surface; the data-driven alerts feed is nice-to-have.
10. **MOU Pipeline simple-table view** (§6) - Ops `/kanban` is a richer surface for a different flow; the simple pipeline table may not be needed.
11. **Path aliases** (`/reconcile`, `/agreements`, `/vex`, `/sales-team` → Ops equivalents) - muscle-memory aid only.

### Out of scope (Replaced or Full):

12. Sidebar items 3, 5, 6, 7, 9, 10, 11 (verdicts Full).
13. Sidebar item 1 (Dashboard → `/`) - Ops landing is deliberately different.

---

## Session sequencing recommendation

This audit is large; the build pieces it implies are larger. To avoid the CC ship-pattern (shipping half-baked):

**Session 1 (this session):** audit doc (this file) + landing reorder (Step 4) + nav routing (Step 5). Push and stop.

**Session 2:** Finance dashboard rebuild (Step 2 + 2.5 side panels). Heavy UI work; merits a dedicated session.

**Session 3:** Ops dashboard augmentations (Step 3) + Kanban (Step 6).

**Session 4:** Renewals route + Schools drilldown + Receipts drilldown (Step 7 items 5-7 above). Verification + final report.

If any session reveals a surface from this audit's P0 list that's been missed, it gets added as a commit in the relevant session - not silently skipped, per the brief's "no more surprises" rule.

---

## Decisions for Anish review

These two items deserve an explicit call before the Finance rebuild lands:

1. **VEX in the programme filter.** gsl-mou-system filter chips list only 3 programmes (STEAM / YP / HBPE). Ops platform has 4 programmes in the enum (STEAM / YP / HBPE / Robotics) + VEX as a separate productSelection. The Gate 4.95 brief says "Product chips multi-select: STEAM | Young Pioneers | Harvard HBPE | Robotics | VEX". Confirming: filter exposes 5 chips; the VEX chip filters on `productSelection='VEX'` rather than `programme`, since VEX doesn't have a `programme` value in our enum.

2. **`/dashboard/receipts` location and shape.** gsl-mou-system places it under `/dashboard/`. Ops platform's `/dashboard/` namespace is reserved for department dashboards (`finance`, `ops`, `leadership`, `accountability`). Should the receipts drilldown live at:
   - `/dashboard/finance/receipts` (under Finance dashboard's tree), or
   - `/finance/receipts` (under the Finance work surface tree, alongside `/finance/payments` and `/finance/pi/pending`)?
   Recommendation: `/finance/receipts` to keep Ops platform's namespace convention (`/dashboard/*` is the at-a-glance views; `/finance/*` is the work surfaces). Same recommendation for Schools drilldown: `/finance/schools-receipts` or just augment `/schools` with filter params.
