/*
 * POST /api/feedback/submit (Phase C6).
 *
 * SPOC-facing public endpoint. Verifies the magic-link HMAC, consumes
 * the token (atomic usedAt update), validates the ratings payload,
 * writes the Feedback record via the queue, and fires the
 * feedbackAutoEscalation hook if any rating <= 2 per Update 3.
 *
 * Body shape (form-encoded for compatibility with the page form;
 * also accepts JSON for programmatic test hits):
 *   tokenId: string      // MagicLinkToken.id
 *   h: string            // HMAC over the token payload
 *   ratings: JSON-string // [{category, rating|null, comment|null}, ...]
 *   overallComment: string | empty
 *
 * Response codes:
 *   201 Created    -> success; client navigates to /feedback/thank-you
 *   403 Forbidden  -> HMAC verification failed
 *   410 Gone       -> token expired or already used
 *   400 Bad Req    -> ratings payload malformed
 *   404 Not Found  -> tokenId not in directory
 *
 * Per DESIGN.md "Surface 2 / Submission flow": the form does not
 * surface auto-escalation status; thank-you reads identically
 * regardless of whether an escalation fired.
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import type {
  Feedback,
  FeedbackCategory,
  FeedbackRating,
  MagicLinkToken,
} from '@/lib/types'
import magicLinkTokensJson from '@/data/magic_link_tokens.json'
import { verifyMagicLink } from '@/lib/magicLink'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { feedbackAutoEscalation } from '@/lib/feedback/autoEscalation'

const VALID_CATEGORIES: ReadonlyArray<FeedbackCategory> = [
  'training-quality',
  'kit-condition',
  'delivery-timing',
  'trainer-rapport',
]

interface ValidatedRatings {
  ratings: FeedbackRating[]
}

function validateRatings(raw: unknown): ValidatedRatings | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const seen = new Set<FeedbackCategory>()
  const result: FeedbackRating[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return null
    const r = item as Record<string, unknown>
    const category = r.category
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as FeedbackCategory)) {
      return null
    }
    if (seen.has(category as FeedbackCategory)) return null
    seen.add(category as FeedbackCategory)
    const rating = r.rating
    const okRating = rating === null || (typeof rating === 'number' && [1, 2, 3, 4, 5].includes(rating))
    if (!okRating) return null
    const comment = r.comment
    if (comment !== null && typeof comment !== 'string') return null
    result.push({
      category: category as FeedbackCategory,
      rating: rating as 1 | 2 | 3 | 4 | 5 | null,
      comment: typeof comment === 'string' && comment.trim() !== '' ? comment : null,
    })
  }
  if (seen.size !== 4) return null
  return { ratings: result }
}

async function readBody(request: Request): Promise<{
  tokenId: string
  h: string
  ratingsRaw: unknown
  overallComment: string | null
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await request.json()) as Record<string, unknown>
    return {
      tokenId: typeof json.tokenId === 'string' ? json.tokenId : '',
      h: typeof json.h === 'string' ? json.h : '',
      ratingsRaw: json.ratings,
      overallComment: typeof json.overallComment === 'string' && json.overallComment.trim() !== ''
        ? json.overallComment
        : null,
    }
  }
  const form = await request.formData()
  const ratingsField = String(form.get('ratings') ?? '')
  let ratingsRaw: unknown = null
  try {
    ratingsRaw = JSON.parse(ratingsField)
  } catch {
    ratingsRaw = null
  }
  const overall = String(form.get('overallComment') ?? '').trim()
  return {
    tokenId: String(form.get('tokenId') ?? ''),
    h: String(form.get('h') ?? ''),
    ratingsRaw,
    overallComment: overall === '' ? null : overall,
  }
}

export async function POST(request: Request) {
  const { tokenId, h, ratingsRaw, overallComment } = await readBody(request)

  if (!tokenId || !h) {
    return NextResponse.json({ error: 'missing-credentials' }, { status: 400 })
  }

  const tokens = magicLinkTokensJson as unknown as MagicLinkToken[]
  const token = tokens.find((t) => t.id === tokenId)
  if (!token) {
    return NextResponse.json({ error: 'token-not-found' }, { status: 404 })
  }

  if (token.purpose !== 'feedback-submit') {
    return NextResponse.json({ error: 'wrong-purpose' }, { status: 403 })
  }

  const valid = verifyMagicLink(
    {
      purpose: token.purpose,
      mouId: token.mouId,
      installmentSeq: token.installmentSeq,
      spocEmail: token.spocEmail,
      issuedAt: token.issuedAt,
    },
    h,
  )
  if (!valid) {
    return NextResponse.json({ error: 'hmac-failed' }, { status: 403 })
  }

  const now = new Date()
  if (token.expiresAt && new Date(token.expiresAt) <= now) {
    return NextResponse.json({ error: 'token-expired' }, { status: 410 })
  }
  if (token.usedAt !== null) {
    return NextResponse.json({ error: 'token-used' }, { status: 410 })
  }

  const validated = validateRatings(ratingsRaw)
  if (!validated) {
    return NextResponse.json({ error: 'invalid-ratings' }, { status: 400 })
  }

  const ts = now.toISOString()
  const feedback: Feedback = {
    id: `FBK-${crypto.randomUUID().slice(0, 8)}`,
    schoolId: '',  // resolved server-side from MOU; left blank for the queue consumer to fill
    mouId: token.mouId,
    installmentSeq: token.installmentSeq,
    submittedAt: ts,
    submittedBy: 'spoc',
    submitterEmail: token.spocEmail,
    ratings: validated.ratings,
    overallComment,
    magicLinkTokenId: token.id,
    auditLog: [
      {
        timestamp: ts,
        user: 'system',
        action: 'feedback-submitted',
        notes: `Submitted via magic link ${token.id} by ${token.spocEmail}`,
      },
    ],
  }

  const updatedToken: MagicLinkToken = {
    ...token,
    usedAt: ts,
    usedByIp: request.headers.get('x-forwarded-for') ?? null,
  }

  await enqueueUpdate({
    queuedBy: 'system',
    entity: 'magicLinkToken',
    operation: 'update',
    payload: updatedToken as unknown as Record<string, unknown>,
  })

  await enqueueUpdate({
    queuedBy: 'system',
    entity: 'feedback',
    operation: 'create',
    payload: feedback as unknown as Record<string, unknown>,
  })

  await feedbackAutoEscalation(feedback)

  return NextResponse.json({ ok: true, feedbackId: feedback.id }, { status: 201 })
}
