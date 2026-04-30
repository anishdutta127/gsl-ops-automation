/*
 * Auth middleware for GSL Ops Automation.
 *
 * Route scopes (per D7 final statement + Update 2 + W4-I.3.B):
 *   /login, /api/login, /api/logout, /api/health   : public
 *   /api/feedback/submit                            : public; HMAC-verified by route handler
 *                                                     (D7 refinement, Tension 4)
 *   /api/admin/sync-queue                           : public from middleware's perspective;
 *                                                     bearer-auth via CRON_SECRET inside the
 *                                                     route handler. Cron-triggered, not user-
 *                                                     callable; same allow-list pattern as
 *                                                     /api/feedback/submit (W4-I.3.B-fallback).
 *   /feedback/**                                    : public; HMAC-verified at page level by
 *                                                     the SPOC-facing form Server Component
 *                                                     (covers form, thank-you, link-expired)
 *   /portal/status/**                               : public; HMAC-verified at page level by
 *                                                     the read-only status portal Server Component
 *                                                     (Update 2; covers token page + link-expired)
 *   everything else                                 : staff JWT required
 *
 * No candidate session cookie in Phase 1 (D7 final statement). The three narrow
 * public surfaces (feedback POST, status-view GET, sync-queue cron) all enforce
 * their own auth inside the route or page handler; middleware just lets them
 * through.
 *
 * Forked from gsl-hr-system. Edits: candidate-cookie branch fully stripped
 * (no CANDIDATE_SESSION_COOKIE, no verifyCandidateSession import, no
 * /portal/exchange or /portal/request-new-link routes); PUBLIC_PATHS adds
 * /api/feedback/submit and /api/admin/sync-queue; PUBLIC_PREFIXES adds
 * /feedback and /portal/status.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  issueSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from '@/lib/crypto/jwt'

// Sliding-refresh threshold (seconds): on every authenticated request,
// if more than this much time has passed since `iat`, the middleware
// silently issues a fresh token and rotates the cookie. Active users
// keep a rolling 7-day session; inactive users still expire after 7
// idle days. Threshold tuned per Phase B decision 2: 1 day so we
// re-sign at most once per day of activity.
const SLIDING_REFRESH_THRESHOLD_SECONDS = 24 * 60 * 60

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
  '/api/feedback/submit',
  '/api/admin/sync-queue',
]

const PUBLIC_PREFIXES = [
  '/feedback',        // /feedback/[tokenId], /feedback/thank-you, /feedback/link-expired
  '/portal/status',   // /portal/status/[tokenId], /portal/status/link-expired
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Staff JWT required for everything else
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!token) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(url)
  }

  const session = await verifySessionToken(token)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    const response = NextResponse.redirect(url)
    response.cookies.delete(SESSION_COOKIE_NAME)
    return response
  }

  const response = NextResponse.next()

  // Sliding refresh: re-sign at most once per day of activity.
  const now = Math.floor(Date.now() / 1000)
  const iat = typeof session.iat === 'number' ? session.iat : now
  if (now - iat > SLIDING_REFRESH_THRESHOLD_SECONDS) {
    const fresh = await issueSessionToken({
      sub: session.sub,
      email: session.email,
      name: session.name,
      role: session.role,
    })
    response.cookies.set(SESSION_COOKIE_NAME, fresh, sessionCookieOptions())
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.ico$|.*\\.png$|.*\\.webp$).*)'],
}
