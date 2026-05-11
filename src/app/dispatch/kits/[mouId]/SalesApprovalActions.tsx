'use client'

/*
 * SalesApprovalActions (Gate 3 Step 4).
 *
 * Approve / Reject affordances for the Sales rep. Approve transitions
 * salesApprovalStatus to 'Approved' and generates the initial
 * DispatchSummary stub. Reject requires a non-empty reason and routes
 * back to Ops for revision.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle } from 'lucide-react'

interface Props {
  mouId: string
}

export function SalesApprovalActions({ mouId }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<'idle' | 'approving' | 'rejecting'>('idle')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [reason, setReason] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function approve(): Promise<void> {
    setBusy('approving')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Approve failed (${res.status})`)
      }
      router.refresh()
    } catch (e) {
      setBusy('idle')
      setErrorMessage(e instanceof Error ? e.message : 'Approve failed')
    }
  }

  async function reject(): Promise<void> {
    if (reason.trim() === '') {
      setErrorMessage('A rejection reason is required.')
      return
    }
    setBusy('rejecting')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Reject failed (${res.status})`)
      }
      setShowRejectForm(false)
      setReason('')
      router.refresh()
    } catch (e) {
      setBusy('idle')
      setErrorMessage(e instanceof Error ? e.message : 'Reject failed')
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={busy !== 'idle'}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          data-testid="approve-button"
        >
          <CheckCircle aria-hidden className="size-4" />
          {busy === 'approving' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => setShowRejectForm((v) => !v)}
          disabled={busy !== 'idle'}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-signal-alert/60 bg-white px-4 py-2 text-sm font-semibold text-signal-alert hover:bg-red-50 disabled:opacity-60"
          data-testid="reject-toggle"
        >
          <XCircle aria-hidden className="size-4" />
          Reject
        </button>
      </div>

      {showRejectForm && (
        <div className="rounded-md border border-border bg-card p-3" data-testid="reject-form">
          <label className="block text-xs font-medium text-brand-navy">
            Rejection reason (required)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            placeholder="e.g., Quantity for Grade 6 looks wrong; please confirm with school."
            data-testid="reject-reason-input"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false)
                setReason('')
                setErrorMessage(null)
              }}
              className="min-h-11 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void reject()}
              disabled={busy === 'rejecting'}
              className="min-h-11 rounded-md bg-signal-alert px-3 py-1.5 text-sm font-semibold text-white hover:bg-signal-alert/90 disabled:opacity-60"
              data-testid="confirm-reject"
            >
              {busy === 'rejecting' ? 'Rejecting...' : 'Confirm reject'}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}
    </div>
  )
}
