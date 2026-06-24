/*
 * /work - Overview landing (Phase 1.3).
 *
 * Product-first daily landing: one card per product (programme today; Phase 1.4
 * makes the product set an admin-managed registry) showing live health -
 * #MOUs, #students, total contract value, outstanding. Each card links to that
 * product's MOU list (filtered) and an Add MOU action.
 *
 * Reads live at request time (getCurrentUser forces dynamic); aggregates the
 * same MOU fields the finance/ops dashboards use, so the numbers agree.
 *
 * The role-scoped daily boards still live at /work/finance, /work/ops,
 * /work/admin (reachable from the "My ... work" nav items); this index no
 * longer redirects to them.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Plus } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { mouRepo } from '@/lib/db/repos/mou'
import type { MOU, Programme } from '@/lib/types'
import { formatRs, formatCount } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Phase 1.3: the current product set is the four live programmes. Phase 1.4
// replaces this with the admin-managed registry seeded from the finance
// taxonomy.
const PRODUCTS: Programme[] = ['STEAM', 'Young Pioneers', 'Harvard HBPE', 'Robotics']

interface ProductHealth {
  product: Programme
  mous: number
  students: number
  value: number
  outstanding: number
}

function computeHealth(mous: MOU[]): ProductHealth[] {
  const byProduct = new Map<Programme, ProductHealth>()
  for (const p of PRODUCTS) {
    byProduct.set(p, { product: p, mous: 0, students: 0, value: 0, outstanding: 0 })
  }
  for (const m of mous) {
    const slot = byProduct.get(m.programme as Programme)
    if (!slot) continue
    slot.mous += 1
    slot.students += m.studentsActual ?? m.studentsMou ?? 0
    slot.value += m.contractValue ?? 0
    slot.outstanding += m.balance ?? 0
  }
  return PRODUCTS.map((p) => byProduct.get(p)!)
}

export default async function OverviewPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fwork')

  const allMous = (await mouRepo.findAll()) as MOU[]
  const health = computeHealth(allMous)

  return (
    <>
      <TopNav currentPath="/work" />
      <main id="main-content">
        <PageHeader
          title="Overview"
          subtitle="Your products at a glance. Open a product to see its MOUs or add a new one."
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {health.map((h) => {
              const programmeParam = encodeURIComponent(h.product)
              return (
                <li
                  key={h.product}
                  className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm"
                >
                  <h2 className="font-heading text-base font-semibold text-brand-navy">
                    {h.product}
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                    <Stat label="MOUs" value={formatCount(h.mous)} />
                    <Stat label="Students" value={formatCount(h.students)} />
                    <Stat label="Total value" value={formatRs(h.value)} />
                    <Stat label="Outstanding" value={formatRs(h.outstanding)} tone="attention" />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    <Link
                      href={`/mous?programme=${programmeParam}`}
                      data-testid={`product-view-${h.product}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                    >
                      View MOUs <ArrowRight aria-hidden className="size-4" />
                    </Link>
                    <Link
                      href="/mous/upload"
                      data-testid={`product-add-${h.product}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      <Plus aria-hidden className="size-4" /> Add MOU
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </main>
    </>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'attention'
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={
          'mt-0.5 font-heading text-lg font-semibold tabular-nums ' +
          (tone === 'attention' ? 'text-signal-attention' : 'text-brand-navy')
        }
      >
        {value}
      </dd>
    </div>
  )
}
