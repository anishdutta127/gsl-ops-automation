'use client'

/*
 * QueueFreshnessIndicatorClient (Gate 5A.5 Step 2).
 *
 * Client half of the top-nav queue indicator. Owns the dropdown
 * open/close state and the Sync-now POST. Server passes the
 * computed bucket + counts so the initial paint is correct without
 * any client roundtrip.
 *
 * After a successful Sync-now we refresh the route segment so the
 * server component re-reads sync_health + pending_updates and the
 * badge re-paints with the post-drain state. Sonner toast surfaces
 * the drained count, or a rate-limit / error message.
 */

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  RefreshCcw,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  formatAgeMinutes,
  type FreshnessBucket,
} from '@/lib/sync/freshnessState'

interface Props {
  bucket: FreshnessBucket
  lastDrainAt: string | null
  ageMinutes: number | null
  queueDepth: number
  oldestPendingMinutes: number | null
}

const BUCKET_DOT: Record<FreshnessBucket, string> = {
  synced: 'bg-signal-ok',
  pending: 'bg-signal-attention',
  stalled: 'bg-signal-alert',
}

const BUCKET_ICON_TEXT: Record<FreshnessBucket, string> = {
  synced: 'text-signal-ok',
  pending: 'text-signal-attention',
  stalled: 'text-signal-alert',
}

function bucketLabel(
  bucket: FreshnessBucket,
  ageMinutes: number | null,
  queueDepth: number,
): string {
  if (bucket === 'pending') {
    return queueDepth === 1 ? 'Pending 1 write' : `Pending ${queueDepth} writes`
  }
  if (bucket === 'stalled') {
    if (ageMinutes === null) return 'Sync never run'
    return `Sync stalled ${formatAgeMinutes(ageMinutes)}`
  }
  return `Synced ${formatAgeMinutes(ageMinutes)}`
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

  const label = bucketLabel(props.bucket, props.ageMinutes, props.queueDepth)
  const lastDrainLabel =
    props.lastDrainAt === null
      ? 'No sync recorded yet'
      : `Last drain: ${props.lastDrainAt.slice(0, 16).replace('T', ' ')} UTC`
  const StatusIcon =
    props.bucket === 'synced'
      ? CheckCircle2
      : props.bucket === 'pending'
        ? CircleDashed
        : AlertTriangle

  return (
    <div ref={wrapperRef} className="relative" data-testid="queue-freshness-wrapper">
      <button
        type="button"
        aria-label={`Sync status: ${label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="queue-freshness-button"
        data-bucket={props.bucket}
        onClick={() => setOpen((o) => !o)}
        className="hidden min-h-11 items-center gap-2 rounded-md px-2 text-xs font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-teal sm:flex"
      >
        <span
          aria-hidden
          className={'inline-block size-2 rounded-full ' + BUCKET_DOT[props.bucket]}
        />
        <span className="hidden md:inline">{label}</span>
        <span className="md:hidden">Sync</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Sync queue status"
          data-testid="queue-freshness-dropdown"
          className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[90vw] rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg"
        >
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusIcon
                aria-hidden
                className={'size-4 ' + BUCKET_ICON_TEXT[props.bucket]}
              />
              <span className="text-sm font-semibold text-brand-navy">
                {label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{lastDrainLabel}</p>
            {props.queueDepth > 0 ? (
              <p className="mt-0.5 text-xs text-slate-600">
                Oldest pending: {formatAgeMinutes(props.oldestPendingMinutes)}
              </p>
            ) : null}
          </div>

          <div className="px-3 py-2">
            <p className="mb-2 text-xs text-slate-600">
              The cron drains the queue every 5 minutes. Click below to force an immediate drain.
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
