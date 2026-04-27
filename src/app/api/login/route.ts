/*
 * POST /api/login
 *
 * Form target for the /login page. Accepts multipart form-data with
 * `email`, `password`, and an optional `next`. On success, sets the
 * session cookie and 303-redirects to the validated `next` (falling
 * back to / per W3-G kanban-first nav; /dashboard alias still works
 * if preserved via `next=`). On any failure (missing fields, unknown
 * user, inactive user, wrong password) returns a 303 redirect to
 * /login?error=invalid&next=<preserved-if-valid>. The error reason
 * is NOT differentiated in the response, to prevent enumeration.
 *
 * 303 (See Other) is used so a POST → redirect ends in a GET on the
 * target URL. 302 historically does the same but 303 is the precise
 * HTTP semantic for this flow.
 *
 * Rate limiting deferred to Phase 1.1 per Phase B decision 5.
 */

import { NextResponse } from 'next/server'
import { authenticateLogin } from '@/lib/auth/login'
import { validateNextParam } from '@/lib/auth/nextParam'
import {
  SESSION_COOKIE_NAME,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/crypto/jwt'

export async function POST(request: Request) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '')
  const password = String(form.get('password') ?? '')
  const nextRaw = form.get('next')
  const validatedNext = validateNextParam(
    typeof nextRaw === 'string' ? nextRaw : null,
  )

  const result = await authenticateLogin({ email, password })

  if (!result.ok) {
    const url = new URL('/login', request.url)
    url.searchParams.set('error', 'invalid')
    if (validatedNext) url.searchParams.set('next', validatedNext)
    return NextResponse.redirect(url, { status: 303 })
  }

  const token = await issueSessionToken({
    sub: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
  })

  const target = validatedNext ?? '/'
  const url = new URL(target, request.url)
  const response = NextResponse.redirect(url, { status: 303 })
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions())
  return response
}
