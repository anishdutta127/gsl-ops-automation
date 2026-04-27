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
    framing: 'You are closest to the schools. Your work moves MOUs from signed to actuals confirmed.',
    workstream: 'Confirm the actual student count once a programme starts. Resolve sales-lane escalations. Spot-check school records when you visit.',
    whereTime: 'The kanban’s actuals-confirmed column (the queue waiting for you) and the SALES-lane filter on /escalations.',
  },
  {
    role: 'Ops core team (Pradeep, Misba, Swati, Shashank)',
    framing: 'You are the operational backbone. The kanban is your command centre; drive every transition forward.',
    workstream: 'Raise dispatches, send feedback requests, record delivery acknowledgements, manage CC rules and lifecycle rules, resolve OPS-lane escalations, triage MOU import review queue. You can do everything an Admin can do.',
    whereTime: 'The full kanban (every column, every drag), /admin surfaces, /admin/audit for the system view of who-did-what.',
  },
  {
    role: 'Finance (Shubhangi, Pranav)',
    framing: 'You unblock the kanban at one specific point: turning Actuals confirmed into Invoice raised.',
    workstream: 'Generate Proforma Invoices once actuals are confirmed and the school has a GSTIN. Reconcile incoming payments. Acknowledge any pre-payment dispatch overrides Leadership authorised.',
    whereTime: 'MOU detail pages with a Generate PI button (cards in the actuals-confirmed column on the kanban) and the invoice-raised column waiting on payment.',
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
    whatHappens: 'Ops raises a dispatch (the kit ships from GSL warehouse to the school). Click Raise dispatch; a dispatch note .docx downloads. Re-clicking re-downloads the same document without changing state (idempotent).',
    whoInvolved: 'Ops core team',
    systemTracks: 'dispatch.poRaisedAt, dispatch.dispatchedAt, dispatch.stage',
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
    definition: 'The shipment of programme materials (the "kit") to a school. Each instalment of an MOU has its own dispatch record. Stage progresses pending → po-raised → dispatched → in-transit → delivered → acknowledged.',
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
    term: 'Idempotent',
    definition: 'An action that is safe to repeat. Re-clicking Raise dispatch on an already-raised dispatch downloads the same document again without changing state. Re-clicking Generate PI creates a new PI number, so don’t double-click it.',
  },
  {
    term: 'Instalment',
    definition: 'One payment within an MOU’s payment schedule. A 50/50 schedule has two instalments; a 25/25/25/25 schedule has four. Each instalment has its own PI number, payment record, and dispatch.',
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
    term: 'SPOC',
    definition: 'Single Point of Contact at a school. The person GSL emails about delivery, feedback, and escalations. Stored on the school record (contactPerson, email, phone fields).',
  },
  {
    term: 'Stage transition',
    definition: 'Moving an MOU card from one column to another on the kanban. Forward-by-1 (happy path, no reason): opens the per-stage form. Skip / Backward / Pre-Ops exit: requires a reason logged in the audit.',
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
      'Click Raise dispatch on the detail page.',
      'A dispatch note .docx downloads. Stage advances to po-raised.',
      'If a dispatch is already raised, the same docx re-downloads without writing again (idempotent).',
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
      'Paste the resulting URL into the Signed form URL field. Click Record signed form.',
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
