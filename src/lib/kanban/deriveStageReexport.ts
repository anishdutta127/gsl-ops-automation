/*
 * Re-export helper to break a circular-import risk.
 *
 * recordTransition.ts uses classifyTransition + validateReason from
 * transitions.ts; transitions.ts uses KANBAN_COLUMNS from
 * deriveStage.ts. Tests + the API route consume both. Centralised
 * re-export keeps each module's import surface narrow.
 */

export type { KanbanStageKey } from './deriveStage'
export { classifyTransition, validateReason } from './transitions'
