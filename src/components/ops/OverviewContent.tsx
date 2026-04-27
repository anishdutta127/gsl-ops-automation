/*
 * OverviewContent (W3-F + W4-A.3).
 *
 * Shared body for /overview and /dashboard (the latter aliases the
 * former for bookmark compatibility). Both routes pass identical
 * data; the wrappers handle TopNav currentPath and the tab-active
 * indicator.
 *
 * Composes:
 *   - 5 health tiles (top row)
 *   - exception feed (max 5 visible; "View all" links to
 *     /dashboard/exceptions)
 *   - open escalations list (max 5; pass-through across cohorts)
 *   - trigger tiles (W4-A.7 dropped Legacy schools tile; grid is now
 *     up to 9 tiles depending on which factories return non-null)
 *
 * W4-A.3 cohort filtering:
 *   - `mous` is the active-only slice (kanban-first; tiles + exception
 *     feed measure the operationally-current cohort).
 *   - `allMous` is the full cohort union (active + archived). Used
 *     ONLY by the open-escalation list to look up school names for
 *     archived MOUs and surface the [archived] hint chip; an
 *     unresolved escalation on a 2025-26 MOU still needs closing.
 *   - `schools` is unfiltered; school records have no cohort
 *     concept (the same school can carry MOUs from multiple AYs).
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type {
  Communication,
  Dispatch,
  Escalation,
  Feedback,
  MOU,
  Payment,
  School,
  User,
} from '@/lib/types'
import { buildHealthTiles } from '@/lib/dashboard/health'
import { buildTriggerTiles } from '@/lib/dashboard/triggers'
import { buildExceptionFeed } from '@/lib/dashboard/exceptions'
import { HealthTile } from '@/components/ops/HealthTile'
import { TriggerTile } from '@/components/ops/TriggerTile'
import { ExceptionRow } from '@/components/ops/ExceptionRow'
import { EscalationRow } from '@/components/ops/EscalationRow'

interface OverviewContentProps {
  user: User | null
  /** Active-cohort slice; backs health tiles, exception feed, trigger tiles. */
  mous: MOU[]
  /**
   * Full cohort union (active + archived). Used only by the open-escalation
   * list so an escalation on an archived MOU still resolves to a school name
   * and surfaces an [archived] tag. Defaults to `mous` for callers that have
   * not adopted the W4-A.3 split yet.
   */
  allMous?: MOU[]
  schools: School[]
  dispatches: Dispatch[]
  payments: Payment[]
  communications: Communication[]
  feedback: Feedback[]
  escalations: Escalation[]
}

const EXCEPTION_PREVIEW = 5
const ESCALATION_PREVIEW = 5

export function OverviewContent({
  user,
  mous,
  allMous,
  schools,
  dispatches,
  payments,
  communications,
  feedback,
  escalations,
}: OverviewContentProps) {
  const cohortUnion = allMous ?? mous
  const archivedIds = new Set(
    cohortUnion.filter((m) => m.cohortStatus === 'archived').map((m) => m.id),
  )
  const mouById = new Map(cohortUnion.map((m) => [m.id, m]))

  const healthTiles = buildHealthTiles({ mous, schools, dispatches, payments, user })
  const triggerTiles = buildTriggerTiles({
    mous, schools, dispatches, escalations, communications,
  })
  const exceptions = buildExceptionFeed({
    mous, schools, dispatches, payments, communications, feedback, user,
  })
  const exceptionPreview = exceptions.slice(0, EXCEPTION_PREVIEW)
  const escalationPreview = escalations
    .filter((e) => e.status === 'open')
    .slice(0, ESCALATION_PREVIEW)

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6">
      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className="sr-only">Health</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {healthTiles.map((tile) => (
            <HealthTile
              key={tile.label}
              label={tile.label}
              primary={tile.primary}
              unit={tile.unit}
              status={tile.status}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="exceptions-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="exceptions-heading" className="font-heading text-lg font-semibold text-brand-navy">Exceptions</h2>
          <Link
            href="/dashboard/exceptions"
            className="flex items-center gap-1 text-sm text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            View all <ArrowRight aria-hidden className="size-3" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {exceptionPreview.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No exceptions right now.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="exception-list">
              {exceptionPreview.map((e) => (
                <li key={e.id}>
                  <ExceptionRow
                    schoolName={e.schoolName}
                    description={e.description}
                    daysSince={e.daysSince}
                    priority={e.priority}
                    iconType={e.iconType}
                    href={e.href}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="escalations-heading">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="escalations-heading" className="font-heading text-lg font-semibold text-brand-navy">Open escalations</h2>
          <Link
            href="/escalations"
            className="flex items-center gap-1 text-sm text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            View all <ArrowRight aria-hidden className="size-3" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {escalationPreview.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No open escalations.</p>
          ) : (
            <ul className="divide-y divide-border" data-testid="escalation-list">
              {escalationPreview.map((e) => {
                const baseName = schools.find((s) => s.id === e.schoolId)?.name ?? e.schoolId
                const isArchivedCohort =
                  e.mouId !== null
                  && e.mouId !== undefined
                  && archivedIds.has(e.mouId)
                  && mouById.get(e.mouId)?.cohortStatus === 'archived'
                const schoolName = isArchivedCohort
                  ? `${baseName} [archived]`
                  : baseName
                return (
                  <li key={e.id}>
                    <EscalationRow
                      schoolName={schoolName}
                      description={e.description}
                      daysSince={Math.max(0, Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86400000))}
                      lane={e.lane}
                      level={e.level}
                      notifiedNames={e.notifiedEmails}
                      href={`/escalations/${e.id}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="triggers-heading">
        <h2 id="triggers-heading" className="mb-2 font-heading text-lg font-semibold text-brand-navy">Triggers</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {triggerTiles.map((tile) => (
            <TriggerTile
              key={tile.label}
              label={tile.label}
              primary={tile.primary}
              threshold={tile.threshold}
              status={tile.status}
              trendDirection={tile.trendDirection}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
