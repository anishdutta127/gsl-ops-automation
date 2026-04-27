/*
 * /mous/[mouId]/dispatch
 *
 * Dispatch raise + state-transition surface. Per Phase C4 hybrid:
 * form renders + role gates, but submit is a 501 stub. Real
 * implementation lands in Phase D when the dispatch-note docx
 * template + state-transition lib come online.
 *
 * Roles: Admin + OpsHead per 'mou:raise-dispatch' (advisory only post
 * Week 3 W3-B). Page-level UI gate removed; the form renders for any
 * authenticated user. Server-side canPerform() in lib/dispatch/raiseDispatch.ts
 * still enforces at submit time. P2 gate uses the existing isGateUnblocked
 * predicate from Phase A2.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Info } from 'lucide-react'
import type { Dispatch, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import { getCurrentUser } from '@/lib/auth/session'
import { isGateUnblocked } from '@/lib/dispatch/overrideAudit'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]

interface PageProps {
  params: Promise<{ mouId: string }>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function DispatchPage({ params }: PageProps) {
  const { mouId } = await params
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const mouDispatches = allDispatches.filter((d) => d.mouId === mou.id)

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} dispatch`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Dispatch' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">

          <DetailHeaderCard
            title={mou.id}
            subtitle="Raise PO and progress dispatch state"
            metadata={[
              { label: 'School', value: mou.schoolName },
              { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
              { label: 'Dispatches on file', value: String(mouDispatches.length) },
            ]}
          />

          <p className="flex items-start gap-2 rounded-md border border-signal-attention bg-card p-3 text-xs text-foreground">
            <Info aria-hidden className="size-4 shrink-0 text-signal-attention" />
            <span>
              Phase 1 note: this submit endpoint is wired in Phase D. The P2 gate predicate (isGateUnblocked) is already live from Phase A2; the docx-render and state-transition land alongside the API.
            </span>
          </p>

          <section aria-labelledby="dispatches-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h3 id="dispatches-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
              Existing dispatches
            </h3>
            {mouDispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dispatches raised yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {mouDispatches.map((d) => {
                  const gate = isGateUnblocked(d)
                  return (
                    <li key={d.id} className="py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">Inst {d.installmentSeq}</span>{' '}
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{d.stage}</span>{' '}
                      <span className={gate ? 'text-signal-ok' : 'text-signal-alert'}>
                        gate {gate ? 'open' : 'blocked'}
                      </span>
                      {d.overrideEvent ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (P2 override by {d.overrideEvent.overriddenBy})
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <form
            action="/api/dispatch/generate"
            method="POST"
            className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Raise dispatch
              </button>
              <Link
                href={`/mous/${mou.id}`}
                className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Cancel
              </Link>
            </div>
          </form>

        </div>
      </main>
    </>
  )
}
