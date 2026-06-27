'use client'

/*
 * VEX PI void danger zone (Pass 2). Finance only. Shows the cascade preview
 * (pre-ship dispatches + payment_logs that will be voided) and blocks when the
 * PI has a committed (Shipped/Invoiced/Delivered) dispatch. POSTs to
 * /api/operations/vex/pi/[id]/void and refreshes.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const REASON_COPY: Record<string, string> = {
  'already-voided': 'This PI is already voided.',
  'missing-reason': 'A reason of at least 10 characters is required.',
  'has-committed-dispatch': 'This PI has a shipped or invoiced dispatch. Handle those dispatches before voiding the PI.',
  permission: 'You do not have permission to void a VEX PI.',
  'pi-not-found': 'PI not found.',
}

interface Props {
  piId: string
  preShipCount: number
  logCount: number
  committed: string[] // committed dispatch labels; non-empty => blocked
}

export function VexPiVoidButton({ piId, preShipCount, logCount, committed }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked = committed.length > 0

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vex/pi/${piId}/void`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string; committed?: string[] }
        throw new Error(REASON_COPY[b.error ?? ''] ?? b.error ?? `Failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Void failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-red-200 bg-card p-4">
      <h3 className="font-heading text-sm font-semibold text-brand-navy">Void this PI</h3>
      {blocked ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          Cannot void: this PI has a committed dispatch ({committed.join(', ')}). The goods or tax
          invoice have left. Handle those dispatches first.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Soft-deletes the PI and cascade-voids {preShipCount} pre-ship dispatch
            {preShipCount === 1 ? '' : 'es'} and {logCount} payment log{logCount === 1 ? '' : 's'},
            zeroing the received balance. The rows are kept for audit, not deleted.
          </p>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 inline-flex min-h-9 items-center rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Void this PI
            </button>
          ) : (
            <div className="mt-2 space-y-2">
              {error ? (
                <div className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800" role="alert">
                  {error}
                </div>
              ) : null}
              <label className="block">
                <span className="block text-xs text-muted-foreground">Reason (min 10 characters)</span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-label="Void reason"
                  className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || reason.trim().length < 10}
                  onClick={submit}
                  className="inline-flex min-h-10 items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? 'Voiding...' : 'Confirm void + cascade'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-10 items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
