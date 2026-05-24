/*
 * POST /api/admin/product-backfill (Phase 6F Part 3).
 *
 * Bulk-update endpoint for /admin/product-backfill. Form data is
 * `product:<mouId>` -> ProductSelection literal ('TinkRworks' |
 * 'Cretile' | 'Both' | ''). Empty value = leave unset (skip row).
 *
 * For each non-empty row whose value differs from the current MOU
 * productSelection, this route enqueues one mou.update with the new
 * productSelection field set and a fresh audit entry tagged
 * action='product-selection-bulk-update'. Re-submission of an
 * already-set value is a no-op (idempotent).
 *
 * Permission: canEditMOU.
 */

import { NextResponse } from 'next/server'
import type { AuditEntry } from '@/lib/types'
import type { ProductSelection } from '@/lib/mouSystem/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { getCurrentSession, getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const VALID: ProductSelection[] = ['TinkRworks', 'Cretile', 'Both']

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/product-backfill')
    return NextResponse.redirect(url, { status: 303 })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/product-backfill', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditMOU(user)) return errorTo('permission')

  const form = await request.formData()
  const mous = await mouRepo.findAll()
  const mouById = new Map(mous.map((m) => [m.id, m]))

  const ts = new Date().toISOString()
  let touched = 0
  const entries: Array<[string, FormDataEntryValue]> = []
  form.forEach((value, key) => {
    entries.push([key, value])
  })
  for (const [key, value] of entries) {
    if (!key.startsWith('product:')) continue
    const mouId = key.slice('product:'.length)
    const raw = String(value).trim()
    if (raw === '') continue
    if (!VALID.includes(raw as ProductSelection)) continue
    const mou = mouById.get(mouId)
    if (!mou) continue
    if (mou.productSelection === raw) continue
    const audit: AuditEntry = {
      timestamp: ts,
      user: user.id,
      action: 'product-selection-bulk-update',
      before: { productSelection: mou.productSelection ?? null },
      after: { productSelection: raw },
      notes: `Phase 6F /admin/product-backfill bulk update.`,
    }
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'mou',
      operation: 'update',
      payload: {
        ...mou,
        productSelection: raw as ProductSelection,
        auditLog: [...(mou.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
    touched += 1
  }

  if (touched === 0) return errorTo('no-changes')

  const url = new URL('/admin/product-backfill', request.url)
  url.searchParams.set('saved', String(touched))
  return NextResponse.redirect(url, { status: 303 })
}
