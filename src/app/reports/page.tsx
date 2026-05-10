/*
 * /reports (Gate 1 Step 3 stage landing page).
 *
 * Reports stage entry. Cross-functional analytics live here; the
 * Leadership Console for aggregate KPIs ships in Gate 5. For Gate 1
 * the page is a placeholder that points at the existing dashboard
 * exception feed and admin audit surfaces.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { accentFor } from '@/lib/departmentAccents'

const ENTITIES = [
  {
    label: 'Operations Control Dashboard',
    href: '/',
    description: 'School onboarding, orders, shipments, inventory at a glance.',
  },
  {
    label: 'Exceptions feed',
    href: '/dashboard/exceptions',
    description: 'MOUs that need attention right now.',
  },
  {
    label: 'Audit log',
    href: '/admin/audit',
    description: 'Cross-entity audit trail (lane-scoped per role).',
  },
  {
    label: 'MOU pipeline',
    href: '/kanban',
    description: 'Drag-and-drop kanban across the 8-stage lifecycle.',
  },
]

export default async function ReportsStagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Freports')
  const accent = accentFor('cross-functional')

  return (
    <>
      <TopNav currentPath="/reports" />
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
              Reports stage
            </span>
            <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              Reports
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Cross-functional analytics. Leadership Console with aggregate KPIs ships in Gate 5.
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
