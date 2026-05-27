/*
 * POST /api/dispatch/kits/[mouId]/allocate (Gate 3 Step 3).
 *
 * Submits a grade-wise allocation for a KitDispatch (creating the
 * record on first submit). Permission: canAllocateKits (Ops + Admin).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canAllocateKits } from '@/lib/access'
import type { KitAllocation } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import { allocateKits } from '@/lib/kitDispatch/allocate'
import { emitKitsAllocatedForApproval } from '@/lib/notifications/workflowTriggers'

interface Body {
  allocations?: unknown
  /**
   * P2b.X OCC: the version the operator's browser loaded. Omit on
   * first-submit (CREATE path - record does not exist yet). Required
   * on subsequent edits; mismatch returns 409 with the current version
   * so the UI can prompt for reload.
   */
  expectedVersion?: unknown
  inventoryOverrideReason?: unknown
}

function parseAllocations(v: unknown): KitAllocation[] | null {
  if (!Array.isArray(v)) return null
  const out: KitAllocation[] = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    const grade = Number(o.grade)
    const students = Number(o.students)
    const kitsQty = Number(o.kitsQty)
    const kt = o.kitType
    const productName = typeof o.productName === 'string' ? o.productName : ''
    if (!Number.isFinite(grade) || grade < 1 || grade > 12) return null
    if (!Number.isFinite(students) || students < 0) return null
    if (!Number.isFinite(kitsQty) || kitsQty <= 0) return null
    if (kt !== 'Reusable' && kt !== 'Consumable') return null
    if (productName.trim() === '') return null
    out.push({
      grade,
      students,
      kitsQty,
      kitType: kt,
      productName,
    })
  }
  return out
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canAllocateKits(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const allocations = parseAllocations(body.allocations)
  if (allocations === null) {
    return NextResponse.json({ error: 'invalid-rows' }, { status: 400 })
  }
  const expectedVersion = typeof body.expectedVersion === 'number'
    && Number.isFinite(body.expectedVersion)
    ? body.expectedVersion
    : undefined
  const inventoryOverrideReason = typeof body.inventoryOverrideReason === 'string'
    && body.inventoryOverrideReason.trim().length > 0
    ? body.inventoryOverrideReason.trim()
    : undefined

  // Load LIVE state via repos so the OCC version check sees current
  // postgres data (not stale json bundle).
  const [mous, kitDispatches, inventory] = await Promise.all([
    mouRepo.findAll(),
    kitDispatchRepo.findAll(),
    inventoryItemRepo.findAll(),
  ])

  const result = await allocateKits(
    {
      mouId,
      user: { id: user.id, name: user.name },
      allocations,
      expectedVersion,
      inventoryOverrideReason,
    },
    { mous, kitDispatches, inventory },
  )

  if (!result.ok) {
    if (result.reason === 'version-conflict') {
      // 409 Conflict: another operator updated this kit_dispatch since
      // the page was loaded. UI shows "Another user updated this. Reload
      // to see latest." and re-renders from the fresh GET.
      return NextResponse.json(
        {
          error: 'version-conflict',
          conflictVersion: result.conflictVersion,
          message: 'Another user updated this kit_dispatch since you loaded the page. Reload to see the latest version and re-submit.',
        },
        { status: 409 },
      )
    }
    const status = result.reason === 'mou-not-found' ? 404 : 400
    return NextResponse.json(
      {
        error: result.reason,
        offendingSkuName: 'offendingSkuName' in result ? result.offendingSkuName : undefined,
        requested: 'requested' in result ? result.requested : undefined,
        available: 'available' in result ? result.available : undefined,
      },
      { status },
    )
  }

  // Gate 4.5 Step 4: notify Sales that kits are allocated + Sales review
  // is required before Finance can execute. Best-effort: a fan-out
  // failure does not roll back the allocation write. createNotification
  // dedups by (kind + recipient + relatedEntityId) within 60s so a retry
  // on transient error is safe.
  try {
    const totalKits = result.dispatch.allocations.reduce(
      (s, a) => s + a.kitsQty,
      0,
    )
    await emitKitsAllocatedForApproval({
      kitDispatchId: result.dispatch.id,
      mouId: result.dispatch.mouId,
      schoolName: result.dispatch.schoolName,
      allocationCount: result.dispatch.allocations.length,
      totalKits,
      senderUserId: user.id,
    })
  } catch (notifyErr) {
    console.error('[allocate] notification fan-out failed:', notifyErr)
  }

  return NextResponse.json({
    ok: true,
    dispatchId: result.dispatch.id,
    // P2b.X OCC: tell the UI the new version so the next save sends it.
    version: result.dispatch.version ?? 1,
  })
}
