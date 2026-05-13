/*
 * POST /api/mou/[mouId]/schedule/save (Gate 5A.6 Step 1).
 *
 * Body { mode: 'no-pi' | 'override', rows: ScheduleRowInput[], reason?: string }.
 * Dispatches to saveScheduleNoPi or overrideLockedSchedule based on mode.
 * Returns 303 redirect back to the schedule editor with ?saved=1 or
 * ?error=<reason>.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import {
  saveScheduleNoPi,
  overrideLockedSchedule,
  type ScheduleRowInput,
} from '@/lib/scheduleEdit/saveSchedule'

interface RouteContext {
  params: Promise<{ mouId: string }>
}

function parseRowsField(raw: string | null): ScheduleRowInput[] {
  if (raw === null) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((r) => {
        const obj = (r ?? {}) as Record<string, unknown>
        const pct = Number(obj.pctDue)
        const due = typeof obj.dueDateIso === 'string' && obj.dueDateIso !== ''
          ? obj.dueDateIso
          : null
        const notes = typeof obj.notes === 'string' && obj.notes.trim() !== ''
          ? obj.notes.trim()
          : null
        const paymentId = typeof obj.paymentId === 'string' && obj.paymentId !== ''
          ? obj.paymentId
          : null
        return { paymentId, pctDue: pct, dueDateIso: due, notes }
      })
      .filter((r) => Number.isFinite(r.pctDue))
  } catch {
    return []
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set(
      'next',
      `/mous/${mouId}/installments/schedule-edit`,
    )
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const mode = String(form.get('mode') ?? '')
  const rowsRaw = form.get('rows')
  const rows = parseRowsField(typeof rowsRaw === 'string' ? rowsRaw : null)
  const reason = String(form.get('reason') ?? '').trim()

  const redirectTo = (params: Record<string, string>) => {
    const url = new URL(`/mous/${mouId}/installments/schedule-edit`, request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (mode !== 'no-pi' && mode !== 'override') {
    return redirectTo({ error: 'invalid-mode' })
  }

  const result =
    mode === 'no-pi'
      ? await saveScheduleNoPi({ mouId, rows, recordedBy: session.sub })
      : await overrideLockedSchedule({
          mouId,
          rows,
          recordedBy: session.sub,
          reason,
        })

  if (!result.ok) {
    return redirectTo({ error: result.reason })
  }
  return redirectTo({
    saved: '1',
    touched: String(result.touchedPayments),
    created: String(result.createdPayments),
    deleted: String(result.deletedPayments),
    adjustments: String(result.adjustmentsCount),
  })
}
