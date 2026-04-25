/*
 * TriggerTile (DESIGN.md "Surface 1 / Trigger tile component").
 *
 * 10 of these on the Leadership Console mapping to step 6.5 items
 * A through J. Smaller than HealthTile (96px tall vs 144px).
 * The primary number itself takes the status colour because the
 * number IS the signal; an icon plus text-status carry redundant
 * meaning per WCAG 2.1 AA "colour is never the only signal".
 */

import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TriggerStatus = 'ok' | 'attention' | 'alert' | 'neutral'

interface TriggerTileProps {
  label: string
  primary: string
  threshold: string
  status?: TriggerStatus
  trendDirection?: 'up' | 'down' | 'flat'
}

const STATUS_TEXT: Record<TriggerStatus, string> = {
  ok: 'text-[var(--signal-neutral)]',
  attention: 'text-[var(--signal-attention)]',
  alert: 'text-[var(--signal-alert)]',
  neutral: 'text-[var(--signal-neutral)]',
}

const STATUS_LABEL: Record<TriggerStatus, string> = {
  ok: 'Within range',
  attention: 'Drifting',
  alert: 'Threshold breached',
  neutral: 'Informational',
}

function StatusIcon({ status, trendDirection }: { status: TriggerStatus; trendDirection?: 'up' | 'down' | 'flat' }) {
  if (status === 'alert') return <AlertTriangle aria-hidden className="size-4" />
  if (status === 'attention') return <AlertTriangle aria-hidden className="size-4" />
  if (trendDirection === 'up') return <TrendingUp aria-hidden className="size-4" />
  if (trendDirection === 'down') return <TrendingDown aria-hidden className="size-4" />
  return <Minus aria-hidden className="size-4" />
}

export function TriggerTile({
  label,
  primary,
  threshold,
  status = 'neutral',
  trendDirection,
}: TriggerTileProps) {
  return (
    <div
      className="rounded-lg border border-[var(--signal-neutral)]/20 bg-card p-3 shadow-sm"
      role="group"
      aria-label={`${label}: ${primary}, ${STATUS_LABEL[status]}. ${threshold}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        {label}
      </div>
      <div className={cn('mt-1 flex items-center gap-2', STATUS_TEXT[status])}>
        <span
          className="text-2xl font-bold"
          style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
        >
          {primary}
        </span>
        <StatusIcon status={status} trendDirection={trendDirection} />
        <span className="sr-only">{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-1 text-[11px] text-[var(--signal-neutral)]">{threshold}</div>
    </div>
  )
}
