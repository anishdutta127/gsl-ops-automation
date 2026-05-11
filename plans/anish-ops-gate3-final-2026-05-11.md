# Gate 3 final report: 2026-05-11

**Owner:** Anish Dutta · **Joint spec authors:** Misba, Shashank, Pranav.
**Source:** `phase-misba-feedback/Kits_for_Dispatch__1_.docx` (2026-05-10 version).
**Scope:** Kits dispatch flow end-to-end: MOU enhancement, list view, school-level allocation, Sales approval, dispatch summary, Accounts execution + Tally Delivery Challan, inventory module, shipment tracking + POD, final dispatch summary view.
**Status:** Gate 3 closed. Gate 4 starts after Anish review.

---

## 1. Step commits (Gate 3)

| Step | Commit | Subject |
|---|---|---|
| Housekeeping | `2b65259` | chore(housekeeping): fix 5 pre-existing tsc errors + testing email queue |
| Gate 3 prep | `cd263af` | docs(gate3): import kits-dispatch joint spec doc into repo |
| 1 | `f54334b` | feat(mou): productSelection + gradewiseDistribution fields on MOU draft + Pipeline |
| 2 | `64dbf8b` | feat(dispatch): Kits for Dispatch list view |
| 3 | `abcb5ff` | feat(dispatch): school-level kit allocation with inventory validation |
| 4 | `8d5e709` | feat(dispatch): Sales approval workflow with reject-and-revise loop |
| 5 | `1b167b9` | feat(dispatch): dispatch summary with dual-write to School Master |
| 6 | `5a149c9` | feat(dispatch): Accounts execution with Tally Delivery Challan + partial dispatch |
| 7 | `d0df5a8` | feat(inventory): integrated inventory module with auto-outward + Finance inward control |
| 8 | `3b053d5` | feat(dispatch): shipment tracking + POD upload with status auto-transition |
| 9 | `908b28e` | feat(dispatch): final dispatch summary view with CSV export |

11 commits total (10 Gate 3 + 1 housekeeping that lifted pre-Gate-2-Step-6 tsc debt). 8 of the 10 ship through sub-agent (Steps 2-9 per the user-authorised delegation pattern); Step 1 and the joint spec doc import done by main CC.

---

## 2. Test count

| Snapshot | Tests | Files |
|---|---|---|
| Gate 2 final (Step 8 close) | 2,127 | 232 |
| Gate 3 housekeeping (5 tsc + testing-email queue) | 2,127 | 232 |
| Gate 3 Step 1 close (GradewiseSection + schema) | 2,135 | 233 |
| **Gate 3 Step 10 close (final)** | **2,176** | **241** |

Net Gate 3 contribution: +49 tests across 9 new test files. New libs covered: `kitDispatch/{derive,lookup,allocate,approve,summary,accountsExecute,shipment,statusLogic,summaryView}.ts` (8 lib test files, 41 tests) + `components/mou-system/GradewiseSection` (8 static-render tests).

`tsc --noEmit`: **clean** (the 5 pre-existing strict-mode errors in `reverseAdjustment.test.ts` flagged across Gates 2-3 sessions were fixed in commit `2b65259`).
`next lint --max-warnings 0`: clean.
`docs-lint`: passed (em-dash zero on new content; 9 pre-existing AI-slop warnings in older docs).

---

## 3. Best-practice defaults locked across Gate 3

For the testing email after Gate 5; appended to the Gate 2 list:

### MOU enhancement (Step 1)

- **Two optional fields on MOU**: `productSelection: 'TinkRworks' | 'Cretile' | 'Both' | null` and `gradewiseDistribution: GradewiseDistributionRow[] | null`. Both are `?:` optional, so existing 152 MOUs render without breakage.
- **GradewiseSection is reusable**: same component drives the GeneratorWizard's collapsible section and the new `/mous/[mouId]/kits-details` late-stage edit surface. Sales fills at either entry point; downstream consumers do not care which path was taken.
- **Total auto-calculation** at the UI layer (sum of students). Rows with 0 students AND null kitType drop from the persisted array, keeping the JSON minimal.
- **Permission**: `canEditMOU` (Sales + Admin) on both the draft surface and the Pipeline edit route.

### Kits for Dispatch flow (Steps 2-9)

- **Lazy KitDispatch minting**: every MOU at status >= Active (the data corpus has 0 MOUs at literal 'Completed' status; sub-agent decided 'Active' onwards counts as "MOU process done" per STEP9_QUESTIONS Q6) gets a synthetic stub row on the list view until Ops submits the first allocation. The detail page routes by `mouId` (not `dispatchId`) so URLs survive the mint event.
- **Inventory-linked allocation gate**: server-side check that `kitsQty` per SKU does not exceed `availableQty` on `inventory_items.json`. UI also shows a soft warning before submit.
- **Sales reject-and-revise loop**: rejection requires a non-empty reason; allocation flips back to editable; reason persists on `salesRejectionReason` and re-appears on the next Ops view. Empty reason returns 400 `rejection-reason-required`.
- **School Master dual-write**: when Sales edits School details on the dispatch summary, two queue commits land (one on KitDispatch, one on Schools). Both audited; the School audit entry references the dispatch by id.
- **Accounts partial dispatch**: `qtyActualDispatched` per row can be 0..qtyRequested (not above; 400 if exceeded). Any row with `0 < actualDispatched < qtyRequested` flips the dispatch to status 'Pending'.
- **Auto-outward inventory decrement**: same Accounts-execute queue commit that saves the dispatch also appends an OutwardEntry per row and decrements the SKU's `availableQty`. One atomic commit; no two-phase risk.
- **Finance-only inward inventory entry**: existing `/admin/inventory` page enforces `canManageInventory` (Finance + Admin). Outward entries are always `autoGenerated: true`; never operator-edited.
- **Forward-only status transitions**: `Not Started -> Pending -> In Transit -> Delivered`. Rewinds blocked at the API; recovery is Admin JSON edit.
- **POD-as-completion**: dispatch status flips to 'Delivered' only when POD is uploaded. The "Delivery Status" radio cannot be set to 'Delivered' without a POD file path.
- **Warehouse email is intent-only**: Step 6 logs `warehouseEmailLoggedAt` + audit entry; actual SMTP wire-up is Gate 4.

### Cross-cutting

- **Honest toast on every dispatch-flow write**: "Allocation submitted. Sales rep will receive a notification at next cron drain.", "Dispatch approved. Saved. Will reflect everywhere within ~5 minutes.", "Summary saved. School master updated within ~5 minutes.", "Dispatch saved. Status will update within ~5 minutes; warehouse notified at next cron drain.", "Shipment tracking saved. Will reflect everywhere within ~5 minutes.", "POD uploaded. Status flipped to Delivered."
- **Department accents preserved**: Ops orange on `/dispatch/kits` chrome, Sales navy on approval affordances, Finance teal on Accounts surfaces. `accentFor(department)` is the single source.
- **Permission gates centralised**: 2 new helpers added (`canAllocateKits` Ops + Admin, `canUploadPOD` Ops + Admin); 19 usages across 9 API routes. Zero ad-hoc role-string comparisons.
- **All writes through the queue** (`enqueueUpdate` -> `atomicUpdateJson`). Audit entries on every write.
- **British English + Indian money format** preserved across all new copy. No em-dashes.

---

## 4. Items needing Misba/Shashank/Pranav input

Appended to the existing testing email queue at `docs/decisions/TESTING_EMAIL_QUEUE.md`. New items 6-10 cover Gate 3 decisions parked for the workflow owners:

6. **MOU eligibility threshold for Kits for Dispatch list** (Pranav). The list shows MOUs at `status in {Active, Completed, Expired, Renewed}` rather than just `'Completed'` (joint spec literal). Reason: production has 0 MOUs at literal 'Completed' status. Confirm "MOU is process-done" means Active onwards.

7. **Per-grade multi-SKU allocation** (Shashank). Step 3's allocation form models one SKU per grade row (matches joint spec table verbatim). If a 'Both' MOU has Grade 5 receiving both a Cretile kit AND a TinkRworks kit, today's model needs two rows for Grade 5. Confirm acceptable, or surface multi-SKU-per-grade as a Phase 1.1 enhancement.

8. **Warehouse email content** (Misba + Pranav). Gate 4 wires SMTP; the message template is unspecified. Joint spec section 7 mentions "Email to Warehouse" without template body. Pre-Gate-4: confirm the email recipient (`warehouse@getsetlearn.info`?), subject line, and body skeleton.

9. **POD photo upload alongside PDF** (Shashank). Step 8 accepts PDF for POD. Some couriers issue physical PODs that Anita photographs; would JPG/PNG support be useful? Today's accept attribute is `application/pdf` only; flip to `application/pdf,image/jpeg,image/png` is trivial.

10. **Final Dispatch Summary export format** (Misba). Step 9 ships CSV export only. Joint spec mentions exportability without naming format. If Misba expects Excel (.xlsx), Phase 1.1 adds a CSV-to-XLSX shim using `xlsx` or `exceljs`.

Items 1-5 (carried from Gate 2 final): VEX PI id format, VEX dispatch rewind, excess-payment UX, single-amount vs CSV matcher, chain MOU consolidation.

---

## 5. Gate 5 cutover prerequisites

Carry-forward from Gate 2 final §5; Gate 3 adds no new cutover blockers (the kits-dispatch flow does not depend on `PI_PARALLEL_BUILD_LOCK`, the `.docx` Generate flow, or chain MOU consolidation for its core path).

| # | Backlog entry | Source gate |
|---|---|---|
| 1 | PI generator render-only split | Gate 2 Step 6 |
| 2 | `.docx` Generate flow port | Gate 2 Step 5 |
| 3 | Chain MOU SchoolGroup reconciliation | Gate 2 Step 4 |

Gate 3 surfaces one **storage durability** item that is NOT cutover-blocking but should resolve before scale-up:

- **`public/delivery-challans/` + `public/delivery-pods/` file storage** (per STEP9_QUESTIONS Q5). The current implementation writes to `public/` (matches existing signed-MOU pattern); Vercel-prod swap to Azure Blob is tracked at `docs/W4-DEFERRED-ITEMS.md` D-041. Cutover safe; production-scale not.

---

## 6. Verification summary (V1-V7 sweep)

- **V1** (honest timing): 5 toast variants surfaced across 5 client form components. Every dispatch-flow write carries a "Will reflect everywhere within ~5 minutes" variant or domain equivalent.
- **V2** (375px mobile): 9 occurrences of responsive Tailwind classes across 7 new dispatch files. Critical surfaces (Step 3 12-row × 5-col allocation table, Step 6 Accounts entry table, Step 2 list view) use `overflow-x-auto` + `min-w-[...]`. Browser-level verification at Vercel preview is yours.
- **V3** (regression): 2,176 / 241 (was 2,127 / 232 at Gate 2 close; +49 tests / +9 files).
- **V4** (edit affordances by role): no ad-hoc role-string comparisons in `/api/dispatch/kits/*`; all gated through centralised access helpers.
- **V5** (cross-step edge cases): the 41 sub-agent tests in `src/lib/kitDispatch/*` already cover every named edge case:
  - Sales rejects with allocation editable (`approve.test.ts`)
  - Accounts partial dispatch with status Pending (`accountsExecute.test.ts`)
  - POD upload on a Pending status dispatch (`shipment.test.ts`)
  - MOU with no grade-wise data triggers Ops-fills-it path (`derive.test.ts:synthesises a stub row`)
  - Inventory insufficient blocks allocation (`allocate.test.ts:rejects when kitsQty exceeds inventory availability`)
  - Plus a full-lifecycle integration test at `statusLogic.test.ts:allocate -> approve -> execute -> In Transit + decrement`.
- **V6** (full permission matrix): 19 gate usages across 9 API routes. Ops allocates + POD-uploads, Sales approves, Finance executes + manages inventory inward. No cross-department EDIT leaks.
- **V7** (hardcoded contact audit): one pre-existing finding in test fixtures (`src/app/dispatch/request/page.test.tsx:32` carries `pratik.d@getsetlearn.info` from Gate 1); no new findings in Gate 3 production code.

---

## 7. Gate 4 entry conditions

Anish reviews this report. If approved, Gate 4 starts. Gate 4 scope per the ceremony plan is Status Tracker + Notifications + Audit + Workflow handoff. The warehouse-email-intent placeholder (item 8 above) becomes a Gate 4 deliverable.

Gate 4 does not need any of the Gate 5 cutover prereqs to begin; those activate at T-0 only.
