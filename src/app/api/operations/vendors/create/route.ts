/*
 * POST /api/operations/vendors/create (Gate 5A.6 Step 12).
 *
 * Create a new Vendor row. Id is 'VEN-' + first 8 chars of a UUID.
 *
 * Permission: canEditFinanceData (Finance + Admin wildcard).
 */

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import type { AuditEntry, Vendor } from '@/lib/types'

function asStringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export async function POST(request: Request) {
  const form = await request.formData()
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
  const errorTo = (reason: string) => {
    const url = new URL('/operations/vendors/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canEditFinanceData(user)) return errorTo('permission')

  const name = String(form.get('name') ?? '').trim()
  if (!name) return errorTo('missing-name')

  const ts = new Date().toISOString()
  const id = `VEN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'create',
    after: { id, name },
    notes: `Vendor ${id} created.`,
  }
  const vendor: Vendor = {
    id,
    name,
    legalEntity: asStringOrNull(form.get('legalEntity')),
    category: asStringOrNull(form.get('category')),
    primaryContact: asStringOrNull(form.get('primaryContact')),
    primaryEmail: asStringOrNull(form.get('primaryEmail')),
    primaryPhone: asStringOrNull(form.get('primaryPhone')),
    address: asStringOrNull(form.get('address')),
    pan: asStringOrNull(form.get('pan')),
    gstNumber: asStringOrNull(form.get('gstNumber')),
    bankAccount: asStringOrNull(form.get('bankAccount')),
    ifsc: asStringOrNull(form.get('ifsc')),
    notes: asStringOrNull(form.get('notes')),
    active: String(form.get('active') ?? '') === 'true',
    createdAt: ts,
    auditLog: [auditEntry],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vendor',
      operation: 'create',
      payload: vendor as unknown as Record<string, unknown>,
    })
  } catch {
    return errorTo('queue-failure')
  }

  const url = new URL(`/operations/vendors/${id}`, request.url)
  url.searchParams.set('created', '1')
  return NextResponse.redirect(url, { status: 303 })
}
