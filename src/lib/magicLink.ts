/*
 * Magic-link HMAC sign + verify (Phase C6).
 *
 * SPOC-facing surfaces (`/feedback/[tokenId]`, `/portal/status/[tokenId]`,
 * `/api/feedback/submit`) all gate on a stateless HMAC over the
 * `${purpose}|${mouId}|${installmentSeq}|${spocEmail}|${issuedAt}`
 * tuple, signed with `GSL_SNAPSHOT_SIGNING_KEY`. Sharing the key with
 * gsl-hr-system means a single rotation covers both repos (per the
 * env-var documentation).
 *
 * Including `purpose` in the payload prevents a feedback-submit token
 * being replayed against the status-view endpoint or vice versa, even
 * if both tokens happen to share mouId / installment / email.
 *
 * The HMAC is hex-encoded so it survives URL params untouched.
 * Verification recomputes and constant-time-compares.
 */

import crypto from 'node:crypto'
import type { MagicLinkPurpose } from './types'

function signingKey(): Buffer {
  const k = process.env.GSL_SNAPSHOT_SIGNING_KEY
  if (!k) {
    throw new Error(
      'GSL_SNAPSHOT_SIGNING_KEY is not set. Set in Vercel env vars.',
    )
  }
  return Buffer.from(k, 'utf8')
}

export interface MagicLinkPayload {
  purpose: MagicLinkPurpose
  mouId: string
  installmentSeq: number
  spocEmail: string
  issuedAt: string
}

function payloadString(p: MagicLinkPayload): string {
  return `${p.purpose}|${p.mouId}|${p.installmentSeq}|${p.spocEmail}|${p.issuedAt}`
}

export function signMagicLink(payload: MagicLinkPayload): string {
  return crypto
    .createHmac('sha256', signingKey())
    .update(payloadString(payload))
    .digest('hex')
}

export function verifyMagicLink(
  payload: MagicLinkPayload,
  signature: string,
): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false
  const expected = signMagicLink(payload)
  if (expected.length !== signature.length) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}
