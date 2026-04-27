/*
 * KanbanOverviewTabs (W3-F).
 *
 * Two-tab page navigation rendered at the top of / (Kanban) and
 * /overview (Overview). Underlined-active tab pattern matches the
 * TopNav style. Tabs are real route links (not in-page state) so
 * each tab is a separate Server Component render; no client-side
 * tab state to sync with the URL.
 *
 * The /dashboard route aliases /overview for bookmark compatibility;
 * both routes render the same content with the Overview tab active.
 *
 * Touch targets: 44px min via min-h-11. Active tab carries
 * aria-current="page" for assistive tech. ARIA-pattern: this is
 * navigation, not in-page tabs (tablist / tab roles), so the
 * underlying <nav><ul><a>...</a></ul></nav> is correct.
 *
 * A third "List" tab grouping /mous + /schools + /escalations was
 * surfaced in scope as optional. Deferred: TopNav already exposes
 * those routes individually; a "List" tab would duplicate that
 * navigation without new capability. Re-add if testers report the
 * three list surfaces feel disconnected.
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface KanbanOverviewTabsProps {
  /**
   * Currently active route. Server pages pass their own route in.
   * /dashboard is treated as 'overview' since it aliases that page.
   */
  activeTab: 'kanban' | 'overview'
}

interface TabDef {
  href: string
  label: string
  key: 'kanban' | 'overview'
}

const TABS: ReadonlyArray<TabDef> = [
  { href: '/', label: 'Kanban', key: 'kanban' },
  { href: '/overview', label: 'Overview', key: 'overview' },
]

export function KanbanOverviewTabs({ activeTab }: KanbanOverviewTabsProps) {
  return (
    <nav
      aria-label="Kanban / Overview tabs"
      className="border-b border-border bg-card"
      data-testid="kanban-overview-tabs"
    >
      <ul className="mx-auto flex max-w-screen-2xl items-stretch px-4">
        {TABS.map((tab) => {
          const active = tab.key === activeTab
          return (
            <li key={tab.key} className="flex">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy',
                  active
                    ? 'border-b-2 border-brand-navy text-brand-navy'
                    : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
                )}
                data-testid={`tab-${tab.key}`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
