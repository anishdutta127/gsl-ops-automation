/*
 * GET /api/admin/pending-user-reviews (Phase 6G Part 5).
 *
 * Minimal JSON dump of Users whose requiresAdminReview flag is set
 * (auto-created on first SSO sign-in by an unknown email). The full
 * approval UI is deferred to a future gate per Anish 2026-05-21 GO;
 * this endpoint is the "good enough" interim surface linked from
 * /admin/queue-status and the homepage data-quality card.
 *
 * Permission: canManageUsers (Admin / Leadership wildcard).
 */

import { NextResponse } from 'next/server'
import usersJson from '@/data/users.json'
import type { User } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canManageUsers(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const all = usersJson as unknown as User[]
  const pending = all
    .filter((u) => u.requiresAdminReview === true)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department ?? null,
      active: u.active,
      createdAt: u.createdAt,
      azureAdObjectId: u.azureAdObjectId ?? null,
      lastAudit: u.auditLog?.[u.auditLog.length - 1] ?? null,
    }))
  return NextResponse.json({
    count: pending.length,
    users: pending,
    note: 'Promote a user via direct edit on src/data/users.json: set active=true and clear requiresAdminReview. Full approval UI is in the backlog.',
  })
}
