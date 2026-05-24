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
import { vexProductRepo } from '@/lib/db/repos/vexProduct'

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

  const existing = await vexProductRepo.findByPartNumber(partNumber)
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
  const activeFinal =
    form.get('active-submitted') === '1' ? active : existing.active
  // P3 OCC: version the operator's browser loaded.
  const expectedVersionRaw = form.get('expectedVersion')
  const expectedVersion =
    typeof expectedVersionRaw === 'string' && expectedVersionRaw.trim() !== ''
      ? Number(expectedVersionRaw)
      : (existing.version ?? 1)

  try {
    const r = await vexProductRepo.updateOCC(
      partNumber,
      expectedVersion,
      { name, defaultUnitPrice, active: activeFinal },
      { queuedBy: user.id },
    )
    if (!r.ok) {
      const url = new URL(
        `/operations/vex/products/${encodeURIComponent(partNumber)}/edit`,
        request.url,
      )
      url.searchParams.set('error', 'version-conflict')
      url.searchParams.set('conflictVersion', String(r.conflictVersion))
      return NextResponse.redirect(url, { status: 303 })
    }
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL('/operations/vex', request.url)
  url.searchParams.set('product-edited', partNumber)
  return NextResponse.redirect(url, { status: 303 })
}
