/*
 * LeadershipAggregate (Phase 6F Part 3).
 *
 * Ameet's homepage view. No personal queue; instead, a per-category
 * count tile of every ActionItem across the platform. The Ameet user
 * does not click into individual cards from here; they go to the
 * legacy overview at /dashboard/overview for drill-down.
 */

import Link from 'next/link'
import type { ActionItem } from '@/lib/homepage/types'

const CATEGORY_LABEL: Record<ActionItem['category'], string> = {
  overdue: 'Overdue & escalating',
  today: "Today's actions",
  'this-week': 'This week',
  'data-quality': 'Data quality',
  'ai-insight': 'AI insights',
}

const STRIPE_COLOUR: Record<ActionItem['category'], string> = {
  overdue: 'border-l-signal-alert',
  today: 'border-l-signal-attention',
  'this-week': 'border-l-brand-navy',
  'data-quality': 'border-l-slate-500',
  'ai-insight': 'border-l-brand-teal',
}

interface Props {
  greeting: string
  todayLine: string
  items: ActionItem[]
  fallbackOverviewHref: string
}

export function LeadershipAggregate({
  greeting,
  todayLine,
  items,
  fallbackOverviewHref,
}: Props) {
  const byCategory: Record<ActionItem['category'], { count: number; items: number }> = {
    overdue: { count: 0, items: 0 },
    today: { count: 0, items: 0 },
    'this-week': { count: 0, items: 0 },
    'data-quality': { count: 0, items: 0 },
    'ai-insight': { count: 0, items: 0 },
  }
  for (const item of items) {
    byCategory[item.category].count += item.count
    byCategory[item.category].items += 1
  }

  return (
    <div
      className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6"
      data-testid="leadership-aggregate-root"
    >
      <header className="mb-5">
        <h1 className="font-heading text-2xl font-bold text-brand-navy">{greeting}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {todayLine}
          <span className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-slate-700">
            Leadership
          </span>
        </p>
      </header>
      <section
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        data-testid="platform-pulse"
        aria-label="Platform pulse: per-category action counts across all roles"
      >
        {(Object.keys(CATEGORY_LABEL) as ActionItem['category'][]).map((cat) => {
          const slice = byCategory[cat]
          return (
            <article
              key={cat}
              className={`relative flex flex-col gap-1 rounded-lg border border-l-4 border-border bg-card p-4 ${STRIPE_COLOUR[cat]}`}
              data-testid={`platform-pulse-${cat}`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
                {CATEGORY_LABEL[cat]}
              </p>
              <p className="text-2xl font-bold text-brand-navy" aria-label={`${slice.count} total items in ${CATEGORY_LABEL[cat]}`}>
                {slice.count}
              </p>
              <p className="text-xs text-slate-600">
                {slice.items} card{slice.items === 1 ? '' : 's'}
              </p>
            </article>
          )
        })}
      </section>
      <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-slate-600">
        Drill into any category from{' '}
        <Link href={fallbackOverviewHref} className="text-brand-navy underline-offset-2 hover:underline">
          the full overview dashboard.
        </Link>
      </footer>
    </div>
  )
}
