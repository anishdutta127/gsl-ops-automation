/*
 * /mous/[mouId]/actuals
 *
 * Lifecycle stage 1: actuals confirmation. The first stage where a
 * tester drives a real mutation through the system in Phase 1.
 *
 * Per Phase C4 hybrid scope: this is the ONE lifecycle stage with a
 * real backing API in C4 (/api/mou/actuals/confirm). The other four
 * stage pages render forms with explicit "Phase 1 note: wired in
 * Phase D" inline notes.
 *
 * Roles: Admin / SalesHead / SalesRep can submit per Item B
 * ("SalesRep gathers; SalesHead signs off"). Cross-verify
 * (per handoff: OpsHead reads the detail page) is documentation-grade
 * in Phase 1; no separate UI button. Phase 1.1 may add a
 * 'mou:verify-actuals' Action and "Verify" button on this page if
 * testers ask.
 *
 * Drift badge: appears when |variancePct| > 0.10 strictly
 * (computed by isDriftReviewRequired in confirmActuals.ts). Routing
 * to Pratik's queue is deferred to Phase D.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { isDriftReviewRequired } from '@/lib/mou/confirmActuals'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'

const allMous = mousJson as unknown as MOU[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<{ error?: string }>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-students': 'Student count must be between 1 and 20,000.',
  'mou-not-found': 'MOU not found.',
  'wrong-status': 'This MOU is not active. Confirm actuals only on Active MOUs.',
  permission: 'You do not have permission to confirm actuals.',
  'unknown-user': 'Session expired. Please sign in again.',
  'missing-mou': 'MOU id missing from request.',
}

const FIELD_INPUT_CLASS =
  'block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
const FIELD_LABEL_CLASS = 'block text-sm font-medium text-brand-navy mb-1'

export default async function ActualsPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const { error } = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const allowed = user ? canPerform(user, 'mou:confirm-actuals') : false
  const hasActuals = mou.studentsActual !== null
  const variancePct = mou.studentsVariancePct ?? 0
  const driftFlag = hasActuals && isDriftReviewRequired(variancePct)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} actuals`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Actuals' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={mou.id}
            subtitle="Confirm actual student count for instalment 1"
            metadata={[
              { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
              { label: 'MOU students', value: mou.studentsMou.toLocaleString('en-IN') },
              { label: 'Current actual', value: mou.studentsActual === null ? 'not yet confirmed' : mou.studentsActual.toLocaleString('en-IN') },
              {
                label: 'Variance',
                value: hasActuals ? `${(variancePct * 100).toFixed(2)}% (${(mou.studentsVariance ?? 0) >= 0 ? '+' : ''}${mou.studentsVariance})` : 'n/a',
              },
            ]}
          />

          {driftFlag ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-signal-attention bg-card p-3 text-sm text-foreground"
              data-testid="drift-badge"
            >
              <AlertTriangle aria-hidden className="size-4 shrink-0 text-signal-attention" />
              <div>
                <p className="font-medium text-brand-navy">Needs Sales Head review</p>
                <p className="text-xs text-muted-foreground">
                  Variance exceeds the 10% threshold. Pratik will review per Item B; queue routing wires in Phase D.
                </p>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md border border-signal-alert bg-card p-3 text-sm text-signal-alert">
              {ERROR_MESSAGES[error] ?? 'Submission failed. Please try again.'}
            </p>
          ) : null}

          {allowed ? (
            <form
              action="/api/mou/actuals/confirm"
              method="POST"
              className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
            >
              <input type="hidden" name="mouId" value={mou.id} />
              <div>
                <label htmlFor="studentsActual" className={FIELD_LABEL_CLASS}>
                  Actual student count
                </label>
                <input
                  id="studentsActual"
                  name="studentsActual"
                  type="number"
                  min="1"
                  max="20000"
                  defaultValue={mou.studentsActual ?? mou.studentsMou}
                  required
                  autoFocus
                  className={FIELD_INPUT_CLASS}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Range: 1 to 20,000. Current MOU value: {mou.studentsMou.toLocaleString('en-IN')}.
                </p>
              </div>
              <div>
                <label htmlFor="notes" className={FIELD_LABEL_CLASS}>Notes (optional)</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  className={FIELD_INPUT_CLASS}
                  placeholder="Source of count, register reference, etc."
                />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Confirm actuals
                </button>
                <Link
                  href={`/mous/${mou.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <p
              role="status"
              className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
            >
              Confirming actuals requires the SalesRep, SalesHead, or Admin role.
            </p>
          )}

        </div>
      </main>
    </>
  )
}
