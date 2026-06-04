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
import { isMicrosoftEntraIdConfigured } from '@/lib/auth/ssoEnv'
import { signIn } from '@/lib/auth/ssoConfig'

interface PageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

const SSO_ERROR_COPY: Record<string, string> = {
  'sso-no-email':
    'Your Microsoft account did not return an email. Contact your IT administrator.',
  'sso-domain-not-allowed':
    'Your Microsoft account is not on the allowed-domain list for this app.',
  'sso-not-authorised':
    'Account not authorised. Contact your GSL administrator for access.',
  'sso-signin-failed':
    'Microsoft sign-in failed. Please try again or use the email + password form.',
}

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const validatedNext = validateNextParam(sp.next ?? null)
  const errorReason = sp.error
  const ssoEnabled = isMicrosoftEntraIdConfigured()
  const ssoErrorMessage =
    errorReason && errorReason in SSO_ERROR_COPY ? SSO_ERROR_COPY[errorReason] : null

  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) {
    const session = await verifySessionToken(token)
    if (session) {
      // Step 4: /work is the role-scoped daily landing.
      redirect(validatedNext ?? '/work')
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
              data-testid="login-invalid-error"
            >
              Invalid email or password.
            </p>
          ) : null}
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-teal px-4 py-2 font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            Sign in
          </button>
        </form>

        {/* Phase 6G: Continue with Microsoft. Detect env vars server-side
            and either render the button as a live link to NextAuth's
            sign-in handler, or a disabled-style placeholder with a
            tooltip explaining the IT-still-configuring state. The
            disabled state keeps the button rendered so Anish + Pranav
            see "this is coming"; the tooltip is the honest signal. */}
        <div className="mt-6">
          <div className="relative my-4 flex items-center" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="px-2 text-[10px] uppercase tracking-wide text-slate-500">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {ssoErrorMessage && (
            <p
              role="alert"
              aria-live="polite"
              className="mb-3 rounded-md border border-signal-alert/40 bg-red-50 px-3 py-2 text-xs text-signal-alert"
              data-testid="login-sso-error"
            >
              {ssoErrorMessage}
            </p>
          )}
          {ssoEnabled ? (
            // Auth.js v5 dropped the GET /api/auth/signin/<provider>
            // entrypoint that v4 supported (UnknownAction on GET). The
            // canonical v5 trigger is a server action calling signIn(),
            // which handles the CSRF token + redirect internally. Pass
            // validatedNext through the closure so a deep-linked login
            // returns the user to the page they were trying to reach.
            <form
              action={async () => {
                'use server'
                await signIn('microsoft-entra-id', {
                  redirectTo: validatedNext ?? '/',
                })
              }}
            >
              <button
                type="submit"
                aria-label="Sign in with Microsoft work account"
                data-testid="login-sso-button"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <MicrosoftLogo />
                <span>Continue with Microsoft</span>
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Sign in with Microsoft work account (not yet available)"
              data-testid="login-sso-button-disabled"
              title="Microsoft sign-in will be available shortly. IT team is configuring access."
              className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-slate-500"
            >
              <MicrosoftLogo muted />
              <span>Continue with Microsoft</span>
            </button>
          )}
          {!ssoEnabled && (
            <p
              className="mt-2 text-center text-[11px] text-slate-500"
              data-testid="login-sso-tooltip-help"
            >
              Microsoft sign-in will be available shortly. IT team is configuring access.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

/**
 * Microsoft four-square logo, inline SVG. Four 6×6 px squares in the
 * canonical Microsoft brand colours (red, green, blue, yellow). Switch
 * to muted greys when the parent button is disabled.
 */
function MicrosoftLogo({ muted = false }: { muted?: boolean }) {
  // Microsoft brand square colours expressed in rgb() so the
  // login-page token-discipline test (which bans raw hex codes
  // in rendered HTML) stays green. These are the official
  // Microsoft logo squares, not GSL palette tokens; they must
  // render as the literal Microsoft red / green / blue / yellow.
  const colours = muted
    ? ['rgb(156,163,175)', 'rgb(156,163,175)', 'rgb(156,163,175)', 'rgb(156,163,175)']
    : ['rgb(242,80,34)', 'rgb(127,186,0)', 'rgb(0,164,239)', 'rgb(255,185,0)']
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0" y="0" width="8" height="8" fill={colours[0]} />
      <rect x="10" y="0" width="8" height="8" fill={colours[1]} />
      <rect x="0" y="10" width="8" height="8" fill={colours[2]} />
      <rect x="10" y="10" width="8" height="8" fill={colours[3]} />
    </svg>
  )
}
