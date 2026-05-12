'use client'

/*
 * SyncNowButton (Gate 5A.5 Step 2).
 *
 * Stand-alone Sync-now control for /admin/queue-status and any
 * form-success surface that wants a fallback drain trigger. Calls
 * /api/sync/trigger then refreshes the route so the server
 * component re-renders with the post-drain state.
 *
 * The freshness indicator in TopNav owns its own Sync-now button
 * with the dropdown context; this one renders prominently when used
 * as a primary action on /admin/queue-status.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  /** 'primary' (teal solid) or 'outline' (teal border on white). */
  variant?: 'primary' | 'outline'
  /** Optional label override; defaults to "Sync now". */
  label?: string
  /** Optional className passthrough. */
  className?: string
}

export function SyncNowButton({
  variant = 'primary',
  label = 'Sync now',
  className = '',
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' })
      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; drained?: number; remaining?: number; reason?: string; retryAfterMs?: number; anomalies?: string[] }
        | null

      if (res.status === 429 && body) {
        const seconds = Math.ceil((body.retryAfterMs ?? 60_000) / 1000)
        toast.error(`Sync just ran. Try again in ${seconds}s.`)
        return
      }
      if (!res.ok || !body || body.ok === false) {
        toast.error('Sync did not run. Try again in a minute.')
        return
      }

      const drained = body.drained ?? 0
      const remaining = body.remaining ?? 0
      if (drained === 0 && remaining === 0) {
        toast.success('Queue is empty. Nothing to sync.')
      } else if (remaining === 0) {
        toast.success(`Synced ${drained} write${drained === 1 ? '' : 's'}.`)
      } else {
        toast.success(
          `Synced ${drained} write${drained === 1 ? '' : 's'}; ${remaining} still pending.`,
        )
      }
      if ((body.anomalies?.length ?? 0) > 0) {
        toast.error(`Sync flagged ${body.anomalies?.length} anomal${body.anomalies?.length === 1 ? 'y' : 'ies'}. Check sync history.`)
      }

      startTransition(() => router.refresh())
    } catch {
      toast.error('Sync did not run. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      data-testid="sync-now-button"
      className={
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-60 '
        + (variant === 'primary'
          ? 'bg-brand-teal text-brand-navy hover:bg-brand-teal/90 '
          : 'border border-brand-teal bg-white text-brand-navy hover:bg-brand-teal/10 ')
        + className
      }
    >
      <RefreshCcw aria-hidden className={'size-4 ' + (busy ? 'animate-spin' : '')} />
      {busy ? 'Syncing.' : label}
    </button>
  )
}
