# Backlog

Phase 1.1+ items deferred from Phase 1. Each entry names the trigger
that should pull it onto the active plan.

## PI generator render-only split (Gate 2 Step 6 follow-up, Gate 5 prereq)

Step 6's `/finance/pi/[paymentId]` view surfaces a Download button
that re-renders the PI .docx via the existing `src/lib/pi/generatePi.ts`
helper. That helper advances the per-entity PI counter on every call.
During the parallel-build window the Download button is hidden behind
the same `PI_PARALLEL_BUILD_LOCK` gate that protects the issue flow,
so the bug is dormant. **After Gate 5 cutover, the lock flips off and
each Download click burns a fresh PI number** -- a Finance user
opening the same PI twice would advance MTPL/UP/26-27/0017 to /0019
without anything new being issued.

Implementation shape when this re-activates:

- Split `src/lib/pi/generatePi.ts` into two libs:
  - `renderPi(payment, mou, school) -> docxBytes` (pure render; reads
    the piNumber already on the Payment record; does NOT advance the
    counter or write any audit).
  - `issueAndRenderPi(mouId, instalmentSeq, generatedBy) -> { piNumber,
    docxBytes, payment }` (existing behaviour; advances counter, writes
    Payment + audit).
- Re-wire `/finance/pi/[paymentId]` download to `renderPi`.
- `/mous/[id]/pi` Generate flow stays on `issueAndRenderPi`.
- Test: download the same PI twice -> identical .docx bytes, counter
  unchanged, no audit entries appended.

Trigger: **before Gate 5 cutover, split `src/lib/pi/generatePi.ts`
into render-only (no counter) and issue-and-render (counter advance).
Re-wire `/finance/pi/[paymentId]` download to use render-only. Without
this, Pranav clicking Download twice burns 2 PI numbers.**

References:
- `src/lib/pi/generatePi.ts` (current single-purpose helper).
- `src/app/finance/pi/[paymentId]/page.tsx` (Download button, lock-gated).
- `src/lib/pi/parallelBuildLock.ts` (the lock that hides this bug today).
- `docs/decisions/STEP5_QUESTIONS_resolved.md` background, `STEP6_QUESTIONS.md` Q6 the canonical write-up.

## Dispatch-workflow Kanban view (Gate 3.5 Step 6 follow-up)

Gate 3.5 Step 6 preserved the existing `/` Operations Control Dashboard
verbatim (per the Ops team request) and redirected `/dashboard/ops` to
`/`. The existing `/kanban` route remains as the canonical MOU
lifecycle kanban (9 columns, Pre-Ops to Delivered) and stays linked
prominently from the `/` header CTA.

The Gate 3.5 brief Step 6 ALSO asked for a separate dispatch-workflow
Kanban view with 6 columns reflecting the kit-dispatch lifecycle:

1. Awaiting actuals (MOU signed, no grade-wise data captured)
2. Allocation in progress (Ops working on kit allocation)
3. Pending Sales approval (waiting on Sales rep)
4. Ready for dispatch (Sales approved, Finance not yet executed)
5. In transit (Finance executed, POD not yet uploaded)
6. Delivered (POD uploaded; collapsed by default since stable)

Each card carries: school + programme, days at current status (amber
>7d, red >14d), sales rep + ops owner avatars, hover tooltip with last
activity, click-through to `/dispatch/kits/[mouId]`. Filters: programme,
region, sales rep, ops owner, date range. Mobile: status-stacked
accordion.

Implementation shape when this re-activates:

- New route `src/app/operations/kanban/page.tsx` that consumes
  `src/data/mous.json` + `src/data/kit_dispatches.json` to derive
  per-card column membership.
- Per-card status detection lib at
  `src/lib/dashboard/dispatchKanbanData.ts` (pure compute; testable).
- Add a "Kanban view" tile or button to `/` (the canonical Ops
  cockpit) near the existing `Open Kanban Board` header CTA, with a
  clear label distinguishing the MOU-lifecycle kanban from the
  dispatch-workflow kanban.
- Also surface in the Operations side rail when one lands (Gate 5
  polish backlog item; today the side rail is absent).

Trigger: **after Gate 4 ships (status tracker + notifications), or
when Anish or Shashank reports the existing `/kanban` does not show
dispatch-workflow stages they need.** The fix is bounded; estimated
4-6 hours of build + tests.

References:
- `docs/gate-3.5/CURRENT_STATE.md` section 6.1 (Anish-confirmed
  decision to keep `/` as the canonical Ops dashboard).
- `src/app/kanban/page.tsx` (the existing MOU lifecycle kanban; pattern
  for the new dispatch kanban).
- `src/lib/kanban/deriveStage.ts` (analogue for the dispatch lifecycle
  stage derivation).

## VEX dispatch status rewind (Gate 2 Step 7 follow-up)

Gate 2 Step 7's dispatch transition route enforces forward-only status
transitions (`Requested → Request Raised to Warehouse → Invoiced →
Shipped`). The API returns 400 `invalid-transition` if `nextIdx <
currentIdx`. The chosen invariant protects against UI-bypass scripted
writes that could reset a Shipped dispatch back to Requested.

The cost: if Ops misclicks Shipped on the wrong dispatch row, the only
recovery path is an Admin JSON edit to `src/data/vex_dispatches.json`
followed by a manual audit entry recording the correction. There is no
in-app rewind affordance.

Trigger: **if Ops requests a rewind capability after 30 days of usage.**
The fix is small (drop the `nextIdx < currentIdx` check OR add a
`canAdminRewind` gate that allows backwards transitions for Admin
with audit). Surface in BACKLOG until usage validates demand.

References:
- `src/app/api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition/route.ts`
  lines 107-118 (the forward-only check).
- `STEP7_QUESTIONS.md` Q4 (decision archive).

## .docx Generate flow port (Gate 2 Step 5 follow-up)

Step 5's `GeneratorWizard` ships the drafting flow + Save Draft action
but the wizard's "Generate" button currently shows an inline note
explaining the parallel-build window rather than producing the .docx.
Pranav continues to get the rendered MOU document from
gsl-mou-system.vercel.app until cutover. After cutover Ops becomes the
source of truth and the wizard must actually emit the .docx.

Implementation shape when this re-activates:

- Wire the wizard's Generate button to a new `/api/mou/generate-docx`
  route (or extend the existing `/api/mou/save-draft` shape).
- Route reads the persisted draft, loads the matching `.docx` template
  from `public/mou-templates/` (already populated: STEAM, YP, HBPE;
  Robotics template still needs sourcing if Robotics goes live on the
  wizard).
- Renders via `mouSystem/templates.ts` + the `docx` library
  (`mouSystem/mouDoc.ts`), uses combined GSL+AMG logo header from
  `public/branding/gsl_amg_logo.png`.
- Streams the binary back as `Content-Disposition: attachment`.
- Audit entry on the MOU: `mou-docx-generated` with template version,
  render timestamp, downloader user id.

Trigger: **before Gate 5 cutover handover to Pranav. Wizard's Generate
button currently shows parallel-build note; needs to actually generate
the .docx by reading from `public/mou-templates/` and using the
migrated `mouSystem/templates.ts` library. Without this, Pranav cannot
draft new MOUs on Ops platform at cutover.**

References:
- `src/components/mou-system/GeneratorWizard.tsx` (Generate button + inline note).
- `src/lib/mouSystem/templates.ts` (template registry).
- `src/lib/mouSystem/mouDoc.ts` (docx renderer).
- `public/mou-templates/`, `public/branding/gsl_amg_logo.png`.
- `docs/decisions/STEP5_QUESTIONS_resolved.md` Q3 / Q8 background.

## Chain MOU SchoolGroup reconciliation (Gate 2 Step 4 follow-up)

Gate 2 Step 4 backfilled SchoolGroups 1:1 by default. Twelve schools in
the gsl-mou-system snapshot have names matching chain patterns and
need manual SchoolGroup consolidation before Gate 5 cutover. Surfaced
in `src/data/_snapshots/mou-system/_meta.json` under `chainCandidates`
and on `/admin/data-snapshot`. The Ground-Truth report §1.3 flagged
the canonical case (Narayana Group of Schools West Bengal: 7,950
students captured as a single MOU row representing N branches).

Schools requiring review:
- `SCH-B_D_MEMORIAL_JR_SCHO`: B.D Memorial Jr. School (4-branch
  precedent in the Cretile delivery tracker)
- `SCH-KAZIMAN_RAI_MEMORIAL`: KAZIMAN RAI MEMORIAL TRUST
- `SCH-RISHI_AUROBINDO_MEMO`: Rishi Aurobindo Memorial Academy
- `SCH-SRI_R_N_SINGH_MEMORI`, `_2`, `_3`, `_4`: Sri R. N. Singh
  Memorial High School (4 records suggesting branch split)
- `SCH-SRI_RAM_NARAYAN_SING`: Sri Ram Narayan Singh Memorial High
  School
- `SCH-SUMANA_DUTTA_MEMORIA`: Sumana Dutta Memorial Vivekananda
  International School
- `SCH-TECHNO_INDIA_GROUP_P`, `_2`, `_3`: Techno India Group Public
  School (Kalyani + Asansol + Panagarh)

Trigger: before Gate 5 cutover, manually reconcile chain MOUs into
proper SchoolGroups. Decision per school: is this a chain (multiple
branches under one MOU billed centrally) or a standalone school? For
each chain, consolidate the per-branch School records into a single
SchoolGroup with `memberSchoolIds` listing every branch and
`groupMouId` pointing at the chain MOU. The `chain-billing fields`
on SchoolGroup (primaryContact, primaryEmail, primaryPhone,
gstNumber) carry the central billing details; child Schools'
gstNumber stays null and the PI generation lib reads from
SchoolGroup. The 1:1 default is preserved for any School the
reviewer leaves alone.

References:
- `ops-data/ground-truth-data-report-2026-04-24.md` §1.3 (Narayana).
- `docs/MERGE_PLAN.md` §7.2 (SchoolGroup model, Option B).
- `src/data/_snapshots/mou-system/_meta.json` `chainCandidates`.

## Escalations ticketing polish (Phase 1.1)

- **Saved filters per user (localStorage).** Gate 1 Step 5 ships
  category / type / status / severity / SLA-breached / owning-
  department filters as standard URL-state filters; the brief also
  asked for per-user saved filter sets via localStorage. Deferred
  because the discovery UX (a "Save filter" affordance + a saved-
  filters dropdown) is non-trivial and the URL-share pattern covers
  most multi-tab needs.
  Trigger: any tester reports "I keep retyping the same filter
  combination". The save flow is a thin client component on top of
  the existing FilterRail.

- **Multi-column sort with default SLA-breached first.** Gate 1
  Step 5 list defaults to most-recent-first across all entries with
  SLA-breached chips visible inline; the brief also asked for
  multi-column sort with SLA-breached as the primary key. Deferred
  because EntityListTable currently sorts by a single column and
  multi-column sort is a primitive change.
  Trigger: any tester reports the list ordering does not surface
  breached tickets quickly enough.

- **Hard delete of escalations (Admin only).** Brief calls for an
  Admin-only hard-delete action. Deferred because the data model
  flips status to Closed for the operationally-relevant "done"
  state, and no historical ticket has been hard-deleted yet.
  Trigger: an Admin asks to permanently remove a stray test ticket.

## Stage-scoped side navigation (Gate 5 polish)

- **Stage-scoped side rail.** The Gate 1 brief calls for a side nav
  within each top-level stage (e.g., inside Operations: Schools /
  Escalations / VEX / Vendors / Inventory; inside Pipeline: Drafts /
  Sent / Awaiting Signature / Signed). Gate 1 Step 3 ships card-list
  index stub pages at `/dispatch`, `/finance`, `/operations`,
  `/reports` instead, because the entity routes those side rails
  would point at are still scattered across the existing app shape
  and Gates 2-4 will migrate the canonical entities into the new
  stage routes. Building the side rail before that migration means
  rebuilding it after each gate as routes shift.
  Trigger: after Gate 4 ships (Status Tracker + Notifications +
  Audit + Workflow handoff), before Gate 5 polish. At that point
  every entity has a stable stage home and the side rail can be
  built once against the final route shape.

## Filters (Phase X)

- **Sales Channel filter dimension.** Deferred pending the MOU phase 3a
  sales-channel field landing. Today MOU records do not carry a
  channel attribute (school programmes vs bootcamps vs partnerships
  vs others); without source data on every row, the chip set would
  always evaluate to "match all" or "match none". Trigger: when
  `MOU.salesChannel` (or equivalent) lands as a typed enum on every
  active-cohort record, add it as a fifth dimension on the kanban,
  /mous, and /sales-pipeline FilterRails.

- **Stage filter dimension on the kanban.** Deferred indefinitely:
  the kanban column IS the stage, so a stage filter would either
  hide entire columns (confusing) or duplicate the column-level
  scrolling that already exists. The /mous list page already
  supports `?stage=<key>` deep-links from the column headers for
  the all-MOUs-at-this-stage view. Trigger: only revisit if
  operators ask for a multi-stage subset view that the column +
  list-deeplink combination cannot already serve.

- **Notion-style chip+dropdown multi-select UI.** v2 alternative
  to today's chip-toggle FilterRail. Today's pattern is one click
  per value, with every selection visible inline; Notion's
  pattern is chip → dropdown → checkboxes → Apply, which trades
  more clicks for compactness. Trigger: when any dimension grows
  past ~12 chip options or operators report the chip rail feels
  cluttered under real use, evaluate migration. The Region,
  Programme, Sales Rep, and Status dimensions are well within the
  chip-toggle sweet spot today.

- **Sales Pipeline owner select unification.** The /sales-pipeline
  page keeps its existing Owner select (mine / all / sp-XXX) outside
  FilterRail because it carries a SalesRep "mine" default scope
  semantic: empty filter = own opps only, `?owner=all` opt-out
  expands to the team. Trigger: when the "mine" default is no
  longer the dominant SalesRep workflow, fold the salesRep dimension
  into FilterRail with a multi-select chip set and drop the legacy
  owner param. Existing tests for `?owner=mine|all|sp-X` would need
  updating in the same migration.

- **Inventory + Notifications filter unification.** Inventory
  (/admin/inventory) and Notifications (/notifications) skipped the
  Phase X Region/Programme/Sales Rep/Status dimension set per the
  "skip silently; don't show filters that would not do anything"
  rule: SKU rows have no school / region / programme / sales-rep
  attribute, and notification rows are scoped per-user with kind as
  the only meaningful filter. Trigger: if either page grows
  cross-cutting attributes (e.g., notification → MOU → school region
  cascade for an Ops dashboard), revisit and add the matching
  FilterRail dimensions.

- **City → region inference helper.** Originally proposed for a
  one-time backfill plus a default suggestion in school create /
  edit forms. Backfill skipped because school.region is already
  populated from SPOC source. Trigger: when a school create form
  lands and operators want a city-typed-first → region-defaulted
  flow, port the major-metro mapping from the original Phase X
  brief into `src/lib/regions.ts` as `inferRegionFromCity(city)` and
  wire to the form's onChange.
