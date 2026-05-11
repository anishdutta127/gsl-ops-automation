'use client'

/*
 * VEX PI status transition strip. Finance / Admin only.
 *
 * Status order from gsl-mou-system VexPiStatus enum:
 *   Generated -> Payment Pending -> Delivery Pending -> Partially Dispatched -> Completed
 *
 * Phase 1: status transitions are recorded as an audit entry on the
 * PI; the actual state machine (which derives status from payments
 * received + dispatches raised) stays in the migrated mou-system
 * code. Finance can still nudge the status manually e.g. to mark a
 * deal Completed when the last delivery is acknowledged out-of-band.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VexPi, VexPiStatus } from '@/lib/mouSystem/types'

const STATUSES: VexPiStatus[] = [
  'Generated',
  'Payment Pending',
  'Delivery Pending',
  'Partially Dispatched',
  'Completed',
]

export function VexPiStatusBar({ pi }: { pi: VexPi }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function flip(next: VexPiStatus) {
    if (next === pi.status) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/operations/vex/pi/${pi.id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as {
          error?: string
          message?: string
        }
        throw new Error(b.message ?? b.error ?? `Transition failed (${res.status})`)
      }
      setToast('Status updated. Will reflect everywhere within ~5 minutes.')
      router.refresh()
      setTimeout(() => setToast(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => {
          const active = pi.status === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => flip(s)}
              disabled={busy || active}
              aria-pressed={active}
              className={
                'min-h-9 rounded-full border px-3 py-1 text-xs font-medium ' +
                (active
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-border bg-card text-foreground hover:bg-muted disabled:opacity-50')
              }
            >
              {s}
            </button>
          )
        })}
      </div>
      {toast ? (
        <p className="mt-2 text-xs text-emerald-700">{toast}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      ) : null}
    </div>
  )
}
