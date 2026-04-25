/*
 * EscalationRow (DESIGN.md "Surface 1 / Escalation list row").
 *
 * Same anatomy as ExceptionRow plus lane pill, level pill, and
 * fan-out indicator. Lane pills include redundant Lucide icons
 * (Wrench / Briefcase / GraduationCap) for WCAG colour-not-only
 * compliance.
 */

import Link from 'next/link'
import { Briefcase, ChevronRight, GraduationCap, Wrench } from 'lucide-react'
import type { EscalationLane, EscalationLevel } from '@/lib/types'
import { cn } from '@/lib/utils'

interface EscalationRowProps {
  schoolName: string
  description: string
  lane: EscalationLane
  level: EscalationLevel
  notifiedNames: string[]
  daysSince: number
  href: string
}

const LANE_PILL: Record<
  EscalationLane,
  { className: string; icon: typeof Wrench; label: string }
> = {
  OPS: {
    className:
      'bg-[var(--brand-teal)] text-[var(--brand-navy)] border-transparent',
    icon: Wrench,
    label: 'Operations lane',
  },
  SALES: {
    className: 'bg-[var(--brand-navy)] text-white border-transparent',
    icon: Briefcase,
    label: 'Sales lane',
  },
  ACADEMICS: {
    className: 'bg-amber-700 text-white border-transparent',
    icon: GraduationCap,
    label: 'Academics lane',
  },
}

export function EscalationRow({
  schoolName,
  description,
  lane,
  level,
  notifiedNames,
  daysSince,
  href,
}: EscalationRowProps) {
  const pill = LANE_PILL[lane]
  const PillIcon = pill.icon
  const dayLabel = daysSince === 1 ? '1d' : `${daysSince}d`
  const fanOut =
    notifiedNames.length > 0
      ? `Notified: ${notifiedNames.join(', ')}`
      : 'No notifications recorded'

  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-[72px] items-start gap-4 px-4 py-3 hover:bg-slate-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        'focus-visible:outline-[var(--brand-navy)]',
      )}
      aria-label={`${schoolName} escalation, ${pill.label}, level ${level}. ${description}. ${dayLabel} since.`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-[var(--brand-navy)]">
            {schoolName}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase',
              pill.className,
            )}
          >
            <PillIcon aria-hidden className="size-3" />
            {lane}
          </span>
          <span className="inline-flex items-center rounded-full border border-[var(--brand-navy)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--brand-navy)]">
            {level}
          </span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm text-slate-700">{description}</div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
          <span>{fanOut}</span>
          <span aria-hidden>·</span>
          <span>{dayLabel}</span>
        </div>
      </div>
      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-slate-400" />
    </Link>
  )
}
