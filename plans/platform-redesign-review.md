# Platform Redesign Review: Separating Visibility from Function

**Status:** Diagnostic and design proposal. No code changed. For review by Anish and advisor before any implementation.
**Date:** 2026-06-02
**Author:** CC teardown, grounded in a full read of `src/app` and `src/components`.
**Scope:** The Cretile / VEX order-and-kit-dispatch slice the platform currently covers, plus the MOU lifecycle, finance, and visibility surfaces. Out of scope: YP year-long courses, trainer scheduling (noted for future-proofing only).

---

## How to read this document

Sections 1 to 3 are the target picture: what is wrong, what the best tools do, and the proposed structure. Read those with the advisor and lock the target. Section 4 is the sequenced build plan; we execute it phase by phase, each with its own approval.

The anchoring diagnosis, stated once so the rest of the document can refer back to it:

> The platform conflates **VISIBILITY** (passive surfaces you watch: health, money flow, order movement, feedback) with **FUNCTION** (active surfaces where you do work: create and manage MOUs, recalc payment cycles, log and match payments, dispatch kits, confirm delivery). Within function, it further tangles **Finance work** with **Ops work**. Almost every complexity complaint traces back to one of those two tangles. The fix is structural separation, not feature removal: every function keeps its information, it just moves to a surface that does one job.

A second finding sharpened the first during the teardown: the platform does not just tangle visibility and function, it **duplicates** each of them. There are four parallel stage vocabularies, ten on-screen stage widgets, eleven dashboard routes (eight live, three redirects), and the same five or six actions scattered across seven-plus surfaces each. The platform grew by accretion, and the accretion is measurable.

---

# SECTION 1: Redundancy and Complexity Audit

Everything below is grounded in specific files. Where a line number is cited it was read directly; where only a file and label are cited the action was located by search and the exact line may have shifted.

## 1.1 Duplicated buttons and actions

The same user action is reachable from many places, with inconsistent labels. This is the most visible adoption tax: an operator never learns "where the button is" because there are five of them, each named differently.

| Action | Where it appears (file) | Count | Risk |
|---|---|---|---|
| **Create MOU** | `src/app/mous/page.tsx` ("New MOU"); `src/app/dashboard/sales/page.tsx` ("Draft new MOU" / "+ Draft new MOU"); `src/app/schools/[schoolId]/page.tsx` ("+ Draft new MOU"); `src/components/dashboard/ConsolidatedLanding.tsx` (QuickActions "New MOU") | ~7 instances, 3 different labels | HIGH |
| **Log / record a payment** | `src/app/finance/page.tsx` ("Log a payment"); `src/app/finance/payments/new/PaymentLogForm.tsx`; `src/app/finance/payments/log-batch/page.tsx`; `src/app/finance/payments/bulk/page.tsx`; `src/app/finance/payments/unmatched/page.tsx`; `src/app/mous/[mouId]/installments/page.tsx` ("Log payment" per row); `src/app/operations/vex/pi/[id]/VexPiActions.tsx` | ~7 instances across 3 sub-systems | HIGH |
| **Raise / manage a dispatch** | `src/app/operations/page.tsx` (Kit dispatch + Dispatch requests cards); `src/app/dispatch/kits/page.tsx`; `src/app/dispatch/kits/[mouId]/page.tsx`; `src/app/dispatch/kits/summary/page.tsx`; `src/app/dispatch/request/page.tsx`; `src/app/mous/[mouId]/dispatch/page.tsx`; `src/app/mous/[mouId]/page.tsx` ("Dispatch", line 543); `src/app/dashboard/sales/page.tsx` ("Raise dispatch"); `src/app/admin/dispatch-requests/page.tsx`; `src/components/dashboard/ConsolidatedLanding.tsx` (QuickActions "Raise dispatch") | 15+ instances | VERY HIGH |
| **Generate / send PI** | `src/app/mous/[mouId]/pi/page.tsx` (primary); `src/app/mous/[mouId]/installments/page.tsx` ("Generate PI"); `src/app/mous/[mouId]/installments/[paymentId]/mark-pi-sent/page.tsx`; `src/app/finance/pi/pending/page.tsx`; `src/app/operations/vex/pi/new/VexPiForm.tsx`; `src/components/dashboard/ConsolidatedLanding.tsx` (QuickActions "Generate PI") | 6 instances across MOU + VEX | MEDIUM-HIGH |
| **Match a payment** | `src/app/finance/payments/page.tsx` (matcher); `src/app/finance/payments/match/[paymentLogId]/page.tsx`; `src/components/dashboard/ConsolidatedLanding.tsx` (QuickActions); `src/app/dashboard/finance/page.tsx` ("Match" per unmatched row) | 4 instances | MEDIUM |
| **Update student count** | `src/app/mous/[mouId]/page.tsx` (line 511, "Update student count") | 1, plus an adjustment-type option in `src/app/finance/adjustments/new/page.tsx` | LOW |
| **Feedback request** | `src/app/mous/[mouId]/page.tsx` (line 546, "Feedback") | 1 canonical | LOW |
| **Delivery ack** | `src/app/mous/[mouId]/page.tsx` (line 549, "Delivery ack") | 1 canonical | LOW |

Two compounding problems beyond raw count:

1. **Inconsistent copy for the same action.** "New MOU" vs "Draft new MOU" vs "+ Draft new MOU". "Dispatch" (no verb) vs "Raise dispatch" vs "Request dispatch". "Feedback" vs "Feedback request". A user cannot pattern-match a verb that keeps changing.
2. **The landing-page QuickActions zone re-duplicates the top offenders.** `ConsolidatedLanding.tsx` carries a `QUICK_ACTIONS` array (New MOU, Match payment, Raise dispatch, Raise escalation, Generate PI). These are not new entry points to new work; they are a sixth copy of buttons that already exist on the MOU list, the Finance workspace, the dispatch tree, and the MOU detail bar. A quick-action zone is a good idea executed as duplication rather than as a single command surface (see Section 2, P6, and Section 3.3).

**Genuinely redundant vs legitimately multiple.** Some multiplicity is real and should consolidate (three payment-logging routes, the QuickActions copies). Some is domain-legitimate and should stay but be made coherent: MOU-side PI and VEX-side PI are different documents with different counters, so two generators is correct, but both should be discoverable from one place (Finance), which today they are not.

### The five ways to record a payment

This deserves its own callout because it is the clearest single example of accretion.

1. `src/app/finance/payments/new/page.tsx` : manual single entry.
2. `src/app/finance/payments/log-batch/page.tsx` : per-school multi-row batch.
3. `src/app/finance/payments/bulk/page.tsx` : CSV upload with fuzzy school matching.
4. `src/app/finance/payments/page.tsx` : the matcher (you already know the amount, find the PI).
5. `src/app/mous/[mouId]/installments/[paymentId]/mark-paid/page.tsx` and `.../mark-partial/page.tsx` : per-instalment inline from the MOU.

All five write a payment. There is no on-screen story for which to use when. Given the brief's emphasis on the **dynamic** business (counts and payments shift constantly), payment recording is the single most-repeated daily Finance act, and it is the most fragmented surface in the app.

## 1.2 Duplicated representations of the same concept

### The two kanbans (and why they are really one route with a hidden door)

There is a single kanban **route**, `src/app/kanban/page.tsx`, which hosts **two views** behind a pill toggle (`KanbanViewToggle`):

- **Lifecycle view** (`?view=lifecycle`, default): the 10-column MOU pipeline, interactive, drag-to-advance (`KanbanBoard.tsx` + `StageColumn.tsx`).
- **Operations view** (`?view=operations`): the 6-column kit-dispatch workflow, read-only (`OpsWorkflowKanbanBoard.tsx`).

The old second route `src/app/dashboard/ops/kanban/page.tsx` is now just a permanent redirect into `?view=operations`. So the "two boards" were already merged at the route level in a prior gate. **The real defect is not that there are two boards. It is that the merged board is not in the navigation at all.** `TopNav` (`src/components/ops/TopNav.tsx`, `NAV_STAGES`) links only to `/mous`, `/operations`, `/finance`, `/reports`, `/admin`. There is no Kanban link. The board is reachable only by typing the URL or via the "MOU Pipeline" CTA buried in the Ops dashboard header (`DashboardHeader.tsx`). This is precisely the "the MOU kanban is useless because it is hidden" complaint, confirmed at the source.

Verdict: **keep one board, give it a home.** The toggle model is correct. It needs a nav entry and a clear identity (see Section 3.3). Do not build a third board.

### Four stage vocabularies for one lifecycle

This is the deeper representational debt. Four different definitions of "what stage is this MOU at" exist, with 6, 8, 9, and 10 stages respectively:

| Model | File | Stages | Used by | Interactive |
|---|---|---|---|---|
| **A. Portal lifecycle** | `src/lib/portal/lifecycleProgress.ts` | 8: mou-signed, post-signing-intake, actuals-confirmed, cross-verification, invoice-raised, payment-received, kit-dispatched, delivery-acknowledged, feedback-submitted | `LifecycleProgress.tsx` (MOU detail sidebar + SPOC portal), `StatusBlock.tsx` (emails) | Read-only |
| **B. Kanban lifecycle** | `src/lib/kanban/deriveStage.ts` | 10: Model A + a `pre-ops` triage column | `KanbanBoard.tsx` (`/kanban?view=lifecycle`) | Drag-to-advance |
| **C. Status tracker** | `src/lib/statusTracker.ts` | 10: pipeline, mou-uploaded, active, payment-pending, installment-1-received, pi-generated, dispatch-requested, shipment-in-progress, delivered, closed | `StatusTracker.tsx` (MOU detail header + school detail mini-trackers) | Click-to-anchor |
| **D. Ops workflow** | `src/lib/kanban/opsWorkflowKanban.ts` | 6: awaiting-actuals, allocation-in-progress, pending-sales-approval, ready-for-dispatch, in-transit, delivered | `OpsWorkflowKanbanBoard.tsx` (`/kanban?view=operations`) | Read-only |

These disagree on real semantics, not just labels. "Payment pending" is an explicit stage in C but is skipped in A and B. Dispatch is one terminal bucket in A/B, three stages in C, and six stages in D. The MOU detail page renders **two of these at once** (Model C as the "Master status tracker" at the top, Model A as "Lifecycle (instalment 1)" in the sidebar), so a single screen shows the same MOU at two different stage counts. That is a direct source of "even I find it confusing."

Verdict: this is genuine redundancy. One canonical stage model should be defined in data and every widget derived from it (Section 3.6 and Section 4, Phase 5). Flagged explicitly per the constraint: consolidating these four is the one place this review recommends collapsing representations, and no information is lost because they describe the same lifecycle.

### Ten widgets that draw a progression

Beyond the four models, ten distinct components render a stage/pipeline/progress visual: `KanbanBoard`, `StageColumn`, `OpsWorkflowKanbanBoard`, `StatusTracker`, `LifecycleProgress`, `StatusBlock` (email), `KanbanViewToggle`, `KanbanOverviewTabs`, `DashboardOrdersTracker`, `DashboardSalesPipelineSummary`. Several are navigation chrome rather than true stage art, but the operator cannot tell that; they read as "yet another progress thing." Consolidating the models (above) lets several of these collapse into one shared primitive.

### Duplicated dashboards and tiles

The dashboard layer is itself duplicated. Eleven `/dashboard*` routes exist; three are redirects to `/` (`/dashboard`, `/dashboard/overview`, `/overview`, and `/dashboard/admin` all funnel to the consolidated landing). The Finance health tile and Operations health tile render on both `/` (`ConsolidatedLanding.tsx`) and `/dashboard/leadership` (`LeadershipOverview.tsx`). The four money KPIs (signed value, received, conversion, DSO) appear in both `LeadershipOverview` MoneySection and the `/dashboard/finance` KpiStrip. The exception feed is computed by one aggregator (`buildExceptionFeed`) but surfaced both truncated on `/` and in full at `/dashboard/exceptions`. Same data, multiple independent fetches and renders.

## 1.3 The MOU detail view: record + workspace + status board at once

`src/app/mous/[mouId]/page.tsx` is 1,219 lines and tries to be three things simultaneously. Full inventory of what it renders today:

**Top region (sticky action bar):**
- MOU id, programme/sub-type, academic year, status chip.
- Action buttons: Update student count, Annexure, Signed values, Instalments, Dispatch, Feedback, Delivery ack (7 buttons, role-gated).
- A collapsible "Status notes" editor (free-text, writes to `mou.delayNotes`).
- Financial-year tabs for multi-year MOUs (All years + per-FY).

**Gate-4 block (between bar and body):**
- Master status tracker (Model C, 10-stage) with an "Owned by" pill linking to `/admin/stage-responsibility`.
- Dispatch override section (request / approve / reject flow with its own state machine).
- Workflow banner (amber, with a CTA and a "Send reminder" POST form).
- Recent critical changes list (top 5 from the audit log).

**Left column (60%):**
- Detail header card: school link, scope (with tooltip), sales person (with edit-history reveal), trainer model, students MOU/actual (with edit-history reveal), contract value (derived from current count × spWithTax, with edit-history reveal), received, balance, start/end, payment schedule.
- Lifecycle (instalment 1) progress (Model A, 8-stage) : a **second** stage visual on the same page.
- Recalc preview (`RecalcSummary`): the dynamic-recalc engine output.
- Paid + adjustments summary (3 KPIs + per-adjustment list).
- Audit log panel (max-h-96 scroll).

**Right column (40%), six collapsible cards:**
- Smart suggestions (template recommendations), Intake, Instalments, Dispatches, Communications, Escalations.

That is, on one screen: **the canonical record** (header card, metadata), **a workspace** (7 action buttons + status notes editor + send-reminder form + override request form), and **a status board** (two different lifecycle visuals, workflow banner, critical changes, owned-by pill). The overload is structural, not cosmetic. The single most important daily fact, the dynamic money picture (current count, recalculated schedule, what is paid, what is due, what changed), is split across the header card, the Recalc preview, the Paid+adjustments summary, and the Instalments card, none of which is the obvious "this is the state of this contract" focal point.

This page is the prime candidate for progressive disclosure (Section 3.6).

## 1.4 Surfaces that mix visibility with function

The tangles, named with their embedded function:

- **`/dashboard/finance`** (`src/app/dashboard/finance/page.tsx`): a watch surface (KPI strip, overdue panels, programme breakdown, receipts summary) that also carries **act** buttons: "Match" per unmatched row, "Re-send PI" per awaiting-PI row, "Run new export", "View receipts". It is a dashboard you cannot help but work inside.
- **`/dashboard/ops`** (`src/app/dashboard/ops/page.tsx`): stat cards, breakdowns, recent-MOU table, orders tracker (watch) plus a communications panel with three "send template" buttons and an action centre (act).
- **`/` (ConsolidatedLanding)**: commercial KPIs, operational counts, attention feed (watch) plus the QuickActions zone (act) discussed in 1.1.
- **MOU detail** (1.3): the most concentrated mix.
- **`/operations` landing** (`src/app/operations/page.tsx`): not visibility-vs-function so much as **department-vs-department**, see 1.5.

The pattern: every dashboard slowly grew action buttons because the actions were not discoverable elsewhere, which made the dashboards heavier, which made them less calm to watch. Separating the two layers fixes both ends at once.

## 1.5 Buried and mis-filed functionality

- **The kanban has no nav entry** (1.2). Most-cited example of the corner problem.
- **`/dashboard/exceptions`** (the full attention feed) is reachable only via a "View all" link on the landing page. There is no nav path to "everything needing attention".
- **`/dashboard/leadership`** and **`/dashboard/leadership/accountability`** (stage ownership, stalled-MOU view): not in nav; reached only by drilling from `/admin` or typing the URL. The accountability view is genuinely useful leadership content with no front door.
- **PI generation is not discoverable from Finance.** `/finance` explicitly says (header copy) "PI generation lives on the per-MOU route at /mous/[id]/pi." A Finance user opening their own workspace cannot start the single most important finance document from there. VEX PI generation lives under `/operations/vex/pi/new`, a third location, under the **Ops** tab.
- **The Operations landing mixes departments.** `src/app/operations/page.tsx` `ENTITIES` lists Kit dispatch and Dispatch requests (Ops execution) alongside Schools, Escalations, Inventory (shared/Ops master data) **and** VEX orders, Vendors, Agreements (procurement / finance-adjacent). An Ops user is shown vendor-agreement renewal tracking next to their dispatch queue; a Finance user is never shown VEX at all from `/finance`. Asymmetric and mis-filed.
- **Orphaned / dormant components**: `OverviewContent.tsx` (preserved, unmounted), `DashboardSalesPipelineSummary.tsx` (imported but not rendered in the ops dashboard), `SyncFreshnessTile.tsx` (built, intentionally not mounted per CLAUDE.md). Not user-facing harm, but evidence of accretion; note for cleanup, do not delete pre-existing dormant code as part of this review.

## 1.6 Navigation reachability map

What the five-item top nav actually reaches, and what it strands:

```
TopNav (top, horizontal)
├─ /mous          → MOU registry (the real workhorse list)
├─ /operations    → card grid mixing ops + procurement (1.5)
├─ /finance       → card grid, no PI generation (1.5)
├─ /reports       → reports landing + 3 dashboards + 5 reports
└─ /admin         → admin toolbox + leadership overview

Reachable ONLY by URL or buried CTA (no nav front door):
   /kanban (the unified board)         ← the headline burial
   /dashboard/exceptions               ← all attention items
   /dashboard/leadership               ← leadership console
   /dashboard/leadership/accountability← stage ownership / stalls
   /dashboard/ops, /dashboard/finance  ← reached via /operations,/finance activePaths
```

The nav is organised as **workflow stages** (a deliberate past decision, per the TopNav header comment) but the stages do not map to how the two teams actually think about their day, and the most useful watch surfaces are not on it at all.

---

# SECTION 2: SaaS Benchmark Research

How best-in-class B2B tools structure exactly this problem: living records with dynamic values, money flow, and two teams doing separate execution, with leadership watching. Every claim is grounded in a retrieved source (URLs inline). We want to learn the patterns and then exceed them.

## 2.1 Linear: personal work separated from progress overview

Linear's left-nav encodes the visibility/function split directly. The top block holds surfaces you *act in* (**Inbox**, **My Issues**); below sit **Views**, **Projects**, **Cycles** as the curated and progress surfaces ([My Issues](https://linear.app/docs/my-issues), [Inbox](https://linear.app/docs/inbox)).

- **My Issues is "your work this week" done right**: a curated view with a default "Focus" ordering by urgency, blockers, SLA, and cycle status, split into Assigned / Created / Subscribed / Recent tabs. It is opinionated by default, not a filter the user assembles ([My Issues](https://linear.app/docs/my-issues)).
- **Projects/Cycles are the watch surfaces**: progress graphs, completion ranges, velocity, scope change ([Projects](https://linear.app/docs/projects)). The explicit payoff is that leadership checks progress without disrupting the people doing the work ([how teams use Linear](https://build.plumhq.com/how-we-use-linear/)).

**Takeaway:** the same records, three lenses, a notification lens, a personal-work lens, and a progress lens. Nobody filters one firehose.

## 2.2 Stripe: dashboard you watch vs object workspace you act in

Stripe groups the sidebar **by object type** and separates monitoring from action ([Web Dashboard](https://docs.stripe.com/dashboard/basics)).

- **Watch**: Home (charts), Balances, Transactions, Reporting/Sigma.
- **Act**: Billing/Invoicing is the living-object workspace, where you create and send invoices, manage subscriptions, apply discounts ([Manage invoices](https://docs.stripe.com/invoicing/dashboard/manage-invoices)). An invoice is a stateful object with an explicit lifecycle (draft → open → paid → void), and the workspace is built around moving it through that lifecycle ([How invoicing works](https://docs.stripe.com/invoicing/overview)).

**Takeaway:** money you *watch* (balances, payouts, charts) is a different destination from money you *work* (the invoice workspace). Directly analogous to our Leadership health view vs the Finance payment-and-PI workspace.

## 2.3 Modern CRMs: one pipeline board you watch, one record you edit

The clearest precedent for "boards you watch vs records you edit" and for progressive disclosure on a changing record.

- **One canonical pipeline board.** A single kanban shows deals moving through stages; you drag a card to advance it, and you can toggle the same pipeline between board and list without losing context ([Pipeline CRM Kanban](https://pipelinecrm.com/features/kanban/)). The industry itself warns a board gives "visibility but not execution," which is exactly why editing lives on the record, not the board ([Inogic](https://www.inogic.com/blog/2026/02/modern-kanban-for-dynamics-365-crm-how-sales-teams-move-from-visibility-to-execution/)).
- **Progressive disclosure on the record.** Salesforce puts a Highlights panel (a compact summary of the most important fields) at the top, then Related lists / Activity / Details in tabs below ([Compact Layouts](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_compact_layouts), [Record Pages](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_recordpage)). Attio mirrors this with tabbed records and an Activity timeline ([Attio records](https://attio.com/help/reference/managing-your-data/records/understanding-records)).
- **Inline edit from the board** avoids a full context switch; dragging into a stage can pop required-field validation inline ([Inogic](https://www.inogic.com/blog/2026/02/modern-kanban-for-dynamics-365-crm-how-sales-teams-move-from-visibility-to-execution/)).
- **Role-scoped home pages.** HubSpot tailors dashboards per team; a sales-rep home focuses on that rep's day ([HubSpot by role](https://clevyr.com/blog/post/hubspot-dashboards)).

## 2.4 The patterns, named

| # | Pattern | Definition | Exemplar | Why it applies to GSL |
|---|---|---|---|---|
| **P1** | Left-nav + contextual sub-nav | Persistent left sidebar of top-level areas; selecting one reveals sub-nav + a list; selecting an item opens detail | [Stripe](https://docs.stripe.com/dashboard/basics), [Linear teams](https://linear.app/docs/teams) | Gives Finance and Ops each a stable home column over the shared school/MOU objects, with room for sub-tabs |
| **P2** | Boards you watch vs records you edit | The glanceable overview is a separate destination from the editable record | [Stripe](https://docs.stripe.com/dashboard/basics), [Pipeline CRM](https://pipelinecrm.com/features/kanban/) | Leadership's health view stays read-only and calm; execution lives in workspaces; no accidental edits from a watch surface |
| **P3** | Progressive disclosure on the record | Record opens with a compact summary; related lists, activity, deep detail are disclosed below / in tabs | [Salesforce](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_compact_layouts), [Attio](https://attio.com/help/reference/managing-your-data/records/add-record-activities) | The MOU shows count, recalced schedule, balance at the top; history, dispatches, audit below. Fixes 1.3 directly |
| **P4** | Role-scoped landing | Each role lands on a home filtered to its own work | [HubSpot](https://clevyr.com/blog/post/hubspot-dashboards), [Linear My Issues](https://linear.app/docs/my-issues) | Finance lands on PIs/payments-to-match; Ops on dispatches/deliveries; leadership on health |
| **P5** | "My work / focus" surface | An opinionated personal queue ordered by urgency, not a filter the user builds | [Linear My Issues](https://linear.app/docs/my-issues) | "To match this week" / "to dispatch this week" as a pre-prioritised default list. Fixes the "current tasks done badly" complaint |
| **P6** | Command palette / quick-create | A single Cmd+K entry for navigation and creation; consolidates scattered buttons | [Mobbin](https://mobbin.com/glossary/command-palette), [solomon.io](https://solomon.io/designing-command-palettes/) | "New PI", "Log payment", "Raise dispatch" become palette commands instead of seven duplicated buttons. Fixes 1.1 |
| **P7** | Dynamic records: inline edit + activity timeline + recalc feedback | Living records are editable in place with instant feedback and a unified change timeline | [Attio](https://attio.com/changelog/real-time-dynamic-reporting), [Stripe](https://docs.stripe.com/invoicing/overview) | When a student count changes and the schedule recalcs, inline edit + timeline make it natural and auditable, on top of our existing `auditLog[]` |

## 2.5 Where we go beyond the benchmark

These tools are the floor. Three places to exceed them, each built on what we already have:

1. **Make the recalculation moment delightful, not just correct.** No benchmarked tool animates the *consequence* of a change. When a count is edited, show a live before → after diff of the payment schedule (old vs new instalments, delta in Rs / lakh) inline, one confirm. We already compute this (`RecalcSummary`, `src/components/mou-system/RecalcSummary.tsx`); today it sits as a static "Recalc preview" card rather than as the confirm-step of the edit. Turning the scariest moment in a living contract into a legible, reassuring one is a differentiator.
2. **A unified cross-team "what changed" feed.** Linear, Stripe, and Attio keep activity per record. We audit every write with before/after (`auditLog[]`) across both Finance and Ops, so a single cross-entity, department-filterable "what changed" feed gives leadership a calm narrative no single-team tool offers. We already have a per-MOU version of this (`collectCriticalChanges`); the move is to lift it to a global watch surface.
3. **Bidirectional watch ↔ act links.** A health tile drills straight into the exact editable record and back, closing the "visibility but not execution" gap the CRM space admits to. Leadership spots an at-risk MOU on the calm surface and is one click from the work surface, without the watch surface ever becoming an editor.

---

# SECTION 3: Proposed Information Architecture

## 3.1 The navigation: left-nav with team sub-tabs

The prediction in the brief is correct. Move from a 5-item top stage-bar to a **left sidebar** grouped into two zones, **WATCH** (visibility) and **WORK** (function), with the function areas carrying contextual sub-tabs. This is P1 + P2 expressed as one tree. The top bar shrinks to a thin global utility bar (wordmark, global search / command palette per P6, notification bell, queue freshness, user menu) so it stops competing as a place to put functions.

```
┌─ GLOBAL BAR ────────────────────────────────────────────────┐
│  GSL Ops    [ ⌘K  search or run a command ]      🔔  Anish ▾ │
└──────────────────────────────────────────────────────────────┘

LEFT NAV
│
├─ WATCH  (calm, read-only, role-aware default)
│   ├─ Home                 role-scoped landing (P4)
│   ├─ Pulse                the health/money/movement/feedback view (3.3)
│   ├─ Pipeline             the ONE kanban board (3.3) ← finally has a home
│   └─ Attention            full feed of everything needing action
│
├─ WORK · FINANCE  (visible to Finance + Admin; sub-tabs)
│   ├─ My finance work      focus queue: to match, PIs to raise/chase (P5)
│   ├─ Payments             log + match + unmatched, unified (3.4)
│   ├─ Proforma invoices    MOU PIs and VEX PIs in one place (3.4)
│   ├─ Adjustments
│   └─ Tally export
│
├─ WORK · OPERATIONS  (visible to Ops + Admin; sub-tabs)
│   ├─ My ops work          focus queue: to allocate, to dispatch, to confirm (P5)
│   ├─ Dispatch             the kit dispatch lifecycle (3.5)
│   ├─ Deliveries           confirmation + POD
│   ├─ Escalations
│   └─ VEX / procurement    VEX orders, vendors, agreements, inventory (3.5)
│
├─ RECORDS  (shared objects both teams open)
│   ├─ MOUs                 the registry (today's /mous)
│   └─ Schools              the school master
│
└─ ADMIN  (Admin/Leadership)
    ├─ Users & roles, Stage responsibility, Templates,
    ├─ Imports, Sync health, Audit, CC rules, Lifecycle rules ...
    └─ (everything under today's /admin, unchanged in scope)
```

Design notes:
- **Two zones, one principle.** WATCH never contains an edit control. WORK never contains a leadership chart. That single rule, enforced, is the whole redesign.
- **Role-aware default, not role-locked.** Per `TESTING_OPEN_ACCESS` and the department model in CLAUDE.md, the nav shows every section to trusted Admins; the *highlight* and the *default landing* follow the user's `department` (Finance lands in WORK · FINANCE, Ops in WORK · OPERATIONS, null-department Admins land on Home). This keeps the "same nav for everyone, department as orientation not wall" principle the current TopNav already states, while delivering P4.
- **Sub-tabs are the thing the top-bar could not do.** This is the structural reason to move left: a vertical rail has room for each team's 4 to 5 sub-surfaces without a second row of tabs.
- **Future-proofing (YP, trainer scheduling).** WORK is a list of department workspaces. Adding "WORK · ACADEMICS" (YP courses, trainer scheduling) later is a new branch, not a restructure. RECORDS likewise extends (Trainers, Courses) without disturbing Finance or Ops. The architecture is explicitly left open here and nowhere assumes exactly two execution teams.

## 3.2 Every current function relocated (nothing lost)

| Current location | Function | New home |
|---|---|---|
| `/` ConsolidatedLanding (KPIs + attention + quick actions) | Health/money glance | **WATCH · Pulse** (charts) + **WATCH · Home** (role default); quick-action buttons → command palette (P6) |
| `/dashboard/finance` | Finance KPIs + overdue + "Match"/"Re-send PI" buttons | KPIs → **WATCH · Pulse** (finance lens); the act buttons → **WORK · FINANCE · My finance work** and Payments |
| `/dashboard/ops` | Ops stats + orders + comms buttons | Stats → **WATCH · Pulse** (ops lens); comms/actions → **WORK · OPERATIONS** |
| `/dashboard/leadership` + `/accountability` | Leadership console + stage ownership/stalls | **WATCH · Pulse** (leadership lens) + a Pulse sub-view "Accountability" |
| `/dashboard/exceptions` | Full attention feed | **WATCH · Attention** (now has a nav home) |
| `/kanban` (lifecycle + operations views) | The board | **WATCH · Pipeline** (one board, see 3.3) |
| `/mous` + `/mous/archive` | MOU registry | **RECORDS · MOUs** (unchanged) |
| `/mous/new`, `/mous/new/[templateId]` | Create MOU | One canonical "New MOU" on RECORDS · MOUs + command palette; remove the duplicate copies (1.1) |
| `/mous/[mouId]` and its sub-routes | MOU detail + edit/dispatch/feedback/etc. | **RECORDS · MOUs → detail**, redesigned with progressive disclosure (3.6); sub-routes become tabs/drawers on the record |
| `/finance` landing | Finance index | **WORK · FINANCE** (becomes the workspace, not a card grid) |
| `/finance/payments/{new,log-batch,bulk}`, `/finance/payments`, `/finance/payments/unmatched` | 5 payment entry points | **WORK · FINANCE · Payments**: one surface, mode chooser (3.4) |
| `/mous/[mouId]/installments/.../mark-paid`/`mark-partial` | Per-instalment payment | Inline action on the MOU record's money panel, writing through the same payment service |
| `/mous/[mouId]/pi`, `/finance/pi/*`, `/operations/vex/pi/*` | PI generation (MOU + VEX) | **WORK · FINANCE · Proforma invoices** lists/creates both; "New PI" stays available on the MOU record too (context-create), but is discoverable from Finance |
| `/finance/adjustments*`, `/finance/tally-export` | Adjustments, Tally | **WORK · FINANCE** sub-tabs (unchanged scope) |
| `/operations` landing | Ops card grid (mixed) | Split: dispatch/deliveries/escalations → **WORK · OPERATIONS**; VEX/vendors/agreements/inventory → **WORK · OPERATIONS · VEX / procurement** sub-tab |
| `/dispatch/*` (kits, request, summary) | Dispatch lifecycle | **WORK · OPERATIONS · Dispatch** (one entry, lifecycle inside; 3.5) |
| `/mous/[mouId]/dispatch`, `/delivery-ack`, `/feedback-request` | Per-MOU ops actions | Tabs/drawers on the MOU record, sharing the same services as the Ops workspace |
| `/operations/vex/*`, `/operations/vendors/*`, `/operations/agreements/*` | VEX + procurement | **WORK · OPERATIONS · VEX / procurement** |
| `/schools/*` | School master | **RECORDS · Schools** |
| `/admin/*` | All admin | **ADMIN** (unchanged scope; just under the left-nav) |
| `/reports/*` | 5 analytical reports | **WATCH · Pulse → Reports** (the analytical, export-oriented siblings of the glance) |
| `/portal/status/*`, `/feedback/*` | Public SPOC surfaces | Unchanged (external, outside the authenticated nav) |

No row deletes a capability. Every function lands somewhere more logical, and the duplicates collapse onto a single canonical home with the others becoming context-create shortcuts or command-palette entries.

## 3.3 The VISIBILITY layer: Pulse, Pipeline, Attention

Three calm, read-only surfaces, none of which carries an edit control.

**WATCH · Pulse** : the "fun and intriguing" glance. One page, lensed by role (P4), four quiet bands:
- **Money flow**: signed value, received, conversion, DSO; a 12-month receipts sparkline. (Reuses the existing KPI computations from `LeadershipOverview` / finance dashboard, now in one calm place.)
- **Order movement**: kits in flight, delivered this period, stalled count, as a small flow strip, not a table.
- **Health**: schools needing action, open escalations, accuracy/collection signals (the existing health-tile logic, DESIGN.md Surface 1).
- **Feedback**: rolling rating summary from the feedback store.
Each tile is a bidirectional watch→act link (P7 go-beyond #3): click drills to the exact record or to a filtered work queue and back. Reports (the 5 analytical/export reports) live as a "Reports" sub-view of Pulse, since they are the deep, exportable form of the same glance.

**WATCH · Pipeline** : the ONE kanban, finally with a front door. Keep the existing two-view toggle exactly as built (`KanbanViewToggle`): **MOU lifecycle** (interactive, drag-to-advance) and **Dispatch operations** (read-only). Do not build a third board. The kanban question, answered directly:
- *One, zero, or rethought?* **One board, two lenses, given a nav home, and re-grounded on the single canonical stage model** (3.6 / Phase 5). The board is genuinely useful (it is the watch-and-advance surface CRMs prove out, 2.3); its only real defects are that it was hidden and that its stage vocabulary disagreed with the MOU detail page. Both are fixed here.
- The interactive lifecycle board sits in WATCH but is the one sanctioned exception to "watch never edits": advancing a stage is the canonical, audited way to move work, exactly the CRM drag-to-advance pattern. It routes into the same work forms rather than editing in place, so the principle holds in spirit.

**WATCH · Attention** : the full attention feed (today's `/dashboard/exceptions`, `buildExceptionFeed`), promoted to a first-class nav item. This is also where "what to focus on" lives at the org level; the per-person version is the "My … work" focus queues in each workspace (P5).

**"Current tasks / what to focus on this week" done well** (the explicitly-flagged weak spot): replace the scattered quick-action zones with two things, an org-level **Attention** feed (watch) and a per-role **My … work** focus queue (work, P5) ordered by urgency (overdue first, then due-soon, then waiting-on-you), not an unsorted list. Linear's "Focus" ordering is the model.

## 3.4 The FINANCE workspace

What a Finance user sees when they open WORK · FINANCE (their default landing per P4):

- **My finance work** (top, the focus queue, P5): "Payments to match (N)", "PIs to raise (N)", "PIs awaiting payment, overdue first (N)", "Adjustments pending". Each row is one click to act. This is the daily to-do, pre-prioritised. No charts.
- **Payments** (sub-tab): **one** surface that replaces the five entry points (1.1). A single "Record a payment" action with a mode chooser, single / batch-by-school / CSV import, and the matcher as the same surface's "find the PI" path. The unmatched queue is a filter on this surface, not a separate route. One mental model: *money arrived → record it → it auto-matches or you match it → if not, it parks here*.
- **Proforma invoices** (sub-tab): lists and creates **both** MOU PIs and VEX PIs (different documents, different counters, clearly labelled, 1.1 "legitimately multiple"). This is where "New PI" is discoverable from Finance, fixing 1.5. Per-MOU "New PI" stays on the MOU record as a context-create shortcut into the same flow.
- **Adjustments** and **Tally export**: unchanged in scope, now coherent sub-tabs.

Uncluttered by Ops and by dashboards: no kit-dispatch cards, no leadership KPIs. The money-glance a Finance lead wants is one click away in Pulse (finance lens); their *work* is here.

## 3.5 The OPERATIONS workspace

What an Ops user sees when they open WORK · OPERATIONS:

- **My ops work** (focus queue, P5): "To allocate (N)", "Awaiting sales approval (N)", "Ready to dispatch (N)", "In transit (N)", "Delivery to confirm (N)". The six-stage ops workflow (Model D) as a personal queue, urgency-ordered.
- **Dispatch** (sub-tab): the kit dispatch lifecycle as **one** entry point (collapsing the four of 1.1, `/dispatch/kits`, `/dispatch/kits/[mouId]`, `/dispatch/request`, `/mous/[mouId]/dispatch`). The list is the entry; the per-MOU stepper (allocate → sales approval → summary → accounts execution → shipment/POD) is the detail; the "raise request" is an action on the list, not a separate route. The existing role-split at the transition route (CLAUDE.md Gate 2 Step 7: `canRaiseDispatch` for warehouse/shipped, `canEditFinanceData` for invoiced) is preserved exactly; only the surface consolidates.
- **Deliveries** (sub-tab): confirmation + POD upload, the tail of the lifecycle given its own light surface because it is a distinct daily act.
- **Escalations** (sub-tab): unchanged.
- **VEX / procurement** (sub-tab): VEX orders, vendors, agreements, inventory, moved off the main Ops grid where they sat next to dispatch (1.5). They are real Ops-adjacent work but not the daily dispatch loop, so they sit one level in. (VEX PI *creation* is surfaced from Finance · Proforma invoices too, since it is a finance document; the VEX order management stays here.)

Uncluttered by Finance and by dashboards.

## 3.6 The MOU record redesigned: progressive disclosure for a living contract

Apply P3 + P7 to the 1,219-line page (1.3). The principle: **the record opens as a calm summary of a living contract; everything else is one disclosure away.**

**At a glance (always visible, the top third):**
- Identity: school, programme/sub-type, AY, status chip, owned-by.
- **The living-money panel** (the single focal point that does not exist today): current student count, the recalculated schedule, contract value (count × price), received, balance, next instalment due. This is the one place the dynamic state of the contract is legible. It carries the two primary living-contract actions inline: **Edit student count** and **Record payment**.
- One **canonical stage strip** (the single consolidated stage model, Phase 5), replacing the two competing lifecycle visuals on the page today.

**The dynamic-edit experience (P7 + go-beyond #1):** "Edit student count" opens an inline editor that shows the **before → after diff of the schedule** (old vs new instalments, delta in Rs / lakh) using the existing `RecalcSummary` engine, with a single Confirm. The recalc stops being a passive "preview card" and becomes the reassuring confirm-step of the edit. This is the heart of making a changing MOU feel natural rather than painful, the central constraint of the brief.

**One disclosure away (tabs or drawers on the record, not separate full pages):**
- **Instalments** (the full schedule + per-row mark-paid/partial, writing through the same payment service as the Finance workspace).
- **Dispatches** (the kit lifecycle for this MOU, the same component the Ops workspace uses).
- **Communications** (sent templates + smart suggestions).
- **Documents** (annexure, signed values, intake, delivery ack, feedback request, the current scattered sub-routes become document tabs).
- **History** (audit log + critical changes + edit-history reveals, consolidated; this is the per-record form of the "what changed" feed).
- **Escalations**.

**Moved out of the glance:** dispatch override request/approve (a rare flow → into the Dispatches tab), stage-responsibility "owned-by" config link (→ a quiet pill, config stays in Admin), workflow reminder banner (→ History/Attention). None deleted; all relocated so the first screen is the contract, not the control panel.

Net effect: the record answers "what is the state of this living contract, and what are the two things I am most likely to do to it?" in the first screen, and "show me any aspect in depth" in one click, exactly the Salesforce/Attio summary-then-drill model.

---

# SECTION 4: Phased Implementation Plan

Sequenced so the biggest friction-removal ships first and nothing is a big-bang rewrite. Each phase is independently shippable and independently approved. Ordering is by adoption impact, with dependencies respected (the canonical stage model, the deepest change, comes after the cheaper navigation wins because the wins do not depend on it).

The build gate stands per CLAUDE.md: each phase ends green on `npm run build` and is V4-verified (the canonical flow walked with realistic data, logged under `docs/`), then pushed.

---

### Phase 0 : Lock the target (no code)
- **Changes:** This document reviewed with the advisor; nav tree (3.1) and the visibility/function split rule ratified; the function-relocation table (3.2) confirmed as the contract for "nothing lost".
- **Depends on:** nothing.
- **Could break:** nothing (no code).
- **Verify:** advisor sign-off on Sections 1 to 3; an agreed list of routes that will become redirects vs move.

---

### Phase 1 : The left-nav shell and the two-zone rule (highest adoption impact, low risk)
- **Changes:** Introduce the left sidebar with WATCH / WORK · FINANCE / WORK · OPERATIONS / RECORDS / ADMIN, replacing the top stage-bar with a thin global utility bar. **Re-home the orphans immediately**: add nav entries for Pipeline (the kanban, fixing the headline burial), Attention, and the Pulse landing. No surface content changes yet; this phase only changes how you *get* to existing pages. Role-aware default landing (P4) using the existing `department` field.
- **Depends on:** Phase 0.
- **Could break:** every page renders the nav (`TopNav` is imported in ~all pages); the active-path highlighting logic; mobile drawer; the single-`<main>` rule and skip-link target (DESIGN.md Surface 6) must be preserved. Deep links and `aria-current` must keep working.
- **Verify:** walk each top-level destination from the new nav as Finance, Ops, and Admin users (`TESTING_OPEN_ACCESS=true`); confirm the kanban is now reachable in two clicks; axe-core baseline does not regress; screenshot pass via `scripts/verify-deploy.mjs`.
- **Why first:** it removes the single largest friction (buried surfaces, no team home) without touching any business logic, and it establishes the rule that the rest of the phases fill in.

---

### Phase 2 : Consolidate payments into one Finance · Payments surface (biggest function win)
- **Changes:** Build the unified Payments surface (3.4): one "Record a payment" with single / batch / CSV modes + the matcher + unmatched-as-a-filter. Point the old five routes at it (redirects or thin wrappers); keep the per-instalment mark-paid writing through the same service. Surface "PIs to raise/chase" as the start of **My finance work**.
- **Depends on:** Phase 1 (Finance workspace exists in nav).
- **Could break:** the payment-matching and auto-match logic; TDS handling (noted in MOU detail comments as a past bug source); the audit trail on payment writes; the `pendingUpdates`/`githubQueue` write path.
- **Verify:** log a payment in each mode and confirm auto-match + park behaviour; mark an instalment paid from the MOU and confirm it appears identically; reconcile against `verify-p4-money-parity`-style checks; confirm audit entries.
- **Why second:** payment recording is the most-repeated daily Finance act and the most fragmented surface (1.1); collapsing five routes to one is the largest per-user friction drop after navigation.

---

### Phase 3 : Make PI generation discoverable from Finance; split the Ops landing
- **Changes:** Build **Finance · Proforma invoices** listing/creating MOU PIs and VEX PIs (no new generators, just a discoverable home + the existing flows). Split the `/operations` grid: dispatch/deliveries/escalations stay primary; VEX/vendors/agreements/inventory move under a **VEX / procurement** sub-tab (3.5). Keep per-MOU "New PI" as a context shortcut.
- **Depends on:** Phase 1.
- **Could break:** PI counter minting and parallel-build locks (MOU and VEX both mint counters); the Gate 2 Step 7 dispatch role-split must be untouched; existing deep links to `/operations/*` and `/finance/pi/*`.
- **Verify:** generate one MOU PI and one VEX PI from the Finance workspace; confirm counters advance correctly and locks hold; confirm Ops users still reach VEX/vendors/agreements (now one level in) and that dispatch is unobstructed.

---

### Phase 4 : Consolidate dispatch into one Ops · Dispatch entry + focus queues
- **Changes:** Collapse the four dispatch entry points (1.1) into one Ops · Dispatch surface (list → stepper detail; raise-request as a list action). Build **My ops work** and **My finance work** focus queues (P5), urgency-ordered.
- **Depends on:** Phases 1 to 3 (workspaces and their actions exist).
- **Could break:** the multi-role dispatch stepper gating (allocate/approve/execute/POD); status forward-only transitions; the dispatch override flow; `/dispatch/*` and `/mous/[mouId]/dispatch` deep links.
- **Verify:** walk a dispatch end to end as Ops → Sales → Finance → Ops (allocate, approve, execute, ship, POD) through the single surface; confirm each role gate behaves; confirm the focus queues count correctly against seeded data.

---

### Phase 5 : One canonical stage model (deepest change, deliberately late)
- **Changes:** Define a single stage model in data and derive every widget from it (the kanban lifecycle board, the MOU record stage strip, the portal/email status, the school mini-trackers). Reconcile the 6/8/9/10-stage disagreement (1.2) into one vocabulary; keep the read-only portal/email projection as a *view* of the canonical model. Retire the redundant model files once all consumers are migrated.
- **Depends on:** Phases 1 to 4 (so the surfaces that render stages are already in their final homes).
- **Could break:** the most logic-dense change. The kanban drag-to-advance routing; `computeStage`, `deriveStage`, `lifecycleProgress`, `opsWorkflowKanban`, `workflowState`, `stageResponsibility`; the SPOC portal and every email status block; reminder eligibility and stage-ownership routing all read stage state.
- **Verify:** golden-file the stage of a representative set of MOUs before and after and assert equivalence (or document each intended change); walk the kanban advance for each transition; render the portal and one of each email type; confirm `lifecycleProgress.ts`-fed surfaces match. This phase carries its own mini-plan and probably its own eng review.
- **Why last among the structural phases:** it is the highest-risk and the navigation/workspace wins do not depend on it. Sequencing it after the cheap wins means adoption improves long before we take on the hard consolidation.

---

### Phase 6 : Redesign the MOU record (progressive disclosure)
- **Changes:** Rebuild `/mous/[mouId]` per 3.6: glance (identity + living-money panel + canonical stage strip) over disclosed tabs (Instalments, Dispatches, Communications, Documents, History, Escalations). Make "Edit student count" the delightful before→after recalc-confirm (go-beyond #1) using the existing `RecalcSummary`.
- **Depends on:** Phase 2 (payment service), Phase 4 (dispatch component), Phase 5 (one stage strip) so the record composes finished pieces rather than inventing them.
- **Could break:** a large, much-referenced page; the multi-year FY tabs; edit-history reveals; the override/reminder relocations; SalesRep visibility scoping.
- **Verify:** walk the record as each role; edit a student count and confirm the schedule diff + recalc + audit; open every tab with realistic data; confirm no second `<main>`; screenshot pass.

---

### Phase 7 : Build the WATCH layer properly and strip function from dashboards
- **Changes:** Build Pulse (money/movement/health/feedback, role-lensed, with watch→act drill, go-beyond #3) and the org-level Attention feed. Then **remove the act buttons from the old dashboards** (the visibility/function un-tangling of 1.4) now that every action has a canonical home from Phases 2 to 6. Collapse the redundant dashboard routes/redirects (1.2) into Pulse. Introduce the command palette (P6) as the single quick-create, and remove the duplicated QuickActions copies (1.1).
- **Depends on:** Phases 2 to 6 (cannot remove a dashboard button until its canonical home exists).
- **Could break:** the consolidated landing and all `/dashboard*` redirects; any deep links that assumed an action lived on a dashboard; the exception/leadership data aggregators (reused, now single-homed).
- **Verify:** confirm every action removed from a dashboard is reachable from its workspace and the palette; confirm Pulse is read-only (no edit control present); confirm leadership can drill watch→act→back; screenshot pass across viewports.
- **Why last:** this is the cleanup that only becomes safe once functions have homes. Doing it last means we never strip a button before its replacement exists.

---

### Cross-cutting, every phase
- British English, Indian money format, no em dash, no AI-slop vocabulary (DESIGN.md copy rules; `docs-lint`).
- WCAG 2.1 AA; axe-core baseline may only shrink.
- Every write audited (`auditLog[]`); all writes through the GitHub Contents API queue.
- Single `<main>` rule preserved as the nav changes.
- Each phase: build green → V4 walk logged under `docs/` → push (CLAUDE.md end-of-session protocol).

---

## Appendix: the redesign in one line per problem

| Problem (Section 1) | Fix (Section 3) | Phase |
|---|---|---|
| 5 ways to log a payment | one Payments surface, mode chooser | 2 |
| PI not discoverable from Finance | Finance · Proforma invoices | 3 |
| 15+ dispatch entry points | one Ops · Dispatch surface | 4 |
| 4 stage vocabularies, 2 on the MOU page | one canonical stage model | 5 |
| MOU detail does 3 jobs at once | glance + progressive disclosure | 6 |
| dashboards mix watch and act | Pulse (watch) + workspaces (act) | 7 |
| kanban hidden, no nav home | WATCH · Pipeline in the left nav | 1 |
| "focus this week" done badly | per-role My-work focus queues | 4 |
| Ops landing mixes departments | VEX/procurement moved one level in | 3 |
| duplicated QuickActions buttons | command palette, single quick-create | 7 |
| nav strands leadership/attention/exceptions | WATCH zone front-doors them | 1 |
```
