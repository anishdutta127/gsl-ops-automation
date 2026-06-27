import { describe, expect, it } from 'vitest'
import type { PaymentLog, User, VexDispatch, VexPi } from '@/lib/types'
import {
  voidVexPi,
  editVexPi,
  deriveVexPiTotals,
  dispatchedQtyByPart,
  type VexPiMutationDeps,
} from './vexPiMutations'

const NOW = '2026-06-27T12:00:00.000Z'

function makeUser(): User {
  return {
    id: 'fin1', name: 'Fin', email: 'fin@x.io', role: 'Admin', department: null,
    testingOverride: false, active: true, passwordHash: '', createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  } as User
}

function makePi(over: Partial<VexPi> = {}): VexPi {
  return {
    id: 'VEXPI-T', piNumber: 'MTPL/T', entityKey: 'UP', issueDate: '2026-06-01',
    schoolName: 'S', shippingAddress: 'a', billingName: 'S', billingAddress: 'a',
    schoolGstNumber: null, contactPerson: 'c', contactNo: 'n',
    lineItems: [{ partNumber: 'P1', productName: 'Kit', quantity: 10, unitPrice: 100, total: 1000 }],
    subtotal: 1000, freightCharges: 0, taxableValue: 1000, gstPct: 0.18, gstAmount: 180, total: 1180,
    status: 'Delivery Pending', generatedBy: 's', generatedAt: '2026-06-01',
    paymentReceivedAmount: 1180, paymentLogIds: ['LOG-1'], notes: null, auditLog: [], ...over,
  } as VexPi
}

function makeDispatch(over: Partial<VexDispatch> = {}): VexDispatch {
  return {
    id: 'VEXD-1', piId: 'VEXPI-T', items: [{ partNumber: 'P1', qty: 4 }], freight: 0,
    mode: 'Surface', status: 'Requested', requestedBy: 's', requestedAt: NOW,
    taxInvoiceNumber: null, taxInvoicePath: null, invoicedAt: null, notes: null,
    supportingDocPath: null, warehouseEmailSentAt: null, warehouseEmailSentBy: null, auditLog: [], ...over,
  } as VexDispatch
}

function makeLog(id = 'LOG-1'): PaymentLog {
  return {
    id, date: '2026-06-01', amount: 1180, mode: 'Bank Transfer', reference: 'R', narration: null,
    salesPersonId: null, matchedInstallmentIds: [], unmatched: false, loggedBy: 'fin1', loggedAt: NOW, notes: null, auditLog: [],
  } as PaymentLog
}

function makeDeps(pi: VexPi, dispatches: VexDispatch[], logs: PaymentLog[]): {
  deps: VexPiMutationDeps
  piVoids: string[]
  piUpdates: VexPi[]
  dispatchVoids: string[]
  logVoids: string[]
} {
  const piVoids: string[] = []
  const piUpdates: VexPi[] = []
  const dispatchVoids: string[] = []
  const logVoids: string[] = []
  const deps: VexPiMutationDeps = {
    pis: [pi], dispatches, logs, users: [makeUser()],
    updatePi: async (p) => { piUpdates.push(p) },
    voidPi: async (id) => { piVoids.push(id) },
    voidDispatch: async (id) => { dispatchVoids.push(id) },
    voidLog: async (id) => { logVoids.push(id) },
    now: () => new Date(NOW),
  }
  return { deps, piVoids, piUpdates, dispatchVoids, logVoids }
}

describe('deriveVexPiTotals', () => {
  it('re-derives subtotal/taxable/gst/total', () => {
    const r = deriveVexPiTotals(
      [{ partNumber: 'P1', productName: 'Kit', quantity: 3, unitPrice: 200, total: 0 }],
      100, 0.18,
    )
    expect(r.subtotal).toBe(600)
    expect(r.taxableValue).toBe(700)
    expect(r.gstAmount).toBe(126)
    expect(r.total).toBe(826)
    expect(r.lineItems[0]!.total).toBe(600)
  })
})

describe('dispatchedQtyByPart', () => {
  it('sums non-voided dispatches only', () => {
    const m = dispatchedQtyByPart([
      makeDispatch({ id: 'd1', items: [{ partNumber: 'P1', qty: 4 }] }),
      makeDispatch({ id: 'd2', items: [{ partNumber: 'P1', qty: 3 }], voidedAt: NOW }),
    ])
    expect(m.get('P1')).toBe(4)
  })
})

describe('voidVexPi (cascade)', () => {
  it('cascade-voids pre-ship dispatches + payment_logs and voids the PI', async () => {
    const pi = makePi({ paymentLogIds: ['LOG-1', 'LOG-2'] })
    const { deps, piVoids, dispatchVoids, logVoids } = makeDeps(
      pi,
      [makeDispatch({ id: 'VEXD-1', status: 'Requested' })],
      [makeLog('LOG-1'), makeLog('LOG-2')],
    )
    const res = await voidVexPi({ piId: 'VEXPI-T', reason: 'raised in error duplicate', recordedBy: 'fin1' }, deps)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.voidedDispatches).toBe(1)
      expect(res.voidedLogs).toBe(2)
    }
    expect(dispatchVoids).toEqual(['VEXD-1'])
    expect(logVoids.sort()).toEqual(['LOG-1', 'LOG-2'])
    expect(piVoids).toEqual(['VEXPI-T'])
  })

  it('BLOCKS when the PI has a Shipped dispatch (no orphaned shipment)', async () => {
    const pi = makePi()
    const { deps, piVoids, dispatchVoids } = makeDeps(pi, [makeDispatch({ status: 'Shipped' })], [makeLog()])
    const res = await voidVexPi({ piId: 'VEXPI-T', reason: 'trying to void shipped', recordedBy: 'fin1' }, deps)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('has-committed-dispatch')
      expect(res.committed).toContain('VEXD-1 (Shipped)')
    }
    expect(piVoids).toHaveLength(0)
    expect(dispatchVoids).toHaveLength(0)
  })

  it('BLOCKS when the PI has an Invoiced dispatch', async () => {
    const { deps } = makeDeps(makePi(), [makeDispatch({ status: 'Invoiced' })], [makeLog()])
    const res = await voidVexPi({ piId: 'VEXPI-T', reason: 'trying to void invoiced', recordedBy: 'fin1' }, deps)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('has-committed-dispatch')
  })

  it('refuses an already-voided PI and a short reason', async () => {
    const { deps } = makeDeps(makePi({ voidedAt: NOW }), [], [makeLog()])
    expect((await voidVexPi({ piId: 'VEXPI-T', reason: 'long enough reason', recordedBy: 'fin1' }, deps)).ok).toBe(false)
    const { deps: d2 } = makeDeps(makePi(), [makeDispatch({ status: 'Requested' })], [makeLog()])
    const r = await voidVexPi({ piId: 'VEXPI-T', reason: 'short', recordedBy: 'fin1' }, d2)
    expect(r).toEqual({ ok: false, reason: 'missing-reason' })
  })
})

describe('editVexPi', () => {
  it('re-derives totals from edited line items', async () => {
    const { deps, piUpdates } = makeDeps(makePi(), [], [makeLog()])
    const res = await editVexPi({
      piId: 'VEXPI-T', schoolName: 'S', shippingAddress: 'a', billingName: 'S', billingAddress: 'a',
      schoolGstNumber: null, contactPerson: 'c', contactNo: 'n', freightCharges: 50, gstPct: 0.18,
      lineItems: [{ partNumber: 'P1', productName: 'Kit', quantity: 5, unitPrice: 200 }],
      recordedBy: 'fin1',
    }, deps)
    expect(res.ok).toBe(true)
    const u = piUpdates[0]!
    expect(u.subtotal).toBe(1000)
    expect(u.taxableValue).toBe(1050)
    expect(u.gstAmount).toBe(189)
    expect(u.total).toBe(1239)
  })

  it('blocks a qty below what is already dispatched', async () => {
    const { deps, piUpdates } = makeDeps(makePi(), [makeDispatch({ items: [{ partNumber: 'P1', qty: 4 }] })], [makeLog()])
    const res = await editVexPi({
      piId: 'VEXPI-T', schoolName: 'S', shippingAddress: 'a', billingName: 'S', billingAddress: 'a',
      schoolGstNumber: null, contactPerson: 'c', contactNo: 'n', freightCharges: 0, gstPct: 0.18,
      lineItems: [{ partNumber: 'P1', productName: 'Kit', quantity: 2, unitPrice: 100 }],
      recordedBy: 'fin1',
    }, deps)
    expect(res).toMatchObject({ ok: false, reason: 'qty-below-dispatched' })
    expect(piUpdates).toHaveLength(0)
  })

  it('rejects no line items, a voided PI, and a bad GST', async () => {
    const base = { piId: 'VEXPI-T', schoolName: 'S', shippingAddress: 'a', billingName: 'S', billingAddress: 'a', schoolGstNumber: null, contactPerson: 'c', contactNo: 'n', freightCharges: 0, recordedBy: 'fin1' }
    const li = [{ partNumber: 'P1', productName: 'Kit', quantity: 5, unitPrice: 100 }]
    const { deps } = makeDeps(makePi(), [], [makeLog()])
    expect((await editVexPi({ ...base, gstPct: 0.18, lineItems: [] }, deps))).toMatchObject({ ok: false, reason: 'no-line-items' })
    expect((await editVexPi({ ...base, gstPct: 2, lineItems: li }, deps))).toMatchObject({ ok: false, reason: 'invalid-gst' })
    const { deps: dv } = makeDeps(makePi({ voidedAt: NOW }), [], [makeLog()])
    expect((await editVexPi({ ...base, gstPct: 0.18, lineItems: li }, dv))).toMatchObject({ ok: false, reason: 'voided' })
  })
})
