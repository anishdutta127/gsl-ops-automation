/*
 * /dispatch (Gate 1 Step 3 stage landing page).
 *
 * Dispatch stage entry. Sales reps raise requests, Ops reviews +
 * approves, Finance authorises post-payment release. The page is a
 * thin index card surface; the actual entity routes live under
 * /dispatch/request and /admin/dispatch-requests today. Gate 3 is
 * the kits-dispatch module rebuild per Misba + Shashank + Pranav
 * joint spec; the routing here will tighten then.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { accentFor } from '@/lib/departmentAccents'

const ENTITIES = [
  {
    label: 'Kits for Dispatch',
    href: '/dispatch/kits',
    description:
      'Allocate kits per school, route through Sales approval + Accounts execution + POD upload.',
  },
  {
    label: 'Final dispatch summary',
    href: '/dispatch/kits/summary',
    description: 'Read-only flat view + CSV export of every kit dispatch.',
  },
  {
    label: 'Raise dispatch request',
    href: '/dispatch/request',
    description: 'Sales submits a kit dispatch request to Ops for review.',
  },
  {
    label: 'Pending review',
    href: '/admin/dispatch-requests',
    description: 'Ops queue of dispatch requests awaiting approval or rejection.',
  },
  {
    label: 'Active dispatches',
    href: '/mous',
    description: 'Per-MOU dispatch + handover history (links into MOU detail).',
  },
]

export default async function DispatchStagePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fdispatch')
  const accent = accentFor('ops')

  return (
    <>
      <TopNav currentPath="/dispatch" />
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
              Dispatch stage
            </span>
            <h1 className="mt-3 font-heading text-2xl font-bold text-brand-navy">
              Kits dispatch
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              Sales submits, Ops reviews, Finance authorises release after payment.
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
