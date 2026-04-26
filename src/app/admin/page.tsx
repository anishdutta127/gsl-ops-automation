/*
 * /admin index (Phase C5a-1).
 *
 * Role-gated landing. Non-Admin / non-OpsHead viewers redirect to
 * /dashboard (admin surfaces are not for them; the audit-route page
 * has its own narrower gate). Effective roles include testingOverride
 * grants so Misba's OpsHead override lets her in.
 *
 * Renders a short directory of admin surfaces. Items not yet real
 * (sales-team, school-groups, schools, spocs) are noted but still
 * linked since they exist as placeholders.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { effectiveRoles } from '@/lib/auth/permissions'

interface AdminLink {
  href: string
  label: string
  description: string
  status: 'real' | 'placeholder'
}

const ADMIN_LINKS: AdminLink[] = [
  {
    href: '/admin/audit',
    label: 'Audit log',
    description: 'Filterable cross-entity audit history.',
    status: 'real',
  },
  {
    href: '/admin/cc-rules',
    label: 'CC rules',
    description: 'Per-context cc fan-out rules; toggle, edit, create.',
    status: 'real',
  },
  {
    href: '/admin/mou-import-review',
    label: 'MOU import review',
    description: 'Quarantined MOUs awaiting human resolution.',
    status: 'placeholder',
  },
  {
    href: '/admin/pi-counter',
    label: 'PI counter',
    description: 'Read-only health view for the proforma-invoice counter.',
    status: 'placeholder',
  },
  {
    href: '/admin/schools',
    label: 'Schools',
    description: 'Self-serve school directory (Item 8).',
    status: 'placeholder',
  },
  {
    href: '/admin/spocs',
    label: 'SPOCs',
    description: 'Per-school SPOC contact records.',
    status: 'placeholder',
  },
  {
    href: '/admin/sales-team',
    label: 'Sales team',
    description: 'Sales rep directory.',
    status: 'placeholder',
  },
  {
    href: '/admin/school-groups',
    label: 'School groups',
    description: 'Chain-MOU group memberships.',
    status: 'placeholder',
  },
]

export default async function AdminIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin')

  const roles = effectiveRoles(user)
  const allowed = roles.includes('Admin') || roles.includes('OpsHead')
  if (!allowed) redirect('/dashboard')

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Admin</h1>
      <p className="mt-1 text-sm text-slate-700">
        Welcome, {user.name}. Pick an area to manage.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--brand-navy)]">
                  {link.label}
                </span>
                {link.status === 'placeholder' ? (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Phase 1 placeholder
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-600">{link.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
