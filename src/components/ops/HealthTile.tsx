/*
 * HealthTile (DESIGN.md "Surface 1 / Health tile").
 *
 * Server Component. 5 of these on the Leadership Console.
 * Anatomy: label / primary / unit / optional trend / status dot.
 * Status colour appears as a dot, not as a number tint (the number
 * stays navy).
 */

import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TileStatus = 'ok' | 'attention' | 'alert' | 'neutral'

interface HealthTileProps {
  label: string
  primary: string
  unit?: string
  trend?: { direction: 'up' | 'down' | 'flat'; magnitude: string }
  status?: TileStatus
}

const STATUS_DOT: Record<TileStatus, string> = {
  ok: 'bg-[var(--signal-ok)]',
  attention: 'bg-[var(--signal-attention)]',
  alert: 'bg-[var(--signal-alert)]',
  neutral: 'bg-[var(--signal-neutral)]',
}

const TREND_TEXT: Record<TileStatus, string> = {
  ok: 'text-[var(--signal-ok)]',
  attention: 'text-[var(--signal-attention)]',
  alert: 'text-[var(--signal-alert)]',
  neutral: 'text-[var(--signal-neutral)]',
}

const STATUS_LABEL: Record<TileStatus, string> = {
  ok: 'Healthy',
  attention: 'Needs attention',
  alert: 'Action required',
  neutral: 'Informational',
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <ArrowUp aria-hidden className="size-3" />
  if (direction === 'down') return <ArrowDown aria-hidden className="size-3" />
  return <Minus aria-hidden className="size-3" />
}

export function HealthTile({
  label,
  primary,
  unit,
  trend,
  status = 'neutral',
}: HealthTileProps) {
  return (
    <div
      className="relative rounded-lg border border-[var(--signal-neutral)]/20 bg-card p-4 shadow-sm"
      role="group"
      aria-label={`${label}: ${primary}${unit ? ' ' + unit : ''}, ${STATUS_LABEL[status]}`}
    >
      <span
        className={cn('absolute right-4 top-4 size-2 rounded-full', STATUS_DOT[status])}
        aria-hidden
      />
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--signal-neutral)]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-3xl font-bold text-[var(--brand-navy)]"
          style={{ fontFamily: 'var(--font-montserrat), sans-serif' }}
        >
          {primary}
        </span>
        {unit ? (
          <span className="text-sm text-[var(--signal-neutral)]">{unit}</span>
        ) : null}
      </div>
      {trend ? (
        <div
          className={cn('mt-1 flex items-center gap-1 text-xs', TREND_TEXT[status])}
        >
          <TrendIcon direction={trend.direction} />
          <span>{trend.magnitude}</span>
        </div>
      ) : null}
    </div>
  )
}
