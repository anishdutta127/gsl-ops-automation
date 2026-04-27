/*
 * Stage duration defaults (W3-C C3 + W3-D editable rules).
 *
 * Each stage carries an "expected days until next stage" budget. The
 * kanban renders an Overdue badge on a card when (today - stage-
 * entered-date) exceeds this budget.
 *
 * Defaults sourced from src/data/lifecycle_rules.json post W3-D;
 * editable via /admin/lifecycle-rules. Was hardcoded in C3 pending
 * the W3-D refactor; values migrate unchanged so existing C3 tests
 * pass without modification.
 *
 * Pre-Ops triage budget (30 days) stays hardcoded here as a special
 * case: it is a while-in-stage budget for the holding bay rather
 * than a transition between two stages, and the W3-D editable-rules
 * collection lists only the 7 forward transitions.
 *
 * cross-verification has no budget (auto-skipped by deriveStage per
 * the W3-C C1 design). Returns null in lookups to suppress the
 * Overdue badge on the rare card that lands there.
 */

import type { LifecycleRule } from '@/lib/types'
import lifecycleRulesJson from '@/data/lifecycle_rules.json'
import type { KanbanStageKey } from './deriveStage'

const PRE_OPS_TRIAGE_DAYS = 30

const allRules = lifecycleRulesJson as unknown as LifecycleRule[]

function buildLookup(rules: LifecycleRule[]): Record<string, number> {
  const lookup: Record<string, number> = {}
  for (const r of rules) lookup[r.stageFromKey] = r.defaultDays
  return lookup
}

const RULE_LOOKUP = buildLookup(allRules)

export function getStageDurationDays(stage: KanbanStageKey): number | null {
  if (stage === 'pre-ops') return PRE_OPS_TRIAGE_DAYS
  if (stage === 'cross-verification') return null
  return RULE_LOOKUP[stage] ?? null
}

/**
 * True when the MOU has spent more than the stage-budget number of
 * days at its current stage. Returns false when daysInStage is null
 * (no entered-date inferable) or when the stage has no defined
 * duration (cross-verification).
 */
export function isOverdue(stage: KanbanStageKey, daysInStage: number | null): boolean {
  if (daysInStage === null) return false
  const limit = getStageDurationDays(stage)
  if (limit === null) return false
  return daysInStage > limit
}
