'use client'

/*
 * FeedbackForm (Phase C6).
 *
 * Mobile-first 375px Client Component for the SPOC feedback page.
 * Owns the local state for 4 category cards plus an overall comment.
 * Submits to /api/feedback/submit as form-encoded data carrying the
 * `tokenId`, the `h` (HMAC), the `ratings` JSON array, and the
 * `overallComment`. On 201 the page navigates to /feedback/thank-you;
 * on 410 (expired/used) it navigates to /feedback/link-expired; on
 * 4xx/5xx the form surfaces an inline error and stays put so the
 * SPOC can retry per DESIGN.md "Surface 2 / Submission flow".
 *
 * Submit-disable rule: until at least one rating is non-null OR the
 * overall comment is non-empty, the submit button is disabled. Per
 * DESIGN.md, a fully-skipped feedback is not a useful signal.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FeedbackCategoryCard } from './FeedbackCategoryCard'
import type { FeedbackCategory, FeedbackRating } from '@/lib/types'
import type { RatingValue } from './RatingSegments'

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  'training-quality': 'Training quality',
  'kit-condition': 'Kit condition',
  'delivery-timing': 'Delivery timing',
  'trainer-rapport': 'Trainer rapport',
}

const CATEGORY_ORDER: FeedbackCategory[] = [
  'training-quality',
  'kit-condition',
  'delivery-timing',
  'trainer-rapport',
]

const OVERALL_LIMIT = 1000

interface FeedbackFormProps {
  tokenId: string
  hmac: string
}

export function FeedbackForm({ tokenId, hmac }: FeedbackFormProps) {
  const router = useRouter()
  const [ratings, setRatings] = useState<Record<FeedbackCategory, FeedbackRating>>(() => {
    const init = {} as Record<FeedbackCategory, FeedbackRating>
    for (const c of CATEGORY_ORDER) {
      init[c] = { category: c, rating: null, comment: null }
    }
    return init
  })
  const [overallComment, setOverallComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateCategory(category: FeedbackCategory, next: { rating: RatingValue; comment: string | null }) {
    setRatings((prev) => ({
      ...prev,
      [category]: { category, rating: next.rating, comment: next.comment },
    }))
  }

  const submitDisabled =
    submitting ||
    (CATEGORY_ORDER.every((c) => ratings[c].rating === null) &&
      overallComment.trim() === '')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitDisabled) return
    setSubmitting(true)
    setError(null)

    const payload = new URLSearchParams()
    payload.set('tokenId', tokenId)
    payload.set('h', hmac)
    payload.set('ratings', JSON.stringify(CATEGORY_ORDER.map((c) => ratings[c])))
    payload.set('overallComment', overallComment)

    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      })
      if (res.status === 201) {
        router.push('/feedback/thank-you')
        return
      }
      if (res.status === 410 || res.status === 403) {
        router.push('/feedback/link-expired')
        return
      }
      setError('Something went wrong. Please try again in a minute.')
    } catch {
      setError('Something went wrong. Please try again in a minute.')
    } finally {
      setSubmitting(false)
    }
  }

  const overallRemaining = OVERALL_LIMIT - overallComment.length

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {CATEGORY_ORDER.map((category) => (
        <FeedbackCategoryCard
          key={category}
          label={CATEGORY_LABELS[category]}
          rating={ratings[category].rating}
          comment={ratings[category].comment}
          onChange={(next) => updateCategory(category, next)}
        />
      ))}

      <section className="rounded-lg border border-slate-200 bg-card p-4">
        <label
          htmlFor="overall-comment"
          className="block text-base font-bold text-[var(--brand-navy)]"
        >
          Anything else you would like to share?
        </label>
        <textarea
          id="overall-comment"
          rows={4}
          maxLength={OVERALL_LIMIT}
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value.slice(0, OVERALL_LIMIT))}
          placeholder="Optional. Any general feedback for the GSL ops team."
          aria-describedby="overall-counter"
          className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        />
        <p
          id="overall-counter"
          aria-live="polite"
          className="mt-1 text-xs text-slate-500"
        >
          {overallRemaining > 100 ? `${OVERALL_LIMIT}-character soft limit` : `${overallRemaining} characters left`}
        </p>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitDisabled}
        aria-busy={submitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand-teal)] px-4 text-base font-semibold text-[var(--brand-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto sm:min-w-[200px]"
      >
        {submitting ? 'Submitting...' : 'Submit feedback'}
      </button>
    </form>
  )
}
