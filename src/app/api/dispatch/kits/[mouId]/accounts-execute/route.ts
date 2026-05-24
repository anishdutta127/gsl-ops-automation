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
} from '@/lib/types'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import { executeAccountsDispatch } from '@/lib/kitDispatch/accountsExecute'
import { emitDispatchExecuted } from '@/lib/notifications/workflowTriggers'

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
  const kitDispatches = await kitDispatchRepo.findAll()
  const inventory = await inventoryItemRepo.findAll()
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

  // Gate 4.5 Step 4: fan out 'dispatch-executed' to Ops + Sales.
  // result.dispatch is the updated KitDispatch with dispatchSummary
  // populated. Best-effort fan-out; failure does not roll back the
  // execute write.
  try {
    // DispatchSummary holds `deliveryChallanPath` (file path) not a
    // discrete invoice number; the Tally export is a downstream step.
    // We pass null for taxInvoiceNumber + taxInvoiceDate here so the
    // payload validator (isStringOrNull) accepts the call; when the
    // Tally export route lands in Gate 5 it can pass the real values.
    await emitDispatchExecuted({
      kitDispatchId: result.dispatch.id,
      mouId: result.dispatch.mouId,
      schoolName: result.dispatch.schoolName,
      taxInvoiceNumber: null,
      taxInvoiceDate: null,
      senderUserId: user.id,
    })
  } catch (notifyErr) {
    console.error('[accounts-execute] notification fan-out failed:', notifyErr)
  }

  return NextResponse.json({
    ok: true,
    newDispatchStatus: result.newDispatchStatus,
    inventoryDecrements: result.inventoryDecrements,
  })
}
