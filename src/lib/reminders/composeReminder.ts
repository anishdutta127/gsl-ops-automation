/*
 * W4-E.4 reminder compose-and-copy lib.
 *
 * Pattern mirrors composeFeedbackRequest.ts: validate inputs, render
 * email body + subject from a kind-specific template, write a
 * Communication row with status='queued-for-manual', append a
 * 'reminder-composed' audit entry, and enqueue the create. Operator
 * copies content via the /admin/reminders/[id]/compose panel and
 * sends from Outlook; markReminderSent flips status to 'sent'.
 *
 * No magic links: reminders are chase emails (the school replies in
 * thread). The original feedback magic-link survives until natural
 * expiry; if it has expired, the SPOC replies asking for a fresh
 * link and we issue one through composeFeedbackRequest.
 *
 * Recipient resolution per kind:
 *   intake          -> sales owner from MOU.salesPersonId
 *   payment         -> school.email (school SPOC inbox)
 *   delivery-ack    -> school.email
 *   feedback-chase  -> the original feedback-request communication's
 *                      toEmail (preserves the addressee that received
 *                      the magic link)
 *
 * CC fan-out: ccResolver.ts via the new CcRuleContext values
 * 'intake-reminder' / 'payment-reminder' / 'delivery-ack-reminder' /
 * 'feedback-chase'. cc_rules entries that match 'all-communications'
 * also fire (existing behaviour).
 *
 * Permission: 'reminder:create' (Admin + OpsHead + SalesHead +
 * SalesRep per W4-E.1 grants). Server-side check.
 *
 * Failure modes (one per shape error):
 *   permission              not granted reminder:create
 *   unknown-user
 *   reminder-not-found      (caller passed a stale DueReminder.id; the
 *                             current state no longer matches)
 *   no-recipient            recipient inbox is missing (e.g., intake
 *                             reminder where the MOU has no salesPerson,
 *                             or school.email is null)
 *   missing-app-url         NEXT_PUBLIC_APP_URL env var not set; the
 *                             body references the system URL in some
 *                             templates
 */

import crypto from 'node:crypto'
import type {
  AuditEntry,
  CcRule,
  CcRuleContext,
  Communication,
  CommunicationType,
  Dispatch,
  Feedback,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import {
  REMINDER_TEMPLATES,
  type ReminderKind,
  type ReminderTemplate,
} from '@/content/reminderTemplates'
import {
  detectDueReminders,
  type DetectDueRemindersDeps,
  type DueReminder,
} from '@/lib/reminders/detectDueReminders'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import paymentsJson from '@/data/payments.json'
import dispatchesJson from '@/data/dispatches.json'
import intakeRecordsJson from '@/data/intake_records.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import salesTeamJson from '@/data/sales_team.json'
import usersJson from '@/data/users.json'
import thresholdsJson from '@/data/reminder_thresholds.json'
import { canPerform } from '@/lib/auth/permissions'
import { resolveCcList } from '@/lib/ccResolver'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const D_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const KIND_TO_COMMUNICATION_TYPE: Record<ReminderKind, CommunicationType> = {
  intake: 'reminder-intake-chase',
  payment: 'reminder-payment-chase',
  'delivery-ack': 'reminder-delivery-ack-chase',
  'feedback-chase': 'reminder-feedback-chase',
}

const KIND_TO_CC_CONTEXT: Record<ReminderKind, CcRuleContext> = {
  intake: 'intake-reminder',
  payment: 'payment-reminder',
  'delivery-ack': 'delivery-ack-reminder',
  'feedback-chase': 'feedback-chase',
}

function applyPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    values[key] !== undefined ? values[key] : `{{${key}}}`,
  )
}

function indianRupee(n: number | null | undefined): string {
  if (n == null) return ''
  // Indian numbering convention: 12,34,567 (lakh / crore grouping). Intl
  // 'en-IN' yields the right groupings without a currency prefix.
  return new Intl.NumberFormat('en-IN').format(n)
}

export interface ComposeReminderArgs {
  reminderId: string
  composedBy: string
  /** Optional: skip detection re-run by passing the DueReminder explicitly. */
  reminder?: DueReminder
}

export type ComposeReminderFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'reminder-not-found'
  | 'no-recipient'
  | 'missing-app-url'

export interface ComposedReminder {
  subject: string
  body: string
  to: string
  ccEmails: string[]
}

export type ComposeReminderResult =
  | {
      ok: true
      reminder: DueReminder
      communication: Communication
      composed: ComposedReminder
    }
  | { ok: false; reason: ComposeReminderFailureReason }

export interface ComposeReminderDeps extends DetectDueRemindersDeps {
  users: User[]
  ccRules: CcRule[]
  enqueue: typeof enqueueUpdate
  uuid: () => string
  appUrl: () => string | undefined
  resolveCc: typeof resolveCcList
}

const defaultDeps: ComposeReminderDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  payments: paymentsJson as unknown as Payment[],
  dispatches: dispatchesJson as unknown as Dispatch[],
  intakeRecords: intakeRecordsJson as unknown as IntakeRecord[],
  communications: communicationsJson as unknown as Communication[],
  feedback: feedbackJson as unknown as Feedback[],
  salesPersons: salesTeamJson as unknown as SalesPerson[],
  thresholds: thresholdsJson as unknown as ComposeReminderDeps['thresholds'],
  users: usersJson as unknown as User[],
  ccRules: ccRulesJson as unknown as CcRule[],
  enqueue: enqueueUpdate,
  uuid: () => crypto.randomUUID(),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL,
  now: () => new Date(),
  resolveCc: resolveCcList,
}

// ----------------------------------------------------------------------------
// Render (pure; no side effects). Used for preview + compose paths.
// ----------------------------------------------------------------------------

export type RenderReminderResult =
  | {
      ok: true
      reminder: DueReminder
      composed: ComposedReminder
      user: User
    }
  | { ok: false; reason: ComposeReminderFailureReason }

export function renderReminder(
  args: ComposeReminderArgs,
  deps: ComposeReminderDeps = defaultDeps,
): RenderReminderResult {
  const user = deps.users.find((u) => u.id === args.composedBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'reminder:create')) {
    return { ok: false, reason: 'permission' }
  }

  let reminder: DueReminder | undefined = args.reminder
  if (!reminder) {
    const all = detectDueReminders(deps)
    reminder = all.find((r) => r.id === args.reminderId)
  }
  if (!reminder) return { ok: false, reason: 'reminder-not-found' }

  const appUrl = deps.appUrl()
  if (!appUrl || appUrl.trim() === '') {
    return { ok: false, reason: 'missing-app-url' }
  }

  const to = reminder.suggestedRecipient?.email ?? null
  if (!to) return { ok: false, reason: 'no-recipient' }

  const template: ReminderTemplate = REMINDER_TEMPLATES[reminder.kind]
  const placeholderValues = buildPlaceholders(reminder, user, deps.now(), deps)
  const subject = applyPlaceholders(template.subject, placeholderValues)
  const body = applyPlaceholders(template.body, placeholderValues)

  const ccEmails = deps.resolveCc(
    {
      context: KIND_TO_CC_CONTEXT[reminder.kind],
      schoolId: reminder.schoolId,
      mouId: reminder.mouId,
    },
    {
      rules: deps.ccRules,
      schools: deps.schools,
      mous: deps.mous,
      users: deps.users,
      salesTeam: deps.salesPersons,
    },
  )

  return {
    ok: true,
    reminder,
    composed: { subject, body, to, ccEmails },
    user,
  }
}

// ----------------------------------------------------------------------------
// Compose (render + enqueue + audit)
// ----------------------------------------------------------------------------

export async function composeReminder(
  args: ComposeReminderArgs,
  deps: ComposeReminderDeps = defaultDeps,
): Promise<ComposeReminderResult> {
  const rendered = renderReminder(args, deps)
  if (!rendered.ok) return rendered
  const { reminder, composed, user } = rendered
  const { subject, body, to, ccEmails } = composed
  const tsIso = deps.now().toISOString()

  const communicationId = `COM-REM-${deps.uuid().slice(0, 8)}`
  const composeAudit: AuditEntry = {
    timestamp: tsIso,
    user: args.composedBy,
    action: 'reminder-composed',
    after: {
      reminderId: reminder.id,
      kind: reminder.kind,
      mouId: reminder.mouId,
      schoolId: reminder.schoolId,
      relatedEntityType: reminder.relatedEntityType,
      relatedEntityId: reminder.relatedEntityId,
      daysOverdue: reminder.daysOverdue,
      thresholdDays: reminder.thresholdDays,
      to,
      ccCount: ccEmails.length,
    },
    notes: `Composed ${reminder.kind} reminder (${reminder.daysOverdue} days overdue ${reminder.anchorEventLabel}). Awaiting manual send.`,
  }

  const communication: Communication = {
    id: communicationId,
    type: KIND_TO_COMMUNICATION_TYPE[reminder.kind],
    schoolId: reminder.schoolId,
    mouId: reminder.mouId,
    installmentSeq: reminder.installmentSeq ?? null,
    channel: 'email',
    subject,
    bodyEmail: body,
    bodyWhatsApp: null,
    toEmail: to,
    toPhone: null,
    ccEmails,
    queuedAt: tsIso,
    queuedBy: args.composedBy,
    sentAt: null,
    copiedAt: null,
    status: 'queued-for-manual',
    bounceDetail: null,
    auditLog: [composeAudit],
  }

  await deps.enqueue({
    queuedBy: args.composedBy,
    entity: 'communication',
    operation: 'create',
    payload: communication as unknown as Record<string, unknown>,
  })

  return {
    ok: true,
    reminder,
    communication,
    composed: { subject, body, to, ccEmails },
  }
}

// ----------------------------------------------------------------------------
// Placeholder builder
// ----------------------------------------------------------------------------

function buildPlaceholders(
  reminder: DueReminder,
  user: User,
  now: Date,
  deps: ComposeReminderDeps,
): Record<string, string> {
  const recipientName =
    reminder.suggestedRecipient?.name ?? 'School coordinator'
  const base: Record<string, string> = {
    recipientName,
    schoolName: reminder.schoolName,
    programme: reminder.programme ?? 'GSL',
    instalmentSeq: reminder.installmentSeq ? String(reminder.installmentSeq) : '',
    daysOverdue: String(reminder.daysOverdue + reminder.thresholdDays),
    anchorEventLabel: reminder.anchorEventLabel,
    senderName: user.name,
    currentDate: D_MONTH_YEAR.format(now),
  }

  if (reminder.kind === 'payment') {
    const pay = deps.payments.find((p) => p.id === reminder.relatedEntityId)
    if (pay) {
      base.piNumber = pay.piNumber ?? '(pending)'
      base.expectedAmount = indianRupee(pay.expectedAmount)
      base.dueDateOrIssued = pay.piSentDate ?? pay.dueDateIso ?? ''
    }
  } else if (reminder.kind === 'delivery-ack') {
    const dis = deps.dispatches.find((d) => d.id === reminder.relatedEntityId)
    if (dis) {
      base.deliveredOn = (dis.deliveredAt ?? dis.poRaisedAt ?? '').slice(0, 10)
    }
  }

  return base
}

// ----------------------------------------------------------------------------
// Helpers exposed for tests
// ----------------------------------------------------------------------------

export const __test__ = {
  applyPlaceholders,
  indianRupee,
  buildPlaceholders,
  KIND_TO_COMMUNICATION_TYPE,
  KIND_TO_CC_CONTEXT,
}
