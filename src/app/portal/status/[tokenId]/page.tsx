/*
 * /portal/status/[tokenId] (Phase C6).
 *
 * Server Component, mobile-first 375px. Read-only SPOC status portal
 * with HMAC-gated entry. The token's purpose must be 'status-view'
 * (multi-use, 30-day expiry per Update 2). Each successful GET
 * enqueues an update to lastViewedAt + viewCount.
 *
 * Phase 1 acceptable cost: every page load triggers a queue write.
 * In a 5-tester environment this is a few writes per day; not worth
 * debouncing yet. Phase 1.1 trigger: if the queue depth metric
 * shows status-view writes dominating, batch them via a separate
 * `status-view-pulse` API route called once per session.
 *
 * Lifecycle data is sourced from the MOU + matching Communications
 * + Feedback / Dispatch records. The lifecycleProgress helper is
 * shared with the email status block so the two surfaces cannot
 * disagree.
 */

import { redirect } from 'next/navigation'
import type {
  Communication,
  Dispatch,
  Feedback,
  MOU,
  MagicLinkToken,
  School,
} from '@/lib/types'
import magicLinkTokensJson from '@/data/magic_link_tokens.json'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import communicationsJson from '@/data/communications.json'
import feedbackJson from '@/data/feedback.json'
import dispatchesJson from '@/data/dispatches.json'
import { verifyMagicLink } from '@/lib/magicLink'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { computeLifecycle } from '@/lib/portal/lifecycleProgress'
import { LifecycleProgress } from '@/components/ops/LifecycleProgress'
import { formatRs, formatDate, formatPct } from '@/lib/format'

const tokens = magicLinkTokensJson as unknown as MagicLinkToken[]
const mous = mousJson as unknown as MOU[]
const schools = schoolsJson as unknown as School[]
const communications = communicationsJson as unknown as Communication[]
const feedbacks = feedbackJson as unknown as Feedback[]
const dispatches = dispatchesJson as unknown as Dispatch[]

function pickFirstDate(comms: Communication[], type: Communication['type']): string | null {
  const matching = comms.filter((c) => c.type === type)
  if (matching.length === 0) return null
  return matching.reduce((earliest, current) =>
    current.queuedAt < earliest.queuedAt ? current : earliest,
  ).queuedAt
}

function piNumberFor(comms: Communication[]): string | null {
  const pi = comms.find((c) => c.type === 'pi-sent')
  if (!pi || !pi.subject) return null
  const match = pi.subject.match(/(GSL\/[A-Z]+\/[0-9-]+\/\d{4,})/)
  return match ? match[1]! : null
}

export default async function StatusPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ tokenId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tokenId } = await params
  const sp = await searchParams
  const hmac = typeof sp.h === 'string' ? sp.h : ''

  const token = tokens.find((t) => t.id === tokenId)
  if (!token || token.purpose !== 'status-view') {
    redirect('/portal/status/link-expired')
  }

  const valid = verifyMagicLink(
    {
      purpose: token.purpose,
      mouId: token.mouId,
      installmentSeq: token.installmentSeq,
      spocEmail: token.spocEmail,
      issuedAt: token.issuedAt,
    },
    hmac,
  )
  if (!valid) {
    redirect('/portal/status/link-expired')
  }

  const now = new Date()
  if (token.expiresAt && new Date(token.expiresAt) <= now) {
    redirect('/portal/status/link-expired')
  }

  const mou = mous.find((m) => m.id === token.mouId)
  if (!mou) {
    redirect('/portal/status/link-expired')
  }

  const school = schools.find((s) => s.id === mou.schoolId)
  const mouComms = communications.filter((c) => c.mouId === token.mouId)
  const mouFeedback = feedbacks.find(
    (f) => f.mouId === token.mouId && f.installmentSeq === token.installmentSeq,
  )
  const mouDispatches = dispatches.filter((d) => d.mouId === token.mouId)

  const lifecycle = computeLifecycle({
    mouSignedDate: mou.startDate,
    actualsConfirmedDate: mou.studentsActual !== null ? mou.startDate : null,
    crossVerifiedDate: null,
    invoiceRaisedDate: pickFirstDate(mouComms, 'pi-sent'),
    invoiceNumber: piNumberFor(mouComms),
    paymentReceivedDate:
      pickFirstDate(mouComms, 'payment-received-confirmation'),
    dispatchedDate: mouDispatches[0]?.dispatchedAt ?? null,
    deliveredDate: mouDispatches[0]?.deliveredAt ?? null,
    feedbackSubmittedDate: mouFeedback?.submittedAt ?? null,
    expectedNextActionDate: null,
  })

  const programmeLine = `${mou.programme}${mou.programmeSubType ? ` - ${mou.programmeSubType}` : ''} - Instalment ${token.installmentSeq}`

  // Phase 1 read-mutation: bump lastViewedAt + viewCount on every GET.
  // Deliberately fire-and-forget (no await) so a queue stall does not
  // delay rendering. Phase 1.1 may batch these per session.
  void enqueueUpdate({
    queuedBy: 'system',
    entity: 'magicLinkToken',
    operation: 'update',
    payload: {
      ...token,
      lastViewedAt: now.toISOString(),
      viewCount: token.viewCount + 1,
    } as unknown as Record<string, unknown>,
  }).catch(() => {
    // Status portal rendering must not fail because the queue is
    // unavailable. View-count drift is acceptable.
  })

  const stageNotCompleted = lifecycle.find((s) => s.status !== 'completed')
  const nextMilestoneText = stageNotCompleted
    ? stageNotCompleted.label
    : 'MOU is complete. Thanks for your engagement this academic year.'

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">
          {school?.name ?? mou.schoolName}
        </h1>
        <p className="mt-1 text-sm text-slate-700">{programmeLine}</p>
      </header>

      <section aria-labelledby="lifecycle-heading" className="mb-8">
        <h2 id="lifecycle-heading" className="sr-only">
          Lifecycle progress
        </h2>
        <LifecycleProgress stages={lifecycle} />
      </section>

      <section
        aria-labelledby="installment-heading"
        className="mb-6 rounded-md border border-slate-200 bg-white p-4"
      >
        <h2
          id="installment-heading"
          className="text-base font-bold text-[var(--brand-navy)]"
        >
          Instalment {token.installmentSeq} summary
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Contract value
            </dt>
            <dd className="mt-0.5 font-semibold text-[var(--brand-navy)]">
              {formatRs(mou.contractValue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Received
            </dt>
            <dd className="mt-0.5 font-semibold text-[var(--brand-navy)]">
              {formatRs(mou.received)}
              <span className="ml-2 text-xs font-normal text-slate-600">
                ({formatPct(mou.receivedPct / 100)})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Pending
            </dt>
            <dd className="mt-0.5 font-semibold text-[var(--brand-navy)]">
              {formatRs(mou.balance)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              Schedule
            </dt>
            <dd className="mt-0.5 text-foreground">{mou.paymentSchedule || '-'}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-[var(--brand-navy)]">
          What&rsquo;s next
        </h2>
        <p className="mt-2 text-sm text-foreground">{nextMilestoneText}</p>
        {stageNotCompleted?.date ? (
          <p className="mt-1 text-xs text-slate-600">
            Expected by {formatDate(stageNotCompleted.date)}
          </p>
        ) : null}
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
        <p>
          Live data as of {formatDate(now.toISOString())}. Sent to{' '}
          {token.spocEmail}.
        </p>
      </footer>
    </div>
  )
}
