/*
 * StatusTracker (Gate 4 Step 1).
 *
 * Horizontal stepper visualisation of the 10-stage MOU lifecycle.
 * Used on:
 *   - MOU detail page header (prominent, all 10 stages)
 *   - School detail "MOUs" tab as a per-MOU mini-tracker (compact mode)
 *
 * Each stage badge is keyboard-accessible; clicking jumps the page to
 * a section anchor (e.g., #pi-section, #dispatch-section). Stages with
 * no matching anchor on the current page navigate to the MOU detail
 * route + anchor instead.
 *
 * Visual states:
 *   done    -> filled brand-teal circle with check
 *   current -> filled signal-attention circle (amber-700 text on white)
 *   future  -> outline slate-300 circle
 *
 * Compact mode collapses the connecting line + labels into a tight
 * pill row so per-MOU mini-trackers fit inside dense School-detail
 * MOU cards.
 */

import { Check, Circle, CircleDot } from 'lucide-react'
import {
  STAGE_ORDER,
  STAGE_LABEL,
  buildStageBadges,
  type LifecycleStage,
  type StageVisualState,
} from '@/lib/statusTracker'

interface Props {
  current: LifecycleStage
  /** Compact mode hides labels and the connecting line for dense layouts. */
  compact?: boolean
  /** Optional anchor map per stage; click jumps to anchor on the same page.
   *  Missing entries render as inert dots (no link). Useful for the
   *  School-detail mini-tracker where there's no per-stage anchor. */
  anchors?: Partial<Record<LifecycleStage, string>>
  /** Optional MOU id; when set, missing anchors fall back to a deep-link
   *  into the MOU detail page (`/mous/[mouId]#<stage>`). */
  mouId?: string
  testId?: string
}

const STATE_VISUAL: Record<
  StageVisualState,
  { wrapClass: string; iconClass: string; labelClass: string }
> = {
  done: {
    wrapClass: 'bg-brand-teal text-brand-navy',
    iconClass: 'text-brand-navy',
    labelClass: 'text-brand-navy font-medium',
  },
  current: {
    wrapClass: 'bg-amber-100 ring-2 ring-amber-600 text-amber-800',
    iconClass: 'text-amber-700',
    labelClass: 'text-amber-700 font-semibold',
  },
  future: {
    wrapClass: 'bg-white border border-slate-300 text-slate-400',
    iconClass: 'text-slate-400',
    labelClass: 'text-slate-500',
  },
}

export function StatusTracker({
  current,
  compact = false,
  anchors,
  mouId,
  testId = 'status-tracker',
}: Props) {
  const badges = buildStageBadges(current)
  return (
    <ol
      data-testid={testId}
      data-current-stage={current}
      aria-label="MOU lifecycle progress"
      className={
        compact
          ? 'flex flex-wrap items-center gap-1.5'
          : 'flex w-full items-start gap-1 overflow-x-auto pb-1 sm:gap-2'
      }
    >
      {badges.map((b, idx) => {
        const visual = STATE_VISUAL[b.state]
        const href =
          anchors?.[b.stage]
          ?? (mouId ? `/mous/${mouId}#${b.stage}` : null)
        const icon =
          b.state === 'done' ? <Check aria-hidden className="size-3" />
          : b.state === 'current' ? <CircleDot aria-hidden className="size-3" />
          : <Circle aria-hidden className="size-2.5" />

        const dotMarkup = (
          <span
            aria-current={b.state === 'current' ? 'step' : undefined}
            className={
              'inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors '
              + visual.wrapClass
            }
          >
            <span className={visual.iconClass}>{icon}</span>
          </span>
        )

        const inner = href ? (
          <a
            href={href}
            data-testid={`${testId}-stage-${b.stage}`}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            aria-label={`Stage ${idx + 1} of ${STAGE_ORDER.length}: ${b.label} (${b.state})`}
          >
            {dotMarkup}
            {compact ? null : (
              <span className={'whitespace-nowrap text-[11px] ' + visual.labelClass}>
                {b.label}
              </span>
            )}
          </a>
        ) : (
          <span
            data-testid={`${testId}-stage-${b.stage}`}
            className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5"
            aria-label={`Stage ${idx + 1} of ${STAGE_ORDER.length}: ${b.label} (${b.state})`}
          >
            {dotMarkup}
            {compact ? null : (
              <span className={'whitespace-nowrap text-[11px] ' + visual.labelClass}>
                {b.label}
              </span>
            )}
          </span>
        )

        return (
          <li
            key={b.stage}
            className="flex items-center gap-1 sm:gap-2"
          >
            {inner}
            {!compact && idx < badges.length - 1 ? (
              <span
                aria-hidden
                className={
                  'hidden h-px w-3 sm:inline-block sm:w-4 '
                  + (badges[idx + 1]?.state && badges[idx + 1]!.state !== 'future'
                    ? 'bg-brand-teal/60'
                    : 'bg-slate-200')
                }
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Default anchor map for the MOU detail page. Maps each lifecycle
 * stage to a section anchor on `/mous/[mouId]`. Stages without a
 * dedicated section fall through to a generic '#mou-header' anchor.
 */
export const MOU_DETAIL_ANCHORS: Partial<Record<LifecycleStage, string>> = {
  pipeline: '#mou-header',
  'mou-uploaded': '#mou-header',
  active: '#mou-header',
  'payment-pending': '#installments-card',
  'installment-1-received': '#installments-card',
  'pi-generated': '#installments-card',
  'dispatch-requested': '#dispatches-card',
  'shipment-in-progress': '#dispatches-card',
  delivered: '#dispatches-card',
  closed: '#mou-header',
}

export { STAGE_LABEL, STAGE_ORDER }
