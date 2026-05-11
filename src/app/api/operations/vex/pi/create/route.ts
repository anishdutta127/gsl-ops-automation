/*
 * POST /api/operations/vex/pi/create (Gate 2 Step 7).
 *
 * Creates a new VEX PI:
 *   1. Gate on the parallel-build lock; if locked, 503 with the
 *      brief-verbatim copy. Default ON; production unlock via
 *      PI_PARALLEL_BUILD_LOCK=false.
 *   2. Gate on canEditFinanceData (Finance + Admin-with-null-dept).
 *   3. Validate the payload (school billing block, line items, GST entity).
 *   4. Atomically issue the next PI number from the per-entity counter
 *      at pi_counter_map.json via mouSystem/piCounterAtomic.
 *   5. Queue the create through enqueueUpdate so the cron drain
 *      writes vex_pis.json on the next tick.
 *
 * Honest response shape: { pi: { id, piNumber } } so the form can
 * route the user to /operations/vex/pi/[id] on success.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import {
  isPiParallelBuildLocked,
  parallelBuildLockMessage,
} from '@/lib/pi/parallelBuildLock'
import { issuePiNumberAtomic } from '@/lib/mouSystem/piCounterAtomic'
import { company } from '@/lib/mouSystem/company'
import type { EntityKey } from '@/lib/mouSystem/company'
import type { AuditEntry, VexPi, VexPiLineItem } from '@/lib/mouSystem/types'
import vexProductsJson from '@/data/vex_products.json'
import type { VexProduct } from '@/lib/mouSystem/types'

const vexProducts = vexProductsJson as unknown as VexProduct[]
const GST_PCT = 0.18

interface IncomingLineItem {
  partNumber?: unknown
  quantity?: unknown
  unitPrice?: unknown
}

interface IncomingPayload {
  entityKey?: unknown
  schoolName?: unknown
  shippingAddress?: unknown
  billingName?: unknown
  billingAddress?: unknown
  schoolGstNumber?: unknown
  contactPerson?: unknown
  contactNo?: unknown
  lineItems?: unknown
  freightCharges?: unknown
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function parseEntityKey(v: unknown): EntityKey | null {
  return v === 'MH' || v === 'UP' ? v : null
}

function parseLineItems(raw: unknown): VexPiLineItem[] | null {
  if (!Array.isArray(raw)) return null
  const out: VexPiLineItem[] = []
  for (const item of raw) {
    if (item == null || typeof item !== 'object') return null
    const obj = item as IncomingLineItem
    const partNumber = asString(obj.partNumber)
    const quantity = Number(obj.quantity)
    const unitPrice = Number(obj.unitPrice)
    if (!partNumber) return null
    if (!Number.isFinite(quantity) || quantity <= 0) return null
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null
    const product = vexProducts.find((p) => p.partNumber === partNumber)
    if (!product) return null
    out.push({
      partNumber,
      productName: product.name,
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
    })
  }
  return out.length > 0 ? out : null
}

function fiscalYearTag(): string {
  // mou-system uses '2627' style in piPrefix; default to company.fiscalYear.
  return company.fiscalYear
}

function makeVexPiId(entityKey: EntityKey, seq: number): string {
  return `VEXPI-${entityKey}-${fiscalYearTag()}-${String(seq).padStart(3, '0')}`
}

export async function POST(request: Request) {
  // (1) Parallel-build lock. Checked BEFORE auth so an authenticated
  // tester cannot accidentally advance the per-entity counter.
  if (isPiParallelBuildLocked()) {
    return NextResponse.json(
      {
        error: 'parallel-build-locked',
        message: parallelBuildLockMessage(),
      },
      { status: 503 },
    )
  }

  // (2) Auth + role gate.
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'unauthenticated' },
      { status: 401 },
    )
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can generate VEX PIs.' },
      { status: 403 },
    )
  }

  // (3) Payload validation.
  let body: IncomingPayload
  try {
    body = (await request.json()) as IncomingPayload
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const entityKey = parseEntityKey(body.entityKey)
  if (!entityKey) {
    return NextResponse.json(
      { error: 'invalid-entity', message: 'Pick MH or UP.' },
      { status: 400 },
    )
  }
  const schoolName = asString(body.schoolName)
  const shippingAddress = asString(body.shippingAddress)
  const billingName = asString(body.billingName)
  const billingAddress = asString(body.billingAddress)
  const contactPerson = asString(body.contactPerson)
  const contactNo = asString(body.contactNo)
  if (!schoolName || !shippingAddress || !billingName || !billingAddress) {
    return NextResponse.json(
      { error: 'missing-billing-block', message: 'Fill every school billing field.' },
      { status: 400 },
    )
  }
  if (!contactPerson || !contactNo) {
    return NextResponse.json(
      { error: 'missing-contact', message: 'Contact person and number required.' },
      { status: 400 },
    )
  }
  const schoolGstNumber = asString(body.schoolGstNumber) || null
  const lineItems = parseLineItems(body.lineItems)
  if (!lineItems) {
    return NextResponse.json(
      { error: 'invalid-line-items', message: 'Add at least one valid product row.' },
      { status: 400 },
    )
  }
  const freightCharges = Number(body.freightCharges) || 0

  // (4) Atomic counter advance + PI number mint.
  let piNumber: string
  let counterSeq: number
  try {
    const { piNumber: minted, counter } = await issuePiNumberAtomic(entityKey)
    piNumber = minted
    counterSeq = counter.entities[entityKey].next - 1
  } catch (e) {
    return NextResponse.json(
      {
        error: 'counter-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to issue PI number. Retry.',
      },
      { status: 500 },
    )
  }

  // (5) Compose the VexPi record + queue the create.
  const subtotal = lineItems.reduce((s, li) => s + li.total, 0)
  const taxableValue = subtotal + freightCharges
  const gstAmount = Math.round(taxableValue * GST_PCT * 100) / 100
  const total = Math.round((taxableValue + gstAmount) * 100) / 100
  const now = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'create',
  }
  const pi: VexPi = {
    id: makeVexPiId(entityKey, counterSeq),
    piNumber,
    entityKey,
    issueDate: now.slice(0, 10),
    schoolName,
    shippingAddress,
    billingName,
    billingAddress,
    schoolGstNumber,
    contactPerson,
    contactNo,
    lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    freightCharges,
    taxableValue: Math.round(taxableValue * 100) / 100,
    gstPct: GST_PCT,
    gstAmount,
    total,
    status: 'Generated',
    generatedBy: user.name,
    generatedAt: now,
    paymentReceivedAmount: 0,
    paymentLogIds: [],
    notes: null,
    auditLog: [audit],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'vexPi',
      operation: 'create',
      payload: { vexPi: pi as unknown as Record<string, unknown> },
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to queue the new VEX PI. Retry or WhatsApp Anish.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({ pi: { id: pi.id, piNumber: pi.piNumber } })
}
