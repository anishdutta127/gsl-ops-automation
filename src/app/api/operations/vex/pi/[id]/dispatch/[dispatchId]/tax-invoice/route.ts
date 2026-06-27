/*
 * POST /api/operations/vex/pi/[id]/dispatch/[dispatchId]/tax-invoice
 *
 * Finance records the Tally tax invoice against a VEX dispatch: the invoice
 * number plus a link to the PDF (kept in Drive/SharePoint, the same paste-a-URL
 * pattern as the delivery acknowledgement). Recording the invoice attests it
 * exists, so the dispatch advances to 'Invoiced' unless it is already further
 * along (Shipped/Delivered), in which case the status is left untouched.
 *
 * Restores the capability that lived on gsl-mou-system
 * (api/vex/dispatch/tax-invoice) and was not ported in the rebuild: the
 * dispatch already carried taxInvoiceNumber/taxInvoicePath but had no writer,
 * so the PI page only ever showed "awaiting upload".
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import type { AuditEntry } from '@/lib/types'
import type {
  VexDispatch,
  VexDispatchStatusV3,
} from '@/lib/mouSystem/types'
import { vexDispatchRepo } from '@/lib/db/repos/leafRepos'

const STATUS_ORDER: VexDispatchStatusV3[] = [
  'Requested',
  'Request Raised to Warehouse',
  'Invoiced',
  'Shipped',
  'Delivered',
]

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

interface RouteContext {
  params: Promise<{ id: string; dispatchId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id, dispatchId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditFinanceData(user)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only Finance can record a tax invoice.' },
      { status: 403 },
    )
  }

  const dispatch = (await vexDispatchRepo.findById(dispatchId)) as VexDispatch | null
  if (!dispatch || dispatch.piId !== id) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  if (dispatch.voidedAt) {
    return NextResponse.json({ error: 'dispatch-voided', message: 'This dispatch is voided.' }, { status: 409 })
  }

  let body: { taxInvoiceNumber?: unknown; taxInvoiceUrl?: unknown }
  try {
    body = (await request.json()) as {
      taxInvoiceNumber?: unknown
      taxInvoiceUrl?: unknown
    }
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const taxInvoiceNumber =
    typeof body.taxInvoiceNumber === 'string' ? body.taxInvoiceNumber.trim() : ''
  const taxInvoiceUrl =
    typeof body.taxInvoiceUrl === 'string' ? body.taxInvoiceUrl.trim() : ''

  if (!taxInvoiceNumber) {
    return NextResponse.json(
      { error: 'missing-number', message: 'Enter the tax invoice number.' },
      { status: 400 },
    )
  }
  if (!isValidUrl(taxInvoiceUrl)) {
    return NextResponse.json(
      {
        error: 'invalid-url',
        message: 'Paste a valid https link to the tax invoice PDF.',
      },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  // Recording the invoice attests it exists, so advance to 'Invoiced', but
  // never rewind a dispatch that is already Shipped or Delivered.
  const invoicedIdx = STATUS_ORDER.indexOf('Invoiced')
  const currentIdx = STATUS_ORDER.indexOf(dispatch.status)
  const nextStatus: VexDispatchStatusV3 =
    currentIdx < invoicedIdx ? 'Invoiced' : dispatch.status

  const auditEntry: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'tax-invoice-recorded',
    before: {
      taxInvoiceNumber: dispatch.taxInvoiceNumber,
      taxInvoicePath: dispatch.taxInvoicePath,
      status: dispatch.status,
    },
    after: {
      taxInvoiceNumber,
      taxInvoicePath: taxInvoiceUrl,
      status: nextStatus,
    },
    notes: `Tax invoice ${taxInvoiceNumber} recorded.`,
  }
  const patch: Partial<VexDispatch> = {
    taxInvoiceNumber,
    taxInvoicePath: taxInvoiceUrl,
    status: nextStatus,
    invoicedAt: dispatch.invoicedAt ?? now,
  }

  try {
    await vexDispatchRepo.updateWithAudit(dispatch.id, patch, auditEntry, {
      queuedBy: user.id,
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error
            ? e.message
            : 'Failed to save the tax invoice. Retry.',
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    taxInvoiceNumber,
    taxInvoicePath: taxInvoiceUrl,
    status: nextStatus,
  })
}
