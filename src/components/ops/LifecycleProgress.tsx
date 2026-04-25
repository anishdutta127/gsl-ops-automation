/*
 * LifecycleProgress (DESIGN.md "Surface 5 / Lifecycle progress component").
 *
 * Renders the 8-stage MOU lifecycle visualisation on the read-only
 * SPOC status portal. Server Component. Consumes LifecycleStage[]
 * from src/lib/portal/lifecycleProgress.ts so the email status
 * block (Surface 3) and this live-page renderer (Surface 5) cannot
 * disagree on stage state.
 *
 * Layout: 8-stage horizontal stepper on desktop (>=640px); vertical
 * stack on mobile. Each stage carries a circle (filled teal /
 * filled amber / outline slate-300) plus a label and a date or
 * status text. WCAG 2.1 AA: every stage carries colour + icon +
 * text + date so colour is never the only signal.
 */

import { Check, Circle as CircleIcon } from 'lucide-react'
import type { LifecycleStage, StageStatus } from '@/lib/portal/lifecycleProgress'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface LifecycleProgressProps {
  stages: LifecycleStage[]
}

const STATUS_LABEL: Record<StageStatus, string> = {
  completed: 'Completed',
  current: 'In progress',
  future: 'Upcoming',
}

export function LifecycleProgress({ stages }: LifecycleProgressProps) {
  return (
    <ol
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-2"
      aria-label="MOU lifecycle progress"
    >
      {stages.map((stage) => (
        <StageItem key={stage.key} stage={stage} />
      ))}
    </ol>
  )
}

function StageItem({ stage }: { stage: LifecycleStage }) {
  const { status, label, date, detail } = stage
  const dateText = renderDateText(status, date)
  return (
    <li
      className="flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-1 sm:text-center"
      aria-label={`${label}: ${STATUS_LABEL[status]}${dateText ? ', ' + dateText : ''}`}
    >
      <StageCircle status={status} />
      <div className="min-w-0 flex-1 sm:w-full">
        <div className="text-sm font-bold text-[var(--brand-navy)]">{label}</div>
        {status === 'current' ? (
          <div className="text-xs font-semibold text-amber-700">In progress</div>
        ) : null}
        {dateText ? (
          <div
            className={cn(
              'text-xs',
              status === 'completed'
                ? 'text-[var(--brand-navy)]'
                : status === 'current'
                  ? 'text-slate-700'
                  : 'text-slate-500',
            )}
          >
            {dateText}
          </div>
        ) : null}
        {detail && status === 'completed' ? (
          <div className="text-xs text-slate-600">{detail}</div>
        ) : null}
      </div>
    </li>
  )
}

function renderDateText(status: StageStatus, date: string | null): string | null {
  if (date === null) {
    return status === 'future' ? 'TBD' : null
  }
  return formatDate(date)
}

function StageCircle({ status }: { status: StageStatus }) {
  if (status === 'completed') {
    return (
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-teal)] text-white"
        aria-hidden
      >
        <Check className="size-4" />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--signal-attention)] text-white"
        aria-hidden
      >
        <CircleIcon className="size-4 fill-current" />
      </span>
    )
  }
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white"
      aria-hidden
    />
  )
}
