'use client'

/*
 * RatingSegments (DESIGN.md "Surface 2 / Category card / Rating affordance").
 *
 * 5 segmented buttons (1-5) plus a 6th "Skip" segment for null. Used
 * inside FeedbackCategoryCard. Mobile-first 375px target: numbers
 * only on small viewports, "1 Poor" through "5 Excellent" labels on
 * sm+ for desktop.
 *
 * Segmented (not stars) by deliberate design choice: stars imply
 * hedonic quality, but "delivery timing" and "kit condition" are
 * factual rather than hedonic. Locked at step 9 design review.
 */

import { cn } from '@/lib/utils'

export type RatingValue = 1 | 2 | 3 | 4 | 5 | null

interface RatingSegmentsProps {
  value: RatingValue
  onChange: (next: RatingValue) => void
  ariaLabel: string
}

const NUMERIC_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'OK',
  4: 'Good',
  5: 'Excellent',
}

export function RatingSegments({ value, onChange, ariaLabel }: RatingSegmentsProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const num = n as 1 | 2 | 3 | 4 | 5
        const active = value === num
        return (
          <button
            key={num}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? null : num)}
            className={cn(
              'h-12 min-w-12 rounded-md text-base font-semibold transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-[var(--brand-navy)]',
              active
                ? 'bg-[var(--brand-teal)] text-[var(--brand-navy)]'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              'px-2 sm:px-3',
            )}
          >
            <span aria-hidden>{num}</span>
            <span className="sr-only sm:not-sr-only sm:ml-1">{NUMERIC_LABELS[num]}</span>
          </button>
        )
      })}
      <button
        type="button"
        role="radio"
        aria-checked={value === null && value !== undefined}
        onClick={() => onChange(null)}
        className={cn(
          'h-12 w-16 rounded-md text-sm font-semibold transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--brand-navy)]',
          value === null
            ? 'bg-slate-50 text-slate-600'
            : 'bg-slate-50 text-slate-400 hover:bg-slate-100',
        )}
      >
        Skip
      </button>
    </div>
  )
}
