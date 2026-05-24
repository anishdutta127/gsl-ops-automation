/*
 * /dispatch/kits/summary (Gate 3 Step 9: Final Dispatch Summary).
 *
 * Read-only flat view of every KitDispatch with CSV export. All
 * departments can view; no edit affordances.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
// P4 batch 2 (2026-05-24): live repo reads.
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { schoolRepo } from '@/lib/db/repos/school'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { getCurrentUser } from '@/lib/auth/session'
import { deriveSummaryRows } from '@/lib/kitDispatch/summaryView'

// Module-scope consts removed; loaded inside the async server component.

const DISPATCH_STATUS_TONE: Record<string, StatusChipTone> = {
  'Not Started': 'neutral',
  Pending: 'attention',
  'In Transit': 'navy',
  Delivered: 'ok',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const v = sp[key]
  if (typeof v === 'string') return v
  return 'all'
}

export default async function FinalDispatchSummaryPage({ searchParams }: PageProps) {
  // P4 batch 2 (2026-05-24): live repo reads.
  const [mous, kitDispatches, schools, salesTeam] = await Promise.all([
    mouRepo.findAll(),
    kitDispatchRepo.findAll(),
    schoolRepo.findAll(),
    salesTeamRepo.findAll(),
  ])
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdispatch%2Fkits%2Fsummary')
  const sp = await searchParams
  const dispatchFilter = readParam(sp, 'dispatch')
  const productFilter = readParam(sp, 'product')
  const salesRepFilter = readParam(sp, 'salesRep')
  const regionFilter = readParam(sp, 'region')

  const rows = deriveSummaryRows({ kitDispatches, mous, schools })

  const filtered = rows.filter((r) => {
    if (dispatchFilter !== 'all' && r.dispatchStatus !== dispatchFilter) return false
    if (productFilter !== 'all' && r.productSelected !== productFilter) return false
    if (salesRepFilter !== 'all' && r.salesPersonId !== salesRepFilter) return false
    if (regionFilter !== 'all' && r.region !== regionFilter) return false
    return true
  })

  const distinctRegions = Array.from(
    new Set(rows.map((r) => r.region).filter((v): v is string => !!v)),
  ).sort()
  const activeReps = salesTeam.filter((s) => s.active)
  const inputClass =
    'mt-1 min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'

  return (
    <>
      <TopNav currentPath="/dispatch" />
      <main id="main-content">
        <PageHeader
          title="Final dispatch summary"
          subtitle={`${rows.length} dispatch record${rows.length === 1 ? '' : 's'}. Read-only flat view across every school.`}
          breadcrumb={[
            { label: 'Dispatch', href: '/dispatch' },
            { label: 'Kits for Dispatch', href: '/dispatch/kits' },
            { label: 'Final summary' },
          ]}
          actions={
            <a
              href="/api/dispatch/kits/summary/csv"
              className="min-h-11 inline-flex items-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50"
              data-testid="csv-export"
            >
              Export CSV
            </a>
          }
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
          <form
            method="GET"
            className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-3"
            data-testid="summary-filters"
          >
            <div>
              <label htmlFor="filter-dispatch" className="block text-xs font-medium text-brand-navy">
                Dispatch status
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
                title="No dispatch records match the current filters."
                description="Clear the filters or wait for the first kit allocation."
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="min-w-full divide-y divide-border" data-testid="summary-table">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-3 font-medium">School</th>
                    <th className="px-3 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 font-medium">Dispatched qty</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">POD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.dispatchId} data-testid={`summary-row-${r.dispatchId}`}>
                      <td className="px-3 py-3">
                        <Link
                          href={`/dispatch/kits/${encodeURIComponent(r.mouId)}`}
                          className="font-medium text-brand-navy underline-offset-2 hover:underline"
                        >
                          {r.schoolName}
                        </Link>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.mouId}
                          {r.region ? ` · ${r.region}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">{r.productSelected}</td>
                      <td className="px-3 py-3 text-sm font-mono">{r.totalDispatchedQty}</td>
                      <td className="px-3 py-3">
                        <StatusChip
                          tone={DISPATCH_STATUS_TONE[r.dispatchStatus] ?? 'neutral'}
                          label={r.dispatchStatus}
                          withDot={false}
                          testId={`summary-status-${r.dispatchId}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {r.podPath ? (
                          <a
                            href={r.podPath}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-brand-navy underline-offset-2 hover:underline"
                            data-testid={`pod-link-${r.dispatchId}`}
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">: none :</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
