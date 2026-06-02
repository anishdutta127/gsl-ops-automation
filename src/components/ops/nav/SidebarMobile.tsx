'use client'

/*
 * SidebarMobile (Phase 1 left-nav).
 *
 * Hamburger trigger (shown < lg) plus a full-height drawer overlay that
 * mirrors the SidebarDesktop structure. Rendered inside the TopNav top
 * bar; the drawer is position:fixed so its DOM nesting does not matter.
 *
 * Owns the open/close state (client). Closes on route change
 * (pathname), on Escape, and locks body scroll while open. Active
 * highlighting shares navModel.activeTestId with the desktop rail.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Department } from '@/lib/types'
import { NAV_ZONES, activeTestId } from '@/lib/nav/navModel'

const DEPT_DOT: Record<string, string> = {
  finance: 'bg-violet-500',
  ops: 'bg-orange-500',
}

interface SidebarMobileProps {
  department: Department
}

export function SidebarMobile({ department }: SidebarMobileProps) {
  const pathname = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const active = activeTestId(pathname)

  // Close on navigation (pathname change indicates a route transition).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Esc to close, body scroll lock while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="sidebar-mobile-drawer"
        data-testid="topnav-mobile-trigger"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center justify-center px-2 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal lg:hidden"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      {open ? (
        <div
          id="sidebar-mobile-drawer"
          data-testid="sidebar-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Primary navigation"
          className="fixed inset-0 top-12 z-50 overflow-y-auto bg-card lg:hidden"
        >
          <nav aria-label="Primary navigation" className="px-3 py-4">
            {NAV_ZONES.map((zone) => (
              <div key={zone.id} className="mb-4" role="group" aria-labelledby={`mobile-${zone.testId}-label`}>
                <p
                  id={`mobile-${zone.testId}-label`}
                  className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                >
                  {zone.label}
                  {zone.department && department === zone.department ? (
                    <span
                      aria-hidden
                      className={'size-1.5 rounded-full ' + (DEPT_DOT[zone.department] ?? '')}
                    />
                  ) : null}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {zone.items.map((item) => {
                    const isActive = item.testId === active
                    return (
                      <li key={item.testId}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          data-active={isActive ? 'true' : 'false'}
                          onClick={() => setOpen(false)}
                          className={
                            'flex min-h-11 items-center gap-2 rounded-md border-l-2 px-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ' +
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
            <div className="mt-2 border-t border-border pt-3">
              <Link
                href="/help"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-md px-3 text-base font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <HelpCircle aria-hidden className="size-4" />
                Help
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  )
}
