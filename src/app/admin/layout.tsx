/*
 * Admin chrome: left nav with sub-routes (per DESIGN.md "Surface 5 /
 * Admin audit route"). Phase 1 placeholder; left-nav component lands
 * in Item 11 alongside real admin functionality.
 */

import Link from 'next/link'

const ADMIN_NAV: Array<{ label: string; href: string }> = [
  { label: 'Audit', href: '/admin/audit' },
  { label: 'Schools', href: '/admin/schools' },
  { label: 'SPOCs', href: '/admin/spocs' },
  { label: 'CcRules', href: '/admin/cc-rules' },
  { label: 'Sales team', href: '/admin/sales-team' },
  { label: 'School groups', href: '/admin/school-groups' },
  { label: 'Import review', href: '/admin/mou-import-review' },
  { label: 'PI counter', href: '/admin/pi-counter' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex">
      <nav className="w-60 shrink-0 border-r border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Admin
        </h2>
        <ul className="space-y-1">
          {ADMIN_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block px-3 py-2 text-sm rounded hover:bg-muted text-foreground"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  )
}
