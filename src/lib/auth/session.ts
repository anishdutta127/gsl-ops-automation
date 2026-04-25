/*
 * Server-Component session helper.
 *
 * Reads the session cookie + verifies the JWT + looks up the User
 * from users.json. Returns null if any step fails. Used by every
 * page that needs the current user for scoping (TopNav, dashboard
 * tiles, scoped lists). Middleware has already verified before the
 * page handler runs, so this is a second-pass read for component
 * convenience, not a security gate.
 *
 * Tradeoff: one extra verifySessionToken per page render. Cost is
 * microseconds; acceptable for an internal tool. Phase 1.1 could
 * route the verified claims through a request header set by the
 * middleware; not worth the complexity today.
 */

import { cookies } from 'next/headers'
import type { SessionClaims, User } from '@/lib/types'
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/crypto/jwt'
import usersJson from '@/data/users.json'

const users = usersJson as unknown as User[]

export async function getCurrentSession(): Promise<SessionClaims | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession()
  if (!session) return null
  return users.find((u) => u.id === session.sub) ?? null
}
