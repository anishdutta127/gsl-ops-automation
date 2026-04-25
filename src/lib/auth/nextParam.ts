/*
 * `?next=` parameter validator.
 *
 * Used by /api/login and the /login page Server Component to gate
 * the post-login redirect target. The value is supplied by the
 * client (originally written by middleware) so it must be treated
 * as untrusted input. An invalid `next` is silently dropped (caller
 * falls back to /dashboard); we do not 400 on bad input because the
 * primary caller is a credentialed user who succeeded at login and
 * deserves a working session, not an error page.
 *
 * Safety contract: a valid `next` is a same-origin path. Concrete:
 *   - starts with a single slash
 *   - does NOT start with two slashes (protocol-relative redirect:
 *     //evil.com would otherwise resolve to https://evil.com)
 *   - contains no backslash (CRLF / path-traversal smuggling on
 *     some clients)
 *   - contains no "://" (defensive against any injected scheme)
 *
 * Returns the validated path or null. Callers MUST handle null with
 * a fallback (typically /dashboard).
 */

export function validateNextParam(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.includes('\\')) return null
  if (value.includes('://')) return null
  return value
}
