/*
 * ActionCard (Phase 6F Part 3).
 *
 * Single card rendering an ActionItem. Category stripe on the left
 * edge (4px), count badge top-right, CTA bottom-right. Accessible:
 * the whole card is a focusable region with the title + count
 * announced together for screen readers.
 *
 * Used by the homepage's "Your queue" and "Team blockers" sections.
 */

import Link from 'next/link'
import type { ActionItem } from '@/lib/homepage/types'

const STRIPE_COLOUR: Record<ActionItem['category'], string> = {
  overdue: 'bg-signal-alert',           // red
  today: 'bg-signal-attention',         // amber
  'this-week': 'bg-brand-navy',          // blue
  'data-quality': 'bg-slate-500',        // grey
  'ai-insight': 'bg-brand-teal',         // purple-teal
}

const CATEGORY_LABEL: Record<ActionItem['category'], string> = {
  overdue: 'Overdue',
  today: 'Today',
  'this-week': 'This week',
  'data-quality': 'Data quality',
  'ai-insight': 'AI insight',
}

const ROLE_LABEL: Record<ActionItem['role'], string> = {
  finance: 'Finance',
  ops: 'Ops',
  sales: 'Sales',
  both: 'Both',
}

interface Props {
  item: ActionItem
  testIdPrefix?: string
}

export function ActionCard({ item, testIdPrefix = 'action-card' }: Props) {
  const subtitle = typeof item.meta.subtitle === 'string' ? item.meta.subtitle : null
  const urgencyDays =
    typeof item.meta.urgencyDays === 'number' && item.meta.urgencyDays > 0
      ? item.meta.urgencyDays
      : null
  return (
    <article
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm focus-within:ring-2 focus-within:ring-brand-navy"
      data-testid={`${testIdPrefix}-${item.id}`}
      aria-label={`${CATEGORY_LABEL[item.category]} · ${item.count} ${item.title}`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1 ${STRIPE_COLOUR[item.category]}`}
      />
      <header className="flex items-start justify-between gap-3 pl-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {CATEGORY_LABEL[item.category]}
            </span>
            <span className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
              {ROLE_LABEL[item.role]}
            </span>
            {urgencyDays !== null && (
              <span className="inline-flex items-center rounded-full bg-signal-alert/10 px-1.5 py-0.5 text-[10px] font-medium text-signal-alert">
                Carried over · day {urgencyDays}
              </span>
            )}
          </div>
          <h3 className="font-heading text-sm font-semibold text-brand-navy">{item.title}</h3>
          {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
        </div>
        <span
          className="rounded-md bg-muted px-2 py-1 text-base font-bold text-brand-navy"
          aria-label={`${item.count} items`}
          data-testid={`${testIdPrefix}-count-${item.id}`}
        >
          {item.count}
        </span>
      </header>
      <footer className="flex items-center justify-between gap-2 pl-2 pt-1">
        <Link
          href={item.ctaHref}
          className="inline-flex min-h-9 items-center rounded-md bg-brand-teal px-3 py-1.5 text-xs font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          data-testid={`${testIdPrefix}-cta-${item.id}`}
        >
          {item.ctaLabel}
        </Link>
      </footer>
    </article>
  )
}
