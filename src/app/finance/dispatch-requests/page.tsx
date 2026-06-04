/*
 * /finance/dispatch-requests (Step 2, item 7).
 *
 * Finance view of ALL dispatch requests Ops has submitted (opsReviewStatus
 * 'Submitted to Finance'). From here Finance raises the Delivery Note and
 * notifies the warehouse. This is the Ops->Finance handoff surface of the
 * two-process model - built on the Step-1 products[] portfolio, NOT the
 * legacy raiseDispatch path (the two dispatch systems coexist).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { mouRepo } from '@/lib/db/repos/mou'
import { getCurrentUser } from '@/lib/auth/session'

export default async function FinanceDispatchRequestsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Fdispatch-requests')

  const mous = await mouRepo.findAll()
  const submitted = mous
    .filter((m) => m.opsReviewStatus === 'Submitted to Finance')
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName))

  function productSummary(m: (typeof submitted)[number]): string {
    if (!m.products || m.products.length === 0) return '-'
    return m.products
      .map((p) => {
        const grades = p.gradeSpecific
          ? (p.perGradeQuantity ?? []).map((x) => x.grade)
          : (p.grades ?? [])
        return `${p.skuName} (G${grades.join('/')})`
      })
      .join(', ')
  }

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Dispatch requests"
          subtitle="Submitted by Ops for dispatch. Raise the Delivery Note and notify the warehouse."
          breadcrumb={[{ label: 'Finance', href: '/finance' }, { label: 'Dispatch requests' }]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          {submitted.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-slate-500" data-testid="finance-dispatch-empty">
              No dispatch requests from Ops yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-card" data-testid="finance-dispatch-requests">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">School</th>
                    <th className="px-4 py-2 font-medium">MOU</th>
                    <th className="px-4 py-2 font-medium">Programme / Year</th>
                    <th className="px-4 py-2 font-medium">Products to dispatch</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submitted.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 hover:bg-muted/30" data-testid={`dispatch-request-${m.id}`}>
                      <td className="px-4 py-2 font-medium text-brand-navy">{m.schoolName}</td>
                      <td className="px-4 py-2 text-slate-600">{m.id}</td>
                      <td className="px-4 py-2 text-slate-600">{m.programme} - {m.academicYear}</td>
                      <td className="px-4 py-2 text-slate-700">{productSummary(m)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/dispatch/kits/${m.id}`} className="text-brand-navy underline-offset-2 hover:underline">
                          Raise Delivery Note
                        </Link>
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
