/*
 * POST /api/mou/[mouId]/cancel (Phase 3): soft-cancel an MOU + cascade.
 *
 * Admin-wildcard only (enforced in cancelMou). Sets status='Cancelled' and
 * soft-deletes every linked payment. Fail-loud: a write error surfaces verbatim
 * via ?error=cancel-failed&detail=. revalidatePath keeps it live (no Sync).
 * 303-redirects back to the MOU edit page with ?ok=cancelled or ?error=.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentSession } from '@/lib/auth/session'
import { cancelMou } from '@/lib/mou/cancelMou'

interface RouteContext {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const session = await getCurrentSession()
  const redirectTo = (params: Record<string, string>) => {
    const url = new URL(`/mous/${mouId}/edit`, request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/edit`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const reason = String(form.get('reason') ?? '').trim()

  try {
    const result = await cancelMou({ mouId, reason, recordedBy: session.sub })
    if (!result.ok) return redirectTo({ error: result.reason })
    revalidatePath(`/mous/${mouId}`)
    revalidatePath(`/mous/${mouId}/edit`)
    revalidatePath('/mous')
    revalidatePath('/finance/payments')
    return redirectTo({ ok: 'cancelled', payments: String(result.cancelledPaymentIds.length) })
  } catch (e) {
    return redirectTo({
      error: 'cancel-failed',
      detail: (e instanceof Error ? e.message : 'cancel failed').slice(0, 200),
    })
  }
}
