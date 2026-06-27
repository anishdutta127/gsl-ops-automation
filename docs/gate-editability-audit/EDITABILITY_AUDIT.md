# Editability audit: making the platform a full "live Excel"

_2026-06-27. Read-only scoping audit (no prod data touched, no features built). Goal: every
field the team needs to change should be editable, in the right place, in one app, so they can
drop the spreadsheet. This maps where we are and proposes a phased build. STOP for owner review;
nothing is built until the plan + order are approved._

Method: four parallel code audits (MOU/lifecycle, finance, VEX/ops, reference+people), each
reading the actual edit screens, routes, repos, and types. File paths cited throughout.

---

## Scoreboard (the shape of the gap)

| Editability tier | Entities |
|---|---|
| **Fully editable + soft-delete** | School, Escalation, SalesOpportunity (pipeline), CcRule, CommunicationTemplate, Product (rename/retire), Vendor, Agreement, Adjustment (reverse) |
| **Editable but partial** (key fields locked, or one concept split across screens) | MOU, Payment/installment, VexProduct (SKU), InventoryItem, SchoolGroup, LifecycleRule, StageResponsibility |
| **Create-only / record-only** (no edit after create) | SalesPerson, PaymentLog, VexPi, VexDispatch, DispatchRequest, Communication, Feedback, IntakeRecord (edit yes, delete no) |
| **No in-app surface at all** | User (create/edit/role/deactivate/password), SchoolSpoc, ReminderThreshold, VexOrder (read-only viewer of Tally) |

Two structural facts drive most of the gaps:

1. **The financial entities are the *least* editable.** PaymentLog and VexPi - the rows that
   carry money - have no edit and no delete UI. Both real prod incidents (St Paul's duplicate
   `PL-CB850B8E`; the VEX over-counts incl. today's Funscholar) had to be fixed with one-off
   `scripts/*.mjs` + SQL. That is the single clearest "we left the app" signal.
2. **The data layer is more capable than the UI.** `salesTeamRepo.update`, `userRepo.update`,
   `productRepo.update` (parentId/kind), `schoolGroupRepo` full update all EXIST but no screen
   calls them. Several gaps are "wire a form to a repo that is already there," not new plumbing.

---

## PART 1 - Editability map

Columns: editable today (yes / partial / no) · where · CRUD coverage · gap · financial (needs
soft-delete + audit) · priority (high = daily use / data-integrity, low = rare).

### 1a. MOU + lifecycle  (`src/lib/db/repos/mou.ts`, `src/app/api/mou/**`, `src/app/mous/**`)

| field / action | editable? | where | CRUD | gap | fin? | pri |
|---|---|---|---|---|---|---|
| school link, programme, salesperson(+region), notes, dates, effectiveDate | partial (Admin-gated) | `mous/[id]/edit` + `api/mou/[mouId]/edit` | edit | programme edit validates a hardcoded 4-value list while CREATE accepts any registry product, so AIQ / "Bootcamps (general)" MOUs cannot be re-saved (`edit/route.ts:33`) | indirect | med |
| **contractValue, spWithTax/spWithoutTax (per-student price), studentsMou (contracted count)** | **no** | create only | create | **no edit surface anywhere**; a price/value/contracted-count correction forces cancel+recreate or a spreadsheet | **yes** | **high** |
| studentsActual | yes (two screens) | `mou/actuals/confirm` + `mou/[mouId]/student-count` | edit | one concept, two entry points; cascades unpaid-instalment recalc | yes | high |
| paymentSchedule / instalments | yes | `mou/[mouId]/schedule/save`, `installments/schedule-edit` | create/edit/del | locked after PI issue (override needs reason) | yes | high |
| signed-values (price/count/duration) | yes, but **dead-end** | `mou/signed-values/save` | edit | writes a separate `signed_values.json`; **never propagates to `mou.spWithTax`/`contractValue`** - operator thinks they corrected the value but the master stays stale | yes (orphaned) | high |
| status (lifecycle) | partial, action-driven | signed-mou upload / mark-renewed / cancel | forward-only | no general status setter, no rewind; cannot mark Completed/Expired early; a wrong transition needs an Admin DB edit | indirect | med |
| academicYear, salesChannel, schoolScope/group, numberOfYears | **no** | create only | create | omitted from edit form; a mis-keyed FY/channel needs a DB edit | no | low |
| signedMouPdfPath | yes | `mou/[mouId]/signed-mou/upload` | upload | `fs.writeFile` to `public/` is ephemeral on Vercel (EROFS class); metadata persists, file lost | no | med |
| CANCEL (soft-delete) | yes, **Admin-wildcard only** | `mou/[mouId]/cancel` -> `cancelMou` | soft-delete (cascades payments) | Finance/Ops/Sales testers cannot cancel their own mistaken MOU; only `role=Admin && dept=null` | yes | med |
| HARD DELETE | no (by design) | - | none | correct for a financial entity | yes | n/a |

### 1b. Finance: payments / logs / adjustments / PI  (`src/lib/payment/**`, `src/lib/finance/**`)

| field / action | editable? | where | CRUD | gap | fin? | pri |
|---|---|---|---|---|---|---|
| Payment receipt (receivedAmount/date/mode/ref/notes) | yes | `finance/payment/[paymentId]` (edit) -> `editPayment` | edit; amount delta auto-creates an Adjustment | edit does **not** touch the `bankAmount`/`tdsAmount` split -> stale after an amount edit (`paymentMutations.ts:137`) | yes | high |
| Payment schedule fields (expectedAmount/dueDate) | yes | `mous/[id]/installments/[paymentId]/edit` | edit | different screen + field set than the finance receipt edit (see consistency) | yes | high |
| Payment unmatch / soft-delete (Cancelled) | yes (Admin wildcard) | `finance/payment/[paymentId]` (unmatch/delete) | soft-delete | unmatch does not reset the source PaymentLog's `unmatched` flag -> the receipt becomes invisible to both queues | yes | med |
| **PaymentLog edit (amount/date/ref/mode)** | **no** | - | none | **no UI to correct a mis-logged receipt** | yes | **high** |
| **PaymentLog delete** | **no** | - | **`paymentLogRepo` has no delete method at all** | **the St Paul's duplicate AND every VEX over-count were fixed with scripts**; this is the top finance gap | yes | **high** |
| Adjustment create / reverse | yes | `finance/adjustments/{new,[id]/reverse}` | create + soft-reverse | amount/reason not editable (reverse + recreate) | yes | med |
| Programme PI generate / void / reissue / download | yes (void = Admin wildcard) | `pi/generate`, `finance/pi/[paymentId]/{void,reissue,download}` | create + soft-void | no inline PI editor (edit source + reissue) | yes | med |
| Tally export | read-only | `finance/tally-export` | export | serializer, no writes | yes | low |
| Discoverability | n/a | `navModel.ts` | - | Adjustments / PI / Tally were moved to `/admin/advanced`; reachable but not in daily nav | - | med |

### 1c. VEX + ops/dispatch  (the weakest side - `src/app/api/operations/vex/**`, `dispatch/**`)

| field / action | editable? | where | CRUD | gap | fin? | pri |
|---|---|---|---|---|---|---|
| **VexPi content (lineItems/qty/price/school/GST/billing/freight/total)** | **no** | rendered read-only on `operations/vex/pi/[id]` | **create only, no edit route** | a wrong VEX invoice cannot be fixed in-app at all; only a DB script | **yes** | **high** |
| VexPi status | partial | `vex/pi/[id]/transition` | soft, any-to-any | rewind allowed here (contrast dispatch below) | yes | high |
| VexPi record payment | yes (add only) | `vex/pi/[id]/payment` | add | **no edit/delete of a logged VEX payment** (today's Funscholar over-count) | yes | high |
| **VexPi cancel / void / delete** | **no** | - | none | the MOU side got cancel; VEX did not | yes | high |
| VexDispatch items/freight/mode | no | create only | create | immutable after raise | yes | med |
| VexDispatch status | partial | `dispatch/[dispatchId]/transition` | **forward-only, no rewind** | a mis-clicked Invoiced/Shipped needs an Admin JSON edit | yes | high |
| VexDispatch tax-invoice number/link | **no (on main)** | read-only "awaiting upload" | none | recorder is built on the held `delivery-confirmation-hold` branch, not on main | yes | high |
| VexDispatch delivered state | **no (on main)** | - | none | `Delivered` + PI roll-up built on the held branch | yes | high |
| VexProduct (SKU) name/price/active | yes | `vex/products/[partNumber]/edit` | create + edit (OCC) | `partNumber` immutable; no hard delete (soft `active=false`) | ~ | med |
| InventoryItem stock/threshold/notes/adjust | yes | `inventory/[id]/{edit,adjust}` | create + edit | skuName/category/grade immutable; no delete; edit and adjust use different gates | no | med |
| Vendor / Agreement | yes | `operations/vendors/**`, `operations/agreements/**` | create + edit + soft-terminate | no delete (soft via active/terminate) | ~ | low |
| DispatchRequest | no post-submit | `dispatch-requests/**` | create + approve/reject/cancel | reason/seq uneditable after submit | no | med |
| KitDispatch (allocate/approve/shipment/POD/challan) | yes per-slice (OCC) | `dispatch/kits/[mouId]/**` | create + staged edits | no delete, no status rewind; **POD/challan upload `fs.writeFile` to `public/` = EROFS on Vercel (latent, won't persist)** | no | high |
| VexOrder (Tally legacy) | **no** | read-only table | **read-only repo** | every create/edit/status lives in Tally; app is a viewer | yes | low |

### 1d. Reference / master data / people  (`src/lib/db/repos/{school,salesTeam,product,user}.ts`, `leafRepos.ts`)

| field / action | editable? | where | CRUD | gap | fin? | pri |
|---|---|---|---|---|---|---|
| School name/contacts/city/state/region/notes/active | yes | `schools/[schoolId]/edit` | create + edit + soft-deactivate | last-write-wins (no OCC) | no | high |
| School billingName/PAN/GSTIN | partial (Finance only) | same screen, hidden for non-Finance | edit | Ops/Sales cannot see or change GST/PAN | yes | high |
| **SalesPerson name/email/phone/territories/programmes/active** | **no (create-only)** | `admin/sales-team/new` | **create only** | `salesTeamRepo.update` exists, no route; cannot fix an email typo, change a territory, or deactivate a departed rep | mild | high gap |
| SalesPerson "reassign" | yes, but misleading | `admin/sales-team/reassign` | n/a | reassigns MOUs' salesPersonId in bulk, NOT a SalesPerson edit | mild | low |
| **User create / role / department / active / password** | **no (no UI at all)** | - | **none** | onboarding, role/dept change, deactivating a leaver, password reset all out-of-app; `pending-user-reviews` is a read-only JSON dump that says "edit users.json by hand". `userRepo.update` exists | no (access) | high gap |
| Product add / rename / retire | yes | `admin/products` | create + rename + soft-retire | no hard delete | moderate | low-med |
| Product parentId / kind / legacyProgrammes / sortOrder | **no** | - | none | migration-017 hierarchy + `kind` (project vs per-student) have NO editor; create always mints `per-student`, no parent picker | moderate | low-med |
| SchoolGroup members/notes | partial | `admin/school-groups/[groupId]/edit-members` | create + edit (members/notes only) | name/region/primaryContact/gstNumber/groupMouId uneditable post-create | yes (group GST) | low |
| SchoolSpoc | **no** | `admin/spocs` is a placeholder | **none (read-only repo)** | multi-SPOC-per-school unmodelled; folded into School contact | no | low |
| CcRule / CommunicationTemplate | yes | `admin/cc-rules/**`, `admin/templates/**` | create + edit (OCC) + soft-toggle | no hard delete | no | low |
| Communication / Feedback | record-only | compose / submit | create + (comm) mark-sent | immutable logs; a mis-queued comm or feedback can't be corrected | no | med |
| Escalation (+comments) | yes | `escalations/**` | create + edit + soft-close + append comments | no OCC | no | high |
| SalesOpportunity (pipeline) | yes | `sales-pipeline/**` | create + edit + soft mark-lost | no OCC | mild | high |
| LifecycleRule | partial | `admin/lifecycle-rules/[k]/edit` | edit `defaultDays` only | fixed transition set; no add/remove | no | low |
| ReminderThreshold | **no** | - | **none (read-only repo)** | cadence/days need a code/seed edit | no | low |
| IntakeRecord | yes | `mou/[mouId]/intake{,-edit}` | create + edit | no delete; writes a parallel record, does not edit MOU master | no | med |
| StageResponsibility | yes | `admin/stage-responsibility` | edit + reset (OCC) | fixed 10 stages; no add/remove | no | low |

---

## PART 2 - Consistency check (same action, different behaviour)

These inconsistencies are their own usability tax: a tester cannot predict how an edit behaves.

1. **"Edit a payment" means two different field sets in two places.** The finance payment detail
   (`finance/payments/[paymentId]`) edits the *receipt* (received amount/date/mode/ref) and never
   the schedule; the installment edit (`mous/[id]/installments/[paymentId]/edit`) edits the
   *schedule* (expected amount/due date) and never the receipt. No screen edits both.
2. **Status rewind policy contradicts itself.** VexPi status is soft / any-to-any (you can rewind
   Completed -> Generated); VexDispatch status is strictly forward-only with no rewind; MOU status
   is forward-only via specific actions with no general setter. Three entities, three rules.
3. **Soft-delete is present for some entities, absent for siblings.** Payment and Adjustment
   soft-delete; **PaymentLog cannot be deleted at all**. School/Product/CcRule/Template/Escalation/
   Pipeline deactivate; **SalesPerson, User, SchoolGroup have no deactivate** even though SalesPerson
   and User carry an `active` column. Nothing in the VEX/ops cluster can be deleted (soft or hard).
4. **The financial entities are less editable than the operational ones.** Every operational VEX
   entity (SKU, inventory, vendor, agreement) has an edit route, but VexPi (the money doc) has none.
   On the MOU side the opposite: the contract economics are the locked part.
5. **`editPayment` desyncs the TDS split** (`bankAmount`/`tdsAmount` not updated), while
   `recordReceipt`/`mark-paid` keep them in sync. Same "edit a payment amount," different result.
6. **Two file-storage idioms, one broken in prod.** Agreement docs + the held tax-invoice recorder
   use paste-a-URL (works); KitDispatch POD/challan + signed-MOU use `fs.writeFile` to `public/`
   (EROFS on Vercel, silently lost). Same capability, two implementations, one non-functional.
7. **Programme edit is narrower than programme create** (hardcoded 4 values vs the full registry).
8. **OCC concurrency is inconsistent.** CcRule/Template/StageResponsibility/SKU/inventory use
   version-OCC and surface 409s; School/Escalation/Pipeline/Product are last-write-wins.
9. **High-stakes gates use an inline `role=Admin && dept=null` literal** in `voidPi`, `deletePayment`,
   `cancelMou` rather than a named `canX` helper - easy to drift from the access layer.
10. **Two persistence patterns for audited updates** (atomic `audit_log || concat` vs full-record
    enqueue) coexist on the VEX side; the PI-transition one is RMW-race-prone.

---

## PART 3 - The "one place" gaps (what pushes work back to Excel)

Ranked by how often it forces the team out of the app:

1. **Correcting money rows.** A mis-logged, duplicate, or wrong-amount PaymentLog or VEX payment has
   no edit/delete UI. Every such fix to date was a developer script. (St Paul's, VEX 020, Funscholar.)
   This is the clearest spreadsheet-and-script driver.
2. **Fixing a wrong VEX PI.** Wrong qty/price/school/GST/billing/freight is frozen at create; no
   edit, no cancel/void. Finance keeps the real numbers somewhere else.
3. **Recording VEX tax invoices + delivery.** On main there is no tax-invoice recorder and no
   `Delivered` state, so invoice numbers and delivery confirmation live in Tally/email/Drive.
   (Both are already built on the held `delivery-confirmation-hold` branch.)
4. **User & sales-rep administration.** Onboarding a user, changing a role/department, deactivating
   a leaver, resetting a password, fixing a rep's email/territory: none exist in-app. Tracked by hand
   in `users.json` / spreadsheets.
5. **MOU contract economics.** Contract value, per-student price, and contracted student count cannot
   be corrected in-app; the signed-values screen looks like it edits them but is a dead-end.
6. **Proof-of-delivery / challan files.** POD and challan "uploads" do not persist in prod (EROFS), so
   the actual documents live in email/Drive.
7. **Reference cleanup.** Product hierarchy/kind, SchoolGroup header fields, reminder cadence, and
   multi-SPOC-per-school are all spreadsheet-or-code territory today.

---

## PART 4 - Proposed build plan (small, reviewable passes, ordered by team impact)

Principle for every pass: **financial edits (payments, logs, VEX payments, PI, MOU value) ALWAYS
soft-delete / reverse with audit + a permission gate, never hard-delete.** Each pass ends in a V4
walk (reproduce the flow locally with realistic data; for prod-data corrections, the
backup -> dry-run -> gated-apply pattern we used for the over-counts).

### Pass 1 - Finance write-corrections (highest impact; closes the incident class)
- **Makes editable:** edit a PaymentLog's amount/date/reference/mode; **soft-delete** a mis-logged
  or duplicate PaymentLog (status flip + audit, never hard delete); edit + soft-delete a recorded
  **VEX payment** (mirror `paymentMutations` for the VexPi balance). Fix `editPayment` to also
  update the `bankAmount`/`tdsAmount` split, and have `unmatchPayment` reset the source log.
- **Screens:** `finance/payments/[paymentId]` (add log edit/delete), a PaymentLog row action on
  `finance/payments` + `/unmatched`; a VEX-payment edit/delete action on `operations/vex/pi/[id]`.
- **Migration:** likely none (add a `status`/`voided` flag to `payment_logs` if we want a tombstone
  rather than a hard row removal; recommend a soft-delete column, additive + reversible).
- **Financial:** YES - soft-delete + audit + Admin/Finance gate; deleting a log must reverse any
  VexPi/Payment balance it fed (the exact reconciliation the recovery scripts do, made first-class).
- **Risk:** medium (touches balances). Mitigate with the dry-run/verify harness already proven.
- **V4:** log a test receipt, edit it, soft-delete it, confirm the balance and queues reconcile.

### Pass 2 - VEX PI lifecycle (edit + cancel/void)
- **Makes editable:** edit a generated VexPi's line items / qty / price / school / GST / billing /
  freight (re-deriving totals); **cancel/void** a VexPi raised in error (soft, mirror `cancelMou`),
  cascading to its dispatches + reversing any recorded payment.
- **Screens:** an edit form on `operations/vex/pi/[id]`; a danger-zone cancel/void action.
- **Migration:** add a `Cancelled`/`Voided` status to the VexPi status set (additive CHECK-free TEXT,
  like the dispatch status); show before apply.
- **Financial:** YES - soft-delete/void + audit + Finance/Admin gate.
- **Risk:** medium-high (PI numbers + counter). Voided PI keeps its number (no counter rollback),
  same rule as programme PI void.
- **V4:** create a throwaway VEX PI, edit a line item, void it, confirm totals + payment reconcile.

### Pass 3 - VEX dispatch completion (ship the held branch + rewind)
- **Makes editable:** record a tax-invoice number + link (paste-URL) against a dispatch; advance a
  dispatch to **Delivered**; auto roll the PI up off "Delivery Pending"; add a **gated rewind** for a
  mis-clicked dispatch status (Admin, audited).
- **Screens:** the `DispatchTaxInvoice` + delivery actions already built on `delivery-confirmation-hold`.
- **Migration:** **019** (`vex_dispatches.delivered_at` + `delivered_by`) - additive, reversible,
  ALREADY WRITTEN, **not yet applied to prod**. Apply 019, then merge the hold branch, then V4.
- **Financial:** tax-invoice attestation is a Finance act (gate on `canEditFinanceData`); Delivered is
  Ops (`canRaiseDispatch`).
- **Risk:** low-medium (the bulk is built + tested on the branch; the work is apply-019 + merge + walk).
- **V4:** the prod throwaway-PI walk already specified in the hold branch's verification log.

### Pass 4 - User & sales-team administration
- **Makes editable:** create a user; edit name/email/role/department/active; reset a password;
  deactivate a leaver. Edit a SalesPerson (email/phone/territories/programmes) + deactivate.
- **Screens:** new `admin/users` (list + create + edit) and `admin/sales-team/[id]/edit`.
- **Migration:** none (repos exist). **Adopt OCC first** - both repos carry explicit headers warning
  not to add an edit form without optimistic-concurrency; honour that.
- **Financial:** no (access-control); still fully audited + Admin-gated; password reset never logs the value.
- **Risk:** medium (security surface). Gate behind `canManageUsers` (role-only meta-action).
- **V4:** create a test user, change role/dept, deactivate, confirm login + gates reflect it; cleanup.

### Pass 5 - MOU contract economics + signed-values
- **Makes editable:** edit contract value / per-student price / contracted student count on the MOU
  (re-deriving + cascading like `studentsActual` does); **wire signed-values to the MOU master** so a
  correction propagates to `spWithTax`/`contractValue` instead of the dead-end JSON. Add the missing
  edit fields (academicYear, salesChannel) and let a department-scoped Admin cancel their own MOU.
- **Screens:** extend `mous/[mouId]/edit`; retire or connect the signed-values screen.
- **Migration:** none (fields exist).
- **Financial:** YES - changing contract value is a financial mutation; audit + Finance/Admin gate;
  recompute instalments through the existing recalc engine.
- **Risk:** medium (touches contract totals + downstream instalments/PI).
- **V4:** edit a test MOU's price, confirm value + schedule + reports recompute consistently.

### Pass 6 - Master-data CRUD completion
- **Makes editable:** Product parentId/kind/sortOrder editor (expose the migration-017 hierarchy);
  SchoolGroup header fields (region/primaryContact/gstNumber); School edit OCC; a decision on
  SchoolSpoc (build multi-SPOC or formally fold it into School); ReminderThreshold cadence editor.
- **Screens:** extend `admin/products`, `admin/school-groups/[groupId]`, add `admin/reminders` editing.
- **Migration:** none.
- **Financial:** SchoolGroup `gstNumber` + Product rename are mildly financial (PI code map + roll-ups);
  audit them.
- **Risk:** low.
- **V4:** edit each, confirm reports/PI-code/grouping reflect the change.

### Pass 7 - Consistency + polish (cleanup, lower urgency)
- POD/challan + signed-MOU uploads: switch `fs.writeFile` to paste-a-URL or `putBinaryFile` (kill the
  EROFS latent bug). Unify the two "edit a payment" surfaces (or cross-link them). Make programme edit
  use the registry (not the hardcoded 4). Replace the inline `role=Admin && dept=null` literals with a
  named helper. Add gated status-rewind affordances where the team needs them. Converge the VEX audit
  persistence pattern on the atomic concat.
- **Migration:** none. **Financial:** the payment-edit unification is financial (audit). **Risk:** low.
- **V4:** per-item.

---

### Suggested order (by team impact)

1 (finance corrections) -> 2 (VEX PI) -> 3 (VEX dispatch / ship the held branch) -> 4 (users) ->
5 (MOU economics) -> 6 (master data) -> 7 (polish).

Rationale: passes 1-3 close the gaps that currently force the team out of the app *and* have caused
real prod data incidents; 4-5 unblock frequent-but-currently-impossible admin/finance corrections;
6-7 are reference cleanup and consistency. Pass 3 is mostly built already (it just needs migration
019 applied + the held branch merged), so it can slot earlier if the owner wants a quick win.

**Nothing here is built yet. Awaiting owner approval of the plan + the order before any pass starts.**
