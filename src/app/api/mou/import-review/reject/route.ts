/*
 * POST /api/mou/import-review/reject
 *
 * Form target for the per-row Reject form on /admin/mou-import-review.
 * Pulls queuedAt + rawRecordId + rejectionReason + optional notes
 * from the form body and calls rejectImportReview. Permission gate
 * inside the lib (mou-import-review:resolve).
 *
 * On success: 303 to /admin/mou-import-review (queue re-renders with
 * the resolved row stamped). On failure: 303 back to the same page
 * with an error param so the UI can surface a friendly message.
 */

import { NextResponse } from 'next/server'
import {
  rejectImportReview,
} from '@/lib/mou/rejectImportReview'
import type { RejectionReason } from '@/lib/types'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const queuedAt = String(form.get('queuedAt') ?? '')
  const rawRecordId = String(form.get('rawRecordId') ?? '')
  const rejectionReason = String(form.get('rejectionReason') ?? '') as RejectionReason
  const rejectionNotes = String(form.get('rejectionNotes') ?? '').trim() || undefined

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/mou-import-review')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/mou-import-review', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!queuedAt) return errorTo('missing-queued-at')
  if (!rawRecordId) return errorTo('missing-raw-record-id')

  const result = await rejectImportReview({
    queuedAt,
    rawRecordId,
    rejectionReason,
    rejectionNotes,
    rejectedBy: session.sub,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/mou-import-review', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
