/*
 * POST /api/inventory/[id]/adjust (Gate 5A.6 Step 11).
 *
 * Apply a signed qtyDelta to InventoryItem.currentStock with an
 * operator reason. Audit action: 'inventory-stock-edited' with notes
 * = reason, before / after captures the stock movement.
 *
 * Permission: canManageInventory (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageInventory } from '@/lib/access'
import type { AuditEntry } from '@/lib/types'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const errorTo = (reason: string) => {
    const url = new URL(
      `/admin/inventory/${encodeURIComponent(id)}/adjust`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageInventory(user)) return errorTo('permission')
  const item = await inventoryItemRepo.findById(id)
  if (!item) return errorTo('item-not-found')

  const deltaRaw = String(form.get('qtyDelta') ?? '').trim()
  const qtyDelta = Number(deltaRaw)
  if (!Number.isInteger(qtyDelta) || qtyDelta === 0) {
    return errorTo('invalid-delta')
  }
  const reason = String(form.get('reason') ?? '').trim()
  if (reason.length < 10) return errorTo('short-reason')

  const newStock = item.currentStock + qtyDelta
  if (newStock < 0) return errorTo('negative-stock')

  const ts = new Date().toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'inventory-stock-edited',
    before: { currentStock: item.currentStock },
    after: { currentStock: newStock, qtyDelta },
    notes: reason,
  }
  try {
    // ATOMIC: partial UPDATE on currentStock + JSONB || concat on audit_log.
    await inventoryItemRepo.updateWithAudit(
      item.id,
      { currentStock: newStock, lastUpdatedAt: ts, lastUpdatedBy: user.id },
      auditEntry,
      { queuedBy: user.id },
    )
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL(`/admin/inventory/${encodeURIComponent(id)}`, request.url)
  url.searchParams.set('adjusted', '1')
  return NextResponse.redirect(url, { status: 303 })
}
