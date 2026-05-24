/*
 * /dispatch/kits (Gate 3 Step 2: Kits for Dispatch list view).
 *
 * Central tracking dashboard for kit dispatches per joint spec section 2.
 * Columns: School Name | Payment Status | Product Selected | Dispatch
 * Status. Entry appears only after MOU lifecycle is complete (see
 * deriveKitDispatchListRows for the eligibility rule). Payment status
 * pulls live from payments.json; never stored on the KitDispatch.
 *
 * All departments can VIEW (no department gate); Ops + Admin edit per
 * canAllocateKits which is enforced on the detail page and API routes.
 *
 * Visual: Ops orange accent (Dispatch is an Ops-owned stage).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PaymentStatus } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { accentFor } from '@/lib/departmentAccents'
import { getCurrentUser } from '@/lib/auth/session'
import { deriveKitDispatchListRows } from '@/lib/kitDispatch/derive'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const DISPATCH_STATUS_TONE: Record<string, StatusChipTone> = {
  'Not Started': 'neutral',
  Pending: 'attention',
  'In Transit': 'navy',
  Delivered: 'ok',
}

const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusChipTone> = {
  Received: 'ok',
  Paid: 'ok',
  Pending: 'neutral',
  Overdue: 'alert',
  Partial: 'attention',
  'Due Soon': 'attention',
  'PI Sent': 'navy',
  Cancelled: 'neutral',
  Skipped: 'neutral',
}

function readParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = sp[key]
  if (typeof v === 'string') return v
  return 'all'
}

export default async function KitsForDispatchListPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdispatch%2Fkits')

  const sp = await searchParams
  const paymentFilter = readParam(sp, 'payment')
  const dispatchFilter = readParam(sp, 'dispatch')
  const productFilter = readParam(sp, 'product')
  const salesRepFilter = readParam(sp, 'salesRep')
  const regionFilter = readParam(sp, 'region')

  const [mous, kitDispatches, payments, schools, salesTeam] = await Promise.all([
    mouRepo.findAll(),
    kitDispatchRepo.findAll(),
    paymentRepo.findAll(),
    schoolRepo.findAll(),
    salesTeamRepo.findAll(),
  ])

  const schoolRegionByMouId: Record<string, string | null> = {}
  const schoolById = new Map(schools.map((s) => [s.id, s]))
  for (const mou of mous) {
    const sc = schoolById.get(mou.schoolId)
    schoolRegionByMouId[mou.id] = sc?.region ?? null
  }

  const rows = deriveKitDispatchListRows({
    mous,
    kitDispatches,
    payments,
    schoolRegionByMouId,
  })

  const filtered = rows.filter((r) => {
    if (paymentFilter !== 'all' && r.paymentStatus !== paymentFilter) return false
    if (dispatchFilter !== 'all' && r.dispatchStatus !== dispatchFilter) return false
    if (productFilter !== 'all') {
      if (productFilter === 'unset') {
        if (r.productSelected !== null) return false
      } else if (r.productSelected !== productFilter) return false
    }
    if (salesRepFilter !== 'all' && r.salesPersonId !== salesRepFilter) return false
    if (regionFilter !== 'all' && r.region !== regionFilter) return false
    return true
  })

  const accent = accentFor('ops')
  const inputClass =
    'mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

  const distinctRegions = Array.from(
    new Set(rows.map((r) => r.region).filter((v): v is string => !!v)),
  ).sort()
  const activeReps = salesTeam.filter((sp) => sp.active)

  return (
    <>
      <TopNav currentPath="/dispatch" />
      <main id="main-content">
        <PageHeader
          title="Kits for Dispatch"
          subtitle={`${rows.length} school${rows.length === 1 ? '' : 's'} ready for dispatch. Payment status pulls live from the Payment module.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Dispatch', href: '/dispatch' },
            { label: 'Kits for Dispatch' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          <div
            className={
              'rounded-md border border-border border-l-4 bg-card p-4 text-sm ' +
              accent.cardBorderClass
            }
            data-testid="kits-dispatch-summary"
          >
            <span
              className={
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ' +
                accent.badgeBgClass +
                ' ' +
                accent.badgeTextClass
              }
            >
              Operations
            </span>
            <p className="mt-2 text-sm text-slate-700">
              Click a school to allocate kits per grade. Allocation routes to
              Sales for approval, then Accounts for dispatch execution.
            </p>
          </div>

          <form
            method="GET"
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
            data-testid="kits-dispatch-filters"
          >
            <div>
              <label htmlFor="filter-payment" className="block text-xs font-medium text-brand-navy">
                Payment
              </label>
              <select
                id="filter-payment"
                name="payment"
                defaultValue={paymentFilter}
                className={inputClass}
              >
                <option value="all">All</option>
                <option value="Received">Received</option>
                <option value="Partial">Partial</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
                <option value="PI Sent">PI Sent</option>
                <option value="Due Soon">Due Soon</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-dispatch" className="block text-xs font-medium text-brand-navy">
                Dispatch
              </label>
              <select
                id="filter-dispatch"
                name="dispatch"
                defaultValue={dispatchFilter}
                className={inputClass}
              >
                <option value="all">All</option>
                <option value="Not Started">Not Started</option>
                <option value="Pending">Pending</option>
                <option value="In Transit">In Transit</option>
                <option value="Delivered">Delivered</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-product" className="block text-xs font-medium text-brand-navy">
                Product
              </label>
              <select
                id="filter-product"
                name="product"
                defaultValue={productFilter}
                className={inputClass}
              >
                <option value="all">All</option>
                <option value="TinkRworks">TinkRworks</option>
                <option value="Cretile">Cretile</option>
                <option value="Both">Both</option>
                <option value="unset">Not yet set</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-sales-rep" className="block text-xs font-medium text-brand-navy">
                Sales rep
              </label>
              <select
                id="filter-sales-rep"
                name="salesRep"
                defaultValue={salesRepFilter}
                className={inputClass}
              >
                <option value="all">All</option>
                {activeReps.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-region" className="block text-xs font-medium text-brand-navy">
                Region
              </label>
              <select
                id="filter-region"
                name="region"
                defaultValue={regionFilter}
                className={inputClass}
              >
                <option value="all">All</option>
                {distinctRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="min-h-11 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
            >
              Apply
            </button>
          </form>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-border bg-card">
              <EmptyState
                title="No kits-for-dispatch rows match the current filters."
                description="Clear the filters to see every eligible MOU."
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="min-w-full divide-y divide-border" data-testid="kits-dispatch-list">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-3 font-medium">School name</th>
                    <th className="px-3 py-3 font-medium">Payment status</th>
                    <th className="px-3 py-3 font-medium">Product selected</th>
                    <th className="px-3 py-3 font-medium">Dispatch status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      data-testid={`kits-dispatch-row-${row.mouId}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-3 py-3">
                        <Link
                          href={`/dispatch/kits/${encodeURIComponent(row.mouId)}`}
                          className="font-medium text-brand-navy underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        >
                          {row.schoolName}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {row.mouId}
                          {row.region ? ` · ${row.region}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          tone={PAYMENT_STATUS_TONE[row.paymentStatus] ?? 'neutral'}
                          label={row.paymentStatus}
                          withDot={false}
                          testId={`payment-status-${row.mouId}`}
                        />
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {row.productSelected ?? (
                          <span className="text-slate-400">: not set :</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip
                          tone={DISPATCH_STATUS_TONE[row.dispatchStatus] ?? 'neutral'}
                          label={row.dispatchStatus}
                          withDot={false}
                          testId={`dispatch-status-${row.mouId}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {rows.length} eligible MOUs. Entries
            appear once the MOU is signed (status Active or later) and
            disappear when archived per cohort policy.
          </p>
        </div>
      </main>
    </>
  )
}
