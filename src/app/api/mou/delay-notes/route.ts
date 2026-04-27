/*
 * POST /api/mou/delay-notes (W4-B.3).
 *
 * Form / fetch target for the auto-save on the "Status notes"
 * textarea on /mous/[id]. Body shape (form-encoded; the textarea
 * client wrapper sends a fetch on blur):
 *
 *   mouId      MOU id
 *   notes      raw textarea value (may be empty / whitespace)
 *
 * Returns:
 *   200 JSON { ok: true, normalised: string | null, savedAt: string }
 *   200 JSON { ok: true, noChange: true }
 *   400 JSON { ok: false, reason: 'mou-not-found' | 'unknown-user' }
 *   401 JSON { ok: false, reason: 'unauthenticated' }
 *
 * No 303 redirect: the client-side wrapper is a debounced fetch from
 * a textarea blur handler, not an HTML form submit. JSON responses
 * keep the round-trip simple and the textarea state easy to reconcile.
 */

import { NextResponse } from 'next/server'
import { updateDelayNotes } from '@/lib/mou/updateDelayNotes'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: 'unauthenticated' },
      { status: 401 },
    )
  }

  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const rawNotes = String(form.get('notes') ?? '')

  if (!mouId) {
    return NextResponse.json(
      { ok: false, reason: 'missing-mou' },
      { status: 400 },
    )
  }

  const result = await updateDelayNotes({
    mouId,
    rawNotes,
    changedBy: session.sub,
  })

  if (!result.ok) {
    if (result.reason === 'no-change') {
      return NextResponse.json({ ok: true, noChange: true }, { status: 200 })
    }
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 400 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      normalised: result.mou.delayNotes,
      savedAt: result.mou.auditLog[result.mou.auditLog.length - 1]?.timestamp,
    },
    { status: 200 },
  )
}
