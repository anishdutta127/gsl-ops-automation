# Testing email queue

Workflow decisions parked for Pranav / Shubhangi / Anita / Misba.
These are NOT cutover-blocking but cutover-surprising if we ship without asking.

Anish forwards this as a single email at the end of Gate 5 build, before T-0 cutover. Each item gets a yes/no/clarification reply.

Maintained as items land. Add to the bottom; never re-order so the email thread stays interpretable.

---

## Item 1: VEX PI id format confirmation

**Owner:** Pranav.
**Question:** is the VEX PI id intended to be VEX-only sequential per entity, or should it follow the shared programme+VEX counter going forward?

**Context.** Snapshot at `src/data/_snapshots/mou-system/vex_pis.json` shows VEX PI ids `VEXPI-UP-2627-001..004` while their piNumbers carry gaps `MTPL/UP/26-27/0008,0009,0010,0015`. The 4 records' VEX seqs are 001..004 gap-free; the 4 piNumbers' programme-seq positions are 0008, 0009, 0010, 0015 with programme PIs filling 0011..0014.

This pattern can mean either:
- **VEX-only sequential** is by design: VEX gets its own counter, the piNumber follows the entity-shared atomic counter for GST. The id is the operator-facing label; the piNumber is the financial label.
- **Coincidence** because these 4 VEX PIs happened to be the first VEX PIs issued under UP. Going forward, the id should follow the shared counter so id-seq and piNumber-seq agree.

Gate 2 Step 8 implementation pinned format to "VEX-only sequential" (matches snapshot exactly). Regression test at `src/app/api/operations/vex/pi/create/route.test.ts` asserts the gap-detection invariant.

**Why we're asking:** if Pranav prefers id-seq = piNumber-seq alignment going forward, a 3-line revert in `nextVexPiSeq` returns to the sub-agent's original counter-aligned approach. If "VEX-only sequential" is the intent, no change.

**Status:** awaiting Pranav.

---

## Item 2: VEX dispatch rewind authority

**Owner:** Pranav / Anita.
**Question:** is forward-only dispatch transition (with Admin JSON edit as the only recovery path) tolerable for the next 30 days of usage?

**Context.** Gate 2 Step 7 enforces forward-only transitions on the VEX dispatch lifecycle (`Requested → Request Raised to Warehouse → Invoiced → Shipped`). The API returns 400 `invalid-transition` if `nextIdx < currentIdx`. The cost: a misclick on the wrong row needs Admin (Anish) editing `src/data/vex_dispatches.json` to recover.

The forward-only invariant protects against UI-bypass scripted writes that could reset a Shipped dispatch back to Requested without an audit trail. The audit trail does exist, but the UI's "Email warehouse" affordance does not reset to its earlier visual state once the row is Shipped.

**Why we're asking:** if Anita reports needing rewinds in real workflow (e.g. tax-invoice was wrong, dispatch needs to drop back to Request-Raised), Phase 1.1 softens the gate. The fix is small (drop the `nextIdx < currentIdx` check OR add a `canAdminRewind` gate that allows backwards transitions for Admin with audit).

Backlog entry trigger: "if Ops requests rewind capability after 30 days of usage."

**Status:** awaiting Anita's first 30 days.

---

## Item 3: Excess-payment UX

**Owner:** Pranav / Shubhangi.
**Question:** was the "Recording excess as advance" warning toast on gsl-mou-system load-bearing, or was deferring it to the drain reconciler acceptable?

**Context.** gsl-mou-system's `/api/vex/pi/payment` route returned `{ excessAmount }` when a payment exceeded the PI value, and the UI showed a warning toast: "Recording excess as advance on this school's account." Gate 2 Step 7's `/api/operations/vex/pi/[id]/payment` defers the excess detection to the drain reconciler. Honest-toast copy says "Will reflect everywhere within ~5 minutes" which covers the timing gap.

**Why we're asking:** if Shubhangi reports the immediate warning was useful (it stopped her from manually re-checking after every overpayment), Phase 1.1 re-adds the detection in the route handler. If she did not rely on it, no change.

**Status:** awaiting Shubhangi's first month of cutover usage.

---

## Item 4: Single-amount matcher vs CSV upload

**Owner:** Shubhangi.
**Question:** does single-amount entry (mirroring gsl-mou-system) cover daily reconciliation needs, or would CSV bulk upload speed it up?

**Context.** The Step 6 brief mentioned CSV upload but contradicted itself with the "preserve muscle memory exactly" rule. Step 6 shipped single-amount entry mirroring gsl-mou-system's `ReconcileForm` and `PaymentLogForm`. CSV upload is feasible as a Phase 1.1 add: the matcher logic exists; CSV becomes a parsing front-end that fans out one matcher call per row.

**Why we're asking:** if Shubhangi reconciles a bank statement of 20+ payments at end of week, CSV upload removes 20+ form submissions. If she enters payments one-at-a-time as they arrive throughout the week (the more likely Pranav-style cadence), single-amount is the right fit.

**Status:** awaiting Shubhangi's first month of cutover usage.

---

## Item 5: Chain MOU SchoolGroup consolidation

**Owner:** Anish + Misba.
**Question:** which of the 12 chain-candidate schools are real chains (multiple branches under one MOU billed centrally) vs standalone schools?

**Context.** Gate 2 Step 4 backfilled SchoolGroups 1:1 by default. Twelve schools in the snapshot have names matching chain patterns (Narayana, Techno India, B.D. Memorial, etc.) and need manual consolidation before Gate 5 cutover. Surfaced in `src/data/_snapshots/mou-system/_meta.json` `chainCandidates` and on `/admin/data-snapshot`.

Schools requiring decision:
- `SCH-B_D_MEMORIAL_JR_SCHO` (B.D Memorial Jr. School)
- `SCH-KAZIMAN_RAI_MEMORIAL` (KAZIMAN RAI MEMORIAL TRUST)
- `SCH-RISHI_AUROBINDO_MEMO` (Rishi Aurobindo Memorial Academy)
- `SCH-SRI_R_N_SINGH_MEMORI`, `_2`, `_3`, `_4` (Sri R. N. Singh Memorial High School, 4 records suggesting branch split)
- `SCH-SRI_RAM_NARAYAN_SING` (Sri Ram Narayan Singh Memorial High School)
- `SCH-SUMANA_DUTTA_MEMORIA` (Sumana Dutta Memorial Vivekananda International)
- `SCH-TECHNO_INDIA_GROUP_P`, `_2`, `_3` (Techno India Group Public School: Kalyani, Asansol, Panagarh)

The Ground-Truth report §1.3 flagged the canonical case: Narayana Group of Schools West Bengal recorded as a single MOU row representing N branches with 7,950 students.

**Why we're asking:** the 1:1 default works for now but breaks central billing for chains. Each chain needs `memberSchoolIds[]` + `chain-billing fields` on SchoolGroup (primaryContact, primaryEmail, primaryPhone, gstNumber); child Schools' gstNumber stays null and PI generation reads from SchoolGroup.

**Status:** Anish + Misba review session needed before Gate 5 cutover.

---

## Item 6: MOU eligibility threshold for Kits for Dispatch list

**Owner:** Pranav.
**Question:** does "after MOU is completed" in the joint spec mean literal `status === 'Completed'`, or "MOU process done" (Active onwards)?

**Context.** Gate 3 Step 2's Kits for Dispatch list view (`/dispatch/kits`) shows MOUs at `status in {Active, Completed, Expired, Renewed}`. The joint spec section 2 says "Entry should appear here only after MOU is completed". The production corpus (152 MOUs) has 0 records at literal 'Completed' status; reading "completed" as "MOU is process-done" matches the operator-facing language.

**Why we're asking:** if Pranav wants strict `'Completed'`-only, the list filter is a one-line change in `src/lib/kitDispatch/derive.ts`. The data may then need a status-transition pass to flip Active MOUs that have kits owed.

**Status:** awaiting Pranav.

---

## Item 7: Per-grade multi-SKU allocation

**Owner:** Shashank.
**Question:** can a single Grade row in the kit allocation form receive both a TinkRworks kit and a Cretile kit, or is one SKU per grade row sufficient?

**Context.** Gate 3 Step 3's allocation form models one SKU per grade row (matches joint spec table layout). For a 'Both' MOU where Grade 5 gets one TinkRworks + one Cretile kit, today's model needs two rows for Grade 5. The data integrity holds; the UX is slightly clunky.

**Why we're asking:** if real workflow includes multi-SKU-per-grade, Phase 1.1 swaps to a SKU-array-per-grade row shape. Trivial schema migration since the canonical form is `kitDispatch.allocations: KitAllocation[]` and the rows are not keyed by grade today.

**Status:** awaiting Shashank's first month of usage.

---

## Item 8: Warehouse email template

**Owner:** Misba + Pranav.
**Question:** what is the recipient address, subject line, and body skeleton for the warehouse-dispatch notification?

**Context.** Joint spec section 7 mentions "Email to Warehouse" without template body. Gate 3 Step 6 logs `warehouseEmailLoggedAt` + audit entry as a placeholder; actual SMTP wire-up is Gate 4. Without the template, Gate 4 cannot ship the integration.

**Why we're asking:** Gate 4 needs the recipient (`warehouse@getsetlearn.info`?), the subject (e.g. "[GSL Ops] Dispatch raised: {schoolName}"), and the body skeleton (what fields the warehouse sees -- school address, SKU list, freight mode, dispatch summary?).

**Status:** awaiting Misba + Pranav before Gate 4 Step that wires the email.

---

## Item 9: POD photo upload alongside PDF

**Owner:** Shashank.
**Question:** should POD accept JPG/PNG images in addition to PDF?

**Context.** Gate 3 Step 8's POD upload route accepts `application/pdf` only. Some couriers issue physical PODs that Anita photographs with her phone (JPG output). Flipping the route to accept `image/jpeg,image/png` alongside PDF is a 1-line config change; the existing storage layout works for either format.

**Why we're asking:** if photographing physical PODs is the common path, ship the multi-format support now. If Shashank routinely gets digital PDF PODs from the courier portal, keep PDF-only for tighter validation.

**Status:** awaiting Shashank.

---

## Item 10: Final Dispatch Summary export format

**Owner:** Misba.
**Question:** is CSV export sufficient, or is Excel (.xlsx) expected?

**Context.** Gate 3 Step 9 ships CSV export at `/dispatch/kits/summary` (CSV emit lib pinned for backwards compatibility with any pipeline downstream of the summary). Joint spec mentions "exportable" without naming format. If Misba's onward consumers (leadership reports, school-wise tracker) expect .xlsx, a Phase 1.1 add converts CSV-to-XLSX via the `xlsx` or `exceljs` library.

**Why we're asking:** CSV is the simpler ship and works with every spreadsheet tool. XLSX preserves formatting if Misba pastes into a polished report.

**Status:** awaiting Misba.

---

## Appending new items

Add to the bottom only. Use the template:

```
## Item N: short title

**Owner:** name(s).
**Question:** one-line concrete question.

**Context.** 1-2 paragraphs of why this surfaced, what the tradeoff is, what we shipped in the meantime.

**Why we're asking:** what changes based on the answer.

**Status:** awaiting X.
```
