/*
 * Escalation SLA computation (Gate 1 Step 5).
 *
 * Pure functions. The migration backfill, the createEscalation flow,
 * and the daily recompute job (deferred until Gate 4 fold-in) all
 * call into here so the SLA contract lives in one place.
 *
 * SLA tiers per the Misba ticketing spec (Gate 1 brief):
 *   P0 / critical = 24 hours
 *   P1 / high     = 72 hours
 *   P2 / medium   = 7 days
 *   P3 / low      = 30 days
 *
 * slaBreached is true when:
 *   - status is not 'Closed' AND
 *   - now > slaTargetDate.
 *
 * Closed escalations stop accruing breach (resolution stops the clock).
 */

import type { EscalationSeverity, EscalationStatus } from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const SLA_HOURS_BY_SEVERITY: Record<EscalationSeverity, number> = {
  critical: 24,
  high: 72,
  medium: 7 * 24,
  low: 30 * 24,
}

/**
 * Returns the SLA window in hours for a given severity. Useful for
 * UI badge copy ("24h to resolve") and tests.
 */
export function slaWindowHours(severity: EscalationSeverity): number {
  return SLA_HOURS_BY_SEVERITY[severity]
}

/**
 * Computes the ISO target-date string for an escalation given when it
 * was created and its severity. Pure: no Date.now() reads.
 */
export function computeSlaTargetDate(args: {
  createdAt: string
  severity: EscalationSeverity
}): string {
  const created = new Date(args.createdAt)
  const target = new Date(created.getTime() + slaWindowHours(args.severity) * HOUR_MS)
  return target.toISOString()
}

/**
 * Returns true when the SLA target has passed and the escalation has
 * not been closed. Closed escalations never read as breached.
 */
export function isSlaBreached(args: {
  status: EscalationStatus
  slaTargetDate: string
  now: Date
}): boolean {
  if (args.status === 'Closed') return false
  return new Date(args.slaTargetDate).getTime() < args.now.getTime()
}

/**
 * Hours remaining until the SLA target. Negative when already
 * breached. Returns 0 for closed escalations (no clock).
 */
export function slaHoursRemaining(args: {
  status: EscalationStatus
  slaTargetDate: string
  now: Date
}): number {
  if (args.status === 'Closed') return 0
  const ms = new Date(args.slaTargetDate).getTime() - args.now.getTime()
  return Math.round(ms / HOUR_MS)
}

/**
 * Days remaining until the SLA target. For UI copy when the window is
 * P2 (7d) or P3 (30d); under P0 / P1 the hours figure is more useful.
 */
export function slaDaysRemaining(args: {
  status: EscalationStatus
  slaTargetDate: string
  now: Date
}): number {
  if (args.status === 'Closed') return 0
  const ms = new Date(args.slaTargetDate).getTime() - args.now.getTime()
  return Math.round(ms / DAY_MS)
}
