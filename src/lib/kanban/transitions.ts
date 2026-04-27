/*
 * Kanban transition classification (W3-C C2).
 *
 * Pure logic that maps a (fromStage, toStage) drag attempt to:
 *   - a transition kind ('forward-by-one' / 'forward-skip' /
 *     'backward' / 'pre-ops-exit' / 'rejected' / 'no-op')
 *   - whether a reason field is required from the operator (per
 *     W3-A.1 design: skip / backward / Pre-Ops exit always require)
 *   - which existing form path to navigate to for forward transitions
 *     (Path A: navigate-on-confirm; reuses /mous/[id]/{action} surfaces)
 *   - dialog copy keys for the operator-facing message
 *
 * Backward + Pre-Ops moves do NOT have a target form: backward is an
 * audit-only intent capture (state revert is a separate /mous/[id]
 * edit), Pre-Ops exit is a triage-only intent capture (status change
 * happens via the MOU detail surface).
 *
 * Pre-Ops one-way exit constraint (W3-A.1 design): cards can leave
 * Pre-Ops but never return. classifyTransition returns 'rejected'
 * when the destination is 'pre-ops' and the source is anything else.
 */

import type { KanbanStageKey } from './deriveStage'
import { KANBAN_COLUMNS } from './deriveStage'

export type TransitionKind =
  | 'no-op'              // dropped on the same column
  | 'forward-by-one'     // adjacent forward; happy path; no reason required
  | 'forward-skip'       // forward by >1; reason required
  | 'backward'           // reverse direction; reason required; audit-only
  | 'pre-ops-exit'       // out of Pre-Ops Legacy; reason required; triage
  | 'rejected'           // drop into Pre-Ops; not allowed (one-way exit)

export interface TransitionClassification {
  kind: TransitionKind
  fromStage: KanbanStageKey
  toStage: KanbanStageKey
  reasonRequired: boolean
  /** Path A target form for forward transitions; null otherwise. */
  forwardFormPath: string | null
  /** Operator-facing copy key (consumed by TransitionDialog). */
  copyKey:
    | 'no-op'
    | 'forward-by-one'
    | 'forward-skip'
    | 'backward'
    | 'pre-ops-exit'
    | 'rejected-pre-ops'
}

const STAGE_INDEX: Record<KanbanStageKey, number> = (() => {
  const map: Record<string, number> = {}
  KANBAN_COLUMNS.forEach((col, i) => { map[col.key] = i })
  return map as Record<KanbanStageKey, number>
})()

/**
 * Map each forward stage to its existing form path. Forward transitions
 * navigate to these surfaces (Path A) so the existing form's validation,
 * audit, and error-handling are reused verbatim.
 *
 * mouId is interpolated by the caller via `forwardFormPath.replace`.
 *
 * Stages without a dedicated form (cross-verification, mou-signed) point
 * at the MOU detail page; the operator picks the right action from there.
 * cross-verification has no surface in Phase 1 (auto-skipped by
 * deriveStage); mou-signed is paired with the W4-C intake form (not yet
 * wired). All other stages map to their per-stage form. payment-received
 * gained its form in W4-B.5 (/mous/{id}/payment-receipt).
 */
const STAGE_FORM_PATH: Record<KanbanStageKey, string | null> = {
  'pre-ops': null,
  'mou-signed': null,                         // no form; status flip happens on /mous/[id]
  'actuals-confirmed': '/mous/{id}/actuals',
  'cross-verification': null,                  // auto-skipped; no form
  'invoice-raised': '/mous/{id}/pi',
  'payment-received': '/mous/{id}/payment-receipt',  // W4-B.5
  'kit-dispatched': '/mous/{id}/dispatch',
  'delivery-acknowledged': '/mous/{id}/delivery-ack',
  'feedback-submitted': '/mous/{id}/feedback-request',
}

export function buildForwardFormPath(toStage: KanbanStageKey, mouId: string): string | null {
  const template = STAGE_FORM_PATH[toStage]
  return template ? template.replace('{id}', mouId) : null
}

export function classifyTransition(
  fromStage: KanbanStageKey,
  toStage: KanbanStageKey,
  mouId: string,
): TransitionClassification {
  if (fromStage === toStage) {
    return {
      kind: 'no-op',
      fromStage, toStage,
      reasonRequired: false,
      forwardFormPath: null,
      copyKey: 'no-op',
    }
  }
  if (toStage === 'pre-ops') {
    return {
      kind: 'rejected',
      fromStage, toStage,
      reasonRequired: false,
      forwardFormPath: null,
      copyKey: 'rejected-pre-ops',
    }
  }
  if (fromStage === 'pre-ops') {
    return {
      kind: 'pre-ops-exit',
      fromStage, toStage,
      reasonRequired: true,
      forwardFormPath: buildForwardFormPath(toStage, mouId),
      copyKey: 'pre-ops-exit',
    }
  }
  const fromIdx = STAGE_INDEX[fromStage]
  const toIdx = STAGE_INDEX[toStage]
  if (toIdx > fromIdx) {
    const distance = toIdx - fromIdx
    if (distance === 1) {
      return {
        kind: 'forward-by-one',
        fromStage, toStage,
        reasonRequired: false,
        forwardFormPath: buildForwardFormPath(toStage, mouId),
        copyKey: 'forward-by-one',
      }
    }
    return {
      kind: 'forward-skip',
      fromStage, toStage,
      reasonRequired: true,
      forwardFormPath: buildForwardFormPath(toStage, mouId),
      copyKey: 'forward-skip',
    }
  }
  return {
    kind: 'backward',
    fromStage, toStage,
    reasonRequired: true,
    forwardFormPath: null,
    copyKey: 'backward',
  }
}

/**
 * Validate the operator-supplied reason for transitions that require it.
 * Returns null on pass, an error code on fail. UI surfaces the error
 * inline next to the textarea.
 */
export type ReasonError = 'reason-missing' | 'reason-too-short'

export function validateReason(reason: string | null | undefined): ReasonError | null {
  if (typeof reason !== 'string') return 'reason-missing'
  const trimmed = reason.trim()
  if (trimmed === '') return 'reason-missing'
  if (trimmed.length < 5) return 'reason-too-short'
  return null
}
