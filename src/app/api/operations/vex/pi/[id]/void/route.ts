/*
 * POST /api/operations/vex/pi/[id]/void
 *
 * Soft-delete (void) a VEX PI raised in error, with cascade. Finance / Admin.
 * BLOCKS if the PI has a committed (Shipped/Invoiced/Delivered) dispatch.
 * Otherwise cascade-voids pre-ship dispatches + the PI's payment_logs, zeroes
 * the balance, and tombstones the PI. Fail-loud; returns the cascade summary.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { voidVexPi } from '@/lib/vex/vexPiMutations'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can void a VEX PI.' },
      { status: 403 },
    )
  }

  let body: { reason?: unknown }
  try {
    body = (await request.json()) as { reason?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const result = await voidVexPi({
    piId: id,
    reason: typeof body.reason === 'string' ? body.reason : '',
    recordedBy: user.id,
  })
  if (!result.ok) {
    const status = result.reason === 'has-committed-dispatch' ? 409 : 400
    return NextResponse.json(
      { error: result.reason, committed: result.reason === 'has-committed-dispatch' ? result.committed : undefined },
      { status },
    )
  }
  revalidatePath(`/operations/vex/pi/${id}`)
  revalidatePath('/operations/vex')
  return NextResponse.json({
    ok: true,
    voidedDispatches: result.voidedDispatches,
    voidedLogs: result.voidedLogs,
  })
}
