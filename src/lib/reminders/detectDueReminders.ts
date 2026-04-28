/*
 * W4-E.4 reminder detection.
 *
 * Pure function: given the system's current state (MOUs, intake records,
 * payments, dispatches, communications, feedback), returns the list of
 * reminders that are operationally due. The detection is read-only; the
 * /admin/reminders surface composes + sends only when an operator clicks
 * Compose, and even then the send is manual (compose-and-copy via
 * Outlook). No automatic mailing.
 *
 * Four detection rules (thresholds in src/data/reminder_thresholds.json):
 *
 *   intake          MOU is Active + cohort=active and started > N days
 *                   ago, but no IntakeRecord exists for that mouId.
 *
 *   payment         Payment.piSentDate older than N days and status in
 *                   {PI Sent, Pending, Overdue, Partial}. The Payment
 *                   becomes a single chase target per instalment.
 *
 *   delivery-ack    Dispatch.stage in {delivered} (or deliveredAt set)
 *                   for more than N days and acknowledgementUrl is null.
 *                   Includes 'in-transit' if deliveredAt is null but
 *                   poRaisedAt is older than N days as a fallback (Phase
 *                   1 simplification: if dispatch was raised more than
 *                   N days ago and has no ack URL, chase).
 *
 *   feedback-chase  feedback-request Communication queued more than N
 *                   days ago and no Feedback record exists for the
 *                   same mouId + installmentSeq.
 *
 * Edge cases handled per W4-E.4 brief:
 *   - Archived cohort MOUs (cohortStatus === 'archived'): skipped.
 *   - Quarantined / orphan items (no IntakeRecord, no MOU): no reminder
 *     fires because the detection chain short-circuits when the related
 *     entity is missing.
 *   - Multi-MOU schools: the active 2627 generates reminders; the
 *     archived 2526 does not.
 *   - Same sales-rep deduplication: NOT done here. Each MOU produces
 *     its own intake reminder; the /admin/reminders surface lists
 *     them separately so the operator can compose individually.
 */

import type {
  Communication,
  Dispatch,
  Feedback,
  IntakeRecord,
  MOU,
  Payment,
  SalesPerson,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import paymentsJson from '@/data/payments.json'
import dispatchesJson from '@/data/dispatches.json'
import intakeRecordsJson from '@/data/intake_records.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import salesTeamJson from '@/data/sales_team.json'
import thresholdsJson from '@/data/reminder_thresholds.json'

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export type ReminderKind = 'intake' | 'payment' | 'delivery-ack' | 'feedback-chase'

export type ReminderRelatedEntity =
  | 'mou'
  | 'payment'
  | 'dispatch'
  | 'communication'

export interface DueReminder {
  /** Synthetic id; stable across runs given same input state. */
  id: string
  kind: ReminderKind
  schoolId: string
  schoolName: string
  mouId: string | null
  mouName: string | null
  programme: string | null
  installmentSeq: number | null
  relatedEntityType: ReminderRelatedEntity
  relatedEntityId: string
  /** ISO date the anchor event happened (mou-active-start, pi-sent, delivered, etc.). */
  anchorTimestamp: string
  /** Human label for the anchor used in template substitution. */
  anchorEventLabel: string
  thresholdDays: number
  daysOverdue: number
  suggestedRecipientType: 'sales-owner' | 'school-spoc' | 'feedback-spoc'
  suggestedRecipient: { name: string; email: string } | null
  /** Brief one-line context shown in the /admin/reminders list. */
  context: string
}

export interface ReminderThresholds {
  intake: { thresholdDays: number; anchorEvent: string }
  payment: { thresholdDays: number; anchorEvent: string }
  'delivery-ack': { thresholdDays: number; anchorEvent: string }
  'feedback-chase': { thresholdDays: number; anchorEvent: string }
}

export interface DetectDueRemindersDeps {
  mous: MOU[]
  schools: School[]
  payments: Payment[]
  dispatches: Dispatch[]
  intakeRecords: IntakeRecord[]
  communications: Communication[]
  feedback: Feedback[]
  salesPersons: SalesPerson[]
  thresholds: ReminderThresholds
  now: () => Date
}

const defaultDeps: DetectDueRemindersDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  payments: paymentsJson as unknown as Payment[],
  dispatches: dispatchesJson as unknown as Dispatch[],
  intakeRecords: intakeRecordsJson as unknown as IntakeRecord[],
  communications: communicationsJson as unknown as Communication[],
  feedback: feedbackJson as unknown as Feedback[],
  salesPersons: salesTeamJson as unknown as SalesPerson[],
  thresholds: thresholdsJson as unknown as ReminderThresholds,
  now: () => new Date(),
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso).getTime()
  if (Number.isNaN(from)) return 0
  const diff = now.getTime() - from
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function ageOfMouForIntake(mou: MOU, now: Date): number {
  // Intake anchor: prefer startDate (MOU went active); fall back to
  // generatedAt and finally now (which yields 0 days, suppressing).
  const anchor = mou.startDate ?? mou.generatedAt
  if (!anchor) return 0
  return daysBetween(anchor, now)
}

// ----------------------------------------------------------------------------
// Per-kind detection
// ----------------------------------------------------------------------------

function detectIntakeReminders(deps: DetectDueRemindersDeps, now: Date): DueReminder[] {
  const out: DueReminder[] = []
  const threshold = deps.thresholds.intake.thresholdDays
  const intakeByMou = new Map(deps.intakeRecords.map((ir) => [ir.mouId, ir]))

  for (const mou of deps.mous) {
    if (mou.cohortStatus !== 'active') continue
    if (mou.status !== 'Active') continue
    if (intakeByMou.has(mou.id)) continue
    const days = ageOfMouForIntake(mou, now)
    if (days <= threshold) continue
    const school = deps.schools.find((s) => s.id === mou.schoolId)
    if (!school) continue
    const salesOwner = mou.salesPersonId
      ? deps.salesPersons.find((sp) => sp.id === mou.salesPersonId) ?? null
      : null
    const anchor = mou.startDate ?? mou.generatedAt ?? now.toISOString()

    out.push({
      id: `rem-intake-${mou.id}`,
      kind: 'intake',
      schoolId: school.id,
      schoolName: school.name,
      mouId: mou.id,
      mouName: mou.schoolName,
      programme: mou.programme,
      installmentSeq: null,
      relatedEntityType: 'mou',
      relatedEntityId: mou.id,
      anchorTimestamp: anchor,
      anchorEventLabel: 'since the MOU went active',
      thresholdDays: threshold,
      daysOverdue: days - threshold,
      suggestedRecipientType: 'sales-owner',
      suggestedRecipient: salesOwner
        ? { name: salesOwner.name, email: salesOwner.email }
        : null,
      context: `IntakeRecord missing on Active MOU ${mou.id} (${days} days since start)`,
    })
  }
  return out
}

function detectPaymentReminders(deps: DetectDueRemindersDeps, now: Date): DueReminder[] {
  const out: DueReminder[] = []
  const threshold = deps.thresholds.payment.thresholdDays
  const mouById = new Map(deps.mous.map((m) => [m.id, m]))

  for (const pay of deps.payments) {
    const mou = mouById.get(pay.mouId)
    if (!mou) continue
    if (mou.cohortStatus !== 'active') continue
    const status = pay.status
    if (status !== 'PI Sent' && status !== 'Pending' && status !== 'Overdue' && status !== 'Partial') {
      continue
    }
    const anchor = pay.piSentDate ?? pay.piGeneratedAt
    if (!anchor) continue
    const days = daysBetween(anchor, now)
    if (days <= threshold) continue
    const school = deps.schools.find((s) => s.id === mou.schoolId)
    if (!school) continue

    out.push({
      id: `rem-payment-${pay.id}`,
      kind: 'payment',
      schoolId: school.id,
      schoolName: school.name,
      mouId: mou.id,
      mouName: mou.schoolName,
      programme: mou.programme,
      installmentSeq: pay.instalmentSeq,
      relatedEntityType: 'payment',
      relatedEntityId: pay.id,
      anchorTimestamp: anchor,
      anchorEventLabel: 'since the proforma invoice was issued',
      thresholdDays: threshold,
      daysOverdue: days - threshold,
      suggestedRecipientType: 'school-spoc',
      suggestedRecipient: school.email
        ? { name: school.contactPerson ?? school.name, email: school.email }
        : null,
      context: `Payment ${pay.id} status=${status}, PI ${pay.piNumber ?? '(no PI number)'} issued ${days} days ago`,
    })
  }
  return out
}

function detectDeliveryAckReminders(deps: DetectDueRemindersDeps, now: Date): DueReminder[] {
  const out: DueReminder[] = []
  const threshold = deps.thresholds['delivery-ack'].thresholdDays
  const mouById = new Map(deps.mous.map((m) => [m.id, m]))

  for (const dis of deps.dispatches) {
    if (!dis.mouId) continue
    const mou = mouById.get(dis.mouId)
    if (!mou) continue
    if (mou.cohortStatus !== 'active') continue
    if (dis.acknowledgementUrl) continue

    // Anchor: deliveredAt if set (the canonical signal); otherwise
    // poRaisedAt as the Phase 1 fallback when the dispatch sits in
    // 'in-transit' / 'delivered' without explicit deliveredAt.
    const anchor = dis.deliveredAt ?? dis.poRaisedAt ?? dis.dispatchedAt
    if (!anchor) continue
    if (dis.stage !== 'delivered' && dis.stage !== 'in-transit') continue
    const days = daysBetween(anchor, now)
    if (days <= threshold) continue
    const school = deps.schools.find((s) => s.id === dis.schoolId)
    if (!school) continue

    out.push({
      id: `rem-delivery-ack-${dis.id}`,
      kind: 'delivery-ack',
      schoolId: school.id,
      schoolName: school.name,
      mouId: mou.id,
      mouName: mou.schoolName,
      programme: mou.programme,
      installmentSeq: dis.installmentSeq,
      relatedEntityType: 'dispatch',
      relatedEntityId: dis.id,
      anchorTimestamp: anchor,
      anchorEventLabel: dis.deliveredAt ? 'since delivery' : 'since the PO was raised',
      thresholdDays: threshold,
      daysOverdue: days - threshold,
      suggestedRecipientType: 'school-spoc',
      suggestedRecipient: school.email
        ? { name: school.contactPerson ?? school.name, email: school.email }
        : null,
      context: `Dispatch ${dis.id} stage=${dis.stage}, no acknowledgement URL after ${days} days`,
    })
  }
  return out
}

function detectFeedbackChaseReminders(deps: DetectDueRemindersDeps, now: Date): DueReminder[] {
  const out: DueReminder[] = []
  const threshold = deps.thresholds['feedback-chase'].thresholdDays
  const mouById = new Map(deps.mous.map((m) => [m.id, m]))
  const feedbackKeys = new Set(
    deps.feedback.map((f) => `${f.mouId}#${f.installmentSeq}`),
  )

  for (const comm of deps.communications) {
    if (comm.type !== 'feedback-request') continue
    if (!comm.mouId || comm.installmentSeq == null) continue
    const mou = mouById.get(comm.mouId)
    if (!mou) continue
    if (mou.cohortStatus !== 'active') continue
    const fbKey = `${comm.mouId}#${comm.installmentSeq}`
    if (feedbackKeys.has(fbKey)) continue
    const days = daysBetween(comm.queuedAt, now)
    if (days <= threshold) continue
    const school = deps.schools.find((s) => s.id === comm.schoolId)
    if (!school) continue

    out.push({
      id: `rem-feedback-chase-${comm.id}`,
      kind: 'feedback-chase',
      schoolId: school.id,
      schoolName: school.name,
      mouId: mou.id,
      mouName: mou.schoolName,
      programme: mou.programme,
      installmentSeq: comm.installmentSeq,
      relatedEntityType: 'communication',
      relatedEntityId: comm.id,
      anchorTimestamp: comm.queuedAt,
      anchorEventLabel: 'since the feedback request was sent',
      thresholdDays: threshold,
      daysOverdue: days - threshold,
      suggestedRecipientType: 'feedback-spoc',
      suggestedRecipient: comm.toEmail
        ? { name: school.contactPerson ?? school.name, email: comm.toEmail }
        : null,
      context: `Feedback-request ${comm.id} sent ${days} days ago; no Feedback record for inst ${comm.installmentSeq}`,
    })
  }
  return out
}

// ----------------------------------------------------------------------------
// Public entry
// ----------------------------------------------------------------------------

export function detectDueReminders(
  deps: DetectDueRemindersDeps = defaultDeps,
): DueReminder[] {
  const now = deps.now()
  const all: DueReminder[] = [
    ...detectIntakeReminders(deps, now),
    ...detectPaymentReminders(deps, now),
    ...detectDeliveryAckReminders(deps, now),
    ...detectFeedbackChaseReminders(deps, now),
  ]
  // Sort by daysOverdue descending so the most-stale reminders are
  // surfaced first; ties broken by kind for deterministic ordering.
  all.sort((a, b) => {
    if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    return a.id.localeCompare(b.id)
  })
  return all
}
