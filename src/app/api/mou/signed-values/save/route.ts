/*
 * POST /api/mou/signed-values/save (Step 5).
 *
 * Form target for /mous/[mouId]/signed-values. Persists the captured
 * values to src/data/signed_values.json via `upsertSignedValues` in
 * src/lib/mouSystem/entityWriters.ts. Mirrors gsl-mou-system's
 * /api/signed-values/save body shape.
 *
 * Permission: canEditMOU.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { upsertSignedValues } from '@/lib/mouSystem/entityWriters'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const pricePerStudentRaw = String(form.get('pricePerStudent') ?? '')
  const studentCountRaw = String(form.get('studentCount') ?? '')
  const duration = String(form.get('duration') ?? '').trim()
  const signedDate = String(form.get('signedDate') ?? '').trim()
  const signedScanUrlRaw = String(form.get('signedScanUrl') ?? '').trim()
  const notesRaw = String(form.get('notes') ?? '').trim()

  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/signed-values` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId ? `/mous/${mouId}/signed-values` : '/',
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditMOU(user)) return errorTo('permission')

  const pricePerStudent = parseFloat(pricePerStudentRaw)
  if (!Number.isFinite(pricePerStudent) || pricePerStudent <= 0) {
    return errorTo('invalid-price')
  }
  const studentCount = parseInt(studentCountRaw, 10)
  if (!Number.isFinite(studentCount) || studentCount <= 0) {
    return errorTo('invalid-students')
  }
  if (duration === '') return errorTo('missing-duration')
  if (signedDate === '') return errorTo('missing-date')

  await upsertSignedValues(user.name, mouId, {
    pricePerStudent,
    studentCount,
    duration,
    signedDate,
    signedScanUrl: signedScanUrlRaw === '' ? null : signedScanUrlRaw,
    notes: notesRaw === '' ? null : notesRaw,
  })

  const url = new URL(`/mous/${mouId}/signed-values`, request.url)
  url.searchParams.set('notice', 'saved')
  return NextResponse.redirect(url, { status: 303 })
}
