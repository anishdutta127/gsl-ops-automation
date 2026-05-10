/*
 * /finance (Gate 1 Step 3 stage landing page).
 *
 * Finance stage entry. PI generation + Tally export migrate in Gate
 * 2 from gsl-mou-system; for Gate 1 the page is a thin index card
 * surface that points at the existing payment + adjustment routes.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { accentFor } from '@/lib/departmentAccents'

const ENTITIES = [
  {
    label: 'PI generation',
    href: '/admin/pi-counter',
    description: 'Sequential per-GSTIN PI counters (Gate 2 lifts the full module from gsl-mou-system).',
  },
  {
    label: 'Payment matching',
    href: '/mous',
    description: 'Per-MOU payment receipt + reconciliation lives on the MOU detail page.',
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    description: 'Per-SKU stock and reorder thresholds.',
  },
  {
    label: 'Adjustments',
    href: '/finance',
    description: 'Adjustment-as-line-item lifecycle (Gate 2 wires the data flow).',
  },
]

export default async function FinanceStagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance')
  const accent = accentFor('finance')

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          <header
            className={
              'rounded-md border border-border border-l-4 bg-card p-6 ' +
              accent.cardBorderClass
            }
          >
            <span
              className={
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ' +
                accent.badgeBgClass +
                ' ' +
                accent.badgeTextClass
              }
            >
              Finance stage
            </span>
            <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              Finance workspace
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              PI generation, payment matching, Tally export, adjustments. Full module migrates in Gate 2.
            </p>
          </header>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ENTITIES.map((entity) => (
              <li key={entity.href}>
                <Link
                  href={entity.href}
                  className={
                    'group flex items-center justify-between rounded-md border border-border bg-card p-4 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy ' +
                    'border-l-4 ' +
                    accent.cardBorderClass
                  }
                >
                  <div>
                    <div className="font-medium text-brand-navy">{entity.label}</div>
                    <div className="mt-0.5 text-sm text-slate-600">
                      {entity.description}
                    </div>
                  </div>
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  )
}
