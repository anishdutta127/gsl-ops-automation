/*
 * POST /api/escalations/[escalationId]/comment (Gate 5A.6 Step 15).
 *
 * Appends an immutable comment to the escalation's comment thread.
 * Writes a parallel audit entry so the discussion is greppable.
 *
 * Permission: canManageEscalations (Sales / Ops / Finance + Admin).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { canManageEscalations } from '@/lib/access'
import type {
  AuditEntry,
  EscalationComment,
} from '@/lib/types'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { userRepo } from '@/lib/db/repos/user'

interface RouteContext {
  params: Promise<{ escalationId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { escalationId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/escalations/${escalationId}`)
    return NextResponse.redirect(url, { status: 303 })
  }
  const user = await userRepo.findById(session.sub)
  if (!user) return redirectBack(request, escalationId, { error: 'unknown-user' })
  if (!canManageEscalations(user)) {
    return redirectBack(request, escalationId, { error: 'permission' })
  }

  const escalation = await escalationRepo.findById(escalationId)
  if (!escalation) {
    return redirectBack(request, escalationId, { error: 'not-found' })
  }

  const form = await request.formData()
  const body = String(form.get('body') ?? '').trim()
  if (body.length < 1) {
    return redirectBack(request, escalationId, { error: 'empty-comment' })
  }

  const ts = new Date().toISOString()
  const comment: EscalationComment = {
    id: `EC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    timestamp: ts,
    authorUserId: user.id,
    body,
  }
  const audit: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'update',
    notes: `Comment posted: ${body.length > 80 ? `${body.slice(0, 77)}...` : body}`,
  }
  try {
    // ATOMIC: appendComment (comments || jsonb concat) + appendAudit
    // (audit_log || jsonb concat). Both are server-side atomic JSONB
    // appends; two parallel comment posts no longer race.
    await escalationRepo.appendComment(escalation.id, comment)
    await escalationRepo.appendAudit(escalation.id, audit)
  } catch (e) {
    return redirectBack(request, escalationId, {
      error: 'queue-failure',
      detail: e instanceof Error ? e.message : 'queue failed',
    })
  }
  return redirectBack(request, escalationId, { commented: '1' })
}

function redirectBack(request: Request, id: string, params: Record<string, string>) {
  const url = new URL(`/escalations/${id}`, request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}
