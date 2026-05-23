/*
 * POST /api/operations/agreements/[id]/terminate (Gate 5A.6 Step 12).
 *
 * Mark an agreement terminated. Per the simpler-path decision (no
 * status field added to Agreement type), this:
 *   - appends a 'terminated' audit entry with timestamp + operator,
 *   - if endDate is null or in the future, sets endDate to today so
 *     the daysToExpiry-driven UI surfaces it as Expired.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { AuditEntry } from '@/lib/types'
import { agreementRepo } from '@/lib/db/repos/leafRepos'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  if (!canEditFinanceData(user)) {
    const url = new URL(`/operations/agreements/${encodeURIComponent(id)}`, request.url)
    url.searchParams.set('error', 'permission')
    return NextResponse.redirect(url, { status: 303 })
  }
  const existing = await agreementRepo.findById(id)
  if (!existing) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const ts = new Date().toISOString()
  const today = ts.slice(0, 10)
  // Move endDate to today only when it is null or strictly in the
  // future. If endDate is already in the past we preserve it.
  const nextEnd =
    existing.endDate === null || existing.endDate > today
      ? today
      : existing.endDate

  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'update',
    before: { endDate: existing.endDate },
    after: { endDate: nextEnd, terminated: true },
    notes: 'Agreement marked terminated.',
  }

  const next: Agreement = {
    ...existing,
    endDate: nextEnd,
    auditLog: [...(existing.auditLog ?? []), auditEntry],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'agreement',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error ? e.message : 'Failed to queue the termination. Retry.',
      },
      { status: 500 },
    )
  }

  const url = new URL(`/operations/agreements/${encodeURIComponent(id)}`, request.url)
  url.searchParams.set('terminated', '1')
  return NextResponse.redirect(url, { status: 303 })
}
