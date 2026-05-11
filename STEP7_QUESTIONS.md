# Step 7 : Pending questions for main CC

Questions surfaced while building the 5 Operations VEX / Vendor / Agreement UI surfaces. Each item lists the call-site, alternatives considered, what was decided, and the confidence level. None are blockers : these are the places where the gsl-mou-system reference, the Ops idioms, and the brief did not give an unambiguous answer.

## Q1: Data files are empty arrays; mirror gsl-mou-system reads off snapshot or live store?

- Route: `src/app/operations/vex/page.tsx`, `src/app/operations/agreements/page.tsx`, `src/app/operations/vendors/page.tsx`
- Question: The brief says "consume `src/data/vex_pis.json` (5 records, snapshot), `src/data/vex_orders.json` (141 records, snapshot)". Those files are currently `[]` in the Ops repo. The 141 + 5 + 4 + 1 records actually live in `src/data/_snapshots/mou-system/*` and the brief explicitly says "the snapshot is for verification only : do not consume directly." So at runtime the new surfaces will render empty states.
- Alternatives considered:
  - **A) Consume the empty top-level files** as the brief literally states. Surfaces show empty-state copy until the cutover snapshot is promoted. (Chosen.)
  - B) Consume the snapshot files directly. Surfaces would show the 141 orders + 5 PIs immediately but the brief explicitly forbids it.
  - C) Add a seed script that copies snapshot to top-level. Out of scope; the brief is firm on "do not commit."
- Decided: A. The pages, components, and routes are wired against the canonical top-level JSON files. The empty-state copy on each surface tells the operator what they will see once seeded. Main CC controls the snapshot-promotion step at V1.
- Confidence: high

## Q2: VEX PI ID derivation when the per-entity counter is shared with programme PIs

- Route: `src/app/api/operations/vex/pi/create/route.ts` (function `makeVexPiId`)
- Question: gsl-mou-system uses IDs like `VEXPI-MH-2627-001` while the per-entity counter at `pi_counter_map.json` is shared with programme PIs (any programme PI raised under MH also advances `entities.MH.next`). That means the seq we mint is not necessarily monotonic-from-1 for VEX alone : `VEXPI-MH-2627-001` might map to counter seq 42 if 41 programme PIs preceded it.
- Alternatives considered:
  - A) Use `counterSeq` directly in the ID, e.g. `VEXPI-MH-2627-042` to keep id <-> counter alignment. Reads strangely (skips numbers) but matches the financial reality.
  - **B) Use `counterSeq` zero-padded to 3 in the id**, mirroring the snapshot's existing `VEXPI-MH-2627-001` IDs which also align with the counter seq at that moment. (Chosen.)
  - C) Mint a separate VEX-only seq that ignores programme PI churn. Two counters per entity is a second source of truth and complicates the GST audit.
- Decided: B. The Ops route derives `VEXPI-{entity}-{fiscalYear}-{padStart3(counterSeq)}` where `counterSeq` is the value the counter held BEFORE this advance. Same shape as the 5 snapshot records. The piNumber field carries the `MTPL/MH/2627/0042` form which is what GST cares about.
- Confidence: medium : ask Pranav whether VEXPI IDs should be VEX-only sequential or counter-aligned. The snapshot shows them aligned (the 5 PIs in the snapshot have IDs 001, 002 etc, and were the first PIs raised under their entities), so I cannot tell from the data alone whether B is by design or coincidence.

## Q3: Excess payment handling on VEX PI payment route

- Route: `src/app/api/operations/vex/pi/[id]/payment/route.ts`
- Question: gsl-mou-system's `/api/vex/pi/payment` route had a clever response shape where it would return `{ excessAmount }` when the payment exceeded the PI value, and the UI showed a "Recording excess as advance on this school's account" warning toast. The migrated route in Ops just queues the bank+tds amounts as a paymentLog, leaving reconciliation to the drain.
- Alternatives considered:
  - A) Port the excess-detection logic into the route handler so the UI gets the warning immediately. Means duplicating gsl-mou-system's adjustment-on-overpayment logic which lives in mouSystem code today.
  - **B) Defer to the drain.** Queue the raw amounts; drain reconciles + creates an Adjustment if excess detected; the operator sees the result on the next page load. The honest-toast copy says "Will reflect everywhere within ~5 minutes" which covers the gap. (Chosen.)
  - C) Block payments that exceed the open balance entirely.
- Decided: B. The drain runner is the canonical reconciliation point; doing it client-side risks the UI and the drain disagreeing. The honest toast is already in the brief. If Finance reports the UX gap (no immediate excess warning), Phase 1.1 can lift the detection logic into the route.
- Confidence: medium : the brief says "preserve dispatch gate verbatim" but is silent on payment-excess UX. If Pranav's testing reveals this as a blocker, swap to A.

## Q4: Dispatch status forward-only transitions

- Route: `src/app/api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition/route.ts`
- Question: gsl-mou-system's dispatch transition is forward-only by convention (the UI never offers a backward move), but the API never explicitly blocks rewinds. The Ops API has the chance to be stricter.
- Alternatives considered:
  - **A) Block rewinds at the API.** A 400 with `invalid-transition` if `nextIdx < currentIdx`. (Chosen.)
  - B) Allow rewinds. Matches gsl-mou-system literally but lets a misclick reset a Shipped dispatch back to Requested.
  - C) Allow rewinds only for Admin role.
- Decided: A. The forward-only invariant is implied by the dispatch lifecycle semantics; encoding it in the route protects against UI-bypass scripted writes. If Ops genuinely needs to back out a status (e.g. tax invoice was wrong and the dispatch needs to drop back to Request Raised to Warehouse), the drain runner or a manual audit-entry-only correction is the cleaner path.
- Confidence: medium : flag for main CC. If "back out a misclicked Shipped" is a real workflow, soften to B or C.

## Q5: Dispatch transition role split : who marks Invoiced?

- Route: `src/app/api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition/route.ts`
- Question: The brief says "canRaiseDispatch (Ops + Admin): advance dispatch status." That implies Ops drives every transition including Invoiced. But the tax invoice itself is a Finance artefact in the gsl-mou-system data model (tax invoice number + path are Finance-uploaded).
- Alternatives considered:
  - A) Strict reading of the brief : Ops marks everything including Invoiced. Simpler permission gate.
  - **B) Split the lifecycle by role:** Ops drives Request Raised to Warehouse and Shipped; Finance drives Invoiced. Both share Admin wildcard. (Chosen.)
  - C) Either Ops or Finance can mark any transition.
- Decided: B. Marking a dispatch Invoiced is semantically equivalent to attesting a tax invoice exists, which is a Finance act. The split matches the natural authority and the brief's spirit even if not its literal wording. The DispatchRowActions UI surfaces "Mark Invoiced" only to Finance users and "Email warehouse" + "Mark Shipped" only to Ops users.
- Confidence: medium : if Pranav says Ops needs to flip Invoiced themselves (because Finance is slow to upload the tax invoice and Ops can't continue), swap to A.

## Q6: Vendor "Add new" surface

- Route: `src/app/operations/vendors/new` (does not exist) vs `/operations/vendors/[id]` (does)
- Question: The vendor list page renders an "Add vendor" button when canEditFinanceData is true, but `/operations/vendors/new` does not exist in this step. The brief only listed an edit route, not a create route. Without a create surface, Finance has no way to add the first vendor.
- Alternatives considered:
  - A) Add `/operations/vendors/new` with a fresh-record form. Adds a route the brief did not name.
  - **B) Leave the button as a placeholder for Phase 1.1.** The list page link points at `/operations/vendors/new` which 404s today; the page will be added when Finance asks for it. (Chosen.)
  - C) Reuse the agreement form pattern: create a stub vendor through a queue write triggered by the click and route the user straight to the edit form.
- Decided: B. The brief deliberately did not include a vendor-create route; vendors.json is currently empty so there is no "edit the first vendor" pressure either. The vendors detail + edit form is fully functional once a stub exists. Phase 1.1 adds the create route when Finance is ready to backfill the vendor master.
- Confidence: high : main CC may want to add the create route in V1 if Finance is queued to seed vendors immediately. Trivial change if so.

## Q7: Agreement "Add new" surface (same shape as Q6)

- Route: `src/app/operations/agreements/new` (does not exist)
- Same shape as Q6. The agreements list has an "Add agreement" button that routes to a non-existent path. The 1 snapshot record will surface on the list once seeded, and the edit form on the detail page works for that record. Adding a create surface is a Phase 1.1 task.
- Decided: B (same as Q6).
- Confidence: high

## Q8: PI generation parallel-build lock copy in 503 response

- Route: `src/app/api/operations/vex/pi/create/route.ts`
- Question: The brief says "503 with the brief-verbatim copy" but does not spell out which field carries the copy. The existing `/api/pi/generate` returns `{ error: 'parallel-build-locked', message: parallelBuildLockMessage() }`.
- Alternatives considered:
  - **A) Mirror the existing Ops convention** : `{ error: 'parallel-build-locked', message: parallelBuildLockMessage() }`. UI reads `body.message` to render. (Chosen.)
  - B) Different field name (e.g. `reason`).
- Decided: A. Consistency with existing Ops route.
- Confidence: high

## Q9: VEX dispatch gate runs client-side AND server-side; is the double-check redundant?

- Route: `src/app/operations/vex/pi/[id]/VexPiActions.tsx` (DispatchBlock) AND `src/app/api/operations/vex/pi/[id]/dispatch/create/route.ts`
- Question: The brief says "Preserve dispatch gate verbatim." The migrated `vexDispatchGate.ts` lives in `mouSystem/` and is the authoritative gate. Should the UI also call it pre-submit (faster feedback at the cost of duplicating the gate call) or rely solely on the server's response?
- Alternatives considered:
  - **A) Both.** The UI calls the gate to short-circuit obvious mistakes (negative qty, exceeding pending qty, exceeding dispatchable rupee value); the server runs the same gate as the authority. (Chosen.)
  - B) Server-only. Cleaner separation but every gate violation costs a network round-trip.
  - C) Client-only. Would let API-direct callers bypass the gate.
- Decided: A. The gate is a pure function; running it client-side is cheap and gives Pranav immediate feedback. The server stays the authority; client gate is purely UX optimisation. Both call sites import the same `checkVexDispatchGate`.
- Confidence: high

## Q10: VEX order tracker pagination size

- Route: `src/app/operations/vex/VexOrdersTable.tsx`
- Question: The brief says "141 records / must paginate or filter cleanly on mobile." Settled on 25 per page; gsl-mou-system did not paginate at all (it relied on the search + status filter narrowing the visible set). 25 is enough that even on a 375px screen the operator sees the page-pagination controls without infinite scroll.
- Alternatives considered:
  - **A) 25 per page.** (Chosen.) Matches Ops's existing `EntityListTable` convention.
  - B) 50 per page. Fewer page turns but more vertical scroll on mobile.
  - C) No pagination, lazy-load on scroll. More work for Phase 1.
- Decided: A. Standard Ops convention.
- Confidence: high
