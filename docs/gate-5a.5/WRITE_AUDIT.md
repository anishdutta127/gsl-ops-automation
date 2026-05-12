# Write-Surface Audit (Gate 5A.5)

Date: 2026-05-12. Trigger: Misba reported "Adding data and it's not showing up even after 5 minutes."

## Persistence chain (canonical)

1. UI form / button calls API route (form-POST or `fetch`)
2. Route calls `enqueueUpdate(...)` or `atomicUpdateJson(...)` with **payload = full entity record carrying `id`**
3. Queue entry lands in `src/data/pending_updates.json` via the GitHub Contents API
4. GitHub Actions cron at `.github/workflows/sync-queue-cron.yml` ticks every 5 min, POSTs to `/api/admin/sync-queue`
5. Drain reads each entry, finds the entity file via `entityRegistry.ts`, applies `applyOneToList` which keys off `payload.id`
6. Per-entity commit `chore(sync): apply <entity> batch (n=N)` triggers Vercel rebuild

**Failure mode discovered:** any route that enqueues `payload: { vendorId, vendor, audit }` (or similar wrapper) instead of `payload: vendor` causes the drain's `applyOneToList` to read `payload.id === undefined` and return `skipped`. The entry stays in the queue but never applies. Toast says "Saved" but nothing ever lands.

## Summary

- Total write surfaces inventoried: 71
- Total broken: 9 (7 silent-drop persistence bugs, 2 missing /new routes)
- Total working: 62
- Total deferred placeholders flagged in UI: 0 (admin/spocs, admin/pi-counter, admin/schools admin index, admin/sales-team, admin/school-groups are already labelled "Phase 1 placeholder" on the admin landing tile but those tiles are info pages, not silently-broken buttons; left as-is)

## Broken surfaces (bug detail)

| # | Route | Bug | Fix |
|---|---|---|---|
| B1 | `POST /api/operations/vendors/[id]/edit` | Enqueues `payload: { vendorId, vendor, audit }` -> drain `applyOneToList` reads `payload.id === undefined` -> `skipped`, write never persists | Enqueue `payload: vendor` (full Vendor with id) |
| B2 | `POST /api/operations/agreements/[id]/edit` | Same wrapper shape `{ agreementId, agreement, audit }` -> drain skip | Enqueue `payload: agreement` |
| B3 | `POST /api/operations/vex/pi/create` | Enqueues `payload: { vexPi: pi }` -> drain skip | Enqueue `payload: pi` |
| B4 | `POST /api/operations/vex/pi/[id]/transition` | Enqueues `payload: { vexPiId, status, audit }` -> drain skip + no full record meant transition wouldn't apply anyway | Build the next VexPi record (status replaced, audit appended), enqueue full record |
| B5 | `POST /api/operations/vex/pi/[id]/payment` | Enqueues `payload: { scope, vexPiId, date, ... }` with no `id` -> drain skip. Wrong entity too: this should mutate the parent VEX PI's paymentReceivedAmount + paymentLogIds + auditLog, not append a separate paymentLog row | Build the next VexPi record (paymentReceivedAmount += total, paymentLogIds += new log id, auditLog += payment-recorded entry), enqueue full record |
| B6 | `POST /api/operations/vex/pi/[id]/dispatch/create` | Enqueues `payload: { vexDispatch: dispatch }` -> drain skip | Enqueue `payload: dispatch` |
| B7 | `POST /api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition` | Enqueues `payload: { vexDispatchId, status, audit }` -> drain skip + partial record only | Build the next VexDispatch record (status replaced, warehouseEmailSentAt/By, invoicedAt, auditLog appended), enqueue full record |
| B8 | `GET /operations/vendors` -> "Add vendor" CTA | Links to `/operations/vendors/new` which does not exist -> 404 | Hide the CTA + emit "Add vendor in next phase" tooltip; vendor create is deferred to Phase 1.1 |
| B9 | `GET /operations/agreements` -> "Add agreement" CTA | Links to `/operations/agreements/new` which does not exist -> 404 | Hide the CTA + emit "Add agreement in next phase" tooltip; agreement create is deferred to Phase 1.1 |

## Full inventory

### MOU drafting / detail / sub-pages

| Surface | Submit handler | Enqueue verified | Validation visible | Toast honest | Audit logged | Status |
|---|---|---|---|---|---|---|
| `/mous/new` (GeneratorWizard) | `src/components/mou-system/GeneratorWizard.tsx:395` (fetch /api/mou/save-draft) | Y -> `entityWriters.saveDraft` -> `enqueueUpdate({entity:'mou', payload: mou})` | Y -> inline error messages + Sonner toast on failure | Y -> "Saved. Will reflect everywhere within ~5 minutes." | Y -> auditLog entry per save | working |
| `/mous/[mouId]/draft` (DraftAnnexureEditor) | `src/components/mou-system/DraftAnnexureEditor.tsx:170` (fetch /api/mou/save-draft) | Y (same path as above) | Y | Y | Y | working |
| `/mous/[mouId]` status notes textarea | `src/components/ops/StatusNotesSection.tsx:69` (fetch /api/mou/delay-notes) | Y -> `updateDelayNotes` -> enqueueUpdate mou | Y -> inline "Save failed: ..." | Y -> "Saved" inline + meta line | Y | working |
| `/mous/[mouId]` workflow banner "Send reminder" | inline form action="/api/workflow/send-reminder" | Y -> enqueueUpdate mou with audit entry | Y -> ?notice=reminder-cooldown / reminder-not-eligible on redirect | Y -> notice copy on /mous/[id]?notice=reminder-sent | Y | working |
| `/mous/[mouId]/actuals` | form action="/api/mou/actuals/confirm" | Y -> `confirmActuals` lib -> enqueueUpdate mou | Y -> ?error=... | Y -> `recorded=` flash | Y | working |
| `/mous/[mouId]/intake` | form action="/api/mou/[id]/intake" | Y -> `recordIntake` lib -> enqueueUpdate intakeRecord (+ mou) | Y -> ?error=... | Y -> `recorded=` flash | Y | working |
| `/mous/[mouId]/intake/edit` | form action="/api/mou/[id]/intake-edit" | Y -> `editIntake` lib -> enqueueUpdate intakeRecord | Y -> ?error=... | Y -> ?intakeEdited= flash | Y | working |
| `/mous/[mouId]/kits-details` | `KitsDetailsForm.tsx:47` (fetch /api/mou/[id]/kits-details) | Y -> `upsertMouKitsDetails` -> enqueueUpdate mou | Y -> inline red banner | Y -> "Saved. Will reflect everywhere within ~5 minutes." | Y | working |
| `/mous/[mouId]/signed-values` | form action="/api/mou/signed-values/save" | Y -> `upsertSignedValues` (entityWriters) -> enqueueUpdate signedValues | Y -> ?error=... | Y -> ?notice=saved flash | Y | working |
| `/mous/[mouId]/installments/[paymentId]/mark-pi-sent` | form action="/api/mou/installments/mark-pi-sent" | Y -> applyInstallmentPatch -> enqueueUpdate payment | Y -> ?error=... | Y -> redirect back | Y | working |
| `/mous/[mouId]/pi` (generate) | form action="/api/pi/generate" | Y -> `generatePi` lib -> issuePiNumberAtomic + enqueueUpdate payment + mou | Y -> error responses | Y -> docx download + redirect | Y | working |
| `/mous/[mouId]/payment-receipt` | form action="/api/payment/record" | Y -> `recordReceipt` -> enqueueUpdate payment + mou | Y -> ?error=... | Y -> `recorded=` flash | Y | working |
| `/mous/[mouId]/dispatch` (direct raise) | form action="/api/dispatch/generate" | Y -> `raiseDispatch` -> enqueueUpdate dispatch + mou + inventoryItem | Y -> ?error=... | Y -> `dispatched=` flash | Y | working |
| `/mous/[mouId]/feedback-request` | form action="/api/communications/compose" | Y -> `composeFeedbackRequest` -> enqueueUpdate communication | Y -> ?error=... | Y -> redirect with composed banner | Y | working |
| `/mous/[mouId]/delivery-ack` template print | form action="/api/delivery-ack/template" | Y (returns docx, no entity write needed) | Y -> ?error=... | n/a (download) | n/a | working |
| `/mous/[mouId]/delivery-ack` confirm | form action="/api/delivery-ack/acknowledge" | Y -> `acknowledgeDispatch` -> enqueueUpdate dispatch + mou | Y -> ?error=... | Y -> `acknowledged=` flash | Y | working |
| `/mous/[mouId]/send-template/[templateId]` "Mark as sent" | form action="/api/mou/[id]/communication-sent" | Y -> `markCommunicationSent` -> enqueueUpdate mou (audit entry) | Y -> ?error=... | Y -> ?sent=1 flash | Y | working |

### School

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/schools/[schoolId]/edit` | form action="/api/schools/[id]" | Y -> `editSchool` -> enqueueUpdate school | Y -> ?error=... | Y -> ?notice=saved flash | Y | working |
| `/admin/schools/new` | form action="/api/admin/schools/create" | Y -> `createSchool` -> enqueueUpdate school | Y -> ?error=... | Y -> redirect with confirmation | Y | working |

### Finance

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/finance/payments` PaymentMatcher confirm-match | fetch /api/finance/payments/confirm-match | Y -> `confirmMatch` -> enqueueUpdate payment + mou | Y -> inline alert | Y -> "Saved. Will reflect everywhere within ~5 minutes." | Y | working |
| `/finance/payments` Park as unmatched | fetch /api/finance/payments/park-unmatched | Y -> `parkUnmatched` -> enqueueUpdate payment | Y -> inline alert | Y -> "Parked. Will reflect under unmatched within ~5 minutes." | Y | working |
| `/finance/pi/[paymentId]` reissue | form action="/api/finance/pi/[paymentId]/reissue" | Y -> `reissuePi` -> issuePiNumberAtomic + enqueueUpdate payment + piIssue + mou | Y -> ?error=... | Y -> download + redirect | Y | working |
| `/finance/adjustments` reverse | form action="/api/finance/adjustments/[id]/reverse" | Y -> `reverseAdjustment` -> enqueueUpdate adjustment + mou | Y -> ?error=... | Y -> "Reversed. Will reflect everywhere within ~5 minutes." | Y | working |
| `/finance/tally-export` | form action="/api/finance/tally-export" | Y (read-only export, no entity write) | Y -> ?error=... | Y -> file download | n/a | working |
| `/finance/renewals` Mark renewed | form action="/api/mou/[id]/mark-renewed" | Y -> `markRenewed` -> enqueueUpdate mou + new mou record | Y -> ?error=... | Y -> redirect with banner | Y | working |
| `/finance/renewals` Decline renewal | form action="/api/mou/[id]/decline-renewal" | Y -> `declineRenewal` -> enqueueUpdate mou | Y -> ?error=... | Y -> redirect with banner | Y | working |

### Operations / VEX / Vendors / Agreements

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/operations/vex/pi/new` | `VexPiForm.tsx:112` (fetch /api/operations/vex/pi/create) | **N** -> enqueues `{ vexPi: pi }` instead of `pi`; drain skips because `payload.id === undefined`. Counter still advances atomically -> PI number burned with no record on file | Y -> inline error | Y -> "Saved. Will reflect everywhere within ~5 minutes." (BUT WRITE WAS DROPPED) | Y in payload but never lands | **B3 broken** |
| `/operations/vex/pi/[id]` status bar | `VexPiStatusBar.tsx:39` (fetch /api/operations/vex/pi/[id]/transition) | **N** -> enqueues `{ vexPiId, status, audit }` instead of full VexPi; drain skips | Y -> inline error | Y -> "Status updated..." (BUT WRITE WAS DROPPED) | partial payload only | **B4 broken** |
| `/operations/vex/pi/[id]` log payment | `VexPiActions.tsx:106` (fetch /api/operations/vex/pi/[id]/payment) | **N** -> enqueues partial paymentLog payload with no id; wrong entity (should mutate parent VexPi.paymentReceivedAmount + audit) | Y -> inline error | Y -> "Saved..." (BUT WRITE WAS DROPPED) | partial only | **B5 broken** |
| `/operations/vex/pi/[id]` raise dispatch | `VexPiActions.tsx:268` (fetch /api/operations/vex/pi/[id]/dispatch/create) | **N** -> enqueues `{ vexDispatch: dispatch }` instead of `dispatch`; drain skips | Y -> inline error | Y -> "Dispatch raised..." (BUT WRITE WAS DROPPED) | Y in payload but never lands | **B6 broken** |
| `/operations/vex/pi/[id]` dispatch row transition | `DispatchRowActions.tsx:59, 104` (fetch /api/operations/vex/pi/[id]/dispatch/[did]/transition) | **N** -> enqueues `{ vexDispatchId, status, audit, ... }` instead of full VexDispatch; drain skips | Y -> inline error | Y -> "Status updated..." (BUT WRITE WAS DROPPED) | partial only | **B7 broken** |
| `/operations/vendors` Add vendor CTA | `Link href="/operations/vendors/new"` | n/a -> route doesn't exist; 404 on click | n/a | n/a | n/a | **B8 broken** |
| `/operations/vendors/[id]` edit form | `VendorEditForm.tsx:32` (fetch /api/operations/vendors/[id]/edit) | **N** -> enqueues `{ vendorId, vendor, audit }`; drain skips | Y -> inline error | Y -> "Saved. Will reflect everywhere within ~5 minutes." (BUT WRITE WAS DROPPED) | Y in payload but never lands | **B1 broken** |
| `/operations/agreements` Add agreement CTA | `Link href="/operations/agreements/new"` | n/a -> route doesn't exist; 404 on click | n/a | n/a | n/a | **B9 broken** |
| `/operations/agreements/[id]` edit form | `AgreementEditForm.tsx:39` (fetch /api/operations/agreements/[id]/edit) | **N** -> enqueues `{ agreementId, agreement, audit }`; drain skips | Y -> inline error | Y -> "Saved. Will reflect everywhere within ~5 minutes." (BUT WRITE WAS DROPPED) | Y in payload but never lands | **B2 broken** |

### Dispatch / Kit dispatch

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/dispatch/request` | `DispatchRequestForm.tsx:177` (fetch /api/dispatch-requests/create) | Y -> `createDispatchRequest` -> enqueueUpdate dispatchRequest | Y -> inline | Y -> redirect with banner | Y | working |
| `/dispatch/kits/[mouId]` allocate kits | `AllocationForm.tsx:153` (fetch /api/dispatch/kits/[mouId]/allocate) | Y -> `allocate` -> enqueueUpdate kitDispatch + mou | Y -> inline | Y -> router.refresh | Y | working |
| `/dispatch/kits/[mouId]` sales approve / reject | `SalesApprovalActions.tsx:31, 54` (fetch approve/reject) | Y -> `approve` / library | Y -> inline | Y -> "Dispatch approved. Saved..." | Y | working |
| `/dispatch/kits/[mouId]` summary save | `DispatchSummaryEditor.tsx:58` (fetch /api/dispatch/kits/[mouId]/summary/save) | Y -> `saveSummary` -> enqueueUpdate kitDispatch | Y -> inline | Y -> "Summary saved..." | Y | working |
| `/dispatch/kits/[mouId]` accounts execute | `AccountsExecutionForm.tsx:82` (fetch /api/dispatch/kits/[mouId]/accounts-execute) | Y -> `accountsExecute` -> enqueueUpdate kitDispatch | Y -> inline | Y -> "Dispatch saved..." | Y | working |
| `/dispatch/kits/[mouId]` challan upload | `AccountsExecutionForm.tsx:116` (fetch /api/dispatch/kits/[mouId]/challan/upload) | Y -> enqueueUpdate kitDispatch | Y -> inline | Y -> redirect / inline | Y | working |
| `/dispatch/kits/[mouId]` warehouse email | `AccountsExecutionForm.tsx:136` (fetch /api/dispatch/kits/[mouId]/warehouse-email) | Y -> enqueueUpdate kitDispatch | Y -> inline | Y -> "warehouse notified..." | Y | working |
| `/dispatch/kits/[mouId]` shipment save | `ShipmentTrackingForm.tsx:53` (fetch /api/dispatch/kits/[mouId]/shipment/save) | Y -> `shipment.save` -> enqueueUpdate kitDispatch | Y -> inline | Y -> "Shipment tracking saved..." | Y | working |
| `/dispatch/kits/[mouId]` POD upload | `ShipmentTrackingForm.tsx:85` (fetch /api/dispatch/kits/[mouId]/pod/upload) | Y -> enqueueUpdate kitDispatch | Y -> inline | Y -> banner | Y | working |
| `/admin/dispatch-requests/[id]` approve / reject / cancel | form action="/api/dispatch-requests/[id]/approve|reject|cancel" | Y -> `reviewRequest` -> enqueueUpdate dispatchRequest | Y -> ?error=... | Y -> redirect | Y | working |

### Escalations / Notifications / Sales Pipeline

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/escalations/new` | form action={createEscalationAction} | Y -> `createEscalation` -> enqueueUpdate escalation + broadcastNotification | Y -> ?error=... | Y -> redirect with banner | Y | working |
| `/escalations/[id]/edit` | form action={editEscalationAction} | Y -> `editEscalation` -> enqueueUpdate escalation | Y -> ?error=... | Y -> redirect | Y | working |
| `/escalations/[id]` transfer | form action={transferEscalationAction} | Y -> `transferEscalation` -> enqueueUpdate escalation | Y -> ?error=... | Y -> redirect | Y | working |
| `/escalations/[id]` claim | form action={claimEscalationAction} | Y -> `claimEscalation` -> enqueueUpdate escalation | Y -> ?error=... | Y -> redirect | Y | working |
| `/notifications` mark all read | form action={markAllReadAction} | Y -> `markAllRead` -> enqueueUpdate notifications | n/a | Y -> redirect with flash | n/a | working |
| `/notifications/[id]/visit` | server-rendered link target | Y -> `markRead` -> enqueueUpdate notification | n/a | n/a (redirect) | n/a | working |
| `/sales-pipeline/new` | form action={createOpportunityAction} | Y -> `createOpportunity` -> enqueueUpdate salesOpportunity | Y -> ?error=... | Y -> redirect | Y | working |
| `/sales-pipeline/[id]/edit` | form action={editOpportunityAction} | Y -> `editOpportunity` -> enqueueUpdate salesOpportunity | Y -> ?error=... | Y -> redirect | Y | working |
| `/sales-pipeline/[id]/mark-lost` | form action={markOpportunityLostAction} | Y -> `markOpportunityLost` -> enqueueUpdate salesOpportunity | Y -> ?error=... | Y -> redirect | Y | working |
| `/sales-pipeline/[id]` link existing / dismiss school match | inline forms with server actions | Y -> editOpportunity -> enqueueUpdate | Y -> ?error=... | Y -> redirect | Y | working |

### Admin

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/admin/cc-rules/new` | form action="/api/cc-rules/create" | Y -> `createCcRule` -> enqueueUpdate ccRule | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/cc-rules/[id]` edit | form action="/api/cc-rules/[id]/edit" | Y -> `editCcRule` -> enqueueUpdate ccRule | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/cc-rules/[id]` toggle | inline `CcRuleToggleRow.tsx:49` (fetch /api/cc-rules/[id]/toggle) | Y -> `toggleCcRule` -> enqueueUpdate ccRule | Y -> inline | Y -> router.refresh | Y | working |
| `/admin/lifecycle-rules` edit | form action="/api/admin/lifecycle-rules/[stage]/edit" | Y -> `editLifecycleRule` -> enqueueUpdate lifecycleRule | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/sales-team/new` | form action="/api/admin/sales-team/create" | Y -> `createSalesPerson` -> enqueueUpdate salesTeam | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/school-groups/new` | form action="/api/admin/school-groups/create" | Y -> `createSchoolGroup` -> enqueueUpdate schoolGroup | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/school-groups/[id]` edit members | form action="/api/admin/school-groups/[id]/edit-members" | Y -> `editSchoolGroupMembers` -> enqueueUpdate schoolGroup + schools | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/templates/new` | form action={createTemplateAction} | Y -> `createTemplate` -> enqueueUpdate communicationTemplate | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/templates/[id]/edit` | form action={editTemplateAction} | Y -> `editTemplate` -> enqueueUpdate communicationTemplate | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/inventory/[id]` edit | form action="/api/inventory/[id]/edit" | Y -> `editInventoryItem` -> enqueueUpdate inventoryItem | Y -> ?error=... | Y -> ?saved=1 redirect | Y | working |
| `/admin/mou-status` bulk | form action="/api/admin/mou-status/bulk" | Y -> enqueueUpdate mou per row | Y -> redirect with error | Y -> redirect | Y | working |
| `/admin/mou-import-review` reject | form action="/api/mou/import-review/reject" | Y -> `rejectImportReview` -> enqueueUpdate mouImportReview | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/reminders/[id]` compose / mark sent | form actions composeReminderAction / markReminderSentAction | Y -> reminders libs -> enqueueUpdate communication | Y -> ?error=... | Y -> redirect | Y | working |
| `/admin/stage-responsibility` | form action={saveStageResponsibilityAction} | Y -> `updateStageResponsibility` per stage -> enqueueUpdate stageResponsibility | Y -> ?error=... | Y -> ?saved=N flash + "Will reflect everywhere within ~5 minutes." | Y | working |
| `/admin/chain-mou-reconciliation` consolidate | form action="/api/admin/chain-reconciliation/consolidate" | Y -> direct `atomicUpdateJson` writes school_groups + schools (NOT through queue, writes commit prefix is `chore(chain-reconciliation):` which Vercel rebuilds on) | Y -> ?error=... | Y -> ?flash="Chain consolidated. Reflects in five minutes." | Y (audit on schools) | working |
| `/admin/chain-mou-reconciliation` dismiss | form action="/api/admin/chain-reconciliation/dismiss" | Y -> same pattern | Y -> ?error=... | Y -> redirect | Y | working |
| Admin "Run import sync now" | form action="/api/mou/import-tick" | Y -> calls importer; writes via enqueueUpdate | Y -> ?error=permission | Y -> ?synced=import-ok flash | Y | working |
| Admin "Run health check now" | form action="/api/sync/tick" | Y -> appendSyncHealth via atomicUpdateJson | Y -> ?error= | Y -> ?synced=health-ok flash | n/a (sync health entry) | working |
| `/admin/audit` | read-only view | n/a | n/a | n/a | n/a | working |
| `/admin/spocs` placeholder | info page, no buttons | n/a | n/a | n/a | n/a | placeholder (explicit) |

### Feedback (external link surface)

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/feedback/[tokenId]` | `FeedbackForm.tsx:85` (fetch /api/feedback/submit) | Y -> `submitFeedback` -> enqueueUpdate feedback + magicLinkToken | Y -> inline | Y -> /feedback/thank-you redirect | Y | working |

### Kanban / Workflow

| Surface | Submit handler | Enqueue | Validation | Toast | Audit | Status |
|---|---|---|---|---|---|---|
| `/kanban` transition (drag) | `KanbanBoard.tsx:190` (fetch /api/kanban/transition) | Y -> `recordTransition` -> enqueueUpdate mou | Y -> inline | Y -> sonner | Y | working |

## Notes on Admin landing placeholders (already labelled, no fix needed)

The admin landing tiles for `/admin/pi-counter`, `/admin/schools`, `/admin/spocs`, `/admin/sales-team`, `/admin/school-groups` are tagged `status: 'placeholder'` and carry a "Phase 1 placeholder" badge. The pages themselves render with real content (Schools, Sales team, School groups are functional list+create pages; SPOCs is an info page redirecting to school edit; PI counter is a read-only view). These tiles' placeholder label is referring to a richer admin surface deferred to Phase 1.1, not to the per-tile pages being broken.

## Fixes applied this round

See commits with prefixes `fix(persistence):`, `fix(operations):` on this branch.
