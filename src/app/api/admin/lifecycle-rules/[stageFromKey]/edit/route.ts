/*
 * POST /api/admin/lifecycle-rules/[stageFromKey]/edit (W3-D).
 *
 * Form target for /admin/lifecycle-rules per-row edit form. Body
 * shape (form-encoded; the page renders an HTML form):
 *
 *   defaultDays  (number, 1..365)
 *   changeNotes  (string, optional)
 *
 * On success: 303 redirect to /admin/lifecycle-rules with a status
 * flash. On any failure: 303 redirect back to the same page with
 * ?error=<reason>.
 */

import { NextResponse } from 'next/server'
import { editLifecycleRule } from '@/lib/lifecycleRules/editLifecycleRule'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(
  request: Request,
  context: { params: Promise<{ stageFromKey: string }> },
) {
  const { stageFromKey } = await context.params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/lifecycle-rules')
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const defaultDaysRaw = String(form.get('defaultDays') ?? '')
  const changeNotes = String(form.get('changeNotes') ?? '').trim() || undefined

  const errorTo = (reason: string) => {
    const url = new URL('/admin/lifecycle-rules', request.url)
    url.searchParams.set('error', reason)
    url.searchParams.set('stage', stageFromKey)
    return NextResponse.redirect(url, { status: 303 })
  }

  const defaultDays = Number(defaultDaysRaw)
  if (!Number.isFinite(defaultDays)) return errorTo('invalid-days')

  const result = await editLifecycleRule({
    stageFromKey,
    defaultDays,
    changeNotes,
    editedBy: session.sub,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const url = new URL('/admin/lifecycle-rules', request.url)
  url.searchParams.set('saved', stageFromKey)
  return NextResponse.redirect(url, { status: 303 })
}
