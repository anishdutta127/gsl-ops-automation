/*
 * POST /api/operations/vex/products/[partNumber]/edit (Gate 5A.6 Step 11).
 *
 * Edit name / defaultUnitPrice / active on an existing VexProduct.
 * partNumber is immutable; the lookup is by URL param.
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

interface RouteContext {
  params: Promise<{ partNumber: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { partNumber: partNumberRaw } = await ctx.params
  const partNumber = decodeURIComponent(partNumberRaw)
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const errorTo = (reason: string) => {
    const url = new URL(
      `/operations/vex/products/${encodeURIComponent(partNumber)}/edit`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageInventory(user)) return errorTo('permission')

  const existing = allVexProducts.find((p) => p.partNumber === partNumber)
  if (!existing) return errorTo('product-not-found')

  const name = String(form.get('name') ?? '').trim()
  if (!name) return errorTo('missing-name')

  const priceRaw = String(form.get('defaultUnitPrice') ?? '').trim()
  let defaultUnitPrice: number | null = null
  if (priceRaw !== '') {
    const n = Number(priceRaw)
    if (!Number.isFinite(n) || n < 0) return errorTo('invalid-price')
    defaultUnitPrice = n
  }
  const activeRaw = form.get('active')
  const active = activeRaw === 'true' || activeRaw === 'on'
  // active-submitted marker means unchecked = false.
  const activeFinal =
    form.get('active-submitted') === '1' ? active : existing.active

  const updated: VexProduct = {
    ...existing,
    name,
    defaultUnitPrice,
    active: activeFinal,
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexProduct',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL('/operations/vex', request.url)
  url.searchParams.set('product-edited', partNumber)
  return NextResponse.redirect(url, { status: 303 })
}
