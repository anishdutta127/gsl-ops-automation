'use client'

/*
 * KanbanBoard (W3-C C2 + W3-F.5; client wrapper for drag mechanics).
 *
 * Wraps the static StageColumn / MouCard layout from C1 in a
 * @dnd-kit/core DndContext. W3-F.5 separates the click-vs-drag
 * affordance spatially: each card body is a plain <a href> (cursor
 * inherits pointer; click navigates to /mous/[id]) and a small
 * GripVertical handle at the card's top-right carries the dnd-kit
 * listeners (cursor-grab; drag from handle only). MouseSensor
 * (8px activation) and TouchSensor (15px activation, finger
 * imprecision) replace the old combined PointerSensor so each input
 * device gets the right click-vs-drag threshold; KeyboardSensor +
 * sortableKeyboardCoordinates still provide arrow-key navigation
 * once a card is lifted via Space / Enter on the focused handle.
 * Drag overlay renders a visual clone that follows the cursor; the
 * original card stays in place at opacity-40 until drop or cancel.
 *
 * onDragEnd path:
 *   - same column         -> no-op
 *   - drop into Pre-Ops   -> rejected with toast (one-way exit)
 *   - forward-by-one      -> open dialog; on confirm, navigate to
 *                            the matching /mous/[id]/{action} form
 *                            (Path A from W3-C scope alignment)
 *   - forward-skip        -> open dialog with reason field; on
 *                            confirm, write 'kanban-stage-transition'
 *                            audit entry then navigate
 *   - backward            -> open dialog with reason field; audit
 *                            entry only, no navigation; toast points
 *                            at /mous/[id] for actual state revert
 *   - pre-ops-exit        -> open dialog with reason field; on
 *                            confirm, audit entry + navigate to the
 *                            target form (or /mous/[id] when no form)
 *
 * Server-rendered initial column buckets are passed in as props so
 * the Server Component (src/app/page.tsx) handles data load and the
 * client wrapper handles interactivity.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, GripVertical, X } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { MOU } from '@/lib/types'
import {
  KANBAN_COLUMNS,
  type KanbanStageKey,
} from '@/lib/kanban/deriveStage'
import {
  classifyTransition,
  type TransitionClassification,
} from '@/lib/kanban/transitions'
import { MouCardBody } from './MouCard'
import {
  getCardUrgency,
  urgencyAriaLabel,
  URGENCY_BORDER_CLASS,
} from '@/lib/kanban/cardUrgency'
import { StageColumn } from './StageColumn'
import { TransitionDialog } from './TransitionDialog'

export interface KanbanCardMeta {
  daysInStage: number | null
  overdue: boolean
}

interface KanbanBoardProps {
  /** Server-rendered: { stageKey -> MOUs in that column }. */
  initialBuckets: Record<KanbanStageKey, MOU[]>
  /** Server-rendered per-MOU display metadata (days-in-stage, overdue flag). */
  cardMeta?: Record<string, KanbanCardMeta>
}

interface DialogState {
  open: boolean
  classification: TransitionClassification | null
  mou: MOU | null
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'Use the arrow keys or pointer to pick up an MOU card. Press space or enter to lift the card; arrow keys move it between columns; press space or enter again to drop. Press escape to cancel.',
}

const ANNOUNCEMENTS = {
  onDragStart({ active }: { active: { id: string | number } }) {
    return `Picked up MOU ${String(active.id)}.`
  },
  onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
    return over
      ? `MOU ${String(active.id)} is over column ${String(over.id)}.`
      : `MOU ${String(active.id)} is no longer over a column.`
  },
  onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
    return over
      ? `Dropped MOU ${String(active.id)} on column ${String(over.id)}.`
      : `Drag of MOU ${String(active.id)} cancelled.`
  },
  onDragCancel({ active }: { active: { id: string | number } }) {
    return `Drag of MOU ${String(active.id)} cancelled.`
  },
}

export function KanbanBoard({ initialBuckets, cardMeta = {} }: KanbanBoardProps) {
  // Activation distances per pointer type:
  //   - mouse: 8px (industry standard for click-vs-drag disambiguation;
  //     small enough that intentional drags feel responsive, large
  //     enough that a stray click + jitter does not register).
  //   - touch: 15px (finger imprecision; reduces accidental drag on
  //     phone / tablet taps even though Phase 1 mobile is read-mostly
  //     per the W3-C C3 mobile-vertical-stack decision).
  // KeyboardSensor activates via Space / Enter on the focused handle.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 15 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Stage-key index for fast from-stage lookup during drag.
  const stageByMouId = useMemo(() => {
    const map = new Map<string, KanbanStageKey>()
    for (const col of KANBAN_COLUMNS) {
      for (const mou of initialBuckets[col.key] ?? []) {
        map.set(mou.id, col.key)
      }
    }
    return map
  }, [initialBuckets])

  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ open: false, classification: null, mou: null })
  const [toast, setToast] = useState<string | null>(null)

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    for (const col of KANBAN_COLUMNS) {
      const found = (initialBuckets[col.key] ?? []).find((m) => m.id === id)
      if (found) {
        setActiveMou(found)
        return
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveMou(null)
    const { active, over } = event
    if (!over) return
    const mouId = String(active.id)
    const toStage = String(over.id) as KanbanStageKey
    const fromStage = stageByMouId.get(mouId)
    if (!fromStage) return

    const classification = classifyTransition(fromStage, toStage, mouId)
    if (classification.kind === 'no-op') return
    if (classification.kind === 'rejected') {
      setToast('Pre-Ops Legacy is a one-way exit; cards cannot move into it.')
      window.setTimeout(() => setToast(null), 6000)
      return
    }
    const mou = (initialBuckets[fromStage] ?? []).find((m) => m.id === mouId) ?? null
    setDialog({ open: true, classification, mou })
  }

  async function onConfirmTransition(reason: string | null): Promise<string | null> {
    if (!dialog.classification || !dialog.mou) return 'No active transition.'
    const c = dialog.classification

    // Forward-by-1: skip the audit-write API call (per-stage action is
    // the substantive record). Dialog will then route to forwardFormPath.
    if (c.kind === 'forward-by-one') return null

    // Skip / backward / pre-ops-exit: write the kanban-stage-transition
    // audit entry via the API. On success the dialog navigates (forward
    // shapes) or closes with a toast (backward).
    try {
      const res = await fetch('/api/kanban/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mouId: dialog.mou.id,
          fromStage: c.fromStage,
          toStage: c.toStage,
          reason,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return `Failed to record transition (${res.status}). ${text}`
      }
    } catch (err) {
      return `Network error: ${(err as Error).message}`
    }

    if (c.kind === 'backward') {
      const m = dialog.mou
      setToast(`Backward move recorded in audit log. To revert lifecycle data, edit the MOU at /mous/${m.id}.`)
      // 8 seconds: toast carries a 16-word message + URL; the prior 4s
      // default would not give a typical reader enough time to read AND
      // act on the next-step pointer. Manual dismiss button is also
      // available for early-acknowledge.
      window.setTimeout(() => setToast(null), 8000)
    }
    return null
  }

  function closeDialog() {
    setDialog({ open: false, classification: null, mou: null })
  }

  // W4-A.8: trackpad horizontal-scroll ergonomics + visible chevron
  // controls. scroll-snap on the grid + columns means a horizontal swipe
  // lands cleanly on a column boundary rather than mid-column. Chevron
  // buttons fade based on scrollLeft / scrollWidth so the operator sees
  // them only when more content exists in that direction.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollEdges, setScrollEdges] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth
      setScrollEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft < maxScroll - 4,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  const COLUMN_SCROLL_STEP = 304  // w-72 (288px) + gap-3 (12px) + a touch
  const scrollByColumn = (direction: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    // The grid container carries the `md:scroll-smooth` class so the CSS
    // `scroll-behaviour` property handles the easing; passing it via the
    // JS ScrollToOptions argument is therefore redundant.
    el.scrollBy({ left: direction * COLUMN_SCROLL_STEP })
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS, announcements: ANNOUNCEMENTS }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveMou(null)}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => scrollByColumn(-1)}
            aria-label="Scroll to previous columns"
            className={
              'absolute left-1 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy md:flex '
              + (scrollEdges.left ? 'opacity-100' : 'pointer-events-none opacity-0')
            }
            data-testid="kanban-scroll-left"
            aria-hidden={scrollEdges.left ? undefined : true}
            tabIndex={scrollEdges.left ? 0 : -1}
          >
            <ChevronLeft aria-hidden className="size-5 text-foreground" />
          </button>
          <button
            type="button"
            onClick={() => scrollByColumn(1)}
            aria-label="Scroll to next columns"
            className={
              'absolute right-1 top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy md:flex '
              + (scrollEdges.right ? 'opacity-100' : 'pointer-events-none opacity-0')
            }
            data-testid="kanban-scroll-right"
            aria-hidden={scrollEdges.right ? undefined : true}
            tabIndex={scrollEdges.right ? 0 : -1}
          >
            <ChevronRight aria-hidden className="size-5 text-foreground" />
          </button>
        <div
          ref={scrollRef}
          className="flex flex-col gap-3 pb-2 md:flex-row md:overflow-x-auto md:scroll-smooth md:snap-x md:snap-mandatory"
          role="region"
          aria-label="MOU lifecycle kanban board"
          data-testid="kanban-board"
        >
          {KANBAN_COLUMNS.map((col) => {
            const cards = initialBuckets[col.key] ?? []
            return (
              <DroppableStageColumn
                key={col.key}
                columnKey={col.key}
                label={col.label}
                variant={col.variant}
                count={cards.length}
              >
                {cards.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground">
                    Empty.
                  </p>
                ) : (
                  cards.map((mou) => (
                    <DraggableMouCard
                      key={mou.id}
                      mou={mou}
                      stage={col.key}
                      active={activeMou?.id === mou.id}
                      meta={cardMeta[mou.id]}
                    />
                  ))
                )}
              </DroppableStageColumn>
            )
          })}
        </div>
        </div>
        <DragOverlay>
          {activeMou ? (
            <div
              className="rounded-md border border-border bg-card p-3 text-left text-sm shadow-lg min-h-[88px] cursor-grabbing"
              data-testid="drag-overlay-card"
            >
              <MouCardBody mou={activeMou} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <TransitionDialog
        open={dialog.open}
        classification={dialog.classification}
        mouId={dialog.mou?.id ?? ''}
        schoolName={dialog.mou?.schoolName ?? ''}
        onClose={closeDialog}
        onConfirm={onConfirmTransition}
      />
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex max-w-sm items-start gap-2 rounded-md border border-border bg-card p-3 text-sm shadow-lg"
          data-testid="kanban-toast"
        >
          <span className="min-w-0 flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            aria-label="Dismiss notification"
            data-testid="kanban-toast-dismiss"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </>
  )
}

interface DroppableStageColumnProps {
  columnKey: KanbanStageKey
  label: string
  variant: 'lifecycle' | 'muted'
  count: number
  children: React.ReactNode
}

function DroppableStageColumn({ columnKey, label, variant, count, children }: DroppableStageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey })
  const isPreOps = columnKey === 'pre-ops'
  const overClass = isOver
    ? isPreOps
      ? 'ring-2 ring-signal-alert ring-inset cursor-not-allowed'
      : 'ring-2 ring-brand-navy ring-inset bg-muted/60'
    : ''
  // W3-C C3: column-header link to /mous?stage=<key> for the
  // all-schools-at-this-stage detail view.
  const headerHref = `/mous?stage=${encodeURIComponent(columnKey)}`
  return (
    <div
      ref={setNodeRef}
      className={`md:snap-start ${overClass}`.trim()}
      data-testid={`droppable-${columnKey}`}
    >
      <StageColumn
        columnKey={columnKey}
        label={label}
        variant={variant}
        count={count}
        headerHref={headerHref}
      >
        {children}
      </StageColumn>
    </div>
  )
}

interface DraggableMouCardProps {
  mou: MOU
  stage: KanbanStageKey
  active: boolean
  meta?: KanbanCardMeta
}

function DraggableMouCard({ mou, stage, active, meta }: DraggableMouCardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: mou.id })
  // W3-F.5 split: setNodeRef on the wrapping div so dnd-kit measures
  // the whole card; <a> is the click-to-navigate body (no listeners,
  // cursor-pointer via anchor default); <button> is the drag handle
  // and carries listeners + attributes (cursor-grab; Space / Enter
  // lifts via KeyboardSensor). pr-12 reserves space for the handle so
  // long school names do not collide with the icon.
  const urgency = getCardUrgency(stage, meta?.daysInStage ?? null)
  const urgencyClass = URGENCY_BORDER_CLASS[urgency]
  const urgencyLabel = urgencyAriaLabel(urgency, stage, meta?.daysInStage ?? null)
  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-md border border-border ${urgencyClass} bg-card hover:bg-muted ${active ? 'opacity-40' : ''}`}
      data-testid="mou-card"
      data-mou-id={mou.id}
      data-overdue={meta?.overdue ? 'true' : undefined}
      data-urgency={urgency}
    >
      <a
        href={`/mous/${mou.id}`}
        className="block min-h-[88px] rounded-md p-3 pr-12 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        title={urgencyLabel ? `${mou.schoolName} (${urgencyLabel})` : mou.schoolName}
      >
        <MouCardBody mou={mou} daysInStage={meta?.daysInStage} overdue={meta?.overdue} stage={stage} />
      </a>
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${mou.schoolName} card to move it between stages`}
        className="absolute right-1 top-1 flex size-11 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        data-testid="mou-card-drag-handle"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
    </div>
  )
}
