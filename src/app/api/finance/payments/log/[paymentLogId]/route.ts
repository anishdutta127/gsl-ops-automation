/*
 * POST /api/finance/payments/log/[paymentLogId]
 *
 * Correct a PARKED (unmatched) payment log. Finance / Admin only. Action via
 * the `action` form field:
 *   - action='edit'  -> editPaymentLog (amount/date/ref/mode/narration)
 *   - action='void'  -> voidPaymentLog (soft-delete tombstone)
 *
 * A log still matched to an instalment, or one feeding a VexPi, is refused with
 * a clear reason (unmatch the instalment first / use the VEX payment action).
 * 303-redirects back to the manage page with ?ok / ?error.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentSession } from '@/lib/auth/session'
import { editPaymentLog, voidPaymentLog } from '@/lib/payment/paymentLogMutations'
import type { PaymentMode } from '@/lib/types'

interface RouteContext {
  params: Promise<{ paymentLogId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { paymentLogId } = await ctx.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/finance/payments/log/${paymentLogId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const action = String(form.get('action') ?? '').trim()

  const redirectTo = (params: Record<string, string>) => {
    const url = new URL(`/finance/payments/log/${paymentLogId}`, request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (action === 'edit') {
    const referenceRaw = String(form.get('reference') ?? '').trim()
    const narrationRaw = String(form.get('narration') ?? '').trim()
    const result = await editPaymentLog({
      logId: paymentLogId,
      amount: Number(form.get('amount') ?? ''),
      date: String(form.get('date') ?? ''),
      mode: String(form.get('mode') ?? '') as PaymentMode,
      reference: referenceRaw === '' ? null : referenceRaw,
      narration: narrationRaw === '' ? null : narrationRaw,
      recordedBy: session.sub,
    })
    if (!result.ok) return redirectTo({ error: result.reason })
    revalidatePath('/finance/payments/unmatched')
    return redirectTo({ ok: 'edit' })
  }

  if (action === 'void') {
    const reason = String(form.get('reason') ?? '').trim()
    const result = await voidPaymentLog({
      logId: paymentLogId,
      reason,
      recordedBy: session.sub,
    })
    if (!result.ok) return redirectTo({ error: result.reason })
    revalidatePath('/finance/payments/unmatched')
    return redirectTo({ ok: 'void' })
  }

  return redirectTo({ error: 'invalid-action' })
}
