/*
 * POST /api/dispatch/kits/[mouId]/accounts-execute (Gate 3 Step 6).
 *
 * Accounts records the actually-dispatched quantities. Server-side
 * validation: qtyActualDispatched in [0, qtyRequested]. Routes the
 * dispatchStatus transition and inventory outward through
 * executeAccountsDispatch.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canExecuteDispatch } from '@/lib/access'
import type {
  AccountsDispatchEntry,
  InventoryItem,
  KitDispatch,
} from '@/lib/types'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import { executeAccountsDispatch } from '@/lib/kitDispatch/accountsExecute'

const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const inventory = inventoryItemsJson as unknown as InventoryItem[]

interface Body {
  accountsEntries?: unknown
}

function parseEntries(v: unknown): AccountsDispatchEntry[] | null {
  if (!Array.isArray(v)) return null
  const out: AccountsDispatchEntry[] = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') return null
    const o = item as Record<string, unknown>
    const grade = Number(o.grade)
    const studentsRequested = Number(o.studentsRequested)
    const qtyRequested = Number(o.qtyRequested)
    const qtyActualDispatched = Number(o.qtyActualDispatched)
    const productRequested = typeof o.productRequested === 'string' ? o.productRequested : ''
    if (!Number.isFinite(grade) || grade < 1 || grade > 12) return null
    if (!Number.isFinite(studentsRequested) || studentsRequested < 0) return null
    if (!Number.isFinite(qtyRequested) || qtyRequested < 0) return null
    if (!Number.isFinite(qtyActualDispatched) || qtyActualDispatched < 0) return null
    if (productRequested.trim() === '') return null
    out.push({
      grade,
      studentsRequested,
      productRequested,
      qtyRequested,
      qtyActualDispatched,
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
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canExecuteDispatch(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }
  const entries = parseEntries(body.accountsEntries)
  if (entries === null) {
    return NextResponse.json({ error: 'invalid-rows' }, { status: 400 })
  }
  const result = await executeAccountsDispatch(
    {
      mouId,
      user: { id: user.id, name: user.name },
      accountsEntries: entries,
    },
    { kitDispatches, inventory },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }
  return NextResponse.json({
    ok: true,
    newDispatchStatus: result.newDispatchStatus,
    inventoryDecrements: result.inventoryDecrements,
  })
}
