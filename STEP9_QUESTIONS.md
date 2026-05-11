# Gate 3 Steps 2-9 : Pending questions for main CC

Questions surfaced during the Kits for Dispatch (Misba + Shashank + Pranav
joint spec) build. Each lists the call-site, alternatives considered,
the decision and confidence. None are blockers; flagged here so main CC
can re-decide before the V1-V7 sweep if any of these are wrong.

## Q1: Where does `/dispatch/kits` mount relative to the existing `/dispatch` stage?
- Route: `src/app/dispatch/kits/page.tsx` (new) sibling to `src/app/dispatch/page.tsx`.
- Question: The joint spec calls the list "a new tab" but Ops already
  has `/dispatch` as a stage landing page (with three index cards:
  raise request, pending review, active dispatches). New surface
  options: extend the existing stage landing, or mount sibling routes.
- Alternatives considered:
  - **A) Sibling route at `/dispatch/kits`** with its own list page; the
    existing `/dispatch` page stays untouched as the stage landing.
    (Chosen.)
  - B) Replace `/dispatch` body to render the Kits for Dispatch list
    directly. Loses the existing entry points; surprises operators
    mid-pilot.
  - C) Add a "Kits for Dispatch" tile to `/dispatch`'s index. Hybrid
    of A + B; we did not add the tile in this batch but should once
    operators confirm the affordance.
- Decided: A. URL is `/dispatch/kits` for the list; detail at
  `/dispatch/kits/[mouId]`; final summary at `/dispatch/kits/summary`.
- Confidence: high.

## Q2: KitDispatch.id timing : minted at MOU completion or first allocation submit?
- Route: `src/lib/kitDispatch/lookup.ts` (mintDispatchId), `src/lib/kitDispatch/allocate.ts`.
- Question: Should every eligible MOU have a KitDispatch record from
  the moment MOU is signed, or should we mint lazily when Ops first
  submits an allocation?
- Alternatives considered:
  - A) Eager mint at MOU status flip to Active. Every eligible MOU has
    a record from day one; simpler list view (no synthetic stubs).
    Adds clutter (a record per of 134 active MOUs) and writes records
    for MOUs that may never see allocation.
  - **B) Lazy mint on first allocation submit.** Synthetic stub rows
    on the list view when no record exists; `STUB-<mouId>` id with
    `hasRecord: false`. (Chosen.)
- Decided: B. The list-view derivation handles both cases. The
  detail page routes by mouId (not dispatchId) so the URL is stable
  pre- and post-mint.
- Confidence: high.

## Q3: KitAllocation.productName : store SKU name or SKU id?
- Route: `src/lib/types.ts` (KitAllocation), `src/lib/kitDispatch/allocate.ts`.
- Question: Should `productName` carry the SKU id (e.g. INV-LAUNCHPAD)
  and resolve to name at render time, or store the human name verbatim?
- Alternatives considered:
  - A) Store SKU id. Survives SKU rename; requires a join at render.
  - **B) Store SKU name (skuName) verbatim.** No join at render; audit
    trail preserves the exact text the operator saw. SKU rename in
    inventory does not retroactively rewrite past allocations. (Chosen.)
- Decided: B. The allocation lib validates the name exists in
  `inventory_items.json` at submit time; a later rename is non-
  retroactive.
- Confidence: medium. The Step 6 accounts-execute path also
  matches by name; if inventory ever supports SKU rename, surface
  the audit history that captures the old name.

## Q4: Warehouse email : ship the placeholder button only, or scaffold SMTP?
- Route: `src/app/api/dispatch/kits/[mouId]/warehouse-email/route.ts`.
- Question: The joint spec section 7 includes "Email to Warehouse" as
  one of the Tally challan handling affordances. Gate 4 wires actual
  SMTP delivery; for Step 6 the button could be: (a) intent-only
  (no email goes out), (b) email goes out but content is hardcoded,
  (c) commented-out SMTP scaffolding ready for Gate 4 to uncomment.
- Alternatives considered:
  - **A) Intent-only: log a warehouseEmailLoggedAt timestamp on the
    dispatchSummary + audit entry "warehouse-email-intent:
    warehouse@getsetlearn.info".** Operator clicks; toast confirms;
    no email goes anywhere. (Chosen.)
  - B) Wire SMTP now. Means picking an email provider in Gate 3
    that should be a Gate 4 architecture decision.
  - C) Comment-out scaffolding. Dead code reduces clarity; a clean
    placeholder is better.
- Decided: A. The button's onClick POSTs to /warehouse-email which
  writes only the audit + timestamp. Gate 4 swaps the route body for
  real email + leaves the same UI affordance.
- Confidence: high.

## Q5: File storage : public/ writes vs S3?
- Route: `src/app/api/dispatch/kits/[mouId]/challan/upload/route.ts`,
  `src/app/api/dispatch/kits/[mouId]/pod/upload/route.ts`.
- Question: The brief said challan is stored at
  `public/delivery-challans/<dispatchId>.pdf`. POD parallel:
  `public/delivery-pods/<dispatchId>.<ext>`. Filesystem writes are
  durable in dev + locally; on Vercel serverless `/public` is
  read-only at runtime (only baked-in assets work).
- Alternatives considered:
  - A) Write to `public/` directly. Works in dev / Azure / any
    persistent-fs host; broken on Vercel serverless.
  - **A) Write to `public/` directly + flag as Phase-1.1 storage swap.**
    Matches the brief's path; matches `signedMouPdfPath` pattern
    Gate 2 already established. Vercel-prod swap is on the D-041
    deferred-items list. (Chosen.)
  - C) Use S3 / Cloudflare R2 now. Adds infra dependency the pilot
    doesn't need; main CC has not approved an object-store vendor.
- Decided: A. Identical pattern to the existing MOU signed-pdf
  upload. Confidence: medium; please confirm Azure migration timeline
  before going to production for the warehouse-handover use case.
- Confidence: medium.

## Q6: MOU eligibility : "Completed" status vs Active-or-later?
- Route: `src/lib/kitDispatch/derive.ts` (`isMouEligibleForKitDispatch`).
- Question: Joint spec section 2 says "Entry should appear here only
  after MOU is completed." But the production corpus has zero MOUs
  at `'Completed'` status (134 at `'Active'`; 9 at `'Pending Signature'`).
  Strict `=== 'Completed'` makes the list empty.
- Alternatives considered:
  - A) `status === 'Completed'` strictly. Empty list at pilot start.
  - **B) `status in {Active, Completed, Expired, Renewed}`.** Read
    "completed" as "MOU process is done, kits can be dispatched"
    rather than "the final MouStatus literal `Completed`". (Chosen.)
- Decided: B. The eligibility helper hard-codes the four-status set.
  Pending Signature / Draft do NOT appear (kits cannot ship before
  signing).
- Confidence: medium. If main CC wants strict-Completed semantics,
  the helper is a one-line flip. (Either way, the eligibility set
  is documented at the top of `derive.ts`.)

## Q7: Allocation form : per-grade single SKU vs multi-SKU?
- Route: `src/app/dispatch/kits/[mouId]/AllocationForm.tsx`.
- Question: The joint spec table shows one product per grade row.
  Real-world a single grade may receive both a TinkRworks kit AND
  a Cretile kit for a Both-product MOU. Step 3's form models one
  row per grade with one product; multi-product per grade would
  need either multiple rows per grade or a multi-select product
  column.
- Alternatives considered:
  - **A) One row per grade, one product per row.** Matches the joint
    spec verbatim. For a "Both" MOU that ships multiple SKUs to
    Grade 6, Ops uses two rows: Grade 6 + Launchpad + 8, then a
    second Grade 6 entry would need to be a separate row but the
    form keys by grade. (Chosen with caveat.)
  - B) Allow multiple rows per grade. More flexible; deviates from
    spec table layout.
- Decided: A for Step 3. If pilot operators need multi-SKU per
  grade, surface and pick B in round 2.
- Confidence: low. Marked for explicit operator feedback during the
  Misba walkthrough.

## Q8: Inventory decrement timing : allocation or execution?
- Route: `src/lib/kitDispatch/allocate.ts`,
  `src/lib/kitDispatch/accountsExecute.ts`.
- Question: When does inventory currentStock decrement: when Ops
  submits an allocation, or when Accounts records actual dispatched?
- Alternatives considered:
  - A) Decrement at allocation submit. Reserves stock; risk of stock
    sitting reserved against allocations Sales rejects.
  - **B) Decrement at accounts-execute (Step 6).** The brief's section 9
    says "Outward auto-reduced after dispatch". Aligns with the
    decrement timing. Partial dispatch only decrements
    `qtyActualDispatched`, not `qtyRequested`. (Chosen.)
- Decided: B. The allocation step validates against
  `currentStock` but does NOT decrement; execution decrements the
  actual-dispatched amount.
- Confidence: high.

## Q9: Detail page route by mouId or dispatchId?
- Route: `src/app/dispatch/kits/[mouId]/page.tsx`.
- Question: The brief called the route `[dispatchId]` but the id is
  minted lazily (Q2). The URL must work pre-mint.
- Decided: Route segment is `[mouId]` (the natural stable key);
  KitDispatch.id is minted lazily inside the lib. Functionally
  identical from the operator's POV; pragmatically the URL is stable
  across the mint event.
- Confidence: high.

## Q10: TopNav surfacing : add "Kits for Dispatch" link to /dispatch landing?
- Route: `src/app/dispatch/page.tsx`.
- Question: I did not modify the existing /dispatch landing page to
  add a tile linking to /dispatch/kits. The Gate 3 build is functional
  via direct URL but operators need to know the route.
- Decided: Deferred. Step 10 V1-V7 sweep can add the tile. Surface
  here because if main CC wants the tile in Step 9 it is a 10-line
  edit to /dispatch/page.tsx; deliberately untouched to avoid
  drifting from "do not touch unrelated routes".
- Confidence: high; intentionally deferred.
