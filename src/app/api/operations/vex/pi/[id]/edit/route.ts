/*
 * POST /api/operations/vex/pi/[id]/edit
 *
 * Edit a generated VEX PI (line items / qty / price / school / GST / billing /
 * freight). Finance / Admin. Totals are re-derived server-side. Blocked on a
 * voided PI or a qty reduction below already-dispatched. JSON body; fail-loud.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { editVexPi } from '@/lib/vex/vexPiMutations'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface Body {
  schoolName?: unknown
  shippingAddress?: unknown
  billingName?: unknown
  billingAddress?: unknown
  schoolGstNumber?: unknown
  contactPerson?: unknown
  contactNo?: unknown
  freightCharges?: unknown
  gstPct?: unknown
  lineItems?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v))

export async function POST(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can edit a VEX PI.' },
      { status: 403 },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const rawItems = Array.isArray(body.lineItems) ? body.lineItems : []
  const lineItems = rawItems.map((r) => {
    const li = r as Record<string, unknown>
    return {
      partNumber: str(li.partNumber),
      productName: str(li.productName),
      quantity: num(li.quantity),
      unitPrice: num(li.unitPrice),
    }
  })

  const result = await editVexPi({
    piId: id,
    schoolName: str(body.schoolName),
    shippingAddress: str(body.shippingAddress),
    billingName: str(body.billingName),
    billingAddress: str(body.billingAddress),
    schoolGstNumber: typeof body.schoolGstNumber === 'string' ? body.schoolGstNumber : null,
    contactPerson: str(body.contactPerson),
    contactNo: str(body.contactNo),
    freightCharges: num(body.freightCharges),
    gstPct: num(body.gstPct),
    lineItems,
    recordedBy: user.id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, detail: result.detail }, { status: 400 })
  }
  revalidatePath(`/operations/vex/pi/${id}`)
  revalidatePath('/operations/vex')
  return NextResponse.json({ ok: true, total: result.pi.total })
}
