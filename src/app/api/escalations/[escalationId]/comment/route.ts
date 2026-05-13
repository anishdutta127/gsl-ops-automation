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
  Escalation,
  EscalationComment,
  User,
} from '@/lib/types'
import escalationsJson from '@/data/escalations.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const allEscalations = escalationsJson as unknown as Escalation[]
const allUsers = usersJson as unknown as User[]

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
  const user = allUsers.find((u) => u.id === session.sub)
  if (!user) return redirectBack(request, escalationId, { error: 'unknown-user' })
  if (!canManageEscalations(user)) {
    return redirectBack(request, escalationId, { error: 'permission' })
  }

  const escalation = allEscalations.find((e) => e.id === escalationId)
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
  const next: Escalation = {
    ...escalation,
    comments: [...(escalation.comments ?? []), comment],
    auditLog: [...escalation.auditLog, audit],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'escalation',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
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
