/*
 * POST /api/admin/sales-team/reassign (Gate 5A.6 Step 14).
 *
 * Bulk MOU reassignment. Admin-only. For each mouIds[] entry:
 *   - validates the MOU exists and currently has salesPersonId === fromRepId
 *   - enqueues a Payment update setting salesPersonId = toRepId
 *   - appends an AuditEntry capturing the prior + new salesPersonId
 *
 * Atomicity: per-MOU writes go through the same enqueueUpdate queue;
 * the cron drain reconciles them sequentially. If any individual
 * enqueue throws the route still 303s back with a partial-success
 * flash.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import type { AuditEntry, MOU } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { userRepo } from '@/lib/db/repos/user'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/sales-team/reassign')
    return NextResponse.redirect(url, { status: 303 })
  }
  const allMous = await mouRepo.findAll()
  const allReps = await salesTeamRepo.findAll()
  const allUsers = await userRepo.findAll()
  const user = allUsers.find((u) => u.id === session.sub)
  if (!user || user.role !== 'Admin') {
    return redirectBack(request, { error: 'permission' })
  }

  const form = await request.formData()
  const fromRepId = String(form.get('fromRepId') ?? '').trim()
  const toRepId = String(form.get('toRepId') ?? '').trim()
  const mouIds = form.getAll('mouIds').map((v) => String(v))

  if (fromRepId === '') return redirectBack(request, { error: 'no-from-rep', fromRepId })
  if (toRepId === '') return redirectBack(request, { error: 'no-to-rep', fromRepId })
  if (mouIds.length === 0) return redirectBack(request, { error: 'no-mous-selected', fromRepId })

  const toRep = allReps.find((r) => r.id === toRepId)
  if (!toRep) return redirectBack(request, { error: 'no-to-rep', fromRepId })

  const ts = new Date().toISOString()
  let reassigned = 0
  let failures = 0
  for (const mouId of mouIds) {
    const mou = allMous.find((m) => m.id === mouId)
    if (!mou) {
      failures += 1
      continue
    }
    if (mou.salesPersonId !== fromRepId) {
      failures += 1
      continue
    }
    const audit: AuditEntry = {
      timestamp: ts,
      user: user.id,
      action: 'reassignment',
      before: { salesPersonId: mou.salesPersonId },
      after: { salesPersonId: toRepId },
      notes: `Bulk reassign from ${fromRepId} to ${toRepId} via /admin/sales-team/reassign.`,
    }
    const next: MOU = {
      ...mou,
      salesPersonId: toRepId,
      auditLog: [...(mou.auditLog ?? []), audit],
    }
    try {
      await enqueueUpdate({
        queuedBy: user.id,
        entity: 'mou',
        operation: 'update',
        payload: next as unknown as Record<string, unknown>,
      })
      reassigned += 1
    } catch {
      failures += 1
    }
  }

  const params: Record<string, string> = {
    fromRepId,
    reassigned: String(reassigned),
    toRepName: toRep.name,
  }
  if (failures > 0) {
    params.error = 'queue-failure'
    params.failures = String(failures)
  }
  return redirectBack(request, params)
}

function redirectBack(request: Request, params: Record<string, string>) {
  const url = new URL('/admin/sales-team/reassign', request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}
