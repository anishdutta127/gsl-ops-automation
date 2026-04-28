/*
 * Orientation doc + glossary + workflow guides (W3-E).
 *
 * Authored as the in-app reference for the 10-tester pilot. Voice:
 * direct, plain, no hedging. Concrete examples over abstractions.
 *
 * Structure: seven sections rendered by /help. Each section is one
 * exported constant; the page composes them with jump-anchor nav.
 *
 * Content drift: this doc is hand-authored. If the system changes
 * faster than the doc, expect drift; the page footer points testers
 * at Anish on Teams when they hit a discrepancy. Phase 1.1 may
 * extract this to a CMS-style source if non-developer editing is
 * wanted.
 */

export interface RoleOrientation {
  role: string
  framing: string
  workstream: string
  whereTime: string
}

export interface LifecycleStageEntry {
  number: string
  key: string
  title: string
  whatHappens: string
  whoInvolved: string
  systemTracks: string
  typicalDays: string
}

export interface GlossaryItem {
  term: string
  definition: string
}

export interface WorkflowItem {
  task: string
  steps: string[]
  precondition?: string
}

export interface ChangeableItem {
  what: string
  where: string
  whoCanEdit: string
}

export interface FeedbackItem {
  question: string
  answer: string
}

// ----------------------------------------------------------------------------
// Section 1: What is this system
// ----------------------------------------------------------------------------

export const HELP_INTRO = {
  oneParagraph: [
    'GSL Ops Automation tracks every MOU from the moment it is signed through to the moment a school confirms they got their kit, the trainer ran the programme, and the SPOC submitted feedback. It replaces the spreadsheet-and-Outlook flow that GSL ran before. The MOU file lives in this system, the audit log lives in this system, the operator queue lives in this system. The MOU project (gsl-mou-system) is upstream: MOUs are negotiated, drafted, and signed there. Once an MOU is signed, it flows into here, and Ops takes over.',
    'What this system is not: it is not a CRM (no lead-pipeline tracking), it is not a finance ledger (no general accounting), it is not the schools’ system (SPOCs see only the bits we send them magic links for). It is an operational queue for the active MOUs we are running.',
  ],
  systemAsOfDate: '2026-04-27',
}

export const HELP_ROLES: RoleOrientation[] = [
  {
    role: 'Sales (Pratik, Vishwanath)',
    framing: 'You are closest to the schools. Your work moves MOUs from signed to actuals confirmed and starts the kit-dispatch flow with multi-SKU requests.',
    workstream: 'Track pre-MOU pursuits at /sales-pipeline (W4-F minimal container; status / recce / approval are free-text pending the round-2 interview that formalises the workflow). Confirm the actual student count once a programme starts. Submit DispatchRequests at /dispatch/request when the school needs kits (Ops reviews and approves). When stock is short for any SKU on a request you submit, the form surfaces a yellow V9 warning ("stock-availability-warning"); the request is non-blocking, Ops confirms at conversion. Resolve sales-lane escalations. Spot-check school records when you visit. Compose reminders for your own MOUs at /admin/reminders when intake / payment / delivery / feedback chases are needed. On the per-MOU dispatch page you can download the handover worksheet (school-side printable) and the dispatch note (GSL-internal) for any raised dispatch on your MOUs.',
    whereTime: 'The kanban’s actuals-confirmed column (the queue waiting for you), /sales-pipeline for pre-MOU schools, /dispatch/request to start a kit shipment, the SALES-lane filter on /escalations, and the bell in the top-right showing notifications about your DR submissions and reminder chases on your MOUs.',
  },
  {
    role: 'Ops core team (Pradeep, Misba, Swati, Shashank)',
    framing: 'You are the operational backbone. The kanban is your command centre; drive every transition forward.',
    workstream: 'Review and convert Sales DispatchRequests at /admin/dispatch-requests, raise direct dispatches when Sales has not requested, send feedback requests, record delivery acknowledgements (renamed Confirm delivery in W4-D.6), compose reminders for stalled entities at /admin/reminders, manage CC rules and lifecycle rules, resolve OPS-lane escalations, triage MOU import review queue. Manage per-SKU stock and reorder thresholds at /admin/inventory; the system auto-decrements stock at every dispatch raise / approval, and broadcasts an inventory-low-stock notification to Admin + OpsHead the moment a SKU crosses its threshold downward. Print the kits handover worksheet from /mous/[id]/dispatch before any on-site visit; re-download the dispatch note from the same per-row affordance when a paper copy is lost. You can do everything an Admin can do.',
    whereTime: 'The full kanban (every column, every drag), /admin surfaces, /admin/dispatch-requests for the Sales-side review queue, /admin/reminders for the chase queue, /admin/audit for the system view of who-did-what. The bell broadcasts new DRs, intake completions, payment receipts, and assignment-queue events.',
  },
  {
    role: 'Finance (Shubhangi, Pranav)',
    framing: 'You unblock the kanban at one specific point: turning Actuals confirmed into Invoice raised.',
    workstream: 'Generate Proforma Invoices once actuals are confirmed and the school has a GSTIN. Reconcile incoming payments. Acknowledge any pre-payment dispatch overrides Leadership authorised.',
    whereTime: 'MOU detail pages with a Generate PI button (cards in the actuals-confirmed column on the kanban) and the invoice-raised column waiting on payment. The bell broadcasts every payment-recorded event so you see the queue update in real time on next page navigation.',
  },
  {
    role: 'Leadership (Ameet)',
    framing: 'You are the L3 fallback for every lane. The dashboard is your daily read.',
    workstream: 'Authorise pre-payment dispatch overrides when a school needs kits before payment lands. Resolve escalations across OPS, SALES, ACADEMICS lanes. Read the daily exception feed to spot patterns the operational team has not flagged.',
    whereTime: '/dashboard for the daily read; /escalations across all lanes; the dispatch detail pages when authorising overrides.',
  },
]

// ----------------------------------------------------------------------------
// Section 2: The 9 lifecycle stages (W4-C.1 added post-signing-intake)
// ----------------------------------------------------------------------------

export const HELP_LIFECYCLE_INTRO =
  'Every MOU passes through 9 stages, displayed as columns on the kanban homepage. Cards drag forward as work happens; cards sit in place when blocked. Pre-Ops Legacy (the muted column on the left) is a holding bay for MOUs imported in Pending Signature status; cards leave it but never return.'

export const HELP_LIFECYCLE_STAGES: LifecycleStageEntry[] = [
  {
    number: '1',
    key: 'mou-signed',
    title: 'MOU signed',
    whatHappens: 'The MOU has been signed by the school and GSL. School name, programme, contract value, and sales rep are set.',
    whoInvolved: 'Sales rep + Sales Head',
    systemTracks: 'startDate, studentsMou (contracted count)',
    typicalDays: 'Up to 14 days while the programme starts and student rolls firm up.',
  },
  {
    number: '2',
    key: 'post-signing-intake',
    title: 'Post-signing intake',
    whatHappens: 'The 22-field intake form is captured at /mous/[id]/intake: sales owner, location, grades, recipient details for the welcome note, students at intake, MOU duration, signed-copy URL, school POC. Replaces the legacy Google Form. Submitting the form auto-drafts the welcome note (compose-and-copy via clipboard).',
    whoInvolved: 'Ops core team (Misba / Pradeep / Swati)',
    systemTracks: 'IntakeRecord (22 fields); audit captures variances against MOU baseline (students, programme, training mode).',
    typicalDays: '14 days from signing to intake completion (default; editable at /admin/lifecycle-rules).',
  },
  {
    number: '3',
    key: 'actuals-confirmed',
    title: 'Actuals confirmed',
    whatHappens: 'The actual student count is recorded. If more than 10% off the contracted count, a drift badge flags it for Sales Head review.',
    whoInvolved: 'Sales rep gathers, Sales Head signs off',
    systemTracks: 'studentsActual, studentsVariance, studentsVariancePct',
    typicalDays: '14 days from intake completion to actuals confirmed.',
  },
  {
    number: '4',
    key: 'cross-verification',
    title: 'Cross-verification',
    whatHappens: 'Auto-skipped in Phase 1. Was meant to be an Ops review step before PI generation; operators verify at actuals confirmation instead. Cards flow through automatically.',
    whoInvolved: 'No tester action needed.',
    systemTracks: 'Nothing additional.',
    typicalDays: 'Instant (auto-advance).',
  },
  {
    number: '5',
    key: 'invoice-raised',
    title: 'Invoice raised',
    whatHappens: 'Finance generates a Proforma Invoice (PI). The school must have a GSTIN on file. Click Generate PI on the MOU detail page; a .docx downloads with the school GSTIN, contract value, and a sequential PI number.',
    whoInvolved: 'Finance (Shubhangi or Pranav)',
    systemTracks: 'piNumber, piGeneratedAt, piSentDate',
    typicalDays: '30 days from PI issue to payment (Net 30).',
  },
  {
    number: '6',
    key: 'payment-received',
    title: 'Payment received',
    whatHappens: 'The school has paid the relevant instalment. Finance reconciles the incoming payment against the PI.',
    whoInvolved: 'Finance',
    systemTracks: 'receivedAmount, receivedDate, paymentMode, bankReference',
    typicalDays: '7 days before kit dispatch is raised.',
  },
  {
    number: '7',
    key: 'kit-dispatched',
    title: 'Kit dispatched',
    whatHappens: 'Ops raises a dispatch (the kit ships from GSL warehouse to the school). Two paths land here: Sales submits a DispatchRequest at /dispatch/request and Ops approves it via /admin/dispatch-requests (multi-SKU + per-grade); or Ops raises directly from /mous/[id]/dispatch (standard programme kit set, single line item). The page is workflow-state-aware: it surfaces any pending DispatchRequest for the MOU + installment so Ops does not raise a duplicate. The dispatch note .docx renders the line items in two conditional sections (flat-quantity items + per-grade allocations) and downloads on raise.',
    whoInvolved: 'Sales submits multi-SKU requests; Ops core team reviews + raises.',
    systemTracks: 'dispatch.poRaisedAt, dispatch.dispatchedAt, dispatch.stage, dispatch.lineItems, dispatch.raisedFrom (sales-request | ops-direct | pre-w4d), dispatch.requestId when converted from a request.',
    typicalDays: '5 days transit + delivery confirmation.',
  },
  {
    number: '8',
    key: 'delivery-acknowledged',
    title: 'Delivery acknowledged',
    whatHappens: 'A signed handover form has been collected from the school SPOC, scanned, uploaded to GSL Drive, and the URL recorded. Click Delivery ack on the MOU detail page; print blank form, get it signed, paste the URL.',
    whoInvolved: 'Ops core team',
    systemTracks: 'dispatch.deliveredAt, dispatch.acknowledgedAt, dispatch.acknowledgementUrl',
    typicalDays: '7 days from dispatch to acknowledgement.',
  },
  {
    number: '9',
    key: 'feedback-submitted',
    title: 'Feedback submitted',
    whatHappens: 'The SPOC has submitted feedback via a magic link sent after delivery. Any rating of 2 or below on training quality or trainer rapport auto-creates an ACADEMICS-lane escalation for Shashank.',
    whoInvolved: 'SPOC submits; Shashank reviews any auto-escalations.',
    systemTracks: 'feedback.ratings (4 categories), feedback.submittedAt, magicLinkToken consumption',
    typicalDays: '30-day closure window after feedback.',
  },
]

export const HELP_LIFECYCLE_FOOTER =
  'Lifecycle rule durations (the "typical days" above) live in /admin/lifecycle-rules and are editable by Admin. Changing one retroactively recomputes overdue badges across every MOU at that stage. The audit log records who changed what and when.'

// ----------------------------------------------------------------------------
// Section 3: Glossary (alphabetical, 38 entries)
// ----------------------------------------------------------------------------

export const HELP_GLOSSARY: GlossaryItem[] = [
  {
    term: 'Actuals',
    definition: 'The actual student count once a programme starts, as opposed to the count contracted in the MOU. Sales reps gather; Sales Head signs off. If more than 10% off the contracted count, the system flags drift for review.',
  },
  {
    term: 'Audit log',
    definition: 'A per-entity history of every write: who did what, when, with before / after values where applicable. Every MOU, school, dispatch, escalation, CC rule, and lifecycle rule carries its own audit log. View on the entity’s detail page or filter cross-entity at /admin/audit.',
  },
  {
    term: 'Cross-verification',
    definition: 'Lifecycle stage 3, auto-skipped in Phase 1. The kanban shows it as a column for completeness; cards advance through it without any tester action.',
  },
  {
    term: 'CC rule',
    definition: 'A rule that tells the system who to copy on outbound communications for a given school, programme, or context. Lives at /admin/cc-rules. Toggle on or off; edit; create new (Admin during the first 30 days; everyone post-Phase 2).',
  },
  {
    term: 'Days in stage',
    definition: 'The number of whole days a MOU has been at its current kanban stage. The kanban shows this as part of the Overdue badge when the count exceeds the lifecycle rule’s default days.',
  },
  {
    term: 'Defense in depth',
    definition: 'See "Server-side enforcement". Two layers of permission checks: the UI shows what you can do; the server checks again before saving. Phase 1 turns off the UI layer for usability; the server layer stays on.',
  },
  {
    term: 'Delivery acknowledgement',
    definition: 'A signed handover form confirming the school SPOC received and accepted the kit. Operator prints the form, gets it signed at the school, scans it, uploads to GSL Drive, pastes the URL into the system. Recorded on the dispatch.',
  },
  {
    term: 'Dispatch',
    definition: 'The shipment of programme materials (the "kit") to a school. Each instalment of an MOU has its own dispatch record. Stage progresses pending → po-raised → dispatched → in-transit → delivered → acknowledged. Each Dispatch carries lineItems (multi-SKU + per-grade), a raisedFrom origin (sales-request | ops-direct | pre-w4d), and optionally a requestId pointing back to the DispatchRequest it converted from.',
  },
  {
    term: 'Dispatch note',
    definition: 'GSL-internal record of a raised dispatch. Auto-generated when raiseDispatch fires (W4-D.5); re-downloadable any time from /mous/[id]/dispatch via the per-row Note link (W4-H.4). The re-download preserves the original AUTHORISED_BY (the user who raised) and the original poRaisedAt date so the printed copy reflects historical reality. Contrast with the handover worksheet, which is school-facing.',
  },
  {
    term: 'DispatchRequest',
    definition: 'A Sales-submitted request for a kit dispatch (W4-D). Sales fills /dispatch/request with line items + reason + installment; Ops reviews on /admin/dispatch-requests and either approves (creates a Dispatch with raisedFrom=sales-request), rejects with a reason, or the requester cancels before review. The conversion path lets Ops edit line items during approval; the audit captures any Ops-side edits.',
  },
  {
    term: 'Line items (dispatch)',
    definition: 'The multi-SKU contents of a Dispatch or DispatchRequest. Two shapes via discriminated union: flat ({ skuName, quantity }) for TinkRworks-style single-quantity rows, and per-grade ({ skuName, gradeAllocations: [{ grade, quantity }] }) for Cretile-style per-grade allocations. The dispatch note .docx renders flat and per-grade sections conditionally; both render together for mixed dispatches.',
  },
  {
    term: 'requestedBy vs raisedBy',
    definition: 'Two attribution fields on the Sales request flow. requestedBy is the Sales user who submitted the DispatchRequest; raisedBy is the user who actually created the resulting Dispatch (Ops on the conversion path; the requester themselves on the rare same-person scenario). Kept separate so the Sales/Ops handoff stays in the audit trail.',
  },
  {
    term: 'raisedFrom origin',
    definition: 'Discriminator on the Dispatch entity: sales-request (Ops approved a Sales DispatchRequest), ops-direct (Ops raised straight from /mous/[id]/dispatch without a request), or pre-w4d (synthetic seed records migrated by the W4-D.1 schema change; not authoritative product detail).',
  },
  {
    term: 'Drift',
    definition: 'When confirmed actuals differ from the MOU’s contracted count by more than 10%. The kanban surfaces a Drift badge on the MOU card; Sales Head reviews drift cases.',
  },
  {
    term: 'Escalation',
    definition: 'A flagged issue requiring human attention. Created manually by an operator, automatically by the system (e.g., feedback rating below 2), or as a paired record when Leadership authorises a P2 override.',
  },
  {
    term: 'Escalation lane',
    definition: 'The category an escalation belongs to. OPS for delivery and dispatch issues, SALES for actuals and payment issues, ACADEMICS for training quality and trainer rapport.',
  },
  {
    term: 'Escalation level',
    definition: 'L1 is the assigned operator. L2 is the lane head: Misba for OPS, Pratik for SALES, Shashank for ACADEMICS. L3 is Ameet across all three lanes.',
  },
  {
    term: 'Feedback request',
    definition: 'An email + WhatsApp draft generated by the system after delivery. Carries a magic link to a SPOC-facing feedback form. Operator copies the email, sends from Outlook, then clicks Mark as sent so the audit captures the timestamp.',
  },
  {
    term: 'GSTIN',
    definition: 'The 15-character GST identification number for a school. Edit on the school record at /schools/[id]/edit. PI generation no longer blocks on a missing GSTIN (W4-A.6); the PI document renders "GSTIN: To be added" and Finance backfills before GST filing if needed. Filter the /schools list by GSTIN=Missing to find the schools still pending one.',
  },
  {
    term: 'Handover worksheet',
    definition: 'School-facing printable form for a kit handover (W4-H). Carries 11 columns: SR, DATE, TIME, GRADES, projects + kits, total, plus bilateral signature blocks (TRAINER NAME / TRAINER SIGN on the GSL side, PERSON NAME / DESIGNATION / PERSON SIGNATURE on the school side). Downloaded on demand from /mous/[id]/dispatch via the per-row Worksheet link. Trainer fills TIME and signatures by hand on-site; the system pre-fills the rest from the Dispatch + MOU + School data.',
  },
  {
    term: 'Idempotent',
    definition: 'An action that is safe to repeat. Re-clicking Raise dispatch on an already-raised dispatch downloads the same document again without changing state. Re-clicking Generate PI creates a new PI number, so don’t double-click it.',
  },
  {
    term: 'Instalment',
    definition: 'One payment within an MOU’s payment schedule. A 50/50 schedule has two instalments; a 25/25/25/25 schedule has four. Each instalment has its own PI number, payment record, and dispatch.',
  },
  {
    term: 'InventoryItem',
    definition: 'Per-SKU stock record at /admin/inventory. Carries currentStock (integer), reorderThreshold (integer or null = no alert), notes, active flag (false = sunset). Stock decrements automatically on every Dispatch raise / approval. Manual edits at /admin/inventory/[id] are audited as inventory-stock-edited or inventory-threshold-edited (W4-G.5).',
  },
  {
    term: 'Kanban',
    definition: 'The homepage at /. Shows every MOU as a card sorted into 9 columns (8 lifecycle stages plus Pre-Ops Legacy). Drag a card to the next column to advance the lifecycle. Each forward-by-one drag opens the existing per-stage form; skip and reverse drags require a reason logged in the audit.',
  },
  {
    term: 'Kit',
    definition: 'The educational materials shipped to a school for a programme. A STEAM kit contains different items than a Young Pioneers kit; the system tracks the dispatch but not the kit contents.',
  },
  {
    term: 'Magic link',
    definition: 'A signed, single-use URL emailed to a SPOC for a feedback form. Valid for 48 hours. The server verifies the signature on every click; tampered or expired links redirect to a friendly "link expired" page.',
  },
  {
    term: 'MOU',
    definition: 'Memorandum of Understanding. The agreement between GSL and a school for a programme. Includes the contracted student count, programme type, sales rep, contract value, and payment schedule. Once signed in gsl-mou-system, it flows into Ops Automation.',
  },
  {
    term: 'MOU project',
    definition: 'gsl-mou-system, the upstream system. MOUs are negotiated, drafted, and signed there. Ops Automation is downstream: it picks up MOUs after signing.',
  },
  {
    term: 'Overdue badge',
    definition: 'The signal-attention badge on a MOU card when the days-in-stage count exceeds the lifecycle rule’s default days for that stage. Shown as "Overdue Nd" on the kanban.',
  },
  {
    term: 'P2 override',
    definition: 'When Leadership authorises a dispatch before the school has paid. Captured as an overrideEvent on the dispatch with a mandatory reason; pairs with an OPS-lane escalation so Finance can ack post-hoc.',
  },
  {
    term: 'Notification',
    definition: 'An in-app event message in your inbox. The bell in the top-right of every page shows the unread count (numeric 1..9, "9+" cap at 10 or more, hidden at 0). Click the bell to see your last 10; click any row to open the related entity (the system marks the notification read in the same step). The full feed is at /notifications. Notification kinds: dispatch-request created/approved/rejected/cancelled, intake-completed, payment-recorded, escalation-assigned, reminder-due. Phase 1 is refresh-on-page-navigation; no real-time polling.',
  },
  {
    term: 'Pending updates queue',
    definition: 'Writes to entity files (mous.json, schools.json, etc.) land here first; the sync runner applies them to the canonical files. If your change is not visible right away, click Run health check on /admin to confirm the queue is processing.',
  },
  {
    term: 'PI / Proforma Invoice',
    definition: 'The .docx invoice generated for a school instalment. PI number is sequential, fiscal-year-prefixed (GSL/OPS/26-27/0001), and tracked by the system. Generation requires a GSTIN on the school record.',
  },
  {
    term: 'Pre-Ops Legacy',
    definition: 'The leftmost (muted) kanban column. Holds MOUs imported from gsl-mou-system in Pending Signature status. Cards leave Pre-Ops once we have evidence the MOU was signed; they never come back. Drag-into Pre-Ops is rejected with a toast.',
  },
  {
    term: 'Programme',
    definition: 'The product GSL is delivering to a school: STEAM, Young Pioneers, Harvard HBPE, TinkRworks, or VEX. Some programmes have a sub-type (e.g., GSLT-Cretile under STEAM); the kanban card shows both as "Programme / Sub-type".',
  },
  {
    term: 'Quarantined MOU',
    definition: 'An incoming MOU from gsl-mou-system that failed validation (zero student count, tax inversion, ambiguous school match, etc.). Lands in /admin/mou-import-review for human resolution. Operator either rejects with a reason or imports manually.',
  },
  {
    term: 'Reconcile',
    definition: 'Matching an incoming bank payment to one or more PIs. A bank entry of 250000 may match Greenfield instalment 2 (PI GSL/OPS/26-27/0002). Phase 1 has the matcher logic but the UI for hitting Reconcile is a Phase 1.1 deliverable.',
  },
  {
    term: 'Reminder',
    definition: 'A chase email composed via /admin/reminders when an entity has stalled past its threshold. Four kinds (with default thresholds): intake (14 days since MOU went active, no IntakeRecord), payment (30 days since PI was sent, status not Paid), delivery-ack (7 days since delivery, no acknowledgement URL), feedback-chase (7 days since feedback request was sent, no Feedback record). The list at /admin/reminders shows due reminders sorted by daysOverdue desc; click Compose, copy the rendered email into Outlook, send, then click "I sent it" to mark sent.',
  },
  {
    term: 'Reminder thresholds',
    definition: 'Configurable in src/data/reminder_thresholds.json without code change. Misba can adjust intake / payment / delivery-ack / feedback-chase day-counts; the lib re-reads on the next request. Same pattern as lifecycle_rules.json.',
  },
  {
    term: 'Reorder threshold',
    definition: 'Per-SKU low-stock alert trigger on InventoryItem.reorderThreshold. When stock crosses the threshold downward via a dispatch decrement, the system broadcasts an inventory-low-stock notification to Admin + OpsHead. Threshold is null until Misba/Pradeep configures it via /admin/inventory/[id]; null means no alert (D-028 captures the operational input).',
  },
  {
    term: 'Reject reason',
    definition: 'When rejecting an MOU import-review item, you pick from: data-quality-issue, duplicate-of-existing, out-of-scope, awaiting-source-correction, or other (notes required for "other"). The reason lands in the audit trail.',
  },
  {
    term: 'Role',
    definition: 'One of 8 base roles in users.json: Admin, Leadership, OpsHead, OpsEmployee, SalesHead, SalesRep, Finance, TrainerHead. Phase 1 turns off UI gating so everyone sees everything; the server still checks roles on writes (defense in depth).',
  },
  {
    term: 'Server-side enforcement',
    definition: 'Even with the button visible, some actions check your role before saving. If a button does nothing, you may not have permission. Anish can grant you wider access; ask on Teams.',
  },
  {
    term: 'SalesOpportunity',
    definition: 'Pre-MOU pipeline record (W4-F). Captures a school Sales is pursuing before the MOU is signed: school name (free-text), city, state, region, sales rep, programme proposed, GSL Model, status, recce status, commitments made, approval notes. Status / recce / GSL Model / approvalNotes are FREE-TEXT in Phase 1 (operators write whatever describes their state); workflow formalisation lands post-round-2 after the Pratik + Shashank interview defines the actual vocabulary (D-026). Once an MOU lands for the same school, the SalesOpportunity stays as historical record (conversionMouId FK; Phase 2 conversion flow lands with D-026).',
  },
  {
    term: 'SchoolSPOC',
    definition: 'Per-school point-of-contact directory entry imported from ops-data/SCHOOL_SPOC_DATABASE.xlsx via the W4-E.2 backfill. Carries name, designation, phone, email, source sheet (South-West / East / North), and a role (primary / secondary). Multi-POC schools have one primary entry plus N secondary entries; the operator views the directory at /schools/[id] (Phase 1 read-only; editing UI is Phase 2). 44 records imported; 15 schools.json gaps captured in D-019.',
  },
  {
    term: 'SPOC',
    definition: 'Single Point of Contact at a school. The person GSL emails about delivery, feedback, and escalations. Stored on the school record (contactPerson, email, phone fields) AND, post-W4-E.2, on the SchoolSPOC directory (one row per POC; primary + secondary roles for multi-POC schools).',
  },
  {
    term: 'Stage transition',
    definition: 'Moving an MOU card from one column to another on the kanban. Forward-by-1 (happy path, no reason): opens the per-stage form. Skip / Backward / Pre-Ops exit: requires a reason logged in the audit.',
  },
  {
    term: 'Stock decrement',
    definition: 'Automatic deduction of InventoryItem.currentStock at the moment a Dispatch is created (raiseDispatch direct) or a DispatchRequest is approved (reviewRequest convert). Walks the Dispatch.lineItems flat-or-per-grade, validates aggregate stock, applies. Hard-blocks the Dispatch creation on sku-not-found, cretile-grade-not-found, insufficient-stock, sku-sunset, or invalid-flat-cretile-line. Pre-W4-D backfilled dispatches (raisedFrom = "pre-w4d") do NOT decrement; Mastersheet inventory already reflects post-historical-shipment state (W4-G.4).',
  },
  {
    term: 'Sunset SKU',
    definition: 'InventoryItem with active = false. The SKU stays in inventory for audit continuity but cannot be dispatched (decrement hard-blocks with reason sku-sunset). Reactivation is one checkbox toggle at /admin/inventory/[id]; no migration needed. As of W4-G.3 backfill: Tinkrsynth and Tinkrsynth Mixer PCB ship as sunset (D-036 captures the tail-end stock decision).',
  },
  {
    term: 'Sync',
    definition: 'Two operations on /admin: Run import sync now (pull fresh MOU data from gsl-mou-system) and Run health check now (verify the pending updates queue + PI counter are healthy). Phase 1 is manual-trigger; Phase 1.1 may automate.',
  },
  {
    term: 'TDS',
    definition: 'Tax Deducted at Source. The portion of a payment that an Indian school withholds and remits to the government on GSL’s behalf. Tracked on the MOU as an integer rupee amount.',
  },
  {
    term: 'Variance / Variance pct',
    definition: 'studentsActual minus studentsMou (variance) and the same as a percentage (variancePct). If variancePct is more than 10% in either direction, the kanban shows a Drift badge and Sales Head reviews.',
  },
]

// ----------------------------------------------------------------------------
// Section 4: Common workflows (18 step-by-step)
// ----------------------------------------------------------------------------

export const HELP_WORKFLOWS: WorkflowItem[] = [
  {
    task: 'Logging in for the first time',
    steps: [
      'Go to https://ops.getsetlearn.info (or the URL in the launch email).',
      'Username is your firstname.lastinitial; initial password is in the email.',
      'You land on the kanban homepage (/). Browse the columns; click a card to see detail.',
      'Rotate your password within 7 days of first login. Phase 1 has no self-serve reset; ping Anish on Teams when you need a change.',
    ],
  },
  {
    task: 'Finding a specific MOU',
    steps: [
      'Quickest: type part of the school name into your browser’s find-on-page (Ctrl-F or Cmd-F) on the kanban.',
      'For a structured search: click MOUs in the TopNav, search by school name, or filter by status / programme / region.',
      'Drilling into a stage: click the column header on the kanban (e.g., "Invoice raised") to see every MOU at that stage as a list.',
    ],
  },
  {
    task: 'Confirming actuals on a MOU',
    precondition: 'You are Sales rep, Sales Head, or Admin.',
    steps: [
      'Find the MOU on the kanban (it will be in the actuals-confirmed column awaiting your action).',
      'Click into the MOU. Click Confirm actuals on the detail page.',
      'Enter the actual student count (must be a whole number between 1 and 20,000).',
      'Optional: add notes explaining any difference from the contracted count.',
      'Submit. The drift badge shows green if within 10% of the contracted count, amber otherwise.',
    ],
  },
  {
    task: 'Generating a Proforma Invoice (Finance)',
    precondition: 'School has a GSTIN on file; actuals are confirmed.',
    steps: [
      'Go to the MOU detail page. Click Generate PI.',
      'A .docx file downloads. Open it; verify the values render correctly (school GSTIN, contract value, PI number).',
      'Send to the school via your usual email path. The PI number is final and tracked in the audit log.',
      'If the school has no GSTIN, the page shows "GSTIN required" with a link to the school edit page. Backfill there, then retry.',
    ],
  },
  {
    task: 'Raising a dispatch (Ops)',
    precondition: 'Payment received OR Leadership has authorised a P2 override.',
    steps: [
      'Find the MOU on the kanban. Click into it.',
      'Click Raise dispatch on the detail page. /mous/[id]/dispatch is workflow-state-aware: if Sales has submitted a pending DispatchRequest for this MOU + installment, the page surfaces it at the top with a link to /admin/dispatch-requests/[id] for review. Convert the request rather than raising a duplicate.',
      'For the standard programme kit set without a pending request, fill the installment dropdown and submit. A dispatch note .docx downloads. Stage advances to po-raised.',
      'For multi-SKU or per-grade dispatches, send Sales to /dispatch/request first; Ops reviews and converts.',
      'If a dispatch is already raised, the same docx re-downloads without writing again (idempotent).',
    ],
  },
  {
    task: 'Submitting a dispatch request as Sales (W4-D)',
    steps: [
      'Go to /dispatch/request.',
      'Pick the MOU from the dropdown (active-cohort MOUs only). The page auto-fills the school name and intake recipient if intake is complete.',
      'Pick the installment number.',
      'Add line items. Each line is either flat (one quantity for all grades) or per-grade (a list of grade-band allocations). Click Add flat line or Add per-grade line; click the kind toggle to flip a row.',
      'Write a request reason (pilot kickoff, post-payment, etc.).',
      'Click Submit dispatch request. The page surfaces any soft warnings (V3 intake-not-completed, V4 SKU-programme mismatch, V5 student count variance, V6 grade-out-of-range, V8 duplicate pending request) but still submits when those fire.',
      'Hard errors (V1 archived MOU, V2 missing sales owner) block the submission.',
    ],
    precondition: 'You have SalesHead, SalesRep, or Admin role.',
  },
  {
    task: 'Reviewing and approving a dispatch request as Ops (W4-D)',
    steps: [
      'Go to /admin/dispatch-requests. Pending requests sort to the top.',
      'Click a row to open the detail page. Review the line items, the request reason, and the audit log entries from Sales submission.',
      'To approve as submitted, click Approve & convert with no edits. A new Dispatch lands with raisedFrom=sales-request and the DispatchRequest moves to approved with conversionDispatchId set.',
      'To approve with edits, paste an updated JSON line items array into the Edited line items field, then click Approve & convert. The audit captures that Ops edited.',
      'To reject, write a rejection reason and click Reject. The DispatchRequest moves to rejected; no Dispatch is created.',
      'To cancel before review (visible to the requester or Ops), click Cancel request.',
    ],
    precondition: 'You have OpsHead or Admin role.',
  },
  {
    task: 'Workflow-aware /mous/[id]/dispatch (Specific C path a)',
    steps: [
      'When you drag a card from payment-received to kit-dispatched on the kanban, the system routes you to /mous/[id]/dispatch.',
      'If a pending DispatchRequest exists for this MOU + installment, the page shows a "Pending dispatch requests" alert at the top with a link to the admin detail page. Convert the request there rather than raising direct (avoids duplicate Dispatches).',
      'If no pending request exists, the direct-raise form is the path. Pick installment, submit, dispatch note .docx downloads.',
      'Existing dispatches list shows a raisedFrom badge: pre-w4d (synthetic seed migrations), ops-direct (direct raise), sales-request (converted from a DispatchRequest).',
    ],
  },
  {
    task: 'Sending a feedback request',
    steps: [
      'Find the MOU on the kanban (delivery-acknowledged column or later).',
      'Click into it. Click Compose feedback request.',
      'Pick the instalment whose feedback you are collecting.',
      'Click Compose. The system generates an email + a WhatsApp message with a magic link.',
      'Click Copy email content. Paste into Outlook and send to the SPOC from your familiar address.',
      'Click Mark as sent. The audit log records the timestamp and your user id.',
    ],
  },
  {
    task: 'Recording a signed delivery acknowledgement',
    steps: [
      'Find the MOU on the kanban. Click Delivery ack on the detail page.',
      'Click Print blank handover form. A .docx downloads. Print it.',
      'Take the printed form to the school. Get it stamped and signed by the responsible person.',
      'Scan or photograph the signed form. Upload to GSL Drive (or wherever your team stores signed paperwork).',
      'Paste the resulting URL into the Signed form URL field. Click Confirm delivery.',
      'Stage advances to acknowledged. The MOU lifecycle is complete for that instalment.',
    ],
  },
  {
    task: 'Reviewing an MOU import (rejecting with reason)',
    steps: [
      'Go to /admin/mou-import-review. Quarantined MOU records are listed with the reason they failed validation.',
      'Read the raw record fields and the quarantine reason.',
      'If the record is unfixable, click Reject. Pick from the 5 reason categories; if "Other", add notes.',
      'The queue shrinks. The decision is recorded in the audit log.',
    ],
  },
  {
    task: 'Toggling a CC rule on or off',
    steps: [
      'Go to /admin/cc-rules. The toggle on each rule row enables or disables it.',
      'When disabling, the system prompts for a reason. The reason is recorded in the audit log.',
      'A disabled rule contributes nothing to outbound communications until re-enabled.',
    ],
  },
  {
    task: 'Editing a CC rule',
    steps: [
      'Go to /admin/cc-rules and click into the rule.',
      'Adjust scope value, contexts, ccUserIds, or sourceRuleText.',
      'Save. The audit log records before / after for every changed field.',
    ],
  },
  {
    task: 'Adding a school',
    steps: [
      'Go to /admin/schools. Click New school.',
      'Fill in the form. Id format is SCH-... (uppercase, digits, hyphens).',
      'Save. The school is immediately visible in /schools.',
    ],
  },
  {
    task: 'Editing a school’s GSTIN (so future PIs render the real value)',
    steps: [
      'Go to /schools and apply the GSTIN=Missing filter chip to find schools still pending one.',
      'Click into the school. Click Edit on the detail page.',
      'Update the GSTIN field. Save changes.',
      'New PI documents for that school will render the real GSTIN; previously-issued PIs that show "To be added" can be regenerated by Finance before GST filing.',
    ],
  },
  {
    task: 'Editing a lifecycle rule duration (Admin only)',
    steps: [
      'Go to /admin/lifecycle-rules.',
      'Find the stage transition you want to retune. Click into the row.',
      'Change Default days (whole number, 1 to 365). Add a Change notes field if there is context worth recording.',
      'Save. Overdue badges across every MOU at that stage recompute on next render. The audit log records who changed what and when.',
    ],
  },
  {
    task: 'Moving a kanban card forward (forward-by-1)',
    steps: [
      'Drag the card from its current column to the next column on the kanban.',
      'A confirmation dialog appears. Click Continue to form.',
      'You land on the per-stage form (Confirm actuals / Generate PI / Raise dispatch / etc.). Complete the form normally.',
      'On return to /, the card has advanced to the new column.',
    ],
  },
  {
    task: 'Moving a kanban card forward by more than one stage (skip)',
    steps: [
      'Drag the card past one or more intermediate columns to a stage further forward.',
      'A warning dialog appears listing the intermediate stages you are skipping.',
      'Type a reason explaining why (minimum 5 characters; example: "Imported mid-flight; PI was already issued upstream").',
      'Click Continue to form. The reason is logged in the audit before navigation.',
    ],
  },
  {
    task: 'Moving a kanban card backward',
    steps: [
      'Drag the card from its current column to a stage further left.',
      'A warning dialog appears. Backward moves do not auto-revert lifecycle data.',
      'Type a reason (minimum 5 characters).',
      'Click Record move. A toast confirms the audit entry. To actually revert state, edit the MOU directly at /mous/[id].',
    ],
  },
  {
    task: 'Reading the audit log on a detail page',
    steps: [
      'Open any MOU, school, dispatch, or escalation detail page.',
      'Scroll to the Audit log section. Entries are listed newest-first.',
      'Each entry shows timestamp, user, action, and (where applicable) before / after values plus notes.',
      'For cross-entity browsing, go to /admin/audit and filter by entity, action, or user.',
    ],
  },
  {
    task: 'Filing an issue (something is broken or confusing)',
    steps: [
      'Take a screenshot of the surface where the issue happens.',
      'Open Teams. Send the screenshot to Anish with a one-line description of what you were trying to do.',
      'Anish triages and replies within a working day. Most fixes ship the same day.',
    ],
  },
  {
    task: 'Sending reminders to schools (W4-E.4)',
    precondition: 'You have SalesHead, SalesRep, OpsHead, or Admin role.',
    steps: [
      'Go to /admin/reminders. The list shows every reminder currently due, sorted by daysOverdue descending.',
      'Filter by kind (Intake / Payment / Delivery ack / Feedback chase) using the chips at top, or by sales owner using the dropdown.',
      'Click Compose on the row you want to chase. The next page shows a preview (subject + body + recipient + CC list) rendered against the live entity (no Communication is written until you confirm).',
      'Click Compose & copy. The Communication is written with status queued-for-manual; the page refreshes with copy targets (To, CC, Subject, Body) ready for clipboard.',
      'Paste into Outlook. Send the email manually from your familiar address.',
      'Return to the page and click I sent it. The Communication flips to status sent; the audit log records who sent it and when.',
      'The reminder disappears from the /admin/reminders list once the underlying entity moves forward (intake submitted / payment recorded / acknowledgement uploaded / feedback received).',
    ],
  },
  {
    task: 'Notifications inbox and bell (W4-E.5/E.6)',
    steps: [
      'Look at the bell icon in the top-right of every page. The rose badge shows the count of unread notifications you have (numeric 1..9, "9+" if 10 or more, hidden when zero).',
      'Click the bell to see your last 10. Each row shows the kind, a one-line summary, and the relative timestamp ("2h ago", "yesterday").',
      'Click any row to open the related entity. The system marks the notification read in the same step; the bell badge updates on the next page navigation.',
      'For the full feed, click See all notifications at the bottom of the bell dropdown, or visit /notifications directly. The page filters by kind (8 NotificationKind values) or by All / Unread.',
      'Mark all read at once: click Mark all read (N) at the top right of /notifications when unread count is greater than zero. A flash banner confirms how many were updated.',
      'Notification kinds you might see: dispatch-request created (broadcast to Admin + OpsHead when Sales submits a DR), dispatch-request approved/rejected (single notification to the requester), dispatch-request cancelled (broadcast to Admin + OpsHead), intake-completed (broadcast to Admin + OpsHead when Sales finishes intake), payment-recorded (broadcast to Finance plus the sales-owner of the MOU), escalation-assigned (single notification to the lane head when feedback auto-escalates), reminder-due (single notification to the sales-owner when the operator composes a chase reminder). Phase 1 is refresh-on-page-navigation; no real-time polling.',
    ],
  },
  {
    task: 'Using the sales pipeline tracker (W4-F)',
    precondition: 'You have SalesRep, SalesHead, or Admin role for create / edit; every authenticated user can view.',
    steps: [
      'Go to /sales-pipeline. The list defaults to your own opportunities (mine filter). Toggle to All to see the team\'s pipeline.',
      'Click New opportunity to log a school you are pursuing. Fill in school name (free-text), city, state, region, programme proposed (optional), GSL Model (free-text), and Status. Required: schoolName, city, state, region, salesRepId, status.',
      'Status field is free-text. Describe your current state in your own words ("Recce scheduled", "Awaiting Pratik approval", "Proposal sent"). The system will formalise standard statuses after round 2 testing (D-026).',
      'On submit, you land on the detail page. If your school name token-matches an existing schools.json record above 0.7, the page surfaces a "did you mean" panel with two options: Link to existing (sets the FK) or Keep as new school (suppresses the suggestion permanently).',
      'Edit any field via the Edit button on the detail page. Status changes land verbatim in the audit log (before / after; no autocorrect) so we can review what vocabulary you actually used.',
      'When an opportunity falls out of the pipeline (school chose competitor, budget cut, etc.), click Mark as lost. A required loss reason captures the why; the row stays visible for history (filter chip Active / Lost / All on the list).',
      'The conversion-to-MOU flow is deliberately NOT built yet. When an opportunity reaches the point where you would create an MOU, do that via the existing MOU surfaces (gsl-mou-system upstream); the SalesOpportunity\'s conversionMouId FK lands when the post-round-2 workflow formalises (D-026).',
      'This pipeline tracker is parallel to the W4-D dispatch flow. It does NOT replace any existing workflow; it adds visibility for pre-MOU work that today happens off-system.',
    ],
  },
  {
    task: 'Using the SPOC database (W4-E.2)',
    steps: [
      'The SPOC DB is the per-school point-of-contact directory imported from ops-data/SCHOOL_SPOC_DATABASE.xlsx during W4-E.2. 44 SchoolSPOC records currently land across 3 source sheets (South-West, East, North).',
      'View the SPOCs for a school: open the school detail page (/schools/[id]). Each SchoolSPOC entry shows name, designation, phone (E.164 normalised where parseable), email, and role (primary / secondary).',
      'CC fan-out uses the SPOC DB top-of-sheet rules via cc_rules.json. New CC contexts in W4-E.4: intake-reminder, payment-reminder, delivery-ack-reminder, feedback-chase. Existing rules with all-communications context still match; per-context rules can be added at /admin/cc-rules.',
      'Editing a SchoolSPOC entry is a Phase 2 deliverable; Phase 1 ships read-only. Round 2 testers flag any per-school correction needed (wrong primary / missing POC / typo in phone) and Anish edits the source data.',
      '15 schools have SPOCs in the SPOC DB but no schools.json entry (D-019 in W4-DEFERRED-ITEMS.md). Round 2 picks whether to add those schools to schools.json or accept as orphaned data.',
    ],
  },
  {
    task: 'Tracking inventory and stock levels (W4-G)',
    precondition: 'You have OpsHead or Admin role for editing; every authenticated user can view.',
    steps: [
      'Go to /admin/inventory. The list shows every SKU with currentStock, reorderThreshold, last-updated stamp, and a status chip (Low / Out / Sunset) when applicable.',
      'Filter by category (TinkRworks / Cretile / Other) or status (Active default / Sunset / All) using the dropdowns at the top. Click Apply to refresh the list.',
      'Click Edit on any row (OpsHead + Admin only) to land on the detail page. Read-only roles see View instead.',
      'On the detail page, the Identity card shows immutable fields (id, skuName, category, cretileGrade, mastersheetSourceName). Renaming a SKU or moving categories means a new InventoryItem; the old id stays for audit continuity.',
      'The Stock + threshold form lets you edit Current stock (manual cycle counts or corrections), Reorder threshold (leave empty to clear; null means no alert), Notes (free-text), and Active (uncheck to mark sunset; sunset SKUs hard-block any future dispatch).',
      'Click Save changes. The page refreshes with a green "Saved." banner; an audit entry lands as inventory-stock-edited or inventory-threshold-edited (with full before / after diff regardless of which code is picked).',
      'Recent decrement history (last 10 dispatches that decremented this SKU) renders below the form. Each row shows the dispatch id, the stock delta, and the timestamp.',
      'The full audit log renders at the bottom: every import, edit, and decrement on this SKU since it was created.',
    ],
  },
  {
    task: 'What happens when I request a dispatch with low stock (V9 warning)',
    steps: [
      'Submit your dispatch request as usual at /dispatch/request. Add the line items and submit.',
      'If any SKU you requested would be short of stock once pending requests convert (yours plus all other open DRs for the same MOU + installment are aggregated), the form surfaces a yellow V9 warning: "stock-availability-warning". The warning is non-blocking; your DR submits successfully.',
      'Ops sees the same warning at conversion time on /admin/dispatch-requests/[id]. They will confirm with the warehouse (Misba / Pradeep) before approving.',
      'When Ops approves, the Dispatch creation hard-blocks if stock is genuinely insufficient at that moment (insufficient-stock failure). At that point Ops adjusts line items, restocks, or asks Sales to revise the request.',
      'V9 is a soft warning; it tells you stock might be tight by the time your turn comes. The hard-block at conversion is the final gate.',
    ],
  },
  {
    task: 'Receiving low-stock notifications (W4-G)',
    precondition: 'You have Admin or OpsHead role; the SKU has a reorderThreshold set (D-028 captures the initial setup).',
    steps: [
      'When a dispatch decrements a SKU and the new stock is at or below the configured reorderThreshold (and the previous stock was above the threshold; one alert per crossing, not on every decrement after the first), the system broadcasts an inventory-low-stock notification to every active Admin + OpsHead.',
      'The bell badge in the top right increments on next page navigation. Click the bell to see the row; the title shows the SKU name and current stock; the body cites the dispatch id that triggered it.',
      'Click the row to open /admin/inventory/[id] for that SKU. The detail page shows the recent decrement history so you can see the dispatch that caused the drop.',
      'Decide what to do off-system: raise a PO with the supplier (Phase 1 has no PO automation; D-030 captures the Phase 2 trigger), or update the threshold if the alert was premature.',
      'No notification fires when reorderThreshold is null. Set thresholds at /admin/inventory/[id] before you expect alerts to start landing.',
    ],
  },
  {
    task: 'Printing a kits handover worksheet (W4-H)',
    precondition: 'Dispatch is raised (stage past pending). Any user with read access to the MOU can download.',
    steps: [
      'Open the per-MOU dispatch page at /mous/[id]/dispatch. Each existing dispatch row carries a Worksheet link with a download icon next to a Note link.',
      'Click Worksheet. The browser downloads HandoverWorksheet-<dispatchId>.docx. Open it in Word or Google Docs to confirm the layout rendered cleanly.',
      'The worksheet has 11 columns: SR, DATE, TIME, GRADES, projects + kits, total, then two signature zones. The TIME column and all four signature columns (TRAINER NAME, TRAINER SIGN, PERSON NAME, DESIGNATION, PERSON SIGNATURE) ship blank for the trainer to handwrite on-site.',
      'The system pre-fills SR, DATE (the dispatch poRaisedAt), GRADES (All grades for flat dispatches; Grade N for per-grade rows), projects (the SKU name), and total (the quantity). Mixed dispatches interleave flat and per-grade rows with a continuous SR counter.',
      'Take the printed worksheet to the school for the in-person handover. Both signatures (TRAINER SIGN + PERSON SIGNATURE) are required for the handover to be considered complete.',
      'The download itself is audited as handover-worksheet-downloaded on the dispatch (60s dedup per user; re-clicking within a minute does not pollute the log). Audit answers "did the trainer print the form before the on-site visit?" when round 2 surfaces a delivery dispute.',
    ],
  },
  {
    task: 'Re-downloading a dispatch note (W4-H)',
    precondition: 'Dispatch is raised. Any user with read access to the MOU can download.',
    steps: [
      'Open /mous/[id]/dispatch. Each existing dispatch row carries a Note link beside the Worksheet link.',
      'Click Note. The browser downloads DispatchNote-<dispatchId>.docx, identical in shape to the document produced when the dispatch was originally raised.',
      'AUTHORISED_BY in the re-downloaded note preserves the user who originally raised the dispatch (looked up from dispatch.raisedBy), not the person clicking the link. Reflects historical reality of who authorised the shipment.',
      'The DISPATCH_DATE in the re-downloaded note stays at the original poRaisedAt timestamp; it does not update to the current date. The printed copy is byte-equivalent to the one produced at raise time, modulo any line-item edits that landed since (rare).',
      'When to use: lost paper copy, school requests an internal copy, finance reconciliation, audit response. Anything where regenerating from current state would mislead.',
      'The download is audited as dispatch-note-downloaded on the dispatch (60s dedup, same as the handover worksheet).',
    ],
  },
]

// ----------------------------------------------------------------------------
// Section 5: What I can change
// ----------------------------------------------------------------------------

export const HELP_CHANGEABLE: ChangeableItem[] = [
  {
    what: 'School records (name, GSTIN, contact details, address, GST + PAN, billing name)',
    where: '/schools/[id]/edit',
    whoCanEdit: 'Admin, OpsHead (per role; UI gating off in Phase 1, so anyone can open the form, but only Admin / OpsHead saves succeed)',
  },
  {
    what: 'MOU details (limited; Phase 1 mostly read-only on MOU surface)',
    where: 'Most fields read-only in Phase 1; specific actions (Confirm actuals, Generate PI, Raise dispatch, Mark as sent) are the writes you have',
    whoCanEdit: 'Per action: see the workflow steps above',
  },
  {
    what: 'CC rules (toggle, edit, create)',
    where: '/admin/cc-rules',
    whoCanEdit: 'Admin can toggle / edit / create. OpsHead can toggle / edit; cc-rule:create is Admin-only for the first 30 days post-launch',
  },
  {
    what: 'Lifecycle rule durations',
    where: '/admin/lifecycle-rules',
    whoCanEdit: 'Admin only',
  },
  {
    what: 'Sales team (add reps)',
    where: '/admin/sales-team',
    whoCanEdit: 'Admin, OpsHead',
  },
  {
    what: 'School groups (chain MOU memberships)',
    where: '/admin/school-groups',
    whoCanEdit: 'Admin, OpsHead',
  },
]

// ----------------------------------------------------------------------------
// Section 6: What happens when I make a change
// ----------------------------------------------------------------------------

export const HELP_CHANGE_SEMANTICS = [
  'Every write goes through the pending updates queue. The sync runner applies queued writes to the canonical fixture files (mous.json, schools.json, etc.) on its next tick. Most changes are visible within a minute; if you do not see your change after that, click Run health check on /admin to confirm the queue is processing.',
  'Every write is recorded in the audit log on the affected entity. The log carries timestamp, user id, action, and (where applicable) before / after values plus notes. Audit entries are append-only; there is no edit / delete on the log itself.',
  'Visibility: most surfaces show the latest state immediately. The kanban is a Server Component that re-reads on every navigation, so dragging a card to a new column and returning to / shows the new state. The /admin/audit page filters across every entity’s log.',
  'Undo: there is no system-level undo. To revert a change, edit the entity again; the new edit lands in the audit log alongside the original. Backward kanban drags record intent in the audit but do not auto-revert state; you do that with a follow-up edit.',
]

// ----------------------------------------------------------------------------
// Section 7: Who to contact
// ----------------------------------------------------------------------------

export const HELP_FEEDBACK: FeedbackItem[] = [
  {
    question: 'Something is broken or confusing. What do I do?',
    answer: 'Take a screenshot. Send it to Anish on Teams with a one-line description of what you were trying to do. Anish triages and replies within a working day.',
  },
  {
    question: 'I forgot my password.',
    answer: 'Reach out to Anish on Teams. Self-serve password reset is a Phase 1.1 feature; for now Anish resets manually.',
  },
  {
    question: 'Why is this button greyed out?',
    answer: 'It usually means a precondition is not met. Generate PI is greyed out if the school has no GSTIN. Raise dispatch is greyed out if the payment has not landed and there is no P2 override. Look for an inline note above the button explaining what to do first; if still unclear, screenshot to Anish.',
  },
  {
    question: 'I clicked a button and nothing happened.',
    answer: 'Phase 1 has UI gating off, so every button is visible. The server still checks your role before saving. If a button visibly does nothing, you may not have permission. Anish can grant you wider access; ask on Teams.',
  },
  {
    question: 'My change did not show up.',
    answer: 'Most writes go through the pending updates queue and apply on the next sync tick. Click Run health check on /admin to confirm the queue is processing. If your change is still missing after a sync, screenshot to Anish.',
  },
  {
    question: 'A page redirects me somewhere unexpected.',
    answer: 'Most redirects are intentional (a deferred surface points you at the live alternative; an unauthenticated path bounces you to /login). If the redirect is unexpected and not /login, screenshot to Anish.',
  },
]
