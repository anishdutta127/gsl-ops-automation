/*
 * TriggerTile (DESIGN.md "Surface 1 / Trigger tile component" + W4-B.2).
 *
 * Post-W4-A.7 the grid is 9 tiles (Legacy schools EXCLUDED removed).
 * Smaller than HealthTile (96px tall vs 144px). The primary number
 * itself takes the status colour because the number IS the signal;
 * an icon plus text-status carry redundant meaning per WCAG 2.1 AA
 * "colour is never the only signal".
 *
 * W4-B.2 adds a click-and-stay info popover at top-right of each
 * tile (Info lucide icon; 44px touch target). Content sourced from
 * src/content/triggerTileInfo.ts keyed by tile label; the popover
 * itself is the only client-hydrated bit, the rest of the tile stays
 * server-rendered.
 */

import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TRIGGER_TILE_INFO } from '@/content/triggerTileInfo'
import { TriggerTileInfoPopover } from './TriggerTileInfoPopover'

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
  const info = TRIGGER_TILE_INFO[label]
  return (
    <div
      className="relative rounded-lg border border-[var(--signal-neutral)]/20 bg-card p-3 pr-12 shadow-sm"
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
      {info !== undefined ? (
        <TriggerTileInfoPopover label={label} info={info} />
      ) : null}
    </div>
  )
}
