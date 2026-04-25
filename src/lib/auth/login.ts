/*
 * Credential verification helper for staff login.
 *
 * Pure async function; no HTTP, no cookies. The /api/login route
 * handler calls this, then translates the AuthenticateResult into
 * an HTTP redirect with cookie. Splitting the lib from the handler
 * keeps the credential logic unit-testable in isolation and matches
 * the deps-injection seam pattern used across Phase A.
 *
 * All failure modes (unknown user, inactive user, wrong password,
 * missing fields) collapse to a single 401-equivalent at the HTTP
 * layer. The handler does NOT differentiate the reason in the
 * response, to prevent enumeration. The reason IS exposed on the
 * AuthenticateResult so future logging or monitoring can
 * differentiate without changing the user-facing surface.
 */

import bcrypt from 'bcryptjs'
import type { User } from '@/lib/types'
import usersJson from '@/data/users.json'

export interface AuthenticateArgs {
  email: string
  password: string
}

export type AuthenticateFailureReason =
  | 'missing-fields'
  | 'unknown-user'
  | 'inactive'
  | 'wrong-password'

export type AuthenticateResult =
  | { ok: true; user: User }
  | { ok: false; reason: AuthenticateFailureReason }

export interface AuthenticateDeps {
  users: User[]
  bcryptCompare: (password: string, hash: string) => Promise<boolean>
}

const defaultDeps: AuthenticateDeps = {
  users: usersJson as unknown as User[],
  bcryptCompare: (password, hash) => bcrypt.compare(password, hash),
}

export async function authenticateLogin(
  args: AuthenticateArgs,
  deps: AuthenticateDeps = defaultDeps,
): Promise<AuthenticateResult> {
  const email = (args.email ?? '').trim()
  const password = args.password ?? ''
  if (email === '' || password === '') {
    return { ok: false, reason: 'missing-fields' }
  }

  const lookup = email.toLowerCase()
  const user = deps.users.find((u) => u.email.toLowerCase() === lookup)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!user.active) return { ok: false, reason: 'inactive' }

  let verified = false
  try {
    verified = await deps.bcryptCompare(password, user.passwordHash)
  } catch {
    verified = false
  }
  if (!verified) return { ok: false, reason: 'wrong-password' }

  return { ok: true, user }
}
