/*
 * /operations/review/[mouId] (Step 2, items 6 + 7).
 *
 * The Ops review screen of the two-process model. When Finance enters a
 * signed MOU it surfaces here as 'Pending for review'. Ops assigns the
 * product portfolio (Step 1 products[]) and aligns dispatch, then "Submit
 * to Finance for Dispatch" hands off to Finance. The relocated Dispatch +
 * Delivery Ack entries (moved off the MOU detail) live here.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { mouRepo } from '@/lib/db/repos/mou'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import { formatRs } from '@/lib/format'
import { OpsReviewProductForm } from './OpsReviewProductForm'

const NOTICES: Record<string, string> = {
  submitted: 'Submitted to Finance for Dispatch. Finance can now raise the Delivery Note.',
}
const ERRORS: Record<string, string> = {
  permission: 'Only Ops and Admin can submit for dispatch.',
  'no-products': 'Assign at least one product before submitting to Finance.',
  'save-failed': 'Save failed. Retry.',
  'not-found': 'MOU not found.',
}

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpsReviewPage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/operations/review/${mouId}`)}`)

  const [mou, inventory] = await Promise.all([
    mouRepo.findById(mouId),
    inventoryItemRepo.findAll(),
  ])
  if (!mou) notFound()

  const skus = inventory
    .filter((i) => i.active)
    .map((i) => ({ skuName: i.skuName, category: i.category, cretileGrade: i.cretileGrade }))

  const canAct = canRaiseDispatch(user!)
  const opsStatus = mou.opsReviewStatus ?? 'Pending for review'
  const hasProducts = !!mou.products && mou.products.length > 0
  const notice = typeof sp.submitted === 'string' ? 'submitted' : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const statusTone = opsStatus === 'Submitted to Finance' ? 'ok' : opsStatus === 'In Review' ? 'navy' : 'attention'

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} - Ops review`}
          subtitle={`${mou.id} - ${mou.programme} - AY ${mou.academicYear}`}
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'Review', href: '/operations/review' },
            { label: mou.schoolName },
          ]}
        />
        <div className="mx-auto max-w-screen-lg space-y-6 px-4 py-6">
          {notice && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" data-testid="ops-review-notice">
              {NOTICES[notice]}
            </div>
          )}
          {errorKey && (
            <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="ops-review-error">
              {ERRORS[errorKey] ?? errorKey}
            </div>
          )}

          <section className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-4">
            <span className="text-sm text-slate-700">Ops review status:</span>
            <StatusChip tone={statusTone} label={opsStatus} withDot={false} testId="ops-review-status-chip" />
            <span className="ml-auto text-sm text-slate-600">
              {mou.studentsMou ?? 0} students - {formatRs(mou.contractValue ?? 0)} contract
            </span>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">Product assignment</h2>
            <p className="mt-1 text-xs text-slate-600">
              Assign the dispatch portfolio (Step 1 model). Cretile is grade-banded;
              TinkRworks kits can serve multiple grades. Dispatch tracking only - this
              never affects pricing.
            </p>
            <div className="mt-3">
              <OpsReviewProductForm mouId={mou.id} skus={skus} initialProducts={mou.products ?? null} editable={canAct} />
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-brand-navy">Dispatch alignment</h2>
            <p className="mt-1 text-xs text-slate-600">Relocated here from the MOU detail (Operations owns dispatch).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/dispatch/kits/${mou.id}`} className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-slate-50" data-testid="ops-kits-dispatch-link">
                Kits dispatch (allocation)
              </Link>
              <Link href={`/mous/${mou.id}/dispatch`} className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-slate-50" data-testid="ops-dispatch-link">
                Dispatch
              </Link>
              <Link href={`/mous/${mou.id}/delivery-ack`} className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-slate-50" data-testid="ops-delivery-ack-link">
                Delivery ack
              </Link>
            </div>
          </section>

          {canAct && (
            <section className="rounded-md border border-border bg-card p-4">
              <h2 className="font-heading text-lg font-semibold text-brand-navy">Submit to Finance</h2>
              <p className="mt-1 text-xs text-slate-600">
                When products are assigned and dispatch is aligned, hand off to Finance
                to raise the Delivery Note and notify the warehouse.
              </p>
              <form method="POST" action={`/api/mou/${mou.id}/submit-to-finance`} className="mt-3">
                <button
                  type="submit"
                  disabled={!hasProducts || opsStatus === 'Submitted to Finance'}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                  data-testid="submit-to-finance"
                >
                  Submit to Finance for Dispatch
                </button>
                {!hasProducts && <p className="mt-1 text-xs text-amber-700">Assign at least one product first.</p>}
                {opsStatus === 'Submitted to Finance' && <p className="mt-1 text-xs text-emerald-700">Already submitted to Finance.</p>}
              </form>
            </section>
          )}
        </div>
      </main>
    </>
  )
}
