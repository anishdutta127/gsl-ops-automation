'use client'

/*
 * SidebarDesktop (Phase 1 left-nav).
 *
 * The fixed left rail shown on lg+ screens. Carries the `.app-sidebar`
 * class: globals.css uses it to offset the page content to the right of
 * the rail (see the "App shell content offset" rule). Rendered by
 * TopNav as a sibling immediately before the page content, so the
 * offset is scoped to authenticated pages only (public pages render no
 * TopNav, hence no rail and no offset).
 *
 * Active highlighting reads the real pathname via usePathname, so deep
 * links (/mous/MOU-123, /finance/payments/new) highlight the correct
 * item. Resolution is centralised in navModel.activeTestId.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle } from 'lucide-react'
import type { Department } from '@/lib/types'
import { NAV_ZONES, activeTestId } from '@/lib/nav/navModel'

const DEPT_DOT: Record<string, string> = {
  finance: 'bg-violet-500',
  ops: 'bg-orange-500',
}

interface SidebarDesktopProps {
  department: Department
}

export function SidebarDesktop({ department }: SidebarDesktopProps) {
  const pathname = usePathname() || '/'
  const active = activeTestId(pathname)

  return (
    <nav
      aria-label="Primary navigation"
      data-testid="sidebar-desktop"
      className="app-sidebar fixed bottom-0 left-0 top-12 z-30 hidden w-64 flex-col overflow-y-auto border-r border-border bg-card lg:flex"
    >
      <div className="flex-1 px-2 py-4">
        {NAV_ZONES.map((zone) => (
          <div key={zone.id} className="mb-4" role="group" aria-labelledby={`${zone.testId}-label`}>
            <p
              id={`${zone.testId}-label`}
              data-testid={zone.testId}
              className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {zone.label}
              {zone.department && department === zone.department ? (
                <span
                  aria-hidden
                  data-testid={`${zone.testId}-dot`}
                  className={'size-1.5 rounded-full ' + (DEPT_DOT[zone.department] ?? '')}
                />
              ) : null}
            </p>
            <ul className="flex flex-col">
              {zone.items.map((item) => {
                const isActive = item.testId === active
                return (
                  <li key={item.testId}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={item.testId}
                      data-active={isActive ? 'true' : 'false'}
                      className={
                        'flex min-h-11 items-center gap-2 rounded-md border-l-2 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ' +
                        (isActive
                          ? 'border-brand-teal bg-brand-navy/5 font-semibold text-brand-navy'
                          : 'border-transparent font-medium text-slate-700 hover:bg-slate-100')
                      }
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-2 py-3">
        <Link
          href="/help"
          data-testid="nav-help"
          className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        >
          <HelpCircle aria-hidden className="size-4" />
          Help
        </Link>
      </div>
    </nav>
  )
}
