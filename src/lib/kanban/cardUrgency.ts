/*
 * Card urgency level (W4-E.6.5).
 *
 * Maps the existing daysInStage + lifecycle threshold (per
 * stageDurations.ts) to a 4-level UrgencyLevel that drives the
 * subtle left-edge stripe on MouCard. Three terminal/holding
 * stages skip the stripe entirely:
 *
 *   - 'pre-ops':           triage holding bay; operators expect
 *                          cards to sit here pre-triage. The
 *                          existing Overdue badge still fires when
 *                          the 30-day budget is breached; the
 *                          stripe stays neutral.
 *   - 'cross-verification': auto-skipped by deriveStage; should
 *                          never carry a card in production.
 *   - 'feedback-submitted': terminal from the operator's perspective.
 *
 * For all other stages:
 *   - daysInStage > limit                  -> 'alert'
 *   - daysInStage >= limit / 2 (50%-100%)  -> 'attention'
 *   - daysInStage < limit / 2              -> 'ok'
 *   - daysInStage null OR limit null       -> 'none'
 *
 * The level pairs with a screen-reader label so colour is never the
 * only signal (DESIGN.md WCAG 2.1 AA "Colour rules").
 */

import { getStageDurationDays } from './stageDurations'
import type { KanbanStageKey } from './deriveStage'

export type UrgencyLevel = 'ok' | 'attention' | 'alert' | 'none'

const TERMINAL_OR_HOLDING: ReadonlySet<KanbanStageKey> = new Set<KanbanStageKey>([
  'pre-ops',
  'cross-verification',
  'feedback-submitted',
])

export function getCardUrgency(
  stage: KanbanStageKey,
  daysInStage: number | null,
): UrgencyLevel {
  if (daysInStage === null) return 'none'
  if (TERMINAL_OR_HOLDING.has(stage)) return 'none'
  const limit = getStageDurationDays(stage)
  if (limit === null) return 'none'
  if (daysInStage > limit) return 'alert'
  if (daysInStage * 2 >= limit) return 'attention'
  return 'ok'
}

/**
 * Tailwind class for the 4px left-edge stripe on MouCard. Tokens
 * resolve to the Semantic signal palette (DESIGN.md "Semantic signal
 * palette") so a brand swap stays single-line in globals.css.
 */
export const URGENCY_BORDER_CLASS: Record<UrgencyLevel, string> = {
  ok: 'border-l-4 border-l-signal-ok',
  attention: 'border-l-4 border-l-signal-attention',
  alert: 'border-l-4 border-l-signal-alert',
  none: 'border-l-4 border-l-transparent',
}

/**
 * Screen-reader label paired with the stripe. Pair with text on
 * hover/aria-label so the colour is never the only signal.
 */
export function urgencyAriaLabel(
  level: UrgencyLevel,
  stage: KanbanStageKey,
  daysInStage: number | null,
): string {
  if (level === 'none' || daysInStage === null) return ''
  const limit = getStageDurationDays(stage)
  if (limit === null) return ''
  const remaining = limit - daysInStage
  if (level === 'alert') {
    return `Overdue by ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'}`
  }
  if (level === 'attention') {
    return `${daysInStage} day${daysInStage === 1 ? '' : 's'} in stage; ${remaining} remaining`
  }
  return `${daysInStage} day${daysInStage === 1 ? '' : 's'} in stage; on track`
}
