/*
 * Delivery confirmation + PI roll-up wiring for the VEX dispatch transition.
 *
 * Marking a dispatch Delivered must (a) stamp deliveredAt/deliveredBy on the
 * dispatch and (b) roll the parent PI up off "Delivery Pending" when the whole
 * order is delivered. Repos are mocked so the test controls the exact state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))
vi.mock('@/lib/db/repos/leafRepos', () => ({
  vexDispatchRepo: {
    findById: vi.fn(),
    findAll: vi.fn(),
    updateWithAudit: vi.fn(),
  },
}))
vi.mock('@/lib/db/repos/vexPi', () => ({
  vexPiRepo: { findById: vi.fn() },
}))

const OPS_USER: User = {
  id: 'anish.d',
  name: 'Anish D.',
  email: 'anish.d@getsetlearn.info',
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

function makeDispatch(status: string, items: { partNumber: string; qty: number }[]) {
  return {
    id: DISPATCH_ID,
    piId: PI_ID,
    items,
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

function makePi(status: string, lineItems: { partNumber: string; quantity: number }[]) {
  return {
    id: PI_ID,
    piNumber: 'MTPL/UP/26-27/0030',
    status,
    lineItems: lineItems.map((l) => ({
      partNumber: l.partNumber,
      productName: l.partNumber,
      quantity: l.quantity,
      unitPrice: 100,
      total: 100 * l.quantity,
    })),
    auditLog: [],
  }
}

async function callTransition(status: string) {
  const { POST } = await import('./route')
  return POST(
    new Request(
      `http://localhost/api/operations/vex/pi/${PI_ID}/dispatch/${DISPATCH_ID}/transition`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    ),
    { params: Promise.resolve({ id: PI_ID, dispatchId: DISPATCH_ID }) },
  )
}

describe('VEX dispatch transition: Delivered + PI roll-up', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('marks Delivered, stamps who/when, and rolls the PI up to Completed', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    const { vexPiRepo } = await import('@/lib/db/repos/vexPi')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)
    const dispatch = makeDispatch('Shipped', [{ partNumber: 'A', qty: 5 }])
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(dispatch)
    ;(vexDispatchRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([dispatch])
    ;(vexPiRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePi('Delivery Pending', [{ partNumber: 'A', quantity: 5 }]),
    )

    const res = await callTransition('Delivered')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; piStatus: string | null }
    expect(body.status).toBe('Delivered')
    expect(body.piStatus).toBe('Completed')

    // Dispatch stamped Delivered with who + when.
    expect(vexDispatchRepo.updateWithAudit).toHaveBeenCalledOnce()
    const [, patch] = (vexDispatchRepo.updateWithAudit as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(patch.status).toBe('Delivered')
    expect(typeof patch.deliveredAt).toBe('string')
    expect(patch.deliveredBy).toBe(OPS_USER.name)

    // PI rolled up to Completed.
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const piCall = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(piCall.entity).toBe('vexPi')
    expect(piCall.payload.status).toBe('Completed')
    expect(piCall.payload.auditLog.at(-1)?.action).toBe('status_change')
  })

  it('marking Shipped does not roll the PI up (nothing delivered yet)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    const { vexPiRepo } = await import('@/lib/db/repos/vexPi')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)
    const dispatch = makeDispatch('Invoiced', [{ partNumber: 'A', qty: 5 }])
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(dispatch)
    ;(vexDispatchRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([dispatch])
    ;(vexPiRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePi('Delivery Pending', [{ partNumber: 'A', quantity: 5 }]),
    )

    const res = await callTransition('Shipped')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { piStatus: string | null }
    expect(body.piStatus).toBeNull()
    expect(enqueueUpdate).not.toHaveBeenCalled()
  })

  it('partial delivery rolls the PI to Partially Dispatched, not Completed', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    const { vexPiRepo } = await import('@/lib/db/repos/vexPi')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)
    // Only 3 of 5 ordered units were dispatched; delivering them is partial.
    const dispatch = makeDispatch('Shipped', [{ partNumber: 'A', qty: 3 }])
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(dispatch)
    ;(vexDispatchRepo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([dispatch])
    ;(vexPiRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePi('Delivery Pending', [{ partNumber: 'A', quantity: 5 }]),
    )

    const res = await callTransition('Delivered')
    const body = (await res.json()) as { piStatus: string | null }
    expect(body.piStatus).toBe('Partially Dispatched')
    expect((enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![0].payload.status).toBe(
      'Partially Dispatched',
    )
  })

  it('rejects a backward transition (Shipped -> Invoiced)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { vexDispatchRepo } = await import('@/lib/db/repos/leafRepos')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)
    ;(vexDispatchRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeDispatch('Shipped', [{ partNumber: 'A', qty: 5 }]),
    )
    const res = await callTransition('Invoiced')
    expect(res.status).toBe(400)
    expect(vexDispatchRepo.updateWithAudit).not.toHaveBeenCalled()
  })
})
