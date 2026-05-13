/*
 * KanbanViewToggle (Gate 5A.7 Step 2).
 *
 * Pill switcher at the top of /kanban. Two views share the route:
 *   - Full lifecycle (default): 10-column MOU pipeline with drag-to-advance.
 *   - Active operations: 6-column KitDispatch workflow, read-only.
 *
 * Server-rendered (each button is a <Link>) so shareable URLs work out
 * of the box and there is no client-side state to wire. All other
 * search params on the current URL are preserved on toggle; only the
 * `view=` param flips.
 */

import Link from 'next/link'
import { cn } from '@/lib/utils'

export type KanbanViewMode = 'lifecycle' | 'operations'

interface KanbanViewToggleProps {
  view: KanbanViewMode
  /** Current search params, used to preserve filter state across views. */
  searchParams: Record<string, string | string[] | undefined>
}

function buildHref(
  sp: Record<string, string | string[] | undefined>,
  nextView: KanbanViewMode,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'view') continue
    if (v === undefined) continue
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.set(k, v)
    }
  }
  // Lifecycle is the default; omit the param so canonical URLs stay clean.
  if (nextView === 'operations') params.set('view', 'operations')
  const qs = params.toString()
  return qs ? `/kanban?${qs}` : '/kanban'
}

const ACTIVE_CLASS =
  'bg-brand-navy text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
const INACTIVE_CLASS =
  'border border-border bg-white text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'

export function KanbanViewToggle({ view, searchParams }: KanbanViewToggleProps) {
  const lifecycleHref = buildHref(searchParams, 'lifecycle')
  const operationsHref = buildHref(searchParams, 'operations')
  const isLifecycle = view === 'lifecycle'
  const isOperations = view === 'operations'

  return (
    <div
      role="group"
      aria-label="Kanban view"
      data-testid="kanban-view-toggle"
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1 text-xs font-medium"
    >
      <Link
        href={lifecycleHref}
        aria-pressed={isLifecycle}
        data-testid="kanban-view-toggle-lifecycle"
        className={cn(
          'inline-flex min-h-9 items-center rounded-full px-3 py-1 transition',
          isLifecycle ? ACTIVE_CLASS : INACTIVE_CLASS,
        )}
      >
        Full lifecycle
      </Link>
      <Link
        href={operationsHref}
        aria-pressed={isOperations}
        data-testid="kanban-view-toggle-operations"
        className={cn(
          'inline-flex min-h-9 items-center rounded-full px-3 py-1 transition',
          isOperations ? ACTIVE_CLASS : INACTIVE_CLASS,
        )}
      >
        Active operations
      </Link>
    </div>
  )
}
