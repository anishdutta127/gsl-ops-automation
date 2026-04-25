/*
 * POST /api/logout
 *
 * Clears the session cookie and 303-redirects to /login. No body
 * required; the cookie is the only state to invalidate. JWTs are
 * stateless so there is no server-side session to revoke; clearing
 * the cookie is the full operation.
 */

import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/crypto/jwt'

export async function POST(request: Request) {
  const url = new URL('/login', request.url)
  const response = NextResponse.redirect(url, { status: 303 })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
