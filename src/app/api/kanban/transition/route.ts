/*
 * POST /api/kanban/transition (W3-C C2).
 *
 * Called by the TransitionDialog on confirm for skip / backward /
 * Pre-Ops exit drags. Forward-by-1 drags do NOT call this endpoint
 * (the dialog navigates straight to the per-stage form). Body shape:
 *
 *   { mouId: string, fromStage: KanbanStageKey, toStage: KanbanStageKey, reason: string }
 *
 * On success returns 200 with { ok: true, audited: boolean, kind }.
 * On validation / not-found / permission errors returns 400/404/403
 * with { ok: false, reason }.
 */

import { NextResponse } from 'next/server'
import { recordTransition } from '@/lib/kanban/recordTransition'
import { getCurrentSession } from '@/lib/auth/session'
import type { KanbanStageKey } from '@/lib/kanban/deriveStage'

interface TransitionRequestBody {
  mouId?: unknown
  fromStage?: unknown
  toStage?: unknown
  reason?: unknown
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 })
  }

  let body: TransitionRequestBody
  try {
    body = (await request.json()) as TransitionRequestBody
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid-json' }, { status: 400 })
  }

  const mouId = typeof body.mouId === 'string' ? body.mouId : ''
  const fromStage = typeof body.fromStage === 'string' ? body.fromStage : ''
  const toStage = typeof body.toStage === 'string' ? body.toStage : ''
  const reason = typeof body.reason === 'string' ? body.reason : null

  if (!mouId || !fromStage || !toStage) {
    return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 })
  }

  const result = await recordTransition({
    mouId,
    fromStage: fromStage as KanbanStageKey,
    toStage: toStage as KanbanStageKey,
    reason,
    recordedBy: session.sub,
  })

  if (!result.ok) {
    const status = result.reason === 'mou-not-found' ? 404 :
      result.reason === 'unknown-user' ? 403 :
      400
    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result, { status: 200 })
}
