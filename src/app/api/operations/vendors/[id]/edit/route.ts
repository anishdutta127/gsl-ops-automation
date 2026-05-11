/*
 * POST /api/operations/vendors/[id]/edit
 *
 * Update a Vendor record. Finance / Admin only. Phase 1 is a full-
 * record replace queue write; the drain reconciles by id and writes
 * the merged record back to vendors.json.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { Vendor } from '@/lib/types'
import vendorsJson from '@/data/vendors.json'

const allVendors = vendorsJson as unknown as Vendor[]

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can edit vendors.' },
      { status: 403 },
    )
  }
  const existing = allVendors.find((v) => v.id === id)
  if (!existing) return NextResponse.json({ error: 'not-found' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json(
      { error: 'missing-name', message: 'Vendor name required.' },
      { status: 400 },
    )
  }

  const next: Vendor = {
    ...existing,
    name,
    legalEntity: asStringOrNull(body.legalEntity),
    category: asStringOrNull(body.category),
    primaryContact: asStringOrNull(body.primaryContact),
    primaryEmail: asStringOrNull(body.primaryEmail),
    primaryPhone: asStringOrNull(body.primaryPhone),
    address: asStringOrNull(body.address),
    pan: asStringOrNull(body.pan),
    gstNumber: asStringOrNull(body.gstNumber),
    bankAccount: asStringOrNull(body.bankAccount),
    ifsc: asStringOrNull(body.ifsc),
    notes: typeof body.notes === 'string' ? body.notes : null,
    active: body.active !== false,
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vendor',
      operation: 'update',
      payload: {
        vendorId: existing.id,
        vendor: next as unknown as Record<string, unknown>,
        audit: {
          timestamp: new Date().toISOString(),
          user: user.name,
          action: 'update',
          before: existing as unknown as Record<string, unknown>,
          after: next as unknown as Record<string, unknown>,
        },
      },
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error ? e.message : 'Failed to queue the edit. Retry.',
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
