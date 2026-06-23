/*
 * /admin/advanced (Phase 1.2).
 *
 * Directory of surfaces moved OFF the everyday left-nav during the nav
 * simplification. Nothing was deleted: every route below is intact and fully
 * functional; this page keeps them discoverable and the deep links stable.
 *
 * Access: any authenticated active user (NOT admin-locked) - a Finance user
 * needs Proforma invoices / Tally, an Ops user needs Deliveries, etc. Each
 * linked route still enforces its own server-side permission gate, so this
 * directory only lists shortcuts; it grants nothing.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, LayoutDashboard, Wallet, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

interface AdvancedLink {
  href: string
  label: string
  description: string
}

interface AdvancedGroup {
  heading: string
  icon: LucideIcon
  links: AdvancedLink[]
}

const GROUPS: AdvancedGroup[] = [
  {
    heading: 'Dashboards and boards',
    icon: LayoutDashboard,
    links: [
      { href: '/work', label: 'Overview', description: 'Your daily landing (also in the nav).' },
      { href: '/dashboard/leadership', label: 'Pulse', description: 'Leadership health KPIs.' },
      { href: '/kanban', label: 'Pipeline', description: 'Drag-to-advance MOU lifecycle board.' },
      { href: '/dashboard/exceptions', label: 'Attention', description: 'Exceptions and escalation snapshot.' },
    ],
  },
  {
    heading: 'Finance',
    icon: Wallet,
    links: [
      { href: '/finance/dispatch-requests', label: 'Dispatch requests', description: 'Ops-to-Finance handoff and payment-release gate.' },
      { href: '/finance/pi/pending', label: 'Proforma invoices', description: 'Generate and track PIs (MOU and VEX).' },
      { href: '/finance/adjustments', label: 'Adjustments', description: 'View and reverse installment adjustments.' },
      { href: '/finance/tally-export', label: 'Tally export', description: 'Export vouchers to Tally Prime.' },
    ],
  },
  {
    heading: 'Operations',
    icon: Wrench,
    links: [
      { href: '/dispatch/kits/summary', label: 'Deliveries', description: 'Dispatch summary and proof-of-delivery.' },
      { href: '/operations/welcome', label: 'Welcome notes', description: 'Welcome-note lifecycle tracking.' },
      { href: '/operations/recce', label: 'Recce', description: 'Post-delivery verification reports.' },
    ],
  },
]

export default async function AdvancedPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fadvanced')

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Advanced"
          subtitle="Surfaces moved off the everyday navigation. All routes are fully functional; this is a directory of shortcuts. Each opens only if your role allows it."
          breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Advanced' }]}
        />
        <div className="mx-auto flex max-w-screen-lg flex-col gap-6 px-4 py-6 sm:px-6">
          {GROUPS.map((group) => {
            const Icon = group.icon
            return (
              <section key={group.heading} aria-label={group.heading}>
                <h2 className="mb-2 flex items-center gap-2 font-heading text-sm font-semibold text-brand-navy">
                  <Icon aria-hidden className="size-4" />
                  {group.heading}
                </h2>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        data-testid={`advanced-link-${link.href}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                      >
                        <span>
                          <span className="font-medium text-brand-navy">{link.label}</span>
                          <span className="block text-xs text-muted-foreground">{link.description}</span>
                        </span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </main>
    </>
  )
}
