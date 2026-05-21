/*
 * POST /api/admin/walk-as (Phase 6F Part 5, V4 verification).
 *
 * Verification-only endpoint that lets the Playwright walker render
 * the homepage as Pranav (Finance), Misba (Ops), or Ameet
 * (Leadership) without knowing those users' passwords.
 *
 * Hard requirements:
 *   - Caller must already hold a session belonging to Anish
 *     (id === 'anish.d') or any user with department === null AND
 *     role === 'Admin'. Anyone else gets 403.
 *   - Target user must be active.
 *   - Issued token has the same TTL as a normal session (no shorter
 *     because the JWT lib does not parametrise expiry per call).
 *   - The impersonation event is logged to the audit log of the
 *     CALLER's record (not the impersonated user's). That way the
 *     audit trail still shows who initiated each role-walk.
 *
 * This route exists for verification + onboarding walkthroughs.
 * Production users do not see it surfaced anywhere.
 */

import { NextResponse } from 'next/server'
import usersJson from '@/data/users.json'
import type { AuditEntry, User } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import {
  SESSION_COOKIE_NAME,
  issueSessionToken,
  sessionCookieOptions,
} from '@/lib/crypto/jwt'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { getDepartment } from '@/lib/access'

const allUsers = usersJson as unknown as User[]

function isImpersonationCaller(user: User): boolean {
  if (user.id === 'anish.d') return true
  if (user.role === 'Admin' && getDepartment(user) === null) return true
  return false
}

export async function POST(request: Request) {
  const caller = await getCurrentUser()
  if (!caller) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!isImpersonationCaller(caller)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const targetId = String(form.get('targetUserId') ?? '').trim()
  if (!targetId) {
    return NextResponse.json({ error: 'missing-target' }, { status: 400 })
  }
  const target = allUsers.find((u) => u.id === targetId)
  if (!target) {
    return NextResponse.json({ error: 'unknown-target' }, { status: 404 })
  }
  if (!target.active) {
    return NextResponse.json({ error: 'target-inactive' }, { status: 400 })
  }

  const ts = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: caller.id,
    action: 'user-impersonation-started',
    before: {},
    after: { targetUserId: target.id, targetRole: target.role },
    notes: `Phase 6F Part 5 V4 verification walk. Impersonation does not modify the target user.`,
  }
  await enqueueUpdate({
    queuedBy: caller.id,
    entity: 'user',
    operation: 'update',
    payload: {
      ...caller,
      auditLog: [...(caller.auditLog ?? []), audit],
    } as unknown as Record<string, unknown>,
  })

  const token = await issueSessionToken({
    sub: target.id,
    email: target.email,
    name: target.name,
    role: target.role,
  })

  const response = NextResponse.json({ ok: true, targetUserId: target.id })
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions())
  return response
}
