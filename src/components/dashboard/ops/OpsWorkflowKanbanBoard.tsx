/*
 * OpsWorkflowKanbanBoard (Gate 4.95 Session 3 Step 6).
 *
 * Pure presentation: renders the 6 workflow columns on desktop and the
 * stacked accordion on mobile. Server component; receives already-
 * bucketed cards from the page. Empty states, cap-at-100 overflow link,
 * and column collapse defaults are handled here.
 */

import Link from 'next/link'
import { Inbox } from 'lucide-react'
import {
  capColumn,
  OPS_WORKFLOW_AMBER_DAYS,
  OPS_WORKFLOW_COLUMNS,
  OPS_WORKFLOW_RED_DAYS,
  type ColumnBuckets,
  type OpsWorkflowCard,
  type OpsWorkflowColumn,
} from '@/lib/kanban/opsWorkflowKanban'

interface OpsWorkflowKanbanBoardProps {
  columns: ColumnBuckets
  filterActive: boolean
  /** Query string the "+N more" link can carry through; empty string ok. */
  currentQueryString: string
}

export function OpsWorkflowKanbanBoard({
  columns,
  filterActive,
  currentQueryString,
}: OpsWorkflowKanbanBoardProps) {
  return (
    <div data-testid="ops-workflow-kanban-board">
      {/* Desktop: 6-column grid, side-scroll on narrow viewports. */}
      <div className="hidden sm:block">
        <div
          className="grid gap-3 lg:gap-4"
          style={{ gridTemplateColumns: 'repeat(6, minmax(14rem, 1fr))' }}
        >
          {OPS_WORKFLOW_COLUMNS.map((col) => (
            <Column
              key={col.key}
              columnKey={col.key}
              label={col.label}
              cards={columns[col.key]}
              filterActive={filterActive}
              currentQueryString={currentQueryString}
            />
          ))}
        </div>
      </div>

      {/* Mobile: status-stacked <details> accordion. */}
      <div className="sm:hidden">
        <div className="flex flex-col gap-2">
          {OPS_WORKFLOW_COLUMNS.map((col) => (
            <details
              key={col.key}
              data-testid={`kanban-accordion-${col.key}`}
              open={!col.collapsedByDefault}
              className="rounded-lg border border-border bg-card"
            >
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-brand-navy">
                <span>{col.label}</span>
                <span className="rounded-full bg-brand-navy/10 px-2 py-0.5 text-xs font-medium text-brand-navy">
                  {columns[col.key].length}
                </span>
              </summary>
              <div className="border-t border-border px-3 py-3">
                <ColumnBody
                  columnKey={col.key}
                  cards={columns[col.key]}
                  filterActive={filterActive}
                  currentQueryString={currentQueryString}
                />
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function Column({
  columnKey,
  label,
  cards,
  filterActive,
  currentQueryString,
}: {
  columnKey: OpsWorkflowColumn
  label: string
  cards: OpsWorkflowCard[]
  filterActive: boolean
  currentQueryString: string
}) {
  return (
    <section
      data-testid={`kanban-column-${columnKey}`}
      aria-label={label}
      className="flex min-h-[12rem] flex-col rounded-lg border border-border bg-slate-50"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <h2 className="font-heading text-sm font-semibold text-brand-navy">{label}</h2>
        <span
          data-testid={`kanban-column-count-${columnKey}`}
          className="rounded-full bg-brand-navy/10 px-2 py-0.5 text-xs font-medium text-brand-navy"
        >
          {cards.length}
        </span>
      </header>
      <div className="flex-1 px-2 py-2">
        <ColumnBody
          columnKey={columnKey}
          cards={cards}
          filterActive={filterActive}
          currentQueryString={currentQueryString}
        />
      </div>
    </section>
  )
}

function ColumnBody({
  columnKey,
  cards,
  filterActive,
  currentQueryString,
}: {
  columnKey: OpsWorkflowColumn
  cards: OpsWorkflowCard[]
  filterActive: boolean
  currentQueryString: string
}) {
  if (cards.length === 0) {
    return (
      <div
        data-testid={`kanban-empty-${columnKey}`}
        className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-6 text-center text-xs text-slate-600"
      >
        <Inbox aria-hidden className="size-5 text-slate-400" />
        <p>
          {filterActive
            ? 'No cards match the current filters.'
            : 'No cards in this column.'}
        </p>
      </div>
    )
  }

  const { visible, overflowCount } = capColumn(cards)
  const moreHref = currentQueryString
    ? `/mous?${currentQueryString}`
    : '/mous'

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((card) => (
        <li key={card.mouId}>
          <KanbanCard card={card} />
        </li>
      ))}
      {overflowCount > 0 ? (
        <li>
          <Link
            href={moreHref}
            data-testid={`kanban-more-${columnKey}`}
            className="inline-flex w-full min-h-11 items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            + {overflowCount} more
          </Link>
        </li>
      ) : null}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function KanbanCard({ card }: { card: OpsWorkflowCard }) {
  const lastActivityLabel = card.lastActivityTimestamp
    ? `Last activity: ${card.lastActivityTimestamp}`
    : 'Last activity: not recorded'

  return (
    <Link
      href={card.href}
      data-testid={`kanban-card-${card.mouId}`}
      title={lastActivityLabel}
      className="block rounded-md border border-border bg-card p-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-brand-navy">
            {card.schoolName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="inline-flex items-center rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {card.programme}
            </span>
            {card.productSelection ? (
              <span className="inline-flex items-center rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-slate-600">
                {card.productSelection}
              </span>
            ) : null}
          </div>
        </div>
        <DaysBadge
          days={card.daysAtStatus}
          isAging={card.isAging}
          isOverdue={card.isOverdue}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {card.salesRepInitials ? (
            <span
              aria-label={`Sales rep: ${card.salesRepName ?? ''}`}
              className="inline-flex size-6 items-center justify-center rounded-full bg-brand-teal text-[10px] font-semibold text-white"
            >
              {card.salesRepInitials}
            </span>
          ) : null}
          {card.opsOwnerInitials ? (
            <span
              aria-label={`Ops owner: ${card.opsOwnerName ?? ''}`}
              className="inline-flex size-6 items-center justify-center rounded-full bg-signal-attention text-[10px] font-semibold text-white"
            >
              {card.opsOwnerInitials}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

function DaysBadge({
  days,
  isAging,
  isOverdue,
}: {
  days: number
  isAging: boolean
  isOverdue: boolean
}) {
  if (isOverdue) {
    return (
      <span
        aria-label={`${days} days at status, overdue`}
        className="inline-flex shrink-0 items-center rounded-full bg-signal-alert/15 px-2 py-0.5 text-[11px] font-semibold text-signal-alert"
      >
        {days}d
      </span>
    )
  }
  if (isAging) {
    return (
      <span
        aria-label={`${days} days at status, aging`}
        className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
      >
        {days}d
      </span>
    )
  }
  return (
    <span
      aria-label={`${days} days at status`}
      className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
    >
      {days}d
    </span>
  )
}

// Re-export thresholds for tests that want to verify boundaries.
export { OPS_WORKFLOW_AMBER_DAYS, OPS_WORKFLOW_RED_DAYS }
