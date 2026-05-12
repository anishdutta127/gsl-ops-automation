/*
 * Master status tracker (Gate 4 Step 1).
 *
 * Per Misba's 7-step Sales/Ops/Finance workflow doc, every MOU
 * progresses through a 10-stage lifecycle. Lower-level entities
 * (Installments + Payments + KitDispatch) drive the computation;
 * this module surfaces the rolled-up stage on the MOU itself so
 * the detail page header, school detail mini-tracker, and the
 * landing Zone 2 stage chart can read it in one place.
 *
 * The 10 stages, in order:
 *
 *   1. pipeline                Sales drafting (MOU.status === 'Draft' or 'Pending Signature')
 *   2. mou-uploaded             Signed PDF in (status flips Active but no actuals + payments yet)
 *   3. active                   Actuals captured (studentsActual !== null) but no payment activity
 *   4. payment-pending          PI generation due on at least one installment (next installment due window OR overdue) but no PI raised
 *   5. installment-1-received   1st installment Paid / Received
 *   6. pi-generated             Any installment has piGeneratedAt set
 *   7. dispatch-requested       KitDispatch record exists with allocations
 *   8. shipment-in-progress     KitDispatch.dispatchStatus = 'In Transit'
 *   9. delivered                All KitDispatch records dispatchStatus = 'Delivered'
 *  10. closed                   MOU.status = 'Completed' AND all installments Paid AND all dispatches Delivered
 *
 * Stages 4-7 may interleave with 6-9 depending on programme; the
 * tracker returns the FURTHEST stage reached. Stages 1-3 are mutually
 * exclusive (sequential states of the MOU's setup). 5+ "received"
 * stages monotonically advance as installments are paid; the tracker
 * sticks at the highest-numbered stage that has triggered.
 *
 * Pure function. No I/O.
 */

import type {
  KitDispatch,
  MOU,
  Payment,
} from '@/lib/types'

export type LifecycleStage =
  | 'pipeline'
  | 'mou-uploaded'
  | 'active'
  | 'payment-pending'
  | 'installment-1-received'
  | 'pi-generated'
  | 'dispatch-requested'
  | 'shipment-in-progress'
  | 'delivered'
  | 'closed'

export const STAGE_ORDER: ReadonlyArray<LifecycleStage> = [
  'pipeline',
  'mou-uploaded',
  'active',
  'payment-pending',
  'installment-1-received',
  'pi-generated',
  'dispatch-requested',
  'shipment-in-progress',
  'delivered',
  'closed',
]

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  pipeline: 'Pipeline',
  'mou-uploaded': 'MOU uploaded',
  active: 'Active',
  'payment-pending': 'Payment pending',
  'installment-1-received': '1st instalment received',
  'pi-generated': 'PI generated',
  'dispatch-requested': 'Dispatch requested',
  'shipment-in-progress': 'Shipment in progress',
  delivered: 'Delivered',
  closed: 'Closed',
}

export interface ComputeStageArgs {
  mou: MOU
  payments: Payment[]
  dispatches: KitDispatch[]
  /** Used for "payment-pending" computation (due window). Defaults to now. */
  now: Date
}

/**
 * Returns the FURTHEST lifecycle stage the MOU has reached. The caller
 * is responsible for joining the right slice of Payments + KitDispatch
 * records (filter by mouId before calling).
 *
 * Gate 5A.5 Step 4: when `mou.dispatchOverride.status === 'approved'`
 * the payment-pending + installment-1-received stages are skipped. An
 * approved override means dispatch is authorised without payment
 * having to land; the tracker reflects that by jumping from `active`
 * straight into the dispatch chain.
 */
export function computeStage(args: ComputeStageArgs): LifecycleStage {
  const { mou, payments, dispatches, now } = args
  const nowMs = now.getTime()
  const overrideApproved = mou.dispatchOverride?.status === 'approved'

  // Stage 1: pipeline (MOU still drafting).
  if (mou.status === 'Draft' || mou.status === 'Pending Signature') {
    return 'pipeline'
  }

  // From here onward, MOU has been signed. Stages 2-10 stack
  // monotonically; the tracker walks the chain and returns the
  // highest-numbered stage whose precondition is met.

  // Stage 10: closed.
  const allInstalmentsPaid =
    payments.length > 0
    && payments.every((p) => p.status === 'Paid' || p.status === 'Received')
  const allDispatchesDelivered =
    dispatches.length > 0
    && dispatches.every((d) => d.dispatchStatus === 'Delivered')
  if (
    mou.status === 'Completed'
    && allInstalmentsPaid
    && (dispatches.length === 0 || allDispatchesDelivered)
  ) {
    return 'closed'
  }

  // Stage 9: delivered (every KitDispatch Delivered; closure pending).
  if (dispatches.length > 0 && allDispatchesDelivered) {
    return 'delivered'
  }

  // Stage 8: shipment in progress.
  if (dispatches.some((d) => d.dispatchStatus === 'In Transit')) {
    return 'shipment-in-progress'
  }

  // Stage 7: dispatch requested (KitDispatch record + at least one allocation).
  if (
    dispatches.some(
      (d) => d.dispatchStatus !== 'Delivered' && (d.allocations?.length ?? 0) > 0,
    )
  ) {
    return 'dispatch-requested'
  }

  // Stage 6: PI generated (any installment).
  if (payments.some((p) => p.piGeneratedAt !== null)) {
    return 'pi-generated'
  }

  // Stage 5: 1st instalment received. Skipped when override approved.
  if (!overrideApproved) {
    const firstInstalment = payments.find((p) => p.instalmentSeq === 1)
    if (
      firstInstalment
      && (firstInstalment.status === 'Paid' || firstInstalment.status === 'Received')
    ) {
      return 'installment-1-received'
    }
  }

  // Stage 4: payment pending (an installment due in 30d OR overdue + no PI).
  // Skipped when override approved.
  if (!overrideApproved) {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const paymentPending = payments.some((p) => {
      if (p.status === 'Paid' || p.status === 'Received') return false
      if (!p.dueDateIso) return false
      const dueMs = new Date(p.dueDateIso).getTime()
      if (Number.isNaN(dueMs)) return false
      return dueMs - nowMs <= THIRTY_DAYS_MS // includes overdue
    })
    if (paymentPending) {
      return 'payment-pending'
    }
  }

  // Stage 3: active (actuals captured).
  if (mou.studentsActual !== null && mou.studentsActual !== undefined) {
    return 'active'
  }

  // Stage 2: MOU uploaded (signed, but no actuals + no payment due yet).
  return 'mou-uploaded'
}

/**
 * Visual state of each stage relative to the current stage.
 *   'done'    -> the lifecycle has passed this stage
 *   'current' -> this is the stage the MOU is at now
 *   'future'  -> the lifecycle has not reached this stage yet
 */
export type StageVisualState = 'done' | 'current' | 'future'

export interface StageBadge {
  stage: LifecycleStage
  label: string
  state: StageVisualState
}

export function buildStageBadges(current: LifecycleStage): StageBadge[] {
  const currentIdx = STAGE_ORDER.indexOf(current)
  return STAGE_ORDER.map((stage, idx) => {
    let state: StageVisualState = 'future'
    if (idx < currentIdx) state = 'done'
    else if (idx === currentIdx) state = 'current'
    return {
      stage,
      label: STAGE_LABEL[stage],
      state,
    }
  })
}

/**
 * Bucket-count helper for the landing Zone 2 stage chart. Given a set
 * of MOUs and their corresponding payments + dispatches, returns the
 * number of MOUs currently sitting at each lifecycle stage. MOUs with
 * cohortStatus 'archived' are excluded.
 */
export function bucketByStage(args: {
  mous: MOU[]
  payments: Payment[]
  dispatches: KitDispatch[]
  now: Date
}): Record<LifecycleStage, number> {
  const counts: Record<LifecycleStage, number> = {
    pipeline: 0,
    'mou-uploaded': 0,
    active: 0,
    'payment-pending': 0,
    'installment-1-received': 0,
    'pi-generated': 0,
    'dispatch-requested': 0,
    'shipment-in-progress': 0,
    delivered: 0,
    closed: 0,
  }
  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of args.payments) {
    const list = paymentsByMou.get(p.mouId) ?? []
    list.push(p)
    paymentsByMou.set(p.mouId, list)
  }
  const dispatchesByMou = new Map<string, KitDispatch[]>()
  for (const d of args.dispatches) {
    const list = dispatchesByMou.get(d.mouId) ?? []
    list.push(d)
    dispatchesByMou.set(d.mouId, list)
  }

  for (const m of args.mous) {
    if (m.cohortStatus === 'archived') continue
    const stage = computeStage({
      mou: m,
      payments: paymentsByMou.get(m.id) ?? [],
      dispatches: dispatchesByMou.get(m.id) ?? [],
      now: args.now,
    })
    counts[stage] += 1
  }
  return counts
}
