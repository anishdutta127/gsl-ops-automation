/*
 * /login page Server Component.
 *
 * Two responsibilities:
 *   1. Already-logged-in detect: if the request carries a valid
 *      session cookie, redirect away from /login. Honours `?next=`
 *      if present and valid; falls back to / (kanban homepage)
 *      otherwise. Pre-W3-G the fallback was /dashboard; W3-G flipped
 *      it to / per kanban-first navigation. The /dashboard alias
 *      still resolves so any preserved deep-link in `?next=` keeps
 *      working. Reasoning per Phase B judgment 3: the common path
 *      to /login with a valid session is "user clicked a deep link,
 *      middleware added ?next=, but the session was actually still
 *      valid"; in that case sending the user to the original target
 *      avoids a wasted navigation.
 *   2. Render the form. Plain HTML form posting to /api/login; no
 *      JS required. Errors arrive via ?error=invalid and render
 *      inline as a single generic "Invalid email or password"
 *      message (no enumeration). The `next` value, if validated,
 *      is preserved through a hidden input so /api/login can
 *      forward to it on success.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'
import { validateNextParam } from '@/lib/auth/nextParam'

interface PageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const validatedNext = validateNextParam(sp.next ?? null)
  const errorReason = sp.error

  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) {
    const session = await verifySessionToken(token)
    if (session) {
      redirect(validatedNext ?? '/')
    }
  }

  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-2xl text-brand-navy text-center mb-8">
          GSL Ops
        </h1>
        <form action="/api/login" method="POST" className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-brand-navy mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              autoFocus
              required
              autoComplete="email"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-brand-navy mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
          {validatedNext ? (
            <input type="hidden" name="next" value={validatedNext} />
          ) : null}
          {errorReason === 'invalid' ? (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-signal-alert"
            >
              Invalid email or password.
            </p>
          ) : null}
          <button
            type="submit"
            className="block w-full rounded-md bg-brand-teal px-4 py-2 font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  )
}
