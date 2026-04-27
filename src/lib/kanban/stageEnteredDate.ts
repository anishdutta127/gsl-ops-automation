/*
 * Stage-entered date lookup (W3-C C3; overdue badge support).
 *
 * The "entered date" for a kanban stage is the timestamp the MOU
 * arrived at that stage. Functionally, that is the date the
 * PREVIOUS stage completed: the moment a stage becomes "current" in
 * deriveStage's first-null-wins logic is the same moment the
 * previous stage's date became non-null.
 *
 * Per-stage references (documenting non-obvious fallbacks):
 *
 *   pre-ops             | mou.startDate ?? AY-start synthetic
 *                       | (no real "entered Pre-Ops" event upstream;
 *                       | use the best signal we have for "when did
 *                       | we start working on this MOU")
 *
 *   mou-signed          | mou.startDate ?? AY-start synthetic
 *                       | (when this stage is current, no previous
 *                       | stage exists; the signed date itself is
 *                       | the entered-date proxy)
 *
 *   actuals-confirmed   | mou-signed.completion = signedDate
 *
 *   cross-verification  | actuals-confirmed.completion = actualsDate
 *                       | (auto-skipped by deriveStage; included for
 *                       | completeness in case W3-D promotes it to a
 *                       | real Ops gate)
 *
 *   invoice-raised      | actuals-confirmed.completion = actualsDate
 *
 *   payment-received    | invoice-raised.completion = piGeneratedAt
 *                       | / piSentDate / actualsDate
 *
 *   kit-dispatched      | payment-received.completion = receivedDate
 *                       | / dueDateIso
 *
 *   delivery-ack...     | kit-dispatched.completion = dispatchedAt
 *                       | / poRaisedAt
 *
 *   feedback-submitted  | delivery-acknowledged.completion =
 *                       | acknowledgedAt / deliveredAt
 *
 * Determinism: pure function. No Date.now(); the caller passes today
 * explicitly when computing days-in-stage.
 */

import type { MOU } from '@/lib/types'
import type { DeriveStageDeps, KanbanStageKey } from './deriveStage'

function academicYearStart(academicYear: string | null | undefined): string | null {
  if (typeof academicYear !== 'string') return null
  const year = academicYear.slice(0, 4)
  if (!/^\d{4}$/.test(year)) return null
  return `${year}-04-01`
}

export function stageEnteredDate(
  mou: MOU,
  deps: DeriveStageDeps,
  currentStage: KanbanStageKey,
): string | null {
  const signedDate = mou.startDate ?? academicYearStart(mou.academicYear)

  if (currentStage === 'pre-ops') return signedDate
  if (currentStage === 'mou-signed') return signedDate

  const actualsDate = mou.studentsActual !== null ? signedDate : null

  // Recompute the same per-stage signals deriveStage uses; the entered-
  // date for the current stage equals the previous stage's completion
  // date (per the first-null-wins contract).
  const payments = deps.payments.filter((p) => p.mouId === mou.id)
  const dispatches = deps.dispatches.filter((d) => d.mouId === mou.id)

  const piPayment = payments.find((p) => p.piNumber !== null)
  const receivedPayment = payments.find((p) => p.status === 'Received')
  const dispatchRaised = dispatches.find(
    (x) => x.poRaisedAt !== null || x.dispatchedAt !== null,
  )
  const dispatchDelivered = dispatches.find((x) => x.deliveredAt !== null)
  const dispatchAcknowledged = dispatches.find((x) => x.stage === 'acknowledged')

  const stageCompletion: Record<KanbanStageKey, string | null> = {
    'pre-ops': null,
    'mou-signed': signedDate,
    'actuals-confirmed': actualsDate,
    'cross-verification': actualsDate,
    'invoice-raised': piPayment
      ? (piPayment.piGeneratedAt ?? piPayment.piSentDate ?? actualsDate)
      : null,
    'payment-received': receivedPayment
      ? (receivedPayment.receivedDate ?? receivedPayment.dueDateIso)
      : null,
    'kit-dispatched': dispatchRaised
      ? (dispatchRaised.dispatchedAt ?? dispatchRaised.poRaisedAt)
      : null,
    'delivery-acknowledged': dispatchAcknowledged
      ? dispatchAcknowledged.acknowledgedAt
      : dispatchDelivered ? dispatchDelivered.deliveredAt : null,
    'feedback-submitted': null, // terminal stage; no further progression
  }

  const previousStage: Record<KanbanStageKey, KanbanStageKey | null> = {
    'pre-ops': null,
    'mou-signed': null,
    'actuals-confirmed': 'mou-signed',
    'cross-verification': 'actuals-confirmed',
    'invoice-raised': 'cross-verification',
    'payment-received': 'invoice-raised',
    'kit-dispatched': 'payment-received',
    'delivery-acknowledged': 'kit-dispatched',
    'feedback-submitted': 'delivery-acknowledged',
  }

  const prev = previousStage[currentStage]
  if (!prev) return null
  return stageCompletion[prev]
}

/**
 * Whole-day count between an entered date (ISO) and `now`. Negative
 * intervals (future-dated entered date, possible with synthetic
 * fallbacks) clamp to 0. Returns null if entered date is unparseable.
 */
export function daysSince(entered: string | null, now: Date): number | null {
  if (entered === null) return null
  const enteredMs = new Date(entered).getTime()
  if (!Number.isFinite(enteredMs)) return null
  const diffMs = now.getTime() - enteredMs
  if (diffMs < 0) return 0
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}
