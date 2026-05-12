'use client'

/*
 * QueueFreshnessIndicatorClient (Gate 5A.5 Step 2; simplified
 * post-walkthrough Fix 1).
 *
 * Top-nav surface for triggering an immediate queue drain. Renders
 * as a plain "Sync now" button without any colour-coded status pill.
 *
 * Walkthrough finding: the original tri-state indicator (green
 * "Synced Nm ago" / amber "Pending N writes" / red "Sync stalled
 * Nm") read as a system-health alarm to leadership even when the
 * platform was working correctly; GitHub Actions cron variance
 * (see docs/gate-5a.5/SYNC_DIAGNOSTIC.md) routinely produced
 * 1-3 hour gaps that crossed the red threshold without any actual
 * problem. The colour-coded display moved to /admin/queue-status,
 * which is the right surface for Admin debugging.
 *
 * Click opens a dropdown that still shows the last-drain timestamp
 * and pending-write count as neutral diagnostic context, but with
 * no status colours. The Sync-now action lives both in the
 * dropdown and as the primary trigger.
 */

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  RefreshCcw,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatAgeMinutes,
  type FreshnessBucket,
} from '@/lib/sync/freshnessState'

interface Props {
  /** Kept for parity with the server component; not surfaced visually. */
  bucket: FreshnessBucket
  lastDrainAt: string | null
  ageMinutes: number | null
  queueDepth: number
  oldestPendingMinutes: number | null
}

export function QueueFreshnessIndicatorClient(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  async function handleSyncNow() {
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
        toast.success(`Synced ${drained} write${drained === 1 ? '' : 's'}. Page reloading.`)
      } else {
        toast.success(
          `Synced ${drained} write${drained === 1 ? '' : 's'}; ${remaining} still pending.`,
        )
      }
      if ((body.anomalies?.length ?? 0) > 0) {
        toast.error(`Sync flagged ${body.anomalies?.length} anomal${body.anomalies?.length === 1 ? 'y' : 'ies'}. Open queue status to review.`)
      }

      startTransition(() => router.refresh())
    } catch {
      toast.error('Sync did not run. Check your connection and try again.')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  const lastDrainLabel =
    props.lastDrainAt === null
      ? 'No sync recorded yet'
      : `Last drain: ${props.lastDrainAt.slice(0, 16).replace('T', ' ')} UTC`

  return (
    <div ref={wrapperRef} className="relative" data-testid="queue-freshness-wrapper">
      <button
        type="button"
        aria-label="Sync now"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="queue-freshness-button"
        onClick={() => setOpen((o) => !o)}
        className="hidden min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal sm:flex"
      >
        <RefreshCcw aria-hidden className="size-4" />
        <span className="hidden md:inline">Sync now</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Sync queue actions"
          data-testid="queue-freshness-dropdown"
          className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg"
        >
          <div className="border-b border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-600">{lastDrainLabel}</p>
            {props.queueDepth > 0 ? (
              <p className="mt-0.5 text-xs text-slate-600">
                {props.queueDepth === 1 ? '1 write pending' : `${props.queueDepth} writes pending`}
                {props.oldestPendingMinutes !== null
                  ? ` (oldest ${formatAgeMinutes(props.oldestPendingMinutes)})`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="px-3 py-2">
            <p className="mb-2 text-xs text-slate-600">
              The cron drains the queue automatically. Click below to force an immediate drain.
            </p>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={busy}
              data-testid="queue-freshness-sync-now"
              className="flex w-full min-h-11 items-center justify-center gap-2 rounded-md bg-brand-teal px-3 text-sm font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw aria-hidden className={'size-4 ' + (busy ? 'animate-spin' : '')} />
              {busy ? 'Syncing.' : 'Sync now'}
            </button>
          </div>

          <Link
            href="/admin/queue-status"
            onClick={() => setOpen(false)}
            data-testid="queue-freshness-open-status"
            className="flex min-h-11 items-center justify-center gap-1 border-t border-slate-200 px-3 py-2 text-sm font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            Open queue status
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
