/*
 * VEX dispatch tax-invoice recorder (restored capability).
 *
 * Finance records the tax invoice number + a link to the PDF; the dispatch
 * advances to Invoiced unless already further along. Repos mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/db/repos/leafRepos', () => ({
  vexDispatchRepo: { findById: vi.fn(), updateWithAudit: vi.fn() },
}))

const FINANCE_USER: User = {
  id: 'pranav.d',
  name: 'Pranav D.',
  email: 'pranav.d@getsetlearn.info',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: '',
  createdAt: '2026-01-01T00:00:00Z',
  auditLog: [],
}

const PI_ID = 'VEXPI-UP-2627-001'
const DISPATCH_ID = 'VEXD-UP-2627-001'
const GOOD_URL = 'https://drive.google.com/file/d/abc/view'

function makeDispatch(status: string) {
  return {
    id: DISPATCH_ID,
    piId: PI_ID,
    items: [{ partNumber: 'A', qty: 5 }],
    freight: 0,
    mode: 'Surface',
    status,
    requestedBy: 'anish.d',
    requestedAt: '2026-05-12T00:00:00Z',
    taxInvoiceNumber: null,
    taxInvoicePath: null,
    invoicedAt: null,
    deliveredAt: null,
    deliveredBy: null,
    notes: null,
    supportingDocPath: null,
    warehouseEmailSentAt: null,
    warehouseEmailSentBy: null,
    auditLog: [],
  }
}

async function callTaxInvoice(body: unknown) {
  const { POST } = await import('./route')
  return POST(
    new Request(
      `http://localhost/api/operations/vex/pi/${PI_ID}/dispatch/${DISPATCH_ID}/tax-invoice`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: PI_ID, dispatchId: DISPATCH_ID }) },
  )
}

describe('POST .../dispatch/[dispatchId]/tax-invoice', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('records the invoice and advances a Requested dispatch to Invoiced', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDispatch('Requested'),
    )

    const res = await callTaxInvoice({ taxInvoiceNumber: 'MTPL/UP/26-27/T15', taxInvoiceUrl: GOOD_URL })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; taxInvoicePath: string }
    expect(body.status).toBe('Invoiced')
    expect(body.taxInvoicePath).toBe(GOOD_URL)

    expect(vexDispatchRepo.updateWithAudit).toHaveBeenCalledOnce()
    const [, patch, audit] = (vexDispatchRepo.updateWithAudit as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(patch.taxInvoiceNumber).toBe('MTPL/UP/26-27/T15')
    expect(patch.taxInvoicePath).toBe(GOOD_URL)
    expect(patch.status).toBe('Invoiced')
    expect(typeof patch.invoicedAt).toBe('string')
    expect(audit.action).toBe('tax-invoice-recorded')
  })

  it('does not rewind a dispatch already Shipped', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDispatch('Shipped'),
    )

    const res = await callTaxInvoice({ taxInvoiceNumber: 'T15', taxInvoiceUrl: GOOD_URL })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('Shipped')
    const [, patch] = (vexDispatchRepo.updateWithAudit as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(patch.status).toBe('Shipped')
    expect(patch.taxInvoicePath).toBe(GOOD_URL)
  })

  it('rejects a missing invoice number', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDispatch('Requested'),
    )
    const res = await callTaxInvoice({ taxInvoiceNumber: '  ', taxInvoiceUrl: GOOD_URL })
    expect(res.status).toBe(400)
    expect(vexDispatchRepo.updateWithAudit).not.toHaveBeenCalled()
  })

  it('rejects an invalid link', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDispatch('Requested'),
    )
    const res = await callTaxInvoice({ taxInvoiceNumber: 'T15', taxInvoiceUrl: 'not-a-url' })
    expect(res.status).toBe(400)
    expect(vexDispatchRepo.updateWithAudit).not.toHaveBeenCalled()
  })

  it('403s a non-finance user', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...FINANCE_USER,
      role: 'OpsEmployee',
      department: 'ops',
    })
    // Production-strict gating so the ops user is actually blocked.
    const prev = process.env.TESTING_OPEN_ACCESS
    process.env.TESTING_OPEN_ACCESS = 'false'
    try {
      const res = await callTaxInvoice({ taxInvoiceNumber: 'T15', taxInvoiceUrl: GOOD_URL })
      expect(res.status).toBe(403)
    } finally {
      process.env.TESTING_OPEN_ACCESS = prev
    }
  })
})
