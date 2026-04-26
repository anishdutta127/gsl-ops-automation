/*
 * /dashboard (Surface 1: Leadership Console).
 *
 * Server Component. Reads src/data/*.json at request time; no
 * client-side fetching. Composes:
 *   - 5 health tiles (top row)
 *   - exception feed (max 5 visible; "View all" links to
 *     /dashboard/exceptions)
 *   - escalation list (max 5 visible)
 *   - 10 trigger tiles (2 rows of 5 desktop)
 *
 * Per-role data scoping via getCurrentUser passed into the
 * aggregation libs. SalesRep sees own-MOU values; other roles see
 * all. Empty data renders gracefully ("0" tiles, "No exceptions
 * right now." state copy per DESIGN.md).
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
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import dispatchesJson from '@/data/dispatches.json'
import paymentsJson from '@/data/payments.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import escalationsJson from '@/data/escalations.json'
import { getCurrentUser } from '@/lib/auth/session'
import { buildHealthTiles } from '@/lib/dashboard/health'
import { buildTriggerTiles } from '@/lib/dashboard/triggers'
import { buildExceptionFeed } from '@/lib/dashboard/exceptions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { HealthTile } from '@/components/ops/HealthTile'
import { TriggerTile } from '@/components/ops/TriggerTile'
import { ExceptionRow } from '@/components/ops/ExceptionRow'
import { EscalationRow } from '@/components/ops/EscalationRow'

const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]
const dispatches = dispatchesJson as unknown as Dispatch[]
const payments = paymentsJson as unknown as Payment[]
const communications = communicationsJson as unknown as Communication[]
const feedback = feedbackJson as unknown as Feedback[]
const escalations = escalationsJson as unknown as Escalation[]

const EXCEPTION_PREVIEW = 5
const ESCALATION_PREVIEW = 5

export default async function DashboardPage() {
  const user = await getCurrentUser()
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
    <>
      <TopNav currentPath="/dashboard" />
      <main id="main-content">
        <PageHeader title="Ops at a glance" subtitle={user ? `Signed in as ${user.name}` : undefined} />
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
                  {escalationPreview.map((e) => (
                    <li key={e.id}>
                      <EscalationRow
                        schoolName={schools.find((s) => s.id === e.schoolId)?.name ?? e.schoolId}
                        description={e.description}
                        daysSince={Math.max(0, Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86400000))}
                        lane={e.lane}
                        level={e.level}
                        notifiedNames={e.notifiedEmails}
                        href={`/escalations/${e.id}`}
                      />
                    </li>
                  ))}
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
      </main>
    </>
  )
}
