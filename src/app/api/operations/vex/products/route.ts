/*
 * POST /api/operations/vex/products (Gate 5A.6 Step 11).
 *
 * Create a new VexProduct row. partNumber must be unique across the
 * existing 28-SKU master. Phase 1 enqueues a vexProduct create through
 * the standard queue.
 *
 * Permission: canManageInventory (Finance + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageInventory } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { VexProduct } from '@/lib/types'
import vexProductsJson from '@/data/vex_products.json'

const allVexProducts = vexProductsJson as unknown as VexProduct[]

export async function POST(request: Request) {
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const errorTo = (reason: string) => {
    const url = new URL('/operations/vex/products/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageInventory(user)) return errorTo('permission')

  const partNumber = String(form.get('partNumber') ?? '').trim()
  if (!partNumber) return errorTo('missing-part-number')
  const name = String(form.get('name') ?? '').trim()
  if (!name) return errorTo('missing-name')
  const existing = allVexProducts.find((p) => p.partNumber === partNumber)
  if (existing) return errorTo('duplicate-part-number')

  const priceRaw = String(form.get('defaultUnitPrice') ?? '').trim()
  let defaultUnitPrice: number | null = null
  if (priceRaw !== '') {
    const n = Number(priceRaw)
    if (!Number.isFinite(n) || n < 0) return errorTo('invalid-price')
    defaultUnitPrice = n
  }
  const active = String(form.get('active') ?? '') === 'true'

  const vexProduct: VexProduct = {
    partNumber,
    name,
    defaultUnitPrice,
    active,
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexProduct',
      operation: 'create',
      payload: vexProduct as unknown as Record<string, unknown>,
    })
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL('/operations/vex', request.url)
  url.searchParams.set('product-created', partNumber)
  return NextResponse.redirect(url, { status: 303 })
}
