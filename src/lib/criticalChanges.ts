/*
 * Critical-change surfacing (Gate 4 Step 3).
 *
 * Audit entries already exist on every entity; this module classifies
 * which entries are CRITICAL and worth surfacing at the top of detail
 * pages plus the consolidated landing's attention zone.
 *
 * "Critical" set (per Misba's 7-step doc + Gate 1 lifecycle):
 *   - Student-count change (mou:edit-actuals / actuals-confirmed)
 *   - Fee or pricing change (any audit entry whose before/after
 *     touches spWithoutTax, spWithTax, or contractValue)
 *   - MOU status change (status_change, mou-cohort-status-changed)
 *   - Payment recorded (payment-recorded, pi-issued)
 *   - PI generated (pi-issued)
 *   - Dispatch status forward (dispatch-raised, delivery-acknowledged)
 *   - Escalation status change (escalation-edited that flipped status)
 *   - School master data change (any audit entry on a School)
 *
 * Pure functions. No I/O.
 */

import type { AuditEntry } from '@/lib/types'

/**
 * Domain-specific actions that are ALWAYS critical regardless of the
 * before/after payload contents.
 */
const CRITICAL_ACTIONS: ReadonlySet<string> = new Set<string>([
  'actuals-confirmed',
  'pi-issued',
  'payment-recorded',
  'dispatch-raised',
  'delivery-acknowledged',
  'feedback-submitted',
  'p2-override',
  'mou-cohort-status-changed',
  'status_change',
  'auto-create-from-feedback',
  // Gate 5A.5 Step 4: dispatch override lifecycle.
  'dispatch-override-requested',
  'dispatch-override-approved',
  'dispatch-override-rejected',
  // Phase 5 (2026-05-19, Pranav review #4): student-count changes
  // recalc the entire instalment schedule and are always material.
  'student-count-changed',
])

/**
 * Field paths that, when present in before/after, mark a generic
 * 'update' audit entry as critical. Used for entities whose updates
 * are filed under the generic 'update' AuditAction (e.g., School
 * edits, MOU pricing tweaks).
 */
const CRITICAL_FIELD_KEYS: ReadonlySet<string> = new Set<string>([
  'studentsActual',
  'studentsMou',
  'spWithoutTax',
  'spWithTax',
  'contractValue',
  'status', // MOU status, Escalation status, etc.
  'severity', // Escalation severity bump
  'paymentSchedule',
  // School master fields
  'billingName',
  'pan',
  'gstNumber',
  'contactPerson',
  'email',
  'phone',
])

export type CriticalEntityType =
  | 'mou'
  | 'school'
  | 'payment'
  | 'escalation'
  | 'dispatch'
  | 'kit-dispatch'
  | 'feedback'
  | 'intake-record'

export interface CriticalChange {
  entityType: CriticalEntityType
  entityId: string
  /** Denormalised label for fast list rendering ("MOU-STEAM-2627-014" or "Sunrise High"). */
  entityLabel: string
  timestamp: string
  user: string
  action: string
  /** Short summary built from before/after diff. */
  summary: string
  href: string
}

/**
 * Returns true when the audit entry should surface as a critical
 * change to operators.
 */
export function isCriticalAudit(entry: AuditEntry): boolean {
  if (CRITICAL_ACTIONS.has(entry.action)) return true
  // For generic update entries, inspect before/after to see if a
  // critical field changed.
  const before = (entry.before ?? {}) as Record<string, unknown>
  const after = (entry.after ?? {}) as Record<string, unknown>
  const keys = Array.from(
    new Set<string>([...Object.keys(before), ...Object.keys(after)]),
  )
  for (const key of keys) {
    if (CRITICAL_FIELD_KEYS.has(key)) {
      if (before[key] !== after[key]) return true
    }
  }
  return false
}

/**
 * Build a one-line summary of the audit entry. Falls back to the
 * action name when no diff is available.
 */
export function summariseCriticalAudit(entry: AuditEntry): string {
  if (entry.notes && entry.notes.trim() !== '') return entry.notes.trim()
  const before = (entry.before ?? {}) as Record<string, unknown>
  const after = (entry.after ?? {}) as Record<string, unknown>
  const allKeys = Array.from(
    new Set<string>([...Object.keys(before), ...Object.keys(after)]),
  )
  const diffs: string[] = []
  for (const key of allKeys) {
    if (before[key] === after[key]) continue
    const beforeVal = formatVal(before[key])
    const afterVal = formatVal(after[key])
    diffs.push(`${key}: ${beforeVal} -> ${afterVal}`)
    if (diffs.length === 3) break
  }
  if (diffs.length > 0) return diffs.join(', ')
  return entry.action
}

function formatVal(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value.length > 40 ? value.slice(0, 37) + '...' : value
  return JSON.stringify(value)
}

/**
 * Filter + sort an entity's auditLog to the critical entries, newest
 * first. Caller passes the entity context (type, id, label, href) so
 * the surface code can render uniformly across entities.
 */
export function collectCriticalChanges(args: {
  entityType: CriticalEntityType
  entityId: string
  entityLabel: string
  hrefBase: string // e.g., '/mous'
  auditLog: AuditEntry[]
}): CriticalChange[] {
  const { entityType, entityId, entityLabel, hrefBase, auditLog } = args
  const out: CriticalChange[] = []
  for (const entry of auditLog) {
    if (!isCriticalAudit(entry)) continue
    out.push({
      entityType,
      entityId,
      entityLabel,
      timestamp: entry.timestamp,
      user: entry.user,
      action: entry.action,
      summary: summariseCriticalAudit(entry),
      href: `${hrefBase}/${entityId}`,
    })
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/**
 * Returns the N most-recent critical changes from an entity's audit
 * log. Convenience wrapper used by the MOU detail page's top change
 * log.
 */
export function topNCriticalChanges(
  changes: CriticalChange[],
  n: number,
): CriticalChange[] {
  return changes.slice(0, Math.max(0, n))
}

/**
 * Filter critical changes to those within the trailing-window (in
 * milliseconds). Used by the landing Zone 3 attention items
 * interleave (last 24h).
 */
export function withinTrailingWindow(
  changes: CriticalChange[],
  now: Date,
  windowMs: number,
): CriticalChange[] {
  const cutoff = now.getTime() - windowMs
  return changes.filter((c) => {
    const ts = new Date(c.timestamp).getTime()
    return !Number.isNaN(ts) && ts >= cutoff
  })
}

export const __testing__ = {
  CRITICAL_ACTIONS,
  CRITICAL_FIELD_KEYS,
}
