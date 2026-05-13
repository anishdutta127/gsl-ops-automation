# Kanban surface audit (Gate 5A.7 Step 1)

Snapshot taken 2026-05-13 against `main` at 595911d. Pre-unification state, no
code changes made yet.

Ameet flagged two confusingly-similar Kanbans during the walkthrough today.
Gate 4.95 Session 3 also noted the wart at the time ("Two Kanbans now coexist")
and explicitly deferred it. This audit catalogues both surfaces so Step 2 can
collapse them into one without losing capability.

## Surface A: /kanban -- MOU Pipeline

| Aspect | Value |
|---|---|
| URL | `/kanban` |
| Page | `src/app/kanban/page.tsx` |
| Board component | `src/components/ops/KanbanBoard.tsx` (client, dnd-kit drag) |
| Stage derivation | `src/lib/kanban/deriveStage.ts` (`deriveStage`, `KANBAN_COLUMNS`) |
| Card metadata | `src/lib/kanban/stageEnteredDate.ts`, `src/lib/kanban/stageDurations.ts`, `src/lib/kanban/cardUrgency.ts` |
| Filter rail | `src/components/ops/FilterRail.tsx` (shared list-page rail) |
| Title shown | "MOU Pipeline" |
| Subtitle shown | "N active MOUs across 10 stages" (or filtered variant) |
| Server tests | `src/app/kanban/page.test.tsx` -- 10 cases |
| Board tests | `src/components/ops/KanbanBoard.test.tsx` |
| Transition API | `POST /api/kanban/transition` (audit-only writes for skip / backward / pre-ops exit) |

### Columns (10)

Per `KANBAN_COLUMNS` in `deriveStage.ts:55`:

1. `pre-ops` -- "Pending Signature" (muted variant, holding bay for `status === 'Pending Signature' || 'Draft'`)
2. `mou-signed` -- "MOU signed"
3. `post-signing-intake` -- "Active Schools - Onboarding"
4. `actuals-confirmed` -- "Actuals confirmed"
5. `cross-verification` -- "Cross-verification" (auto-skipped via inheritance; should always be empty)
6. `invoice-raised` -- "Invoice raised"
7. `payment-received` -- "Payment received"
8. `kit-dispatched` -- "Kit dispatched"
9. `delivery-acknowledged` -- "Delivery acknowledged"
10. `feedback-submitted` -- "Feedback submitted"

The comment header at `src/app/kanban/page.tsx:10` says "9 columns"; that's
stale (pre-W4-C.1, before `post-signing-intake` was added). The runtime count
is 10 and the page subtitle confirms it ("...across 10 stages").

### Filter UI

Shared `FilterRail` component, basePath `/kanban`. Four dimensions:

- **Region** -- East / North / South-West chips plus NE / SW super-region shortcuts
- **Programme** -- STEAM / TinkRworks / Young Pioneers / Harvard HBPE / VEX
- **Sales rep** -- multi-select from active sales team
- **Status** -- Active / Pending Signature / Completed / Expired / Renewed

URL params: `region`, `programme`, `salesRep`, `status` (CSV).

### Bucketing logic (`deriveStage`)

Pure function. Per-MOU: first-non-null-date wins across an ordered list of
`(stageKey, date)` tuples. Order is the same as `KANBAN_COLUMNS` (minus
pre-ops, which is gated separately at the top of the function):

1. If `mou.status === 'Pending Signature' || 'Draft'` -> `pre-ops` (returns immediately).
2. Otherwise: walk `mou-signed`, `post-signing-intake`, `actuals-confirmed`,
   `cross-verification`, `invoice-raised`, `payment-received`, `kit-dispatched`,
   `delivery-acknowledged`, `feedback-submitted`. First stage whose date is
   `null` is the card's current column. If every date is non-null, the card
   sits in the terminal `feedback-submitted` column.

Cohort filter: only `cohortStatus === 'active'` MOUs reach the board. Archived
prior-AY cohorts are dropped before bucketing.

### Linkage / discoverability

- `/dashboard/ops` page renders a `DashboardHeader` with a prominent "MOU
  Pipeline" CTA that links to `/kanban` (`DashboardHeader.kanbanHref` defaults
  to `/kanban`, set explicitly at `src/components/ops/dashboard/DashboardHeader.tsx:48`).
- TopNav does NOT carry a direct "Kanban" entry; the page is reached via the
  dashboard CTA, the help docs (`src/content/help.ts:100, 288, 571, 762`), and
  the `/mous` list page's stage links (`stage=<key>` URL chips).
- No deep link from `/` (the consolidated landing) directly to `/kanban`; users
  pivot via `/dashboard/ops`.

## Surface B: /dashboard/ops/kanban -- Workflow Kanban view

| Aspect | Value |
|---|---|
| URL | `/dashboard/ops/kanban` |
| Page | `src/app/dashboard/ops/kanban/page.tsx` |
| Board component | `src/components/dashboard/ops/OpsWorkflowKanbanBoard.tsx` |
| Stage derivation | `src/lib/kanban/opsWorkflowKanban.ts` (`computeOpsWorkflowColumn`, `OPS_WORKFLOW_COLUMNS`) |
| Underlying lifecycle source | `src/lib/statusTracker.ts` (`computeStage`) |
| Card metadata | `OpsWorkflowCard` shape in `opsWorkflowKanban.ts:182` (initials, days at status, ops owner) |
| Filter rail | `src/components/dashboard/ops/OpsKanbanFilterRail.tsx` (Kanban-specific) |
| Title shown | "Workflow Kanban view" |
| Subtitle shown | "N active MOUs across six workflow stages." (or filtered variant) |
| Server tests | `src/app/dashboard/ops/kanban/page.test.tsx` -- 11 cases |
| Transition API | none -- this Kanban is read-only (no drag, no audit writes) |

### Columns (6)

Per `OPS_WORKFLOW_COLUMNS` in `opsWorkflowKanban.ts:51`:

1. `awaiting-actuals` -- "Awaiting actuals"
2. `allocation-in-progress` -- "Allocation in progress"
3. `pending-sales-approval` -- "Pending Sales approval"
4. `ready-for-dispatch` -- "Ready for dispatch"
5. `in-transit` -- "In transit"
6. `delivered` -- "Delivered" (mobile accordion collapsed by default)

### Filter UI

`OpsKanbanFilterRail` (Kanban-specific). Six dimensions:

- **Programme** -- STEAM / Young Pioneers / Harvard HBPE / Robotics (note: no
  VEX, no TinkRworks; differs from Surface A)
- **Region** -- East / North / South-West chips plus NE / SW super-region shortcuts
- **Sales rep** -- multi-select (`<select multiple>`, not chip-based)
- **Ops owner** -- multi-select (`<select multiple>`, not present on Surface A)
- **From date** / **To date** -- ISO `yyyy-mm-dd` inputs (filters on
  `mou.startDate`)

URL params: `p`, `region`, `sr`, `rep`, `owner`, `from`, `to`.

Note the key collision risk: Surface A uses `programme=` for programme filter,
Surface B uses `p=`. Surface A uses `salesRep=`, Surface B uses `rep=`. No
shared filter state today; deep links don't survive a route swap.

### Bucketing logic (`computeOpsWorkflowColumn`)

Pure function. Branches on `KitDispatch` state and the underlying
`computeStage` lifecycle string. Order of checks (first match wins):

1. `mou.status === 'Draft' || 'Pending Signature'` -> `null` (dropped from
   board entirely).
2. `delivered` / `closed` lifecycle OR every dispatch is `Delivered` -> `delivered`.
3. Any dispatch `dispatchStatus === 'In Transit'` -> `in-transit`.
4. Any dispatch is approved + has summary + `Pending` status -> `ready-for-dispatch`.
5. Any dispatch has zero allocations OR `dispatchStatus === 'Not Started'` -> `allocation-in-progress`.
6. Any dispatch has allocations + `Pending` Sales approval -> `pending-sales-approval`.
7. Pre-dispatch lifecycle (`mou-uploaded` / `active` / `payment-pending` /
   `installment-1-received` / `pi-generated`) with no dispatch record -> `awaiting-actuals`.

Cohort filter: `cohortStatus === 'active'` only (same as Surface A).

### Linkage / discoverability

- `/dashboard/ops` renders `OpsKanbanTile` (`src/components/dashboard/OpsKanbanTile.tsx`)
  as a prominent full-width card linking to `/dashboard/ops/kanban`. The tile
  carries an "N active" badge.
- The "MOU Pipeline" CTA on the same `/dashboard/ops` header points to a
  different URL (`/kanban`). Two CTAs on the same page surface two different
  Kanbans.
- TopNav does NOT carry a direct entry.
- No link from `/` (consolidated landing).

## Overlap analysis

### Do the same MOUs appear in both?

**Yes, every Active-status MOU appears in both Kanbans simultaneously, but in
different columns.**

Concrete examples derived from the fixture today (51 active-cohort MOUs):

- A signed MOU with no intake captured yet:
  - Surface A column: `post-signing-intake` (Active Schools - Onboarding).
  - Surface B column: `awaiting-actuals` (no KitDispatch record exists yet).
- A signed MOU with actuals confirmed and a PI raised but no payment yet:
  - Surface A column: `invoice-raised`.
  - Surface B column: `awaiting-actuals` (still no KitDispatch).
- A signed MOU with payment received and a KitDispatch with allocations
  pending Sales approval:
  - Surface A column: `payment-received`.
  - Surface B column: `pending-sales-approval`.
- A delivered + acknowledged MOU:
  - Surface A column: `delivery-acknowledged`.
  - Surface B column: `delivered`.

### Where do they diverge?

- **Pre-Ops Legacy / Pending Signature MOUs:** Surface A surfaces them in the
  muted `pre-ops` column. Surface B drops them entirely (returns `null` from
  `computeOpsWorkflowColumn`).
- **Cross-verification:** Surface A reserves a column for it (always empty
  by design). Surface B has no equivalent.
- **Feedback-submitted:** Surface A has a terminal "Feedback submitted"
  column. Surface B treats feedback as part of `delivered` (the lifecycle
  string moves to `closed` after feedback).
- **Drag-to-advance:** Surface A is interactive (drag a card to advance the
  stage; opens the matching per-stage form or audit dialog). Surface B is
  read-only -- click a card to navigate to the dispatch detail page.

### Cross-bucket consistency check

The two boards never disagree because they classify on different axes:

- Surface A classifies on **lifecycle data** (`payment.piNumber`,
  `payment.receivedDate`, `dispatch.dispatchedAt`, `feedback.submittedAt`).
- Surface B classifies on **KitDispatch workflow state**
  (`dispatch.salesApprovalStatus`, `dispatch.dispatchStatus`,
  `dispatch.allocations`).

They are complementary lenses on the same data. The user confusion is not
that the numbers disagree -- it is that the existence of two different "Kanban"
labels (with two different column shapes, two different filter URL schemes,
two different visual chromes) reads as "two different things to track" when
in fact it is the same set of MOUs under two different framings.

## Test coverage summary

| Surface | Test file | Cases |
|---|---|---|
| A `/kanban` | `src/app/kanban/page.test.tsx` | 10 (column rendering, fixture-derived cards, redirect, copy, token discipline, cross-verification auto-skip) |
| A board | `src/components/ops/KanbanBoard.test.tsx` | drag-and-drop behaviour, classification, dialog flow |
| A transition API | `src/app/api/kanban/transition/route.test.ts` | audit-write paths |
| B `/dashboard/ops/kanban` | `src/app/dashboard/ops/kanban/page.test.tsx` | 11 (6 columns, filter rail, mobile accordion, programme filter, redirect, copy, token, single-main) |
| Bucketing lib A | covered indirectly via page tests + `KanbanBoard.test.tsx` |
| Bucketing lib B | covered indirectly via page tests; lib has unit tests in `src/lib/kanban/__tests__` if present (none found at audit time) |

## Implications for Step 2 unification

The unification target is a single `/kanban` route that hosts both views
behind a top-level toggle. Notes for the build:

1. The two boards classify on different axes, so their column-bucketing logic
   must remain two separate pure functions. `src/lib/kanban/columnBuckets.ts`
   should re-export `bucketByLifecycle` (wrapping `deriveStage`) and
   `bucketByOperations` (wrapping `computeOpsWorkflowColumn`) rather than
   collapsing them.
2. The two boards have different card render shapes (Surface A is a draggable
   `MouCardBody`; Surface B is a read-only card with initials / ops owner
   badges). The toggle should swap board components, not just data.
3. The two filter rails have non-overlapping URL param keys (`programme=` vs
   `p=`, `salesRep=` vs `rep=`, etc). Pick one canonical set and migrate the
   other or namespace by view.
4. Pre-Ops Legacy / Pending Signature MOUs appear only in the lifecycle view.
   The toggle must hide them in the operations view (already the natural
   behaviour of `computeOpsWorkflowColumn` returning `null`).
5. Surface A has interactive drag + transition dialog wired to
   `/api/kanban/transition`. The operations view is read-only. Both must
   continue to work post-unification; the toggle should preserve the drag
   affordance only on the lifecycle view.
6. Both `/dashboard/ops` CTAs need to repoint: the `DashboardHeader.kanbanHref`
   stays `/kanban` (default lifecycle view); the `OpsKanbanTile` repoints to
   `/kanban?view=operations`.
7. `/dashboard/ops/kanban` keeps existing tests valid via a redirect to
   `/kanban?view=operations` (the test file mocks `redirect`, so the
   existing test assertions on column testids will need to move to the
   `/kanban` test file).
