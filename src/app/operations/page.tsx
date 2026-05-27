/*
 * /operations (Gate 1 Step 3 stage landing page).
 *
 * Operations stage entry. Schools, escalations, VEX, vendors, and
 * inventory live as their own routes; this page is the index card
 * surface that points at them.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { accentFor } from '@/lib/departmentAccents'

const ENTITIES = [
  {
    label: 'Kit dispatch',
    href: '/dispatch/kits',
    description: 'Grade-wise allocation, sales approval, shipment tracking.',
  },
  {
    label: 'Dispatch requests',
    href: '/dispatch/request',
    description: 'Raise and review dispatch requests from sales.',
  },
  {
    label: 'Schools',
    href: '/schools',
    description: 'Master data, contacts, billing block per school.',
  },
  {
    label: 'Escalations',
    href: '/escalations',
    description: 'Categorise, transition, transfer tickets.',
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    description: 'Per-SKU stock and reorder thresholds.',
  },
  {
    label: 'VEX orders',
    href: '/operations/vex',
    description: 'VEX PIs, SKU master, dispatch progression.',
  },
  {
    label: 'Vendors',
    href: '/operations/vendors',
    description: 'Vendor master: contacts, GSTIN, banking.',
  },
  {
    label: 'Agreements',
    href: '/operations/agreements',
    description: 'NDA and vendor agreement registry with renewal tracking.',
  },
]

export default async function OperationsStagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations')
  const accent = accentFor('ops')

  return (
    <>
      <TopNav currentPath="/operations" />
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
              Operations stage
            </span>
            <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              Operations workspace
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Dispatch, schools, escalations, VEX, vendors, inventory in one place.
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
