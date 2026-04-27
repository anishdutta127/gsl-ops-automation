/*
 * Kanban stage derivation (Week 3 W3-C).
 *
 * Maps a MOU + its supporting records (dispatches, payments,
 * communications, feedback) to a kanban column key. The 8 lifecycle
 * stages from src/lib/portal/lifecycleProgress.ts are the spine; a
 * Pre-Ops Legacy column is added as the holding bay for MOUs imported
 * from gsl-mou-system that have no Ops-side history yet (Pending
 * Signature status). Cards exit Pre-Ops one-way; nothing returns to
 * it.
 *
 * Design intent: pure derivation. Same inputs -> same output. No
 * Date.now(), no random, no I/O. The only date-bearing transform is
 * the AY-start fallback for Active MOUs whose upstream startDate is
 * null (computed from mou.academicYear; deterministic).
 *
 * Adapter shape decisions surfaced in the W3-C C1 recon:
 *   - mouSignedDate: status='Pending Signature' -> Pre-Ops; else
 *     prefer mou.startDate, fall back to AY-start ('YYYY-04-01').
 *   - actualsConfirmedDate: studentsActual!=null inherits the signed
 *     date as a synthetic completion timestamp (the upstream system
 *     does not record exact actuals-confirmation events).
 *   - crossVerifiedDate: auto-skipped via inheritance from actuals
 *     (Phase 1 cross-verification is documentation-grade, not a
 *     separate UI step). Imported MOUs already have upstream actuals;
 *     bunching every imported MOU at cross-verification would be a
 *     queue mirage.
 *   - invoiceRaisedDate: from any payment.piNumber, falling back via
 *     piGeneratedAt -> piSentDate -> actualsDate.
 *   - paymentReceivedDate: from any payment.status='Received', via
 *     receivedDate -> dueDateIso.
 *   - dispatched/delivered/feedback: from Dispatch/Feedback records.
 *     Imported MOUs have none of these on day 1; Ops drives them in.
 */

import type {
  Communication,
  Dispatch,
  Feedback,
  MOU,
  Payment,
} from '@/lib/types'
import type { StageKey } from '@/lib/portal/lifecycleProgress'

export type KanbanStageKey = 'pre-ops' | StageKey

export interface KanbanColumn {
  key: KanbanStageKey
  label: string
  /** Pre-Ops is visually muted; the 8 lifecycle stages render normally. */
  variant: 'muted' | 'lifecycle'
}

export const KANBAN_COLUMNS: ReadonlyArray<KanbanColumn> = [
  { key: 'pre-ops', label: 'Needs triage', variant: 'muted' },
  { key: 'mou-signed', label: 'MOU signed', variant: 'lifecycle' },
  { key: 'actuals-confirmed', label: 'Actuals confirmed', variant: 'lifecycle' },
  { key: 'cross-verification', label: 'Cross-verification', variant: 'lifecycle' },
  { key: 'invoice-raised', label: 'Invoice raised', variant: 'lifecycle' },
  { key: 'payment-received', label: 'Payment received', variant: 'lifecycle' },
  { key: 'kit-dispatched', label: 'Kit dispatched', variant: 'lifecycle' },
  { key: 'delivery-acknowledged', label: 'Delivery acknowledged', variant: 'lifecycle' },
  { key: 'feedback-submitted', label: 'Feedback submitted', variant: 'lifecycle' },
]

/**
 * Per-stage next-step labels rendered on each MouCard (W4-B.1). The
 * label describes the action that LEAVES that stage forward; verbs
 * match the existing button copy on the per-stage forms exactly so
 * the operator's mental model stays consistent across the kanban,
 * the transition dialog, and the form.
 *
 * Verb sources:
 *   - mou-signed              -> /mous/[id]/actuals "Confirm actuals"
 *   - actuals-confirmed       -> /mous/[id]/pi "Generate PI"
 *   - invoice-raised          -> /mous/[id]/payment-receipt
 *                                "Record payment received" (W4-B.5)
 *   - payment-received        -> /mous/[id]/dispatch "Raise dispatch"
 *   - kit-dispatched          -> /mous/[id]/delivery-ack
 *                                "Record signed form" (W4-D revisits;
 *                                see RUNBOOK §11 for the rename note)
 *   - delivery-acknowledged   -> /mous/[id]/feedback-request
 *                                "Compose feedback request"
 *   - feedback-submitted      -> terminal; no further action
 *   - pre-ops                 -> triage exit; reason-required drag
 *   - cross-verification      -> auto-skipped by deriveStage; should
 *                                never carry a card. Defensive: a
 *                                page-level dev-mode warn fires if
 *                                a card derives this stage in
 *                                production. Label is provided for
 *                                completeness; rendering it would be
 *                                a regression.
 */
export const STAGE_NEXT_STEP: Record<KanbanStageKey, string> = {
  'pre-ops': 'Triage: confirm next stage',
  'mou-signed': 'Confirm actuals',
  'actuals-confirmed': 'Generate PI',
  'cross-verification': 'Auto-skipped; no card should land here',
  'invoice-raised': 'Record payment received',
  'payment-received': 'Raise dispatch',
  'kit-dispatched': 'Record signed form',
  'delivery-acknowledged': 'Compose feedback request',
  'feedback-submitted': 'MOU complete',
}

export interface DeriveStageDeps {
  dispatches: Dispatch[]
  payments: Payment[]
  communications: Communication[]
  feedback: Feedback[]
}

/**
 * AY-start synthetic for null-startDate MOUs. '2025-26' -> '2025-04-01'.
 * Returns null if academicYear is malformed.
 */
function academicYearStart(academicYear: string | null | undefined): string | null {
  if (typeof academicYear !== 'string') return null
  const year = academicYear.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return null
  return `${year}-04-01`
}

export function deriveStage(mou: MOU, deps: DeriveStageDeps): KanbanStageKey {
  // Pre-Ops Legacy: MOUs that haven't been signed (status reflects
  // negotiation phase). One-way exit; cards never return.
  if (mou.status === 'Pending Signature' || mou.status === 'Draft') {
    return 'pre-ops'
  }

  const dispatches = deps.dispatches.filter((d) => d.mouId === mou.id)
  const payments = deps.payments.filter((p) => p.mouId === mou.id)
  const feedbacks = deps.feedback.filter((f) => f.mouId === mou.id)

  const piPayment = payments.find((p) => p.piNumber !== null)
  const receivedPayment = payments.find((p) => p.status === 'Received')
  const dispatchRaised = dispatches.find((x) => x.poRaisedAt !== null || x.dispatchedAt !== null)
  const dispatchDelivered = dispatches.find((x) => x.deliveredAt !== null)
  const dispatchAcknowledged = dispatches.find((x) => x.stage === 'acknowledged')

  const signedDate = mou.startDate ?? academicYearStart(mou.academicYear)
  const actualsDate = mou.studentsActual !== null ? signedDate : null

  const stages: Array<[StageKey, string | null]> = [
    ['mou-signed', signedDate],
    ['actuals-confirmed', actualsDate],
    ['cross-verification', actualsDate], // auto-skip via inheritance
    ['invoice-raised',
      piPayment ? (piPayment.piGeneratedAt ?? piPayment.piSentDate ?? actualsDate) : null],
    ['payment-received',
      receivedPayment ? (receivedPayment.receivedDate ?? receivedPayment.dueDateIso) : null],
    ['kit-dispatched',
      dispatchRaised ? (dispatchRaised.dispatchedAt ?? dispatchRaised.poRaisedAt) : null],
    ['delivery-acknowledged',
      dispatchAcknowledged ? dispatchAcknowledged.acknowledgedAt
        : dispatchDelivered ? dispatchDelivered.deliveredAt
        : null],
    ['feedback-submitted', feedbacks[0]?.submittedAt ?? null],
  ]

  for (const [key, date] of stages) {
    if (date === null) return key
  }
  return 'feedback-submitted'
}

/**
 * Drift flag: mou.studentsVariancePct outside +/- 10%. Mirrors
 * isDriftReviewRequired from confirmActuals.ts; re-stated here for the
 * card-rendering consumer (avoids a dependency on the mutator lib).
 */
export function hasDrift(mou: MOU): boolean {
  if (mou.studentsVariancePct === null) return false
  return Math.abs(mou.studentsVariancePct) > 0.10
}
