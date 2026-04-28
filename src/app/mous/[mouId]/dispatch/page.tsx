/*
 * /mous/[mouId]/dispatch (W4-D.4 Ops surface, repurposed).
 *
 * Workflow-state-aware (Specific C path (a)). Renders three sections:
 *
 *   1. Pending DispatchRequests for this MOU: links to the detail
 *      page where Ops approves / rejects / converts. Avoids the
 *      "Ops doesn't know Sales already requested" failure mode.
 *   2. Existing Dispatches: same list as the W3 surface.
 *   3. Direct-raise form: installmentSeq dropdown is now wired
 *      (was missing in the W3 form bug). Submit goes to
 *      /api/dispatch/generate which calls raiseDispatch.ts; that
 *      lib derives line items from the MOU programme (matches W4-D.1
 *      raisedFrom='ops-direct' default). Custom multi-SKU dispatches
 *      flow through the Sales request path (/dispatch/request).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Dispatch, DispatchRequest, InventoryItem, MOU, User } from '@/lib/types'
import mousJson from '@/data/mous.json'
import dispatchesJson from '@/data/dispatches.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import { getCurrentUser } from '@/lib/auth/session'
import { isGateUnblocked } from '@/lib/dispatch/overrideAudit'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { DetailHeaderCard } from '@/components/ops/DetailHeaderCard'
import { InventoryStatusPanel } from '@/components/ops/InventoryStatusPanel'

const allMous = mousJson as unknown as MOU[]
const allDispatches = dispatchesJson as unknown as Dispatch[]
const allRequests = dispatchRequestsJson as unknown as DispatchRequest[]
const allInventoryItems = inventoryItemsJson as unknown as InventoryItem[]

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to raise a dispatch.',
  'unknown-user': 'Session user not found. Please log in again.',
  'mou-not-found': 'MOU not found.',
  'school-not-found': 'School not found.',
  'wrong-status': 'MOU is not Active; cannot raise a dispatch.',
  'gate-locked': 'Payment not received and no P2 override on file. Gate is blocked.',
  'template-missing': 'Dispatch template is not authored. Contact Ops.',
  'invalid-installment-seq': 'Pick an installment number from the dropdown.',
  'missing-mou': 'MOU id is required.',
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

function totalInstallmentsFor(paymentSchedule: string): number {
  const numbers = paymentSchedule.match(/\d+/g)
  return numbers && numbers.length > 1 ? numbers.length : 1
}

export default async function DispatchPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()

  const mouDispatches = allDispatches.filter((d) => d.mouId === mou.id)
  const pendingRequests = allRequests.filter(
    (r) => r.mouId === mou.id && r.status === 'pending-approval',
  )
  const totalInstallments = totalInstallmentsFor(mou.paymentSchedule)

  // Installments that already have a Dispatch on file; greyed out in the dropdown.
  const usedInstallments = new Set(mouDispatches.map((d) => d.installmentSeq))

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/mous" />
      <PageHeader
        title={`${mou.schoolName} dispatch`}
        breadcrumb={[
          { label: 'MOUs', href: '/mous' },
          { label: mou.id, href: `/mous/${mou.id}` },
          { label: 'Dispatch' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        {errorMessage ? (
          <div role="alert" className="rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert">
            {errorMessage}
          </div>
        ) : null}

        <DetailHeaderCard
          title={mou.id}
          subtitle="Convert pending requests, raise direct, or progress dispatch state"
          metadata={[
            { label: 'School', value: mou.schoolName },
            { label: 'Programme', value: `${mou.programme}${mou.programmeSubType ? ' / ' + mou.programmeSubType : ''}` },
            { label: 'Pending requests', value: String(pendingRequests.length) },
            { label: 'Dispatches on file', value: String(mouDispatches.length) },
          ]}
        />

        {pendingRequests.length > 0 ? (
          <section
            aria-labelledby="pending-requests-heading"
            data-testid="pending-requests-section"
            className="rounded-lg border border-signal-warn bg-signal-warn/5 p-4 sm:p-6"
          >
            <h3 id="pending-requests-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
              Pending dispatch requests for this MOU
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Sales submitted these requests; review and convert via the dispatch-requests admin
              before raising direct.
            </p>
            <ul className="divide-y divide-border">
              {pendingRequests.map((r) => {
                let total = 0
                for (const i of r.lineItems) {
                  if (i.kind === 'flat') total += i.quantity
                  else for (const a of i.gradeAllocations) total += a.quantity
                }
                return (
                  <li key={r.id} data-testid={`pending-dr-row-${r.id}`} className="py-2 text-sm">
                    <Link
                      href={`/admin/dispatch-requests/${r.id}`}
                      className="font-mono font-medium text-brand-navy underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      {r.id}
                    </Link>{' '}
                    <span className="text-muted-foreground">·</span>{' '}
                    Inst {r.installmentSeq}{' '}
                    <span className="text-muted-foreground">·</span>{' '}
                    {r.lineItems.length} line(s), total qty {total}{' '}
                    <span className="text-muted-foreground">·</span>{' '}
                    Reason: &ldquo;{r.requestReason}&rdquo;
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        <InventoryStatusPanel
          programme={mou.programme}
          programmeSubType={mou.programmeSubType}
          inventoryItems={allInventoryItems}
        />

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
                  <li key={d.id} data-testid={`dispatch-row-${d.id}`} className="py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{d.id}</span>{' '}
                    <span className="font-medium">Inst {d.installmentSeq}</span>{' '}
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{d.stage}</span>{' '}
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{d.raisedFrom}</span>{' '}
                    <span className={gate ? 'text-signal-ok' : 'text-signal-alert'}>
                      gate {gate ? 'open' : 'blocked'}
                    </span>
                    {d.lineItems.length > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({d.lineItems.length} line item{d.lineItems.length === 1 ? '' : 's'})
                      </span>
                    ) : null}
                    {d.overrideEvent ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (P2 override by {d.overrideEvent.overriddenBy})
                      </span>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={`/api/dispatch/${encodeURIComponent(d.id)}/handover-worksheet`}
                        data-testid={`handover-link-${d.id}`}
                        download
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        aria-label={`Download handover worksheet for ${d.id}`}
                      >
                        <svg aria-hidden className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Worksheet
                      </a>
                      <a
                        href={`/api/dispatch/${encodeURIComponent(d.id)}/dispatch-note`}
                        data-testid={`dispatch-note-link-${d.id}`}
                        download
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        aria-label={`Download dispatch note for ${d.id}`}
                      >
                        <svg aria-hidden className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Note
                      </a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="direct-raise-heading"
          data-testid="direct-raise-section"
          className="rounded-lg border border-border bg-card p-4 sm:p-6"
        >
          <h3 id="direct-raise-heading" className="mb-3 font-heading text-base font-semibold text-brand-navy">
            Raise direct dispatch
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            For the standard programme kit set, raise a Dispatch directly. Multi-SKU /
            per-grade requests should flow through{' '}
            <Link href={`/dispatch/request?mouId=${encodeURIComponent(mou.id)}`} className="underline">
              /dispatch/request
            </Link>
            . Auto-derives line items from the MOU programme.
          </p>
          <form
            action="/api/dispatch/generate"
            method="POST"
            className="space-y-4"
          >
            <input type="hidden" name="mouId" value={mou.id} />
            <div className="w-full max-w-xs">
              <label htmlFor="installmentSeq" className="block text-sm font-medium text-brand-navy mb-1">
                Installment number
              </label>
              <select
                id="installmentSeq"
                name="installmentSeq"
                required
                defaultValue=""
                className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <option value="" disabled>Pick installment...</option>
                {Array.from({ length: totalInstallments }, (_, i) => i + 1).map((n) => {
                  const used = usedInstallments.has(n)
                  return (
                    <option key={n} value={n} disabled={used}>
                      Installment {n} of {totalInstallments}{used ? ' (already raised)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <button
                type="submit"
                data-testid="direct-raise-submit"
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
        </section>

      </div>
    </>
  )
}
