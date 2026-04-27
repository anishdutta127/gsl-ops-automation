/*
 * Stage duration defaults (W3-C C3; overdue badge support).
 *
 * Each stage carries an "expected days until next stage" budget. The
 * kanban renders an Overdue badge on a card when (today - stage-
 * entered-date) exceeds this budget.
 *
 * Defaults sourced from the W3-D plan + Anish's pre-W3 refinements:
 *
 *   mou-signed              -> actuals-confirmed   : 14 days
 *   actuals-confirmed       -> invoice-raised      : 14 days
 *   cross-verification      (auto-skipped; n/a)
 *   invoice-raised          -> payment-received    : 30 days (B2B Net 30)
 *   payment-received        -> kit-dispatched      : 7 days
 *   kit-dispatched          -> delivery-acknowledged: 5 days
 *   delivery-acknowledged   -> feedback-submitted  : 7 days post-session
 *   feedback-submitted      (closure window)        : 30 days
 *   pre-ops                 (triage budget)         : 30 days
 *
 * W3-D refactor: this constant becomes a runtime read from
 * src/data/lifecycle_rules.json so Ops can tune per-stage durations
 * without a code change. Tests written against the hardcoded values
 * pass after the refactor (same values).
 */

import type { KanbanStageKey } from './deriveStage'

export const STAGE_DURATION_DAYS: Record<KanbanStageKey, number | null> = {
  'pre-ops': 30,
  'mou-signed': 14,
  'actuals-confirmed': 14,
  'cross-verification': null, // auto-skipped; never current
  'invoice-raised': 30,
  'payment-received': 7,
  'kit-dispatched': 5,
  'delivery-acknowledged': 7,
  'feedback-submitted': 30,
}

export function getStageDurationDays(stage: KanbanStageKey): number | null {
  return STAGE_DURATION_DAYS[stage]
}

/**
 * True when the MOU has spent more than the stage-budget number of
 * days at its current stage. Returns false when daysInStage is null
 * (no entered-date inferable) or when the stage has no defined
 * duration (cross-verification).
 */
export function isOverdue(stage: KanbanStageKey, daysInStage: number | null): boolean {
  if (daysInStage === null) return false
  const limit = STAGE_DURATION_DAYS[stage]
  if (limit === null) return false
  return daysInStage > limit
}
