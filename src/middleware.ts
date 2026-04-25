/*
 * Auth middleware for GSL Ops Automation.
 *
 * Route scopes (per D7 final statement + Update 2):
 *   /login, /api/login, /api/logout, /api/health   : public
 *   /api/feedback/submit                            : public; HMAC-verified by route handler
 *                                                     (D7 refinement, Tension 4)
 *   /feedback/**                                    : public; HMAC-verified at page level by
 *                                                     the SPOC-facing form Server Component
 *                                                     (covers form, thank-you, link-expired)
 *   /portal/status/**                               : public; HMAC-verified at page level by
 *                                                     the read-only status portal Server Component
 *                                                     (Update 2; covers token page + link-expired)
 *   everything else                                 : staff JWT required
 *
 * No candidate session cookie in Phase 1 (D7 final statement). The two narrow
 * public surfaces (feedback POST, status-view GET) consume MagicLinkToken via
 * stateless HMAC; no /portal/exchange or /portal/request-new-link surface.
 *
 * Forked from gsl-hr-system. Edits: candidate-cookie branch fully stripped
 * (no CANDIDATE_SESSION_COOKIE, no verifyCandidateSession import, no
 * /portal/exchange or /portal/request-new-link routes); PUBLIC_PATHS adds
 * /api/feedback/submit; PUBLIC_PREFIXES adds /feedback and /portal/status.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/logout',
  '/api/health',
  '/api/feedback/submit',
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

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.ico$|.*\\.png$|.*\\.webp$).*)'],
}
