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
  Feedback,
  IntakeRecord,
  User,
} from '@/lib/types'
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
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { paymentRepo } from '@/lib/db/repos/payment'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { userRepo } from '@/lib/db/repos/user'
import {
  ccRuleRepo, intakeRecordRepo, communicationRepo, feedbackRepo, reminderThresholdRepo,
} from '@/lib/db/repos/leafRepos'
import { canPerform } from '@/lib/auth/permissions'
import { resolveCcList } from '@/lib/ccResolver'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { createNotification } from '@/lib/notifications/createNotification'

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

async function defaultDeps(): Promise<ComposeReminderDeps> {
  const [
    mous, schools, payments, dispatches, intakeRecords, communications,
    feedback, salesPersons, thresholdsRows, users, ccRulesRows,
  ] = await Promise.all([
    mouRepo.findAll(),
    schoolRepo.findAll(),
    paymentRepo.findAll(),
    dispatchRepo.findAll(),
    intakeRecordRepo.findAll() as unknown as Promise<IntakeRecord[]>,
    communicationRepo.findAll() as unknown as Promise<Communication[]>,
    feedbackRepo.findAll() as unknown as Promise<Feedback[]>,
    salesTeamRepo.findAll(),
    reminderThresholdRepo.findAll(),
    userRepo.findAll(),
    ccRuleRepo.findAll() as unknown as Promise<CcRule[]>,
  ])
  // reminderThresholds JSON shape is { kind: row }; the repo's
  // findAll() emits row[] (each with .kind). Rehydrate the object
  // shape callers expect.
  const thresholds = thresholdsRows.reduce<ComposeReminderDeps['thresholds']>(
    (acc, r) => {
      const k = (r as unknown as { kind?: string }).kind ?? null
      if (k) (acc as Record<string, unknown>)[k] = r
      return acc
    },
    {} as ComposeReminderDeps['thresholds'],
  )
  return {
    mous, schools, payments, dispatches, intakeRecords, communications,
    feedback, salesPersons, thresholds, users, ccRules: ccRulesRows,
    enqueue: enqueueUpdate,
    uuid: () => crypto.randomUUID(),
    appUrl: () => process.env.NEXT_PUBLIC_APP_URL,
    now: () => new Date(),
    resolveCc: resolveCcList,
  }
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

export async function renderReminder(
  args: ComposeReminderArgs,
  depsOverride?: ComposeReminderDeps,
): Promise<RenderReminderResult> {
  const deps = depsOverride ?? (await defaultDeps())
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

  const ccEmails = await deps.resolveCc(
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
  depsOverride?: ComposeReminderDeps,
): Promise<ComposeReminderResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const rendered = await renderReminder(args, deps)
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

  // W4-E.5 notify the sales-owner of the MOU so they're aware that a
  // chase has been sent (school-facing reminders) or that the chase
  // is targeted at them (intake reminder where the salesOwner IS the
  // recipient; self-exclusion suppresses in that case).
  if (reminder.mouId) {
    const mou = deps.mous.find((m) => m.id === reminder.mouId)
    if (mou?.salesPersonId) {
      const sp = deps.salesPersons.find((s) => s.id === mou.salesPersonId)
      if (sp) {
        const ownerUser = deps.users.find((u) => u.email === sp.email)
        if (ownerUser) {
          await createNotification({
            recipientUserId: ownerUser.id,
            senderUserId: args.composedBy,
            kind: 'reminder-due',
            title: `Reminder sent for ${reminder.schoolName}`,
            body: `${user.name} composed a ${reminder.kind} reminder (${reminder.daysOverdue} days overdue).`,
            actionUrl: `/admin/reminders/${encodeURIComponent(reminder.id)}?communicationId=${encodeURIComponent(communication.id)}`,
            payload: {
              communicationId: communication.id,
              reminderKind: reminder.kind,
              mouId: reminder.mouId,
              schoolName: reminder.schoolName,
              composerName: user.name,
              daysOverdue: reminder.daysOverdue,
            },
            relatedEntityId: communication.id,
          }).catch((err) => {
            console.error('[composeReminder] notification failed', err)
          })
        }
      }
    }
  }

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
