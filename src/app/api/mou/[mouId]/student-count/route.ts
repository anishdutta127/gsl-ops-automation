/*
 * POST /api/mou/[mouId]/student-count (Phase 5, 2026-05-19).
 *
 * Form target for the student-count change flow. Calls
 * applyCountChange and enqueues the resulting Payment + MOU +
 * StudentCountEvent writes.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  applyCountChange,
  type ApplyCountChangeDeps,
} from '@/lib/mou/applyCountChange'
import type { StudentCountEvent } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { userRepo } from '@/lib/db/repos/user'
import { studentCountEventRepo } from '@/lib/db/repos/leafRepos'

async function buildDeps(): Promise<ApplyCountChangeDeps> {
  const [mous, payments, users, events] = await Promise.all([
    mouRepo.findAll(),
    paymentRepo.findAll(),
    userRepo.findAll(),
    studentCountEventRepo.findAll() as unknown as Promise<StudentCountEvent[]>,
  ])
  return { mous, payments, users, events, now: () => new Date() }
}

interface RouteParams {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const { mouId } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/student-count`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/mous/${mouId}/student-count`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const newCountRaw = Number(String(form.get('newCount') ?? ''))
  const effectiveDate = String(form.get('effectiveDate') ?? '').trim()
  const reason = String(form.get('reason') ?? '').trim()
  const relatedInstallmentId = String(form.get('relatedInstallmentId') ?? '').trim() || null
  const notesRaw = String(form.get('notes') ?? '').trim()
  const notes = notesRaw === '' ? null : notesRaw

  if (reason.length < 10) {
    return errorTo('reason-too-short')
  }

  const deps = await buildDeps()
  const result = applyCountChange(
    {
      mouId,
      newCount: newCountRaw,
      effectiveDate,
      reason,
      relatedInstallmentId,
      notes,
      recordedBy: session.sub,
    },
    deps,
  )

  if (!result.ok) {
    return errorTo(result.reason)
  }

  // Persist: one event create, one MOU update, N Payment updates.
  await enqueueUpdate({
    queuedBy: session.sub,
    entity: 'studentCountEvent',
    operation: 'create',
    payload: result.payloads.event as unknown as Record<string, unknown>,
  })
  await enqueueUpdate({
    queuedBy: session.sub,
    entity: 'mou',
    operation: 'update',
    payload: result.payloads.mouUpdate as unknown as Record<string, unknown>,
  })
  for (const p of result.payloads.paymentUpdates) {
    await enqueueUpdate({
      queuedBy: session.sub,
      entity: 'payment',
      operation: 'update',
      payload: p as unknown as Record<string, unknown>,
    })
  }

  const success = new URL(`/mous/${mouId}`, request.url)
  success.searchParams.set('notice', 'student-count-updated')
  return NextResponse.redirect(success, { status: 303 })
}
