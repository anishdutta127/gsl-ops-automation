/*
 * OpsKanbanTile (Gate 4.95 Session 3 Step 3).
 *
 * Prominent CTA card linking to the workflow-stage Kanban view at
 * /dashboard/ops/kanban. Distinct from the existing /kanban (the MOU
 * lifecycle pipeline shipped in W4-I.5); this one is the 6-column
 * dispatch workflow Kanban built in Session 3 Step 6.
 *
 * Visual: full-width card with a brand-teal accent stripe on the left
 * + Columns3 icon + label + descriptor + a chevron CTA. Designed to
 * read as "the next click" without dominating the dashboard.
 */

import Link from 'next/link'
import { ArrowRight, Columns3 } from 'lucide-react'

interface OpsKanbanTileProps {
  /** Optional badge: number of cards currently across all Kanban columns. */
  totalActiveCards?: number
}

export function OpsKanbanTile({ totalActiveCards }: OpsKanbanTileProps) {
  return (
    <Link
      href="/dashboard/ops/kanban"
      data-testid="ops-kanban-tile"
      className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal sm:p-5"
    >
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-md bg-brand-teal/10 text-brand-teal"
      >
        <Columns3 className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          Workflow Kanban view
        </h2>
        <p className="mt-0.5 text-xs text-slate-600">
          Track active dispatches by stage. Six columns: awaiting actuals,
          allocation, sales approval, ready for dispatch, in transit, delivered.
        </p>
      </div>
      {totalActiveCards !== undefined ? (
        <span
          className="hidden shrink-0 rounded-full bg-brand-navy/10 px-2 py-0.5 text-xs font-medium text-brand-navy sm:inline-flex"
          data-testid="ops-kanban-tile-count"
        >
          {totalActiveCards} active
        </span>
      ) : null}
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 text-brand-navy transition group-hover:translate-x-0.5"
      />
    </Link>
  )
}
