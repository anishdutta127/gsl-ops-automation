/*
 * POST /api/mou/installments/mark-pi-sent (Step 5).
 *
 * Form target for the "Mark PI sent" affordance on the instalments
 * tracker. Mirrors gsl-mou-system's `mark-pi-sent` action shape:
 *   - paymentId
 *   - piSentDate (ISO yyyy-mm-dd)
 *   - piSentTo (email or name; nullable)
 *
 * Permission: canEditMOU. The lib-level check is canPerform but the
 * brief calls out canEditMOU for Sales-led affordances; we route the
 * gate through canEditMOU here.
 *
 * Persistence: applyInstallmentPatch from src/lib/mouSystem/entityWriters.ts
 * writes to src/data/payments.json via the queue.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { applyInstallmentPatch } from '@/lib/mouSystem/entityWriters'

export async function POST(request: Request) {
  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '')
  const paymentId = String(form.get('paymentId') ?? '')
  const piSentDate = String(form.get('piSentDate') ?? '').trim()
  const piSentToRaw = String(form.get('piSentTo') ?? '').trim()
  const piSentTo = piSentToRaw === '' ? null : piSentToRaw

  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', mouId ? `/mous/${mouId}/installments` : '/')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(
      mouId && paymentId
        ? `/mous/${mouId}/installments/${paymentId}/mark-pi-sent`
        : `/mous/${mouId || ''}/installments`,
      request.url,
    )
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (!canEditMOU(user)) return errorTo('permission')
  if (!mouId || !paymentId) return errorTo('missing-fields')
  if (!piSentDate) return errorTo('missing-fields')

  try {
    await applyInstallmentPatch(
      user.name,
      paymentId,
      { piSentDate, piSentTo },
      `Mark PI sent for ${paymentId}.`,
    )
  } catch (e) {
    if (e instanceof Error && e.message.includes('Installment not found')) {
      return errorTo('installment-not-found')
    }
    throw e
  }

  const url = new URL(`/mous/${mouId}/installments`, request.url)
  url.searchParams.set('notice', 'pi-sent-recorded')
  return NextResponse.redirect(url, { status: 303 })
}
