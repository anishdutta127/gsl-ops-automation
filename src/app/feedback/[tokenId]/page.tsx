/*
 * /feedback/[tokenId] (Phase C6).
 *
 * Server Component, mobile-first 375px. Page-level HMAC verification:
 * looks up the MagicLinkToken by id, recomputes the HMAC with
 * `purpose: 'feedback-submit'`, and checks expiry + not-yet-used.
 * Any failure redirects to /feedback/link-expired so the SPOC sees
 * a single canonical "this link does not work" page rather than
 * leaking the precise reason.
 *
 * The form itself is a Client Component (FeedbackForm) that owns
 * the per-category state and POSTs to /api/feedback/submit on
 * submit. The page passes through the tokenId + HMAC so the API
 * can re-verify; the form does not have its own access to the
 * signing key.
 */

import { redirect } from 'next/navigation'
import type { MOU, MagicLinkToken } from '@/lib/types'
import magicLinkTokensJson from '@/data/magic_link_tokens.json'
import mousJson from '@/data/mous.json'
import { verifyMagicLink } from '@/lib/magicLink'
import { FeedbackForm } from '@/components/ops/FeedbackForm'

const tokens = magicLinkTokensJson as unknown as MagicLinkToken[]
const mous = mousJson as unknown as MOU[]

export default async function FeedbackTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ tokenId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tokenId } = await params
  const sp = await searchParams
  const hmac = typeof sp.h === 'string' ? sp.h : ''

  const token = tokens.find((t) => t.id === tokenId)
  if (!token || token.purpose !== 'feedback-submit') {
    redirect('/feedback/link-expired')
  }

  const valid = verifyMagicLink(
    {
      purpose: token.purpose,
      mouId: token.mouId,
      installmentSeq: token.installmentSeq,
      spocEmail: token.spocEmail,
      issuedAt: token.issuedAt,
    },
    hmac,
  )
  if (!valid) {
    redirect('/feedback/link-expired')
  }

  const now = new Date()
  if (token.expiresAt && new Date(token.expiresAt) <= now) {
    redirect('/feedback/link-expired')
  }
  if (token.usedAt !== null) {
    redirect('/feedback/link-expired')
  }

  const mou = mous.find((m) => m.id === token.mouId)
  const heading = mou?.schoolName ?? 'Your training programme'
  const programmeLine = mou
    ? `${mou.programme}${mou.programmeSubType ? ` - ${mou.programmeSubType}` : ''} - Instalment ${token.installmentSeq}`
    : `Instalment ${token.installmentSeq}`

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-navy)]">{heading}</h1>
        <p className="mt-1 text-sm text-slate-700">{programmeLine}</p>
      </header>

      <p className="mb-6 text-base text-foreground">
        Your feedback helps us improve training, kit delivery, and support.
        Takes 2 minutes. You can skip any question.
      </p>

      <FeedbackForm tokenId={tokenId} hmac={hmac} />

      <p className="mt-8 text-xs text-slate-500">
        Sent to {token.spocEmail}.
      </p>
    </div>
  )
}
