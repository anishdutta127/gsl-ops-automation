/*
 * TopNav (DESIGN.md "Surface 1" + cross-cutting nav).
 *
 * Server Component rendered on every authenticated page. Reads the
 * current user via getCurrentUser; renders role-aware nav links.
 * "Admin" appears only for Admin role and OpsHead role (matrix
 * default). User-menu surfaces the current name + a Sign out form
 * posting to /api/logout.
 *
 * Visual: horizontal flex bar, navy bg, teal underline on active
 * link via aria-current. Touch targets 44px minimum on mobile;
 * 48px tall desktop.
 */

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import type { User, UserRole } from '@/lib/types'

interface NavLink {
  href: string
  label: string
  visibleTo: 'all' | UserRole[]
}

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', visibleTo: 'all' },
  { href: '/mous', label: 'MOUs', visibleTo: 'all' },
  { href: '/schools', label: 'Schools', visibleTo: 'all' },
  { href: '/escalations', label: 'Escalations', visibleTo: 'all' },
  { href: '/admin', label: 'Admin', visibleTo: ['Admin', 'OpsHead', 'Leadership'] },
]

function isVisible(link: NavLink, user: User | null): boolean {
  if (link.visibleTo === 'all') return true
  if (!user) return false
  if (link.visibleTo.includes(user.role)) return true
  if (user.testingOverride && user.testingOverridePermissions) {
    return user.testingOverridePermissions.some((r) => link.visibleTo !== 'all' && link.visibleTo.includes(r))
  }
  return false
}

interface TopNavProps {
  currentPath?: string
}

export async function TopNav({ currentPath }: TopNavProps = {}) {
  const user = await getCurrentUser()
  const visibleLinks = NAV_LINKS.filter((l) => isVisible(l, user))

  return (
    <nav
      className="sticky top-0 z-40 border-b border-border bg-brand-navy text-white"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex min-h-12 max-w-screen-xl items-stretch justify-between px-4">
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className="flex items-center px-3 font-heading text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            GSL Ops
          </Link>
          <ul className="flex items-stretch">
            {visibleLinks.map((link) => {
              const active = currentPath === link.href || (currentPath?.startsWith(link.href + '/') ?? false)
              return (
                <li key={link.href} className="flex">
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex min-h-11 items-center px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal ' +
                      (active ? 'border-b-2 border-brand-teal' : 'border-b-2 border-transparent')
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <span className="hidden text-sm text-white/80 sm:inline" aria-label="Signed in as">
              {user.name}
            </span>
          ) : null}
          <form action="/api/logout" method="POST" className="flex items-center">
            <button
              type="submit"
              className="flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              aria-label="Sign out"
            >
              <LogOut aria-hidden className="size-4" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
