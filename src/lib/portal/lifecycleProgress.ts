/*
 * Lifecycle progress helper.
 *
 * Computes the 8-stage lifecycle visualisation state shared by
 * Surface 3 (status-block email template) and Surface 5 (read-only
 * status portal). DESIGN.md prescribes the same labels and the same
 * status semantics for both surfaces; this helper is the single
 * source of truth so the email and the live page can never disagree.
 *
 * Status rules:
 *   - A stage with a non-null date is `completed`.
 *   - The first not-completed stage is `current`.
 *   - All later stages are `future`.
 *
 * Future stages can carry an optional projected date supplied by
 * the caller via `expectedNextActionDate`; that date attaches to
 * the `current` stage so the SPOC sees what is expected next.
 *
 * The 8 stages are defined in fixed order; do not reorder. Phase 1
 * Q-A acceptance asserts that every MOU import sets schoolScope and
 * progresses through these stages monotonically.
 */

export type StageKey =
  | 'mou-signed'
  | 'actuals-confirmed'
  | 'cross-verification'
  | 'invoice-raised'
  | 'payment-received'
  | 'kit-dispatched'
  | 'delivery-acknowledged'
  | 'feedback-submitted'

export type StageStatus = 'completed' | 'current' | 'future'

export interface LifecycleStage {
  key: StageKey
  label: string
  status: StageStatus
  date: string | null
  detail: string | null
}

export interface LifecycleInput {
  mouSignedDate: string | null
  actualsConfirmedDate: string | null
  crossVerifiedDate: string | null
  invoiceRaisedDate: string | null
  invoiceNumber: string | null
  paymentReceivedDate: string | null
  dispatchedDate: string | null
  deliveredDate: string | null
  feedbackSubmittedDate: string | null
  expectedNextActionDate: string | null
}

const STAGE_LABELS: Record<StageKey, string> = {
  'mou-signed': 'MOU signed',
  'actuals-confirmed': 'Actuals confirmed',
  'cross-verification': 'Cross-verification',
  'invoice-raised': 'Invoice raised',
  'payment-received': 'Payment received',
  'kit-dispatched': 'Kit dispatched',
  'delivery-acknowledged': 'Delivery acknowledged',
  'feedback-submitted': 'Feedback submitted',
}

export function computeLifecycle(input: LifecycleInput): LifecycleStage[] {
  const stageDates: Array<[StageKey, string | null, string | null]> = [
    ['mou-signed', input.mouSignedDate, null],
    ['actuals-confirmed', input.actualsConfirmedDate, null],
    ['cross-verification', input.crossVerifiedDate, null],
    ['invoice-raised', input.invoiceRaisedDate, input.invoiceNumber],
    ['payment-received', input.paymentReceivedDate, null],
    ['kit-dispatched', input.dispatchedDate, null],
    ['delivery-acknowledged', input.deliveredDate, null],
    ['feedback-submitted', input.feedbackSubmittedDate, null],
  ]

  let currentAssigned = false
  return stageDates.map(([key, date, detail]) => {
    const label = STAGE_LABELS[key]
    if (date !== null) {
      return { key, label, status: 'completed' as const, date, detail }
    }
    if (!currentAssigned) {
      currentAssigned = true
      return {
        key,
        label,
        status: 'current' as const,
        date: input.expectedNextActionDate,
        detail: null,
      }
    }
    return { key, label, status: 'future' as const, date: null, detail: null }
  })
}
