/*
 * MouCard (W3-C C1 + C2; kanban card).
 *
 * Click navigates to /mous/[id]. Drag (when wrapped in a kanban
 * DndContext with PointerSensor's 8px activation distance) initiates
 * a stage transition. Below 8px movement the click registers and
 * navigation fires; above 8px the drag activates and click is
 * suppressed by dnd-kit until drop. This is how dnd-kit
 * disambiguates click-vs-drag without a separate drag handle.
 *
 * C1 data shape:
 *   - school name (truncated to 32 chars; full text in title attribute)
 *   - MOU id (mono small)
 *   - programme + sub-type (small; sub-type only when non-null)
 *   - drift badge if mou.studentsVariancePct exceeds +/- 10%
 *   - status badge if status !== 'Active'
 *
 * Two render paths:
 *   - <MouCard mou={...} />          : non-draggable; pure Link.
 *   - <DraggableMouCard mou={...} /> : C2 client variant; useDraggable
 *                                      wraps the same content. Used
 *                                      inside KanbanBoard.
 */

import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import type { MOU } from '@/lib/types'
import { hasDrift } from '@/lib/kanban/deriveStage'

const SCHOOL_NAME_MAX = 32

interface MouCardProps {
  mou: MOU
  daysInStage?: number | null
  overdue?: boolean
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1).trimEnd() + '…'
}

interface MouCardBodyProps {
  mou: MOU
  daysInStage?: number | null
  overdue?: boolean
}

/** Visual content shared between Link variant and Draggable variant. */
export function MouCardBody({ mou, daysInStage, overdue }: MouCardBodyProps) {
  const fullName = mou.schoolName
  const displayName = truncate(fullName, SCHOOL_NAME_MAX)
  const programmeLabel = mou.programmeSubType
    ? `${mou.programme} / ${mou.programmeSubType}`
    : mou.programme
  const drift = hasDrift(mou)
  const showStatusBadge = mou.status !== 'Active'
  const showOverdue = overdue === true && typeof daysInStage === 'number'

  const anyBadge = drift || showStatusBadge || showOverdue

  return (
    <>
      <div className="font-medium text-foreground">{displayName}</div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{mou.id}</div>
      <div className="mt-1 text-xs text-muted-foreground">{programmeLabel}</div>
      {anyBadge ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {showOverdue ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-signal-attention bg-card px-2 py-0.5 text-[11px] font-medium text-signal-attention"
              data-testid="overdue-badge"
            >
              <Clock aria-hidden className="size-3" />
              Overdue {daysInStage}d
            </span>
          ) : null}
          {drift ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-signal-attention bg-card px-2 py-0.5 text-[11px] font-medium text-signal-attention"
              data-testid="drift-badge"
            >
              <AlertTriangle aria-hidden className="size-3" />
              Drift
            </span>
          ) : null}
          {showStatusBadge ? (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground">
              {mou.status}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function MouCard({ mou, daysInStage, overdue }: MouCardProps) {
  return (
    <Link
      href={`/mous/${mou.id}`}
      className="block rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy min-h-[88px]"
      title={mou.schoolName}
      data-testid="mou-card"
      data-mou-id={mou.id}
      data-overdue={overdue ? 'true' : undefined}
    >
      <MouCardBody mou={mou} daysInStage={daysInStage} overdue={overdue} />
    </Link>
  )
}
