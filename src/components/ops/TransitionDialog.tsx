'use client'

/*
 * TransitionDialog (W3-C C2; kanban transition popup).
 *
 * Renders the four kanban-transition shapes (forward-by-one,
 * forward-skip, backward, pre-ops-exit) with consistent chrome and
 * conditional reason field. Path A (navigate-on-confirm) per the
 * pre-C2 alignment: forward transitions navigate to the existing
 * /mous/[id]/{action} form; backward + Pre-Ops exit write
 * 'kanban-stage-transition' audit entry via /api/kanban/transition
 * and close.
 *
 * Reason field rules per W3-A.1 design:
 *   forward-by-one  - no reason needed; happy path
 *   forward-skip    - required; min 5 chars
 *   backward        - required; min 5 chars
 *   pre-ops-exit    - required; min 5 chars (triage decision)
 *
 * Accessibility: native <dialog> element with explicit close button +
 * Esc-to-close (browser default). Focus traps to first interactive
 * element on open. role="dialog" + aria-labelledby + aria-describedby.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import type { TransitionClassification } from '@/lib/kanban/transitions'

interface TransitionDialogProps {
  open: boolean
  classification: TransitionClassification | null
  mouId: string
  schoolName: string
  onClose: () => void
  /**
   * Called by the dialog's confirm handler. The parent (KanbanBoard)
   * wires this to the transition API + navigation. Returns null on
   * success, an error message on failure (surfaces in the dialog).
   */
  onConfirm: (reason: string | null) => Promise<string | null>
}

const TITLE: Record<TransitionClassification['copyKey'], string> = {
  'no-op': '',
  'forward-by-one': 'Continue to next stage',
  'forward-skip': 'Skip stages',
  'backward': 'Move back to a prior stage',
  'pre-ops-exit': 'Triage decision',
  'rejected-pre-ops': '',
}

function bodyCopy(c: TransitionClassification, schoolName: string): string {
  switch (c.copyKey) {
    case 'forward-by-one':
      return `Move ${schoolName} from ${c.fromStage} to ${c.toStage}. You'll be taken to the matching form to complete the transition.`
    case 'forward-skip':
      return `Move ${schoolName} from ${c.fromStage} to ${c.toStage}, skipping intermediate stages. The reason is logged in the audit trail; reach out to Anish if any of the skipped stages need their data filled in afterwards.`
    case 'backward':
      return `Move ${schoolName} from ${c.fromStage} back to ${c.toStage}. Lifecycle data won't auto-revert; the audit log captures your reason. To actually revert state, edit the MOU at /mous/${'{id}'}.`
    case 'pre-ops-exit':
      return `Move ${schoolName} out of Pre-Ops Legacy to ${c.toStage}. Pre-Ops is a triage holding bay; cards never return to it.`
    default:
      return ''
  }
}

export function TransitionDialog({
  open,
  classification,
  mouId,
  schoolName,
  onClose,
  onConfirm,
}: TransitionDialogProps) {
  const router = useRouter()
  const reasonId = useId()
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setReason('')
      setReasonError(null)
      setSubmitError(null)
      setSubmitting(false)
      // Move focus into the dialog for keyboard users.
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>('textarea, button')
      firstFocusable?.focus()
    }
  }, [open, classification])

  if (!open || !classification) return null

  const reasonRequired = classification.reasonRequired
  const isForward = classification.kind === 'forward-by-one' || classification.kind === 'forward-skip' || classification.kind === 'pre-ops-exit'
  const navTarget = classification.forwardFormPath
  const title = TITLE[classification.copyKey]
  const body = bodyCopy(classification, schoolName).replace('{id}', mouId)

  async function handleConfirm() {
    if (!classification) return
    if (reasonRequired) {
      const trimmed = reason.trim()
      if (trimmed === '') {
        setReasonError('Reason is required for this transition.')
        return
      }
      if (trimmed.length < 5) {
        setReasonError('Reason must be at least 5 characters.')
        return
      }
      setReasonError(null)
    }
    setSubmitting(true)
    const error = await onConfirm(reasonRequired ? reason.trim() : null)
    setSubmitting(false)
    if (error) {
      setSubmitError(error)
      return
    }
    if (isForward && navTarget) {
      router.push(navTarget)
    } else {
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="transition-dialog"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-heading text-lg font-semibold text-brand-navy">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            aria-label="Close dialog"
          >
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <p id={descId} className="text-sm text-foreground">{body}</p>

        {reasonRequired ? (
          <div className="mt-4">
            <label
              htmlFor={reasonId}
              className="mb-1 block text-sm font-medium text-brand-navy"
            >
              Reason (logged in audit):
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(null)
              }}
              rows={3}
              minLength={5}
              required
              className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              placeholder="Briefly explain why this transition is happening; min 5 characters."
              data-testid="transition-reason"
            />
            {reasonError ? (
              <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-signal-alert">
                <AlertTriangle aria-hidden className="size-3 shrink-0" />
                <span>{reasonError}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-signal-alert bg-card p-2 text-xs text-signal-alert"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{submitError}</span>
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:opacity-50"
            data-testid="transition-confirm"
          >
            {submitting ? 'Working...' : isForward ? 'Continue to form' : 'Record move'}
          </button>
        </div>
      </div>
    </div>
  )
}
