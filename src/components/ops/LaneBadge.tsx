/*
 * LaneBadge.
 *
 * Standalone lane pill: icon + colour + text, the WCAG 2.1 AA
 * "colour is never the only signal" triple. Extracted from
 * EscalationRow so detail-page headers and other surfaces can
 * reuse the same anatomy.
 *
 * Three lanes per Q-I:
 *   - OPS:       teal bg + navy text + Wrench
 *   - SALES:     navy bg + white text + Briefcase
 *   - ACADEMICS: amber-700 bg + white text + GraduationCap
 *
 * Optional `size` prop scales the pill for header use vs row use.
 */

import { Briefcase, GraduationCap, Wrench } from 'lucide-react'
import type { EscalationLane } from '@/lib/types'
import { cn } from '@/lib/utils'

const LANE: Record<
  EscalationLane,
  { className: string; icon: typeof Wrench; label: string }
> = {
  OPS: {
    className: 'bg-brand-teal text-brand-navy border-transparent',
    icon: Wrench,
    label: 'Operations lane',
  },
  SALES: {
    className: 'bg-brand-navy text-white border-transparent',
    icon: Briefcase,
    label: 'Sales lane',
  },
  ACADEMICS: {
    className: 'bg-amber-700 text-white border-transparent',
    icon: GraduationCap,
    label: 'Academics lane',
  },
}

interface LaneBadgeProps {
  lane: EscalationLane
  size?: 'sm' | 'md'
}

export function LaneBadge({ lane, size = 'sm' }: LaneBadgeProps) {
  const meta = LANE[lane]
  const Icon = meta.icon
  const sizeClass =
    size === 'md'
      ? 'gap-1.5 rounded-full border px-3 py-1 text-xs'
      : 'gap-1 rounded-full border px-2 py-0.5 text-[11px]'
  const iconSize = size === 'md' ? 'size-3.5' : 'size-3'
  return (
    <span
      className={cn('inline-flex items-center font-semibold uppercase', sizeClass, meta.className)}
      aria-label={meta.label}
    >
      <Icon aria-hidden className={iconSize} />
      {lane}
    </span>
  )
}

export const LANE_LABEL: Record<EscalationLane, string> = {
  OPS: 'Operations lane',
  SALES: 'Sales lane',
  ACADEMICS: 'Academics lane',
}
