/*
 * Trigger-tile aggregation for /dashboard (Surface 1).
 *
 * 10 tiles mapping to step 6.5 items A-J per
 * plans/assumptions-and-triggers-2026-04-24.md:
 *
 *   A. P2 dispatch overrides (count in last 7d; alert >3/wk for 2wks)
 *   B. Sales drift queue (count of pending Sales-Head approvals)
 *   C. Legacy-school workload (informational pre-launch)
 *   D. CC scope mismatches (informational)
 *   E. Captured commitments (informational)
 *   F. PI blocks on null GSTIN (% of MOUs blocked; alert >30%)
 *   G. Reconciliation health (queue + retry summary; alert on anomaly)
 *   H. CC toggle-offs (count in last 30d; alert >5)
 *   I. Email bounce rate (% of last-7d sends; alert >5%)
 *   J. MOU sales-owner assignment queue (count; alert >5 for 48h)
 *
 * Phase 1 fixture data is sparse (5 MOUs, 5 escalations, 5 dispatches);
 * most tiles will read "0" with neutral status. That is correct
 * behaviour: the tiles are infrastructure for Phase 1.1 thresholds
 * to fire against once production usage flows through.
 *
 * Pure functions; deps-injected via opts. No Date.now() in scoring;
 * the `now` param defaults to new Date() and tests inject a fixed
 * date for determinism.
 */

import type {
  Communication,
  Dispatch,
  Escalation,
  MOU,
  School,
} from '@/lib/types'

export type TriggerStatus = 'ok' | 'attention' | 'alert' | 'neutral'

export interface TriggerTileValue {
  label: string
  primary: string
  threshold: string
  status: TriggerStatus
  trendDirection?: 'up' | 'down' | 'flat'
}

interface BaseDeps {
  mous: MOU[]
  schools: School[]
  dispatches: Dispatch[]
  escalations: Escalation[]
  communications: Communication[]
  now?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function withinDays(iso: string | null | undefined, days: number, now: Date): boolean {
  if (!iso) return false
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return false
  return now.getTime() - ts <= days * DAY_MS
}

// A. P2 dispatch overrides (last 7d)
export function p2OverridesTile({ dispatches, now }: BaseDeps): TriggerTileValue {
  const at = now ?? new Date()
  let count = 0
  for (const d of dispatches) {
    if (d.overrideEvent && withinDays(d.overrideEvent.overriddenAt, 7, at)) {
      count += 1
    }
  }
  let status: TriggerStatus = 'ok'
  if (count > 3) status = 'alert'
  else if (count === 3) status = 'attention'
  return {
    label: 'P2 overrides (7d)',
    primary: String(count),
    threshold: 'ok ≤ 2/wk; alert > 3/wk for 2 wks',
    status,
  }
}

// B. Sales-Head drift queue depth
export function salesDriftQueueTile({ mous }: BaseDeps): TriggerTileValue {
  const pending = mous.filter(
    (m) =>
      m.studentsVariancePct !== null &&
      Math.abs(m.studentsVariancePct) > 0.10,
  ).length
  let status: TriggerStatus = 'ok'
  if (pending > 5) status = 'alert'
  else if (pending >= 3) status = 'attention'
  return {
    label: 'Sales drift queue',
    primary: String(pending),
    threshold: 'ok ≤ 5; alert > 5/wk',
    status,
  }
}

// W4-A.7 removed legacyWorkloadTile. The "Legacy schools EXCLUDED"
// signal was a leftover from the pre-W4 active/archive separation; with
// cohortStatus now first-class and archived MOUs invisible to the active
// kanban / overview by default, the tile no longer earned its grid slot.
// The trigger grid reflows from 10 tiles to 9 (one tile shorter).

// D. CC scope mismatches (informational; populated by post-send audit in Phase 1.1)
export function ccScopeMismatchesTile(_: BaseDeps): TriggerTileValue {
  return {
    label: 'CC scope deltas (7d)',
    primary: '0',
    threshold: 'Informational; review weekly',
    status: 'neutral',
  }
}

// E. Captured commitments (% of active MOUs with non-empty commitments field)
// Phase 1: commitments lives in MOU.notes; conservative count
export function commitmentsTile({ mous }: BaseDeps): TriggerTileValue {
  const active = mous.filter((m) => m.status === 'Active')
  const captured = active.filter((m) => m.notes !== null && m.notes.trim() !== '').length
  return {
    label: 'Captured commitments',
    primary: `${captured}/${active.length}`,
    threshold: 'Informational; first miss flag',
    status: 'neutral',
  }
}

// F. PI blocks on null GSTIN (% of active MOUs whose school has null GSTIN)
export function piBlocksTile({ mous, schools }: BaseDeps): TriggerTileValue {
  const active = mous.filter((m) => m.status === 'Active')
  if (active.length === 0) {
    return { label: 'PI blocked (GSTIN)', primary: '0%', threshold: 'ok < 30%', status: 'ok' }
  }
  const schoolById = new Map(schools.map((s) => [s.id, s]))
  const blocked = active.filter((m) => {
    const s = schoolById.get(m.schoolId)
    return !s || s.gstNumber === null
  }).length
  const ratio = blocked / active.length
  let status: TriggerStatus = 'ok'
  if (ratio > 0.30) status = 'alert'
  else if (ratio > 0.15) status = 'attention'
  return {
    label: 'PI blocked (GSTIN)',
    primary: `${Math.round(ratio * 100)}%`,
    threshold: 'ok < 30%; alert > 30%',
    status,
  }
}

// G. Reconciliation health (queue + retry summary)
// Phase 1: simple "all OK" indicator; richer telemetry in Phase 1.1
export function reconciliationHealthTile(_: BaseDeps): TriggerTileValue {
  return {
    label: 'Reconcile health',
    primary: 'OK',
    threshold: 'alert: counter skip, queue corruption',
    status: 'ok',
  }
}

// H. CC toggle-offs (count of cc-rule-toggle-off audit entries in last 30d)
// Phase 1: counts from cc_rules.json auditLog entries
export function ccToggleOffsTile({ now }: BaseDeps): TriggerTileValue {
  const at = now ?? new Date()
  // Phase 1: cc_rules.json auditLog scan would happen here; deferred to
  // Phase 1.1 admin tooling. Placeholder count.
  const count = 0
  void at
  let status: TriggerStatus = 'ok'
  if (count > 5) status = 'alert'
  else if (count >= 2) status = 'attention'
  return {
    label: 'CC toggle-offs (30d)',
    primary: String(count),
    threshold: 'ok 0-1; alert > 5/30d',
    status,
  }
}

// I. Email bounce rate (% of last-7d sends with status='bounced')
export function emailBounceRateTile({ communications, now }: BaseDeps): TriggerTileValue {
  const at = now ?? new Date()
  const recent = communications.filter(
    (c) => c.channel === 'email' && withinDays(c.sentAt ?? c.queuedAt, 7, at),
  )
  if (recent.length === 0) {
    return { label: 'Email bounce (7d)', primary: '0%', threshold: 'ok < 5%', status: 'ok' }
  }
  const bounced = recent.filter((c) => c.status === 'bounced').length
  const ratio = bounced / recent.length
  // Per Item I spec: ok ≤ 5%, alert > 5%. No attention tier defined.
  const status: TriggerStatus = ratio > 0.05 ? 'alert' : 'ok'
  return {
    label: 'Email bounce (7d)',
    primary: `${Math.round(ratio * 100)}%`,
    threshold: 'ok ≤ 5%; alert > 5%/7d',
    status,
  }
}

// J. MOU sales-owner assignment queue (count of MOUs with null salesPersonId)
export function assignmentQueueTile({ mous }: BaseDeps): TriggerTileValue {
  const unassigned = mous.filter(
    (m) => m.status === 'Active' && (m.salesPersonId === null || m.salesPersonId === ''),
  ).length
  let status: TriggerStatus = 'ok'
  if (unassigned > 5) status = 'alert'
  else if (unassigned >= 1) status = 'attention'
  return {
    label: 'Assignment queue',
    primary: String(unassigned),
    threshold: 'ok 0; alert > 5 unresolved 48h',
    status,
  }
}

export function buildTriggerTiles(deps: BaseDeps): TriggerTileValue[] {
  return [
    p2OverridesTile(deps),
    salesDriftQueueTile(deps),
    ccScopeMismatchesTile(deps),
    commitmentsTile(deps),
    piBlocksTile(deps),
    reconciliationHealthTile(deps),
    ccToggleOffsTile(deps),
    emailBounceRateTile(deps),
    assignmentQueueTile(deps),
  ]
}
