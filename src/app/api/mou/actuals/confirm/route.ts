/*
 * POST /api/mou/actuals/confirm
 *
 * Form target for /mous/[mouId]/actuals. Reads mouId + studentsActual
 * + optional notes from the form body, looks up the current user from
 * the session cookie, and calls confirmActuals(). On success: 303
 * redirect to /mous/[mouId] (detail page re-renders showing the
 * updated variance + drift badge). On any failure: 303 redirect back
 * to /mous/[mouId]/actuals?error=<reason>.
 */

import { NextResponse } from 'next/server'
import { confirmActuals } from '@/lib/mou/confirmActuals'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const studentsActualRaw = String(form.get('studentsActual') ?? '')
  const notes = String(form.get('notes') ?? '').trim() || undefined

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/actuals` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(mouId ? `/mous/${mouId}/actuals` : '/', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!mouId) return errorTo('missing-mou')

  const studentsActual = Number(studentsActualRaw)
  if (!Number.isFinite(studentsActual)) return errorTo('invalid-students')

  const result = await confirmActuals({
    mouId,
    studentsActual,
    confirmedBy: session.sub,
    notes,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const url = new URL(`/mous/${mouId}`, request.url)
  return NextResponse.redirect(url, { status: 303 })
}
