/*
 * MouCard (W3-C C1 + C2 + W4-B.1; kanban card).
 *
 * Click navigates to /mous/[id]. Drag from the W3-F.5 grip handle
 * initiates a stage transition; the body itself is a plain anchor
 * (cursor-pointer; click-to-navigate).
 *
 * C1 / W4-B.1 data shape:
 *   - school name (truncated to 32 chars; full text in title attribute)
 *   - MOU id (mono small)
 *   - programme + sub-type (small; sub-type only when non-null)
 *   - drift badge if mou.studentsVariancePct exceeds +/- 10%
 *   - status badge if status !== 'Active'
 *   - W4-B.1: "Next: <action>" line per stage. Verbs match the
 *     existing button copy on the corresponding per-stage form so
 *     the operator's mental model stays consistent across the
 *     kanban, the transition dialog, and the form.
 *
 * Two render paths:
 *   - <MouCard mou={...} />          : non-draggable; pure Link.
 *   - <DraggableMouCard mou={...} /> : C2 client variant; useDraggable
 *                                      wraps the same content. Used
 *                                      inside KanbanBoard.
 */

import Link from 'next/link'
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react'
import type { MOU } from '@/lib/types'
import {
  hasDrift,
  STAGE_NEXT_STEP,
  type KanbanStageKey,
} from '@/lib/kanban/deriveStage'

const SCHOOL_NAME_MAX = 32

interface MouCardProps {
  mou: MOU
  daysInStage?: number | null
  overdue?: boolean
  /** W4-B.1: drives the "Next: <action>" hint at the foot of the card. */
  stage?: KanbanStageKey
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1).trimEnd() + '…'
}

interface MouCardBodyProps {
  mou: MOU
  daysInStage?: number | null
  overdue?: boolean
  stage?: KanbanStageKey
}

/** Visual content shared between Link variant and Draggable variant. */
export function MouCardBody({ mou, daysInStage, overdue, stage }: MouCardBodyProps) {
  const fullName = mou.schoolName
  const displayName = truncate(fullName, SCHOOL_NAME_MAX)
  const programmeLabel = mou.programmeSubType
    ? `${mou.programme} / ${mou.programmeSubType}`
    : mou.programme
  const drift = hasDrift(mou)
  const showStatusBadge = mou.status !== 'Active'
  const showOverdue = overdue === true && typeof daysInStage === 'number'

  const anyBadge = drift || showStatusBadge || showOverdue
  // W4-B.1: cross-verification stage is auto-skipped by deriveStage; if
  // a card lands here in production it is a bug. Suppress the next-step
  // hint to avoid confusing operators with the placeholder text;
  // src/app/page.tsx fires a dev-mode console.warn alongside.
  const nextStep = stage !== undefined && stage !== 'cross-verification'
    ? STAGE_NEXT_STEP[stage]
    : null

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
      {nextStep !== null ? (
        <p
          className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"
          data-testid="next-step"
        >
          <ArrowRight aria-hidden className="size-3" />
          <span>Next: {nextStep}</span>
        </p>
      ) : null}
    </>
  )
}

export function MouCard({ mou, daysInStage, overdue, stage }: MouCardProps) {
  return (
    <Link
      href={`/mous/${mou.id}`}
      className="block rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy min-h-[88px]"
      title={mou.schoolName}
      data-testid="mou-card"
      data-mou-id={mou.id}
      data-overdue={overdue ? 'true' : undefined}
    >
      <MouCardBody mou={mou} daysInStage={daysInStage} overdue={overdue} stage={stage} />
    </Link>
  )
}
