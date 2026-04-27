'use client'

/*
 * KanbanBoard (W3-C C2; client wrapper for drag mechanics).
 *
 * Wraps the static StageColumn / MouCard layout from C1 in a
 * @dnd-kit/core DndContext. PointerSensor (8px activation distance)
 * disambiguates click-vs-drag so MouCard's Link still navigates on
 * tap. KeyboardSensor + sortableKeyboardCoordinates provide arrow-
 * key navigation between columns and within a column. Drag overlay
 * renders a visual clone that follows the cursor; the original card
 * stays in place at opacity-40 until drop or cancel.
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

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { StageColumn } from './StageColumn'
import { TransitionDialog } from './TransitionDialog'

interface KanbanBoardProps {
  /** Server-rendered: { stageKey -> MOUs in that column }. */
  initialBuckets: Record<KanbanStageKey, MOU[]>
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

export function KanbanBoard({ initialBuckets }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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
      window.setTimeout(() => setToast(null), 4000)
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
      window.setTimeout(() => setToast(null), 6000)
    }
    return null
  }

  function closeDialog() {
    setDialog({ open: false, classification: null, mou: null })
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
        <div
          className="flex gap-3 overflow-x-auto pb-2"
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
                  cards.map((mou) => <DraggableMouCard key={mou.id} mou={mou} active={activeMou?.id === mou.id} />)
                )}
              </DroppableStageColumn>
            )
          })}
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
          className="fixed bottom-4 right-4 z-40 max-w-sm rounded-md border border-border bg-card p-3 text-sm shadow-lg"
          data-testid="kanban-toast"
        >
          {toast}
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
  return (
    <div ref={setNodeRef} className={overClass} data-testid={`droppable-${columnKey}`}>
      <StageColumn columnKey={columnKey} label={label} variant={variant} count={count}>
        {children}
      </StageColumn>
    </div>
  )
}

interface DraggableMouCardProps {
  mou: MOU
  active: boolean
}

function DraggableMouCard({ mou, active }: DraggableMouCardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: mou.id })
  return (
    <a
      ref={setNodeRef}
      href={`/mous/${mou.id}`}
      {...listeners}
      {...attributes}
      className={`block rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy min-h-[88px] ${active ? 'opacity-40' : ''}`}
      title={mou.schoolName}
      data-testid="mou-card"
      data-mou-id={mou.id}
    >
      <MouCardBody mou={mou} />
    </a>
  )
}
