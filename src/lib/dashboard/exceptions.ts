/*
 * Exception-feed aggregation for /dashboard (Surface 1).
 *
 * Produces an ordered ExceptionEntry[] summarising schools that need
 * action right now. Surfaced as 72px-tall rows in the exception
 * feed panel on /dashboard, and as the full list on
 * /dashboard/exceptions.
 *
 * Five categories aggregated:
 *   - late-actuals          : Active MOU past startDate with
 *                             studentsActual === null
 *   - overdue-invoice       : Payment with status === 'Overdue'
 *   - stuck-dispatch        : Dispatch in {po-raised, dispatched,
 *                             in-transit} for >7 days since stage
 *                             entered
 *   - missing-feedback      : Active MOU with installment(s) past
 *                             due where no Feedback exists for that
 *                             installmentSeq
 *   - failed-communication  : Communication with status='bounced'
 *                             or 'failed' in last 14d
 *
 * Per-role scoping mirrors health.ts: SalesRep sees own-MOU
 * exceptions only; lane-aware roles see all (Phase 1 simplification;
 * Phase 1.1 may scope by lane).
 *
 * Ordering: priority desc (alert > attention > neutral) then
 * daysSince desc then schoolName asc. Deterministic across runs.
 */

import type {
  Communication,
  Dispatch,
  Feedback,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import type { ExceptionIconType, ExceptionPriority } from '@/components/ops/ExceptionRow'

export interface ExceptionEntry {
  id: string                       // synthetic; for React keys
  schoolId: string
  schoolName: string
  description: string
  daysSince: number
  priority: ExceptionPriority
  iconType: ExceptionIconType
  href: string
}

interface BaseDeps {
  mous: MOU[]
  schools: School[]
  dispatches: Dispatch[]
  payments: Payment[]
  communications: Communication[]
  feedback: Feedback[]
  user: User | null
  now?: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return 0
  const days = Math.floor((now.getTime() - ts) / DAY_MS)
  return days < 0 ? 0 : days
}

function scopeMouIds(mous: MOU[], user: User | null): Set<string> {
  if (!user || user.role !== 'SalesRep') {
    return new Set(mous.map((m) => m.id))
  }
  return new Set(
    mous.filter((m) => m.salesPersonId === user.id).map((m) => m.id),
  )
}

function priorityFromDays(days: number): ExceptionPriority {
  if (days >= 14) return 'alert'
  if (days >= 7) return 'attention'
  return 'neutral'
}

export function buildExceptionFeed(deps: BaseDeps): ExceptionEntry[] {
  const now = deps.now ?? new Date()
  const inScope = scopeMouIds(deps.mous, deps.user)
  const schoolById = new Map(deps.schools.map((s) => [s.id, s]))
  const mouById = new Map(deps.mous.map((m) => [m.id, m]))
  const out: ExceptionEntry[] = []

  // late-actuals
  for (const m of deps.mous) {
    if (!inScope.has(m.id)) continue
    if (
      m.status === 'Active' &&
      m.studentsActual === null &&
      m.startDate !== null &&
      new Date(m.startDate).getTime() < now.getTime()
    ) {
      const days = daysAgo(m.startDate, now)
      out.push({
        id: `late-actuals:${m.id}`,
        schoolId: m.schoolId,
        schoolName: m.schoolName,
        description: 'Actuals not yet confirmed; MOU is past start date.',
        daysSince: days,
        priority: priorityFromDays(days),
        iconType: 'late-actuals',
        href: `/mous/${m.id}/actuals`,
      })
    }
  }

  // overdue-invoice
  for (const p of deps.payments) {
    if (!inScope.has(p.mouId)) continue
    if (p.status !== 'Overdue') continue
    const m = mouById.get(p.mouId)
    if (!m) continue
    const days = daysAgo(p.dueDateIso ?? null, now)
    out.push({
      id: `overdue-invoice:${p.id}`,
      schoolId: m.schoolId,
      schoolName: m.schoolName,
      description: `Payment ${p.instalmentLabel} overdue${p.piNumber ? ` (PI ${p.piNumber})` : ''}.`,
      daysSince: days,
      priority: priorityFromDays(days),
      iconType: 'overdue-invoice',
      href: `/mous/${p.mouId}/pi`,
    })
  }

  // stuck-dispatch (>7 days in flight without progress)
  for (const d of deps.dispatches) {
    if (!inScope.has(d.mouId ?? '')) continue
    const stageStartedAt = d.dispatchedAt ?? d.poRaisedAt
    if (!stageStartedAt) continue
    if (
      (d.stage === 'po-raised' || d.stage === 'dispatched' || d.stage === 'in-transit') &&
      daysAgo(stageStartedAt, now) > 7
    ) {
      const school = schoolById.get(d.schoolId)
      const days = daysAgo(stageStartedAt, now)
      out.push({
        id: `stuck-dispatch:${d.id}`,
        schoolId: d.schoolId,
        schoolName: school?.name ?? d.schoolId,
        description: `Dispatch in stage "${d.stage}" for ${days} days.`,
        daysSince: days,
        priority: priorityFromDays(days),
        iconType: 'stuck-dispatch',
        href: d.mouId ? `/mous/${d.mouId}/dispatch` : `/schools/${d.schoolId}`,
      })
    }
  }

  // missing-feedback (delivered dispatch with no Feedback for that installment)
  const fbKeys = new Set(deps.feedback.map((f) => `${f.mouId}:${f.installmentSeq}`))
  for (const d of deps.dispatches) {
    if (!inScope.has(d.mouId ?? '')) continue
    if (d.stage !== 'delivered' && d.stage !== 'acknowledged') continue
    if (!d.deliveredAt) continue
    const days = daysAgo(d.deliveredAt, now)
    if (days < 14) continue
    if (!d.mouId) continue
    if (fbKeys.has(`${d.mouId}:${d.installmentSeq}`)) continue
    const school = schoolById.get(d.schoolId)
    out.push({
      id: `missing-feedback:${d.id}`,
      schoolId: d.schoolId,
      schoolName: school?.name ?? d.schoolId,
      description: `No feedback captured 14+ days after delivery (instalment ${d.installmentSeq}).`,
      daysSince: days,
      priority: priorityFromDays(days),
      iconType: 'missing-feedback',
      href: `/mous/${d.mouId}/feedback-request`,
    })
  }

  // failed-communication
  for (const c of deps.communications) {
    if (!inScope.has(c.mouId ?? '')) continue
    if (c.status !== 'bounced' && c.status !== 'failed') continue
    const ts = c.sentAt ?? c.queuedAt
    const days = daysAgo(ts, now)
    if (days > 14) continue
    const school = schoolById.get(c.schoolId)
    out.push({
      id: `failed-communication:${c.id}`,
      schoolId: c.schoolId,
      schoolName: school?.name ?? c.schoolId,
      description: `Communication "${c.type}" ${c.status} (${c.bounceDetail ?? 'no detail'}).`,
      daysSince: days,
      priority: priorityFromDays(days),
      iconType: 'failed-communication',
      href: c.mouId ? `/mous/${c.mouId}` : `/schools/${c.schoolId}`,
    })
  }

  const PRIORITY_ORDER: Record<ExceptionPriority, number> = {
    alert: 0,
    attention: 1,
    neutral: 2,
  }
  out.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority]
    const pb = PRIORITY_ORDER[b.priority]
    if (pa !== pb) return pa - pb
    if (a.daysSince !== b.daysSince) return b.daysSince - a.daysSince
    return a.schoolName.localeCompare(b.schoolName)
  })

  return out
}
