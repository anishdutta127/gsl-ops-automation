/*
 * /admin/pi-counter (Phase C5a-2; Q-G observability).
 *
 * Read-only health view for the proforma-invoice counter. Shows:
 *  - current `next` value, prefix, fiscal year
 *  - monotonicity indicator (ok / violation) computed from all
 *    pi-sent communications via checkMonotonicity()
 *  - last-issued PI summary (latest pi-sent communication by
 *    queuedAt)
 *
 * Permission gate: Admin or OpsHead. Other viewers redirect to
 * /dashboard. No write actions on this page; counter mutations
 * happen during PI generation (Phase D) and are tracked in MOU
 * lifecycle audit logs.
 */

import { redirect } from 'next/navigation'
import type { Communication, PiCounter } from '@/lib/types'
import piCounterJson from '@/data/pi_counter.json'
import communicationsJson from '@/data/communications.json'
import { getCurrentUser } from '@/lib/auth/session'
import { checkMonotonicity } from '@/lib/piCounter/monotonicity'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const counter = piCounterJson as PiCounter
const communications = communicationsJson as unknown as Communication[]

function lastIssuedPi(comms: Communication[]): Communication | null {
  const piComms = comms.filter((c) => c.type === 'pi-sent')
  if (piComms.length === 0) return null
  return piComms.reduce((latest, current) =>
    current.queuedAt > latest.queuedAt ? current : latest,
  )
}

export default async function PiCounterPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fpi-counter')

  const monotonicity = checkMonotonicity(communications)
  const lastIssued = lastIssuedPi(communications)
  const lastSubject = lastIssued?.subject ?? lastIssued?.bodyWhatsApp ?? null
  const nextPiNumber = `${counter.prefix}/${counter.fiscalYear}/${String(counter.next).padStart(4, '0')}`

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="PI counter"
          subtitle="Read-only health view for the proforma-invoice counter."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'PI counter' },
          ]}
        />
        <div className="mx-auto max-w-screen-md space-y-6 px-4 py-6">

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Next PI number
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-brand-navy">
            {nextPiNumber}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Prefix {counter.prefix} · Fiscal year {counter.fiscalYear} · Counter{' '}
            {counter.next}
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Monotonicity
          </p>
          {monotonicity.ok ? (
            <p
              className="mt-1 text-lg font-semibold text-signal-ok"
              data-testid="monotonicity-status"
            >
              OK
            </p>
          ) : (
            <p
              className="mt-1 text-lg font-semibold text-signal-alert"
              data-testid="monotonicity-status"
            >
              Violation
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {monotonicity.issuedCount} issued
            {monotonicity.skippedCount > 0
              ? `, ${monotonicity.skippedCount} skipped (no parseable PI number)`
              : ''}
            {monotonicity.highestSeq !== null
              ? `. Highest seq ${monotonicity.highestSeq}.`
              : '.'}
          </p>
          {monotonicity.firstViolation ? (
            <p className="mt-2 rounded-md border border-signal-alert bg-signal-alert/10 px-2 py-1 text-xs text-signal-alert">
              First violation at communication{' '}
              {monotonicity.firstViolation.communicationId}: previous seq{' '}
              {monotonicity.firstViolation.previousSeq}, current seq{' '}
              {monotonicity.firstViolation.currentSeq}.
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-brand-navy">
          Last-issued PI
        </h2>
        {lastIssued ? (
          <div className="mt-2 rounded-md border border-border bg-card p-4">
            <p className="text-sm text-brand-navy">
              {lastSubject ?? '(no subject parseable)'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Queued {lastIssued.queuedAt.slice(0, 10)} by {lastIssued.queuedBy}
              {' '}via {lastIssued.channel}. Status {lastIssued.status}.
            </p>
          </div>
        ) : (
          <p className="mt-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No PIs issued yet.
          </p>
        )}
      </section>
        </div>
      </main>
    </>
  )
}
