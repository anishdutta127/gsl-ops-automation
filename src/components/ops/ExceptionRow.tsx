/*
 * ExceptionRow (DESIGN.md "Surface 1 / Exception feed row").
 *
 * Server Component (rendered as part of a list of links).
 * 72px tall desktop, 88px mobile (44px touch target preserved).
 * Click target: entire row.
 */

import Link from 'next/link'
import {
  AlertCircle,
  ChevronRight,
  FileText,
  MailX,
  MessageSquare,
  Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExceptionPriority = 'alert' | 'attention' | 'neutral'

export type ExceptionIconType =
  | 'late-actuals'
  | 'overdue-invoice'
  | 'stuck-dispatch'
  | 'missing-feedback'
  | 'failed-communication'

interface ExceptionRowProps {
  schoolName: string
  description: string
  daysSince: number
  priority: ExceptionPriority
  iconType: ExceptionIconType
  href: string
}

const ICON: Record<ExceptionIconType, typeof AlertCircle> = {
  'late-actuals': AlertCircle,
  'overdue-invoice': FileText,
  'stuck-dispatch': Truck,
  'missing-feedback': MessageSquare,
  'failed-communication': MailX,
}

const PRIORITY_DOT: Record<ExceptionPriority, string> = {
  alert: 'bg-[var(--signal-alert)]',
  attention: 'bg-[var(--signal-attention)]',
  neutral: 'bg-[var(--signal-neutral)]',
}

const PRIORITY_LABEL: Record<ExceptionPriority, string> = {
  alert: 'Action required',
  attention: 'Needs attention',
  neutral: 'Informational',
}

export function ExceptionRow({
  schoolName,
  description,
  daysSince,
  priority,
  iconType,
  href,
}: ExceptionRowProps) {
  const Icon = ICON[iconType]
  const dayLabel = daysSince === 1 ? '1d' : `${daysSince}d`

  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-[72px] items-center gap-4 px-4 py-3 hover:bg-slate-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        'focus-visible:outline-[var(--brand-navy)]',
        'sm:min-h-[72px]',
      )}
      aria-label={`${schoolName}: ${description}. ${PRIORITY_LABEL[priority]}. ${dayLabel} since.`}
    >
      <Icon aria-hidden className="size-6 shrink-0 text-[var(--signal-neutral)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium text-[var(--brand-navy)]">
          {schoolName}
        </div>
        <div className="line-clamp-2 text-sm text-slate-700">{description}</div>
        <div className="mt-0.5 text-xs text-slate-500">{dayLabel}</div>
      </div>
      <span
        className={cn('size-2 shrink-0 rounded-full', PRIORITY_DOT[priority])}
        aria-hidden
      />
      <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
    </Link>
  )
}
