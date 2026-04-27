/*
 * StageColumn (Week 3 W3-C C1; kanban column).
 *
 * One column in the kanban board. C1 renders a header (label + count
 * badge) and a vertical list of MouCards. C2 adds drag-target wiring
 * (drop-zone for incoming cards). C3 adds the column-header click
 * action ("show every school at this stage" detail view) and the
 * overdue badge.
 *
 * Variants:
 *   - 'lifecycle': normal column for the 8 stages.
 *   - 'muted':     Pre-Ops Legacy holding bay. Lighter background,
 *                  italic label, "Needs triage" framing rather than
 *                  "Stage 0/9". One-way exit (no drop-into in C2).
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { KanbanStageKey } from '@/lib/kanban/deriveStage'

interface StageColumnProps {
  columnKey: KanbanStageKey
  label: string
  variant: 'lifecycle' | 'muted'
  count: number
  children: ReactNode
  /**
   * W3-C C3: optional column-header click target. When set, the
   * label becomes a Link navigating to the all-schools-at-this-stage
   * detail view (typically /mous?stage=<columnKey>). Omitted: header
   * is a plain h2 (no nav).
   */
  headerHref?: string
}

export function StageColumn({ columnKey, label, variant, count, children, headerHref }: StageColumnProps) {
  const isMuted = variant === 'muted'
  // Mobile: full width vertical stack. Tablet+: 288px column horizontal.
  const widthClass = 'w-full md:w-72 md:shrink-0'
  return (
    <section
      aria-labelledby={`stage-${columnKey}-heading`}
      data-stage-key={columnKey}
      data-testid={`stage-column-${columnKey}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        widthClass,
        isMuted ? 'border-border bg-muted/40' : 'border-border bg-card',
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        {headerHref ? (
          <Link
            href={headerHref}
            id={`stage-${columnKey}-heading`}
            className={cn(
              'font-heading text-sm font-semibold text-brand-navy hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy',
              isMuted ? 'italic' : '',
            )}
            data-testid={`stage-header-link-${columnKey}`}
          >
            {label}
          </Link>
        ) : (
          <h2
            id={`stage-${columnKey}-heading`}
            className={cn(
              'font-heading text-sm font-semibold text-brand-navy',
              isMuted ? 'italic' : '',
            )}
          >
            {label}
          </h2>
        )}
        <span
          className={cn(
            'inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
            isMuted
              ? 'border border-signal-attention bg-card text-signal-attention'
              : 'bg-muted text-foreground',
          )}
          data-testid={`stage-count-${columnKey}`}
        >
          {isMuted ? `Needs triage: ${count}` : count}
        </span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}
