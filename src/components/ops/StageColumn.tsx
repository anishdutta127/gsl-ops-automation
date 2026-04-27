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

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { KanbanStageKey } from '@/lib/kanban/deriveStage'

interface StageColumnProps {
  columnKey: KanbanStageKey
  label: string
  variant: 'lifecycle' | 'muted'
  count: number
  children: ReactNode
}

export function StageColumn({ columnKey, label, variant, count, children }: StageColumnProps) {
  const isMuted = variant === 'muted'
  return (
    <section
      aria-labelledby={`stage-${columnKey}-heading`}
      data-stage-key={columnKey}
      data-testid={`stage-column-${columnKey}`}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-3',
        isMuted ? 'border-border bg-muted/40' : 'border-border bg-card',
      )}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2
          id={`stage-${columnKey}-heading`}
          className={cn(
            'font-heading text-sm font-semibold text-brand-navy',
            isMuted ? 'italic' : '',
          )}
        >
          {label}
        </h2>
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
