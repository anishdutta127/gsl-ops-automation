/*
 * TopNav: app shell (Phase 1 platform redesign, see
 * plans/platform-redesign-review.md Section 3.1).
 *
 * Replaces the former horizontal stage-bar (MOUs | Operations | Finance
 * | Reports | Admin) with two pieces:
 *   1. A thin global utility bar (this <header>): wordmark, a command-
 *      palette placeholder (non-functional in Phase 1), queue-freshness
 *      indicator, notification bell, signed-in name, sign out, and the
 *      mobile nav trigger.
 *   2. A left sidebar (SidebarDesktop on lg+, SidebarMobile drawer
 *      below): the WATCH / WORK / RECORDS / ADMIN nav tree from
 *      navModel.
 *
 * Call-site compatibility: every page still renders <TopNav /> (some
 * pass a currentPath prop). The prop is retained for signature
 * stability but active highlighting now derives from the real pathname
 * inside the sidebar components (usePathname), so deep links highlight
 * correctly without each page passing an accurate currentPath.
 *
 * Content offset: SidebarDesktop carries the `.app-sidebar` class;
 * globals.css shifts the following page content right of the fixed rail
 * on lg+. Public pages render no TopNav, so they are never offset.
 */

import Link from 'next/link'
import { LayoutGrid, LogOut, Search } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { NotificationBell } from './NotificationBell'
import { QueueFreshnessIndicator } from './QueueFreshnessIndicator'
import { SidebarDesktop } from './nav/SidebarDesktop'
import { SidebarMobile } from './nav/SidebarMobile'

interface TopNavProps {
  /** Retained for call-site compatibility; active state now derives
   *  from usePathname in the sidebar components. */
  currentPath?: string
}

export async function TopNav(_props: TopNavProps = {}) {
  const user = await getCurrentUser()
  const department = user?.department ?? null

  return (
    <>
      <header
        data-testid="topnav"
        className="sticky top-0 z-40 flex min-h-12 items-stretch border-b border-border bg-brand-navy text-white"
      >
        <div className="flex w-full items-center gap-1 px-2 sm:px-4">
          <SidebarMobile department={department} />
          <Link
            href="/"
            data-testid="topnav-wordmark"
            aria-label="GSL Ops home"
            className="flex shrink-0 items-center gap-1.5 px-2 font-heading text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <LayoutGrid aria-hidden className="size-4 text-brand-teal" />
            <span>GSL Ops</span>
          </Link>

          {/* Command-palette placeholder. Non-functional in Phase 1; the
              real palette ships in a later phase (Section 3.3, P6).
              Disabled so it is not focusable or interactive, but labelled
              for assistive tech. */}
          <div role="search" className="ml-2 hidden min-w-0 flex-1 md:flex md:max-w-md">
            <button
              type="button"
              disabled
              data-testid="command-palette-placeholder"
              aria-label="Search or run a command (coming in a later phase)"
              title="Search or run a command (coming soon)"
              className="flex w-full items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/70"
            >
              <Search aria-hidden className="size-4" />
              <span>Search or run a command</span>
              <kbd className="ml-auto rounded border border-white/30 px-1 text-[10px]">Ctrl K</kbd>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {user ? <QueueFreshnessIndicator /> : null}
            {user ? <NotificationBell user={user} /> : null}
            {user ? (
              <span className="hidden text-sm text-white/80 sm:inline" aria-label="Signed in as">
                {user.name}
              </span>
            ) : null}
            <form action="/api/logout" method="POST" className="flex items-center">
              <button
                type="submit"
                aria-label="Sign out"
                className="flex min-h-11 items-center gap-2 px-2 text-sm font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                <LogOut aria-hidden className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <SidebarDesktop department={department} />
    </>
  )
}
