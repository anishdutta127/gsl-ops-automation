/*
 * AttentionSnapshotStrip (Phase 6F.1).
 *
 * A one-line band that sits at the very top of the homepage, above the
 * 5-zone landing. Shows the top 3 most urgent action items as inline
 * chips with count + short label, plus a "View all" link to /today
 * for the full queue.
 *
 * Behaviour spec from Phase 6F.1:
 *   - Collapsed by default. Expand is a navigation to /today, not an
 *     inline drawer; this keeps the strip purely server-rendered with
 *     no client state.
 *   - Single line tall. Chip strip must NOT exceed nav-bar height. If
 *     3 chips do not fit at the current viewport, the layout truncates
 *     with overflow-hidden + ellipsis on the chip-label text rather
 *     than wrapping to a second line.
 *   - Role filter: Finance sees finance + both. Ops sees ops + both.
 *     Sales sees sales + both. Admin sees everything. Leadership sees
 *     an aggregate count, no chips.
 *   - Mobile (375px): a single tappable summary line "N need attention",
 *     not a chip strip; the strip layout does not horizontally scroll
 *     on small screens.
 *   - Empty state: hides itself when there is nothing to surface so
 *     the 5-zone landing sits flush against the nav bar.
 */

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { ActionItem } from '@/lib/homepage/types'

type SnapshotView = 'admin' | 'leadership' | 'finance' | 'ops' | 'sales'

interface Props {
  view: SnapshotView
  items: ActionItem[]
}

const MAX_DESKTOP_CHIPS = 3

/**
 * Two-word label derived from an item title. The chip already shows
 * the numeric count; the label gives the operator the noun phrase that
 * disambiguates one chip from the next. Falls back to a short truncate
 * when the title shape is unexpected.
 */
function chipLabelFromTitle(title: string): string {
  const words = title.trim().split(/\s+/)
  if (words.length === 0) return title.slice(0, 18)
  const start = /^\d+$/.test(words[0] ?? '') ? 1 : 0
  const phrase = words.slice(start, start + 2).join(' ')
  return phrase || title.slice(0, 18)
}

export function AttentionSnapshotStrip({ view, items }: Props) {
  // Strip AI-insight items: they are not real action signals.
  const real = items.filter((i) => i.category !== 'ai-insight')

  if (real.length === 0) {
    // Nothing to surface; render nothing so the 5-zone lands flush.
    return null
  }

  if (view === 'leadership') {
    return (
      <div
        data-testid="attention-snapshot-strip"
        data-mode="leadership"
        className="border-b border-border bg-card"
      >
        <Link
          href="/today"
          className="flex h-10 items-center justify-between gap-3 px-4 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="attention-strip-aggregate"
        >
          <span className="truncate text-slate-700">
            <span className="font-semibold text-brand-navy">{real.length}</span>{' '}
            items across the platform
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-navy">
            View all
            <ChevronRight aria-hidden className="size-3" />
          </span>
        </Link>
      </div>
    )
  }

  // Personal view: role + both, sorted by urgencyScore (already sorted
  // by the engine but re-sort defensively).
  const personal = real
    .filter((i) =>
      view === 'admin' ? true : i.role === view || i.role === 'both',
    )
    .sort((a, b) => b.urgencyScore - a.urgencyScore)

  if (personal.length === 0) return null

  const chips = personal.slice(0, MAX_DESKTOP_CHIPS)

  return (
    <div
      data-testid="attention-snapshot-strip"
      data-mode="personal"
      className="border-b border-border bg-card"
    >
      {/* Mobile (375px): single tappable summary line. No chip strip. */}
      <Link
        href="/today"
        className="flex h-10 items-center justify-between gap-3 px-4 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy sm:hidden"
        data-testid="attention-strip-mobile"
      >
        <span className="truncate text-slate-700">
          <span className="font-semibold text-brand-navy">{personal.length}</span>{' '}
          need attention
        </span>
        <ChevronRight aria-hidden className="size-3 shrink-0 text-brand-navy" />
      </Link>

      {/* Desktop + tablet: chip strip on one line. */}
      <div
        className="hidden h-10 items-center gap-3 overflow-hidden px-4 text-sm sm:flex"
        data-testid="attention-strip-desktop"
      >
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-500">
          Needs attention
        </span>
        <ul className="flex min-w-0 items-center gap-2 overflow-hidden">
          {chips.map((item) => {
            const label = chipLabelFromTitle(item.title)
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  href={item.ctaHref}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                  data-testid="attention-strip-chip"
                  data-item-id={item.id}
                  title={item.title}
                >
                  <span className="font-semibold">{item.count}</span>
                  <span className="max-w-[12rem] truncate">{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <Link
          href="/today"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          data-testid="attention-strip-view-all"
        >
          View all {personal.length}
          <ChevronRight aria-hidden className="size-3" />
        </Link>
      </div>
    </div>
  )
}
