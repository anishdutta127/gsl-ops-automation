/*
 * StatusChip (W4-I.5 Phase 4 commit 1).
 *
 * Pill-shaped status indicator with consistent typography + optional
 * leading dot. Used by the Recent MOU Updates table, Orders &
 * Shipment Tracker, escalation detail pages, and (in commits 5-7)
 * every list page that surfaces status.
 *
 * Visual: rounded-full + thin tinted border + subtle tinted bg + bold
 * label + optional 6px coloured dot leading the label.
 *
 * Tone vocabulary chosen to span the existing semantic palette
 * without forcing surfaces to invent their own: 'ok', 'attention',
 * 'alert', 'neutral' map to the signal tokens; 'navy' + 'teal' map
 * to brand tokens for status states that are informational rather
 * than urgency-graded (e.g. "Order Raised" or "Shipped").
 *
 * Surfaces consume StatusChip with explicit tone + label rather than
 * encoding their status enums inside this primitive. Keeps the chip
 * agnostic to MOU.status / EscalationStatus / DispatchStage so it
 * works for whatever new statuses Phase 1.1 adds.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusChipTone = 'ok' | 'attention' | 'alert' | 'neutral' | 'navy' | 'teal'

const TONE_CLASS: Record<StatusChipTone, string> = {
  ok: 'bg-signal-ok/15 text-signal-ok border-signal-ok/30',
  attention: 'bg-signal-attention/15 text-signal-attention border-signal-attention/30',
  alert: 'bg-signal-alert/15 text-signal-alert border-signal-alert/30',
  neutral: 'bg-signal-neutral/15 text-signal-neutral border-signal-neutral/30',
  navy: 'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
  teal: 'bg-brand-teal/15 text-brand-navy border-brand-teal/30',
}

const DOT_CLASS: Record<StatusChipTone, string> = {
  ok: 'bg-signal-ok',
  attention: 'bg-signal-attention',
  alert: 'bg-signal-alert',
  neutral: 'bg-signal-neutral',
  navy: 'bg-brand-navy',
  teal: 'bg-brand-teal',
}

export interface StatusChipProps {
  tone: StatusChipTone
  label: string
  /** Show a leading 6px coloured dot. Default true. */
  withDot?: boolean
  /** Optional test hook. */
  testId?: string
  /** Optional override; for unusual layout needs. */
  className?: string
  /** Optional trailing icon or content. */
  trailing?: ReactNode
}

export function StatusChip({
  tone,
  label,
  withDot = true,
  testId,
  className,
  trailing,
}: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[tone],
        className,
      )}
      data-testid={testId}
      data-tone={tone}
    >
      {withDot ? (
        <span aria-hidden className={`size-1.5 rounded-full ${DOT_CLASS[tone]}`} />
      ) : null}
      {label}
      {trailing ? <span className="ml-0.5">{trailing}</span> : null}
    </span>
  )
}
