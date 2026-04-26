/*
 * Help page content (in-app reference for testers).
 *
 * Plain-language, scannable, no internal jargon. Updates flow
 * through normal commit / deploy. Phase 1.1 may move to a CMS-
 * style source if non-developer editing is wanted.
 *
 * Structure: four ordered sections, each with a heading and an
 * array of items. Item shape varies by section type:
 *   - capabilities: { role, summary, examples[] }
 *   - workflows: { task, steps[] }
 *   - glossary: { term, definition }
 *   - feedback: { question, answer }
 */

export interface CapabilityItem {
  role: string
  summary: string
  examples: string[]
}

export interface WorkflowItem {
  task: string
  steps: string[]
}

export interface GlossaryItem {
  term: string
  definition: string
}

export interface FeedbackItem {
  question: string
  answer: string
}

export const HELP_CAPABILITIES: CapabilityItem[] = [
  {
    role: 'Admin',
    summary: 'Full access to every part of the system.',
    examples: [
      'Manage users, roles, and permission grants',
      'Edit any MOU, school, dispatch, or escalation',
      'Trigger system sync from /admin',
      'Author and toggle CC rules',
    ],
  },
  {
    role: 'Leadership',
    summary: 'Read everything; authorise pre-payment dispatch overrides; resolve escalations across all lanes.',
    examples: [
      'View any MOU, dispatch, or escalation regardless of lane',
      'Approve a pre-payment dispatch when payment is delayed but the school needs kits',
      'Resolve an escalation from any lane (OPS, SALES, ACADEMICS)',
    ],
  },
  {
    role: 'OpsHead',
    summary: 'Run day-to-day operations: dispatches, communications, school records, CC rules.',
    examples: [
      'Raise a dispatch once a MOU is paid (or covered by a pre-payment override)',
      'Compose a feedback request email for a school SPOC',
      'Record a signed delivery acknowledgement form on file',
      'Manage CC rules: toggle on or off, edit, view',
      'Edit school records (name, GSTIN, contact details)',
      'Resolve quarantined MOUs in the import review queue',
    ],
  },
  {
    role: 'SalesHead',
    summary: 'Confirm actuals on MOUs; approve drift; resolve sales-lane escalations.',
    examples: [
      'Confirm the actual student count after a programme starts',
      'Review and approve cases where the actual count drifted more than 10% from the MOU baseline',
      'Resolve sales-lane escalations',
    ],
  },
  {
    role: 'SalesRep',
    summary: 'Confirm actuals on your own assigned MOUs.',
    examples: [
      'See the MOUs assigned to you on /mous',
      'Confirm the actual student count for a programme you sold',
    ],
  },
  {
    role: 'Finance',
    summary: 'Generate proforma invoices; reconcile payments; acknowledge override events.',
    examples: [
      'Generate a PI from a MOU once actuals are confirmed (school must have a GSTIN on file)',
      'Reconcile incoming payments against PIs',
      'Acknowledge a pre-payment dispatch override after the fact',
    ],
  },
  {
    role: 'TrainerHead',
    summary: 'Resolve academics-lane escalations from feedback (training quality, trainer rapport).',
    examples: [
      'Review escalations auto-created from low-rated feedback',
      'Mark an academics escalation as resolved with notes',
    ],
  },
  {
    role: 'OpsEmployee',
    summary: 'Base role for ops staff. Misba carries OpsHead testing-override grants on top so audit attribution remains accurate.',
    examples: [
      'Same operational capabilities as OpsHead during the pilot',
      'Audit log records the real user id (misba.m), not the elevated role',
    ],
  },
]

export const HELP_WORKFLOWS: WorkflowItem[] = [
  {
    task: 'Confirm actuals on a MOU',
    steps: [
      'Go to /mous and click into the MOU.',
      'Click Confirm actuals.',
      'Enter the actual student count (must be greater than zero, no more than 20,000).',
      'Optional: add notes explaining any difference from the baseline.',
      'Submit. The drift badge shows green if within 10% of the MOU count, amber otherwise.',
    ],
  },
  {
    task: 'Generate a proforma invoice (Finance)',
    steps: [
      'Pre-check: the school has a GSTIN on file. If not, edit the school first.',
      'Pre-check: actuals are confirmed on the MOU.',
      'Go to the MOU detail page and click Generate PI.',
      'A .docx file downloads. Open it; verify the values render correctly.',
      'Send to the school via your usual email path. The PI number is final and tracked in the audit log.',
    ],
  },
  {
    task: 'Raise a dispatch (OpsHead)',
    steps: [
      'Pre-check: the corresponding payment has been received (or Leadership has authorised a pre-payment override).',
      'Go to the MOU detail page and click Raise dispatch.',
      'A dispatch note .docx downloads. Stage advances to po-raised.',
      'If a dispatch is already raised, the same docx re-downloads without writing again.',
    ],
  },
  {
    task: 'Send a feedback request',
    steps: [
      'Go to the MOU detail page and click Compose feedback request.',
      'Pick the instalment whose feedback you are collecting.',
      'Click Compose. The system generates an email + a parallel WhatsApp message with a magic link.',
      'Click Copy email content. Paste into Outlook and send to the SPOC from your familiar address.',
      'Click Mark as sent. The audit log records the timestamp and your user id.',
    ],
  },
  {
    task: 'Record a signed delivery acknowledgement',
    steps: [
      'Go to the MOU detail page and click Delivery ack.',
      'Click Print blank handover form. A .docx downloads. Print it.',
      'Take the printed form to the school. Get it stamped and signed by the responsible person.',
      'Scan or photograph the signed form. Upload to GSL Drive (or wherever your team stores signed paperwork).',
      'Paste the resulting URL into the Signed form URL field. Click Record signed form.',
      'Stage advances to acknowledged. The MOU lifecycle is complete for that instalment.',
    ],
  },
  {
    task: 'Resolve an escalation',
    steps: [
      'Go to /escalations. Open escalations are listed.',
      'Click into an escalation. Read the description and any prior audit entries.',
      'Take the action needed off-system (talk to the school, update a record, etc.).',
      'Click Resolve. Add resolution notes. Submit.',
      'The escalation status flips to resolved with your name on the audit entry.',
    ],
  },
  {
    task: 'Edit a school record',
    steps: [
      'Go to /schools and click into the school.',
      'Click Edit on the detail page (Admin or OpsHead only).',
      'Update the field. Save changes.',
      'GSTIN updates here are what unblock PI generation; the change is visible immediately.',
    ],
  },
  {
    task: 'Toggle a CC rule',
    steps: [
      'Go to /admin/cc-rules.',
      'Use the toggle on the rule row to enable or disable.',
      'When disabling, you will be prompted for a reason. The reason is recorded in the audit log.',
    ],
  },
]

export const HELP_GLOSSARY: GlossaryItem[] = [
  {
    term: 'Drift badge',
    definition: 'The colour indicator on confirmed actuals. Green if the actual student count is within 10% of the MOU baseline. Amber if it has drifted more than 10% (sales review queue picks these up).',
  },
  {
    term: 'GSTIN',
    definition: 'The 15-character GST identification number for a school. Required before a PI can be generated. Edit on the school record.',
  },
  {
    term: 'Magic link',
    definition: 'A signed, single-use URL sent to a SPOC for the feedback form. Valid for 48 hours. Includes an HMAC the server verifies on every click.',
  },
  {
    term: 'Lane',
    definition: 'The category an escalation belongs to. OPS for delivery and dispatch issues, SALES for actuals and payment issues, ACADEMICS for training quality and trainer rapport.',
  },
  {
    term: 'Escalation level',
    definition: 'L1 is the assigned operator. L2 is the lane head (Misba for OPS, Pratik for SALES, Shashank for ACADEMICS). L3 is Ameet across all three lanes.',
  },
  {
    term: 'P2 override',
    definition: 'When Leadership authorises a dispatch before the school has paid. Captured as an overrideEvent on the dispatch with a mandatory reason.',
  },
  {
    term: 'Quarantined MOU',
    definition: 'An incoming MOU from the sister project that failed validation (missing GSTIN, tax inversion, ambiguous school match, etc.). Lands in /admin/mou-import-review for human resolution.',
  },
  {
    term: 'CC rule',
    definition: 'A configuration that tells the system who to copy on outbound communications for a given school, programme, or context. Lives in /admin/cc-rules.',
  },
  {
    term: 'Pending updates queue',
    definition: 'Writes to entity files (mous.json, schools.json, etc.) land here first; the sync runner applies them to the canonical files. Visible in /admin via the Run health check button.',
  },
  {
    term: 'Sync',
    definition: 'Either Run import sync (pull new MOUs from the sister project) or Run health check (verify the queue + counter are healthy). Both trigger from /admin manually in Phase 1.',
  },
]

export const HELP_FEEDBACK: FeedbackItem[] = [
  {
    question: 'Something is broken or confusing. What do I do?',
    answer: 'Take a screenshot. Send it to Anish on Teams with a one-line description of what you were trying to do. He triages and replies within a working day.',
  },
  {
    question: 'I forgot my password.',
    answer: 'Reach out to Anish on Teams. Self-serve password reset is a Phase 1.1 feature; for now Anish resets manually.',
  },
  {
    question: 'A button is greyed out and I do not know why.',
    answer: 'It usually means a precondition is not met (e.g., Generate PI is greyed out if the school has no GSTIN). Hover the button or look for an inline note explaining what to do first. If still unclear, screenshot to Anish.',
  },
  {
    question: 'I see "Phase 1 placeholder" on a page.',
    answer: 'That section is intentionally not built yet. The system points you at the surface that does work for that capability today. If the redirect is unclear, screenshot to Anish.',
  },
  {
    question: 'Can I edit something I am not supposed to?',
    answer: 'No: the system role-gates every write action. If you see an Edit button, you have permission to use it. If you do not, the system has hidden it.',
  },
  {
    question: 'My change did not show up.',
    answer: 'Most writes go through a queue that the sync runner applies on its next tick. Click Run health check on /admin to confirm the queue is processing. If your change is still missing after a sync, screenshot to Anish.',
  },
]
