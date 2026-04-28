/*
 * POST /api/inventory/[id]/edit
 *
 * Form target for /admin/inventory/[id]. Builds a patch from the
 * present form fields (currentStock, reorderThreshold, notes, active)
 * and calls editInventoryItem.
 *
 * Permission gate inside editInventoryItem (Admin + OpsHead). On
 * success: 303 back to detail page. On failure: 303 back with error
 * param.
 */

import { NextResponse } from 'next/server'
import { editInventoryItem } from '@/lib/inventory/editInventoryItem'
import { getCurrentSession } from '@/lib/auth/session'

function parseIntOrUndefined(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return Number.NaN
  return n
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/admin/inventory/${id}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/admin/inventory/${encodeURIComponent(id)}`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const patch: Parameters<typeof editInventoryItem>[0]['patch'] = {}

  const stock = parseIntOrUndefined(form.get('currentStock'))
  if (stock !== undefined) {
    if (Number.isNaN(stock)) return errorTo('invalid-stock')
    patch.currentStock = stock
  }

  // reorderThreshold: empty input clears (null); presence sets value.
  const thresholdRaw = form.get('reorderThreshold')
  if (typeof thresholdRaw === 'string') {
    const trimmed = thresholdRaw.trim()
    if (trimmed === '') {
      patch.reorderThreshold = null
    } else {
      const n = Number(trimmed)
      if (!Number.isFinite(n)) return errorTo('invalid-threshold')
      patch.reorderThreshold = n
    }
  }

  const notesRaw = form.get('notes')
  if (typeof notesRaw === 'string') {
    patch.notes = notesRaw
  }

  const activeRaw = form.get('active')
  if (typeof activeRaw === 'string') {
    patch.active = activeRaw === 'true' || activeRaw === 'on'
  } else {
    // Unchecked checkboxes do not submit a value; if the form
    // explicitly carries an `active-submitted` marker we treat absent
    // active as false.
    if (form.get('active-submitted') === '1') patch.active = false
  }

  const result = await editInventoryItem({
    itemId: id,
    editedBy: session.sub,
    patch,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/admin/inventory/${encodeURIComponent(id)}`, request.url)
  url.searchParams.set('saved', '1')
  return NextResponse.redirect(url, { status: 303 })
}
