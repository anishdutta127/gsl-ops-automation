'use client'

/*
 * FeedbackCategoryCard (DESIGN.md "Surface 2 / Category card").
 *
 * One per FeedbackCategory: training-quality, kit-condition,
 * delivery-timing, trainer-rapport. Holds a category label, a
 * RatingSegments, and a per-category comment textarea.
 *
 * Comment auto-expansion rule: when rating is 1 or 2, the textarea
 * auto-grows to a 2-row default with a "tell us more" prompt;
 * otherwise it stays compact. 500-char soft limit, warning at 450,
 * hard cut at 500.
 */

import { useId } from 'react'
import { RatingSegments, type RatingValue } from './RatingSegments'

const SOFT_LIMIT = 500
const WARN_AT = 450

interface FeedbackCategoryCardProps {
  label: string
  rating: RatingValue
  comment: string | null
  onChange: (next: { rating: RatingValue; comment: string | null }) => void
}

export function FeedbackCategoryCard({
  label,
  rating,
  comment,
  onChange,
}: FeedbackCategoryCardProps) {
  const id = useId()
  const ratingId = `${id}-rating`
  const commentId = `${id}-comment`
  const expand = rating === 1 || rating === 2
  const remaining = SOFT_LIMIT - (comment?.length ?? 0)
  const warn = remaining <= SOFT_LIMIT - WARN_AT
  const placeholder = expand
    ? 'Could you tell us more about what went wrong?'
    : 'Anything specific to share?'

  function handleRatingChange(next: RatingValue) {
    onChange({ rating: next, comment })
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value.slice(0, SOFT_LIMIT)
    onChange({ rating, comment: next === '' ? null : next })
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-card p-4">
      <h3
        id={ratingId}
        className="text-lg font-bold text-[var(--brand-navy)]"
      >
        {label}
      </h3>
      <div className="mt-3">
        <RatingSegments
          value={rating}
          onChange={handleRatingChange}
          ariaLabel={`Rating for ${label}`}
        />
      </div>
      <div className="mt-3">
        <label htmlFor={commentId} className="sr-only">
          Comment for {label}
        </label>
        <textarea
          id={commentId}
          rows={expand ? 3 : 2}
          maxLength={SOFT_LIMIT}
          value={comment ?? ''}
          onChange={handleCommentChange}
          placeholder={placeholder}
          aria-describedby={`${commentId}-counter`}
          className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        />
        <div
          id={`${commentId}-counter`}
          className={
            warn
              ? 'mt-1 text-xs text-[var(--signal-attention)]'
              : 'mt-1 text-xs text-slate-500'
          }
          aria-live="polite"
        >
          {warn ? `${remaining} characters left` : `${SOFT_LIMIT}-character soft limit`}
        </div>
      </div>
    </section>
  )
}
