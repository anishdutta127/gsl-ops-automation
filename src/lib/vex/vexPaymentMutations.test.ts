import { describe, expect, it } from 'vitest'
import type { PaymentLog, User, VexPi } from '@/lib/types'
import {
  editVexPayment,
  voidVexPayment,
  recomputeVexPiStatus,
  type VexPaymentDeps,
} from './vexPaymentMutations'

const NOW = '2026-06-27T10:00:00.000Z'

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'fin1',
    name: 'Fin User',
    email: 'fin@getsetlearn.info',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: '',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...over,
  } as User
}

function makePi(over: Partial<VexPi> = {}): VexPi {
  return {
    id: 'VEXPI-T-1',
    piNumber: 'MTPL/T/1',
    entityKey: 'UP',
    issueDate: '2026-06-01',
    schoolName: 'Test School',
    shippingAddress: 'addr',
    billingName: 'Test School',
    billingAddress: 'addr',
    schoolGstNumber: null,
    contactPerson: 'x',
    contactNo: 'y',
    lineItems: [],
    subtotal: 0,
    freightCharges: 0,
    taxableValue: 0,
    gstPct: 0.18,
    gstAmount: 0,
    total: 410516.1,
    status: 'Delivery Pending',
    generatedBy: 'sys',
    generatedAt: '2026-06-01',
    paymentReceivedAmount: 821032,
    paymentLogIds: ['LOG-A', 'LOG-B'],
    notes: null,
    auditLog: [],
    ...over,
  } as VexPi
}

function makeLog(over: Partial<PaymentLog> = {}): PaymentLog {
  return {
    id: 'LOG-B',
    date: '2026-06-27',
    amount: 410516,
    mode: 'Bank Transfer',
    reference: 'INF/INFT/044632377521',
    narration: null,
    salesPersonId: null,
    matchedInstallmentIds: [],
    unmatched: false,
    loggedBy: 'fin1',
    loggedAt: NOW,
    notes: null,
    auditLog: [],
    ...over,
  } as PaymentLog
}

function makeDeps(pi: VexPi, logs: PaymentLog[]): {
  deps: VexPaymentDeps
  piWrites: VexPi[]
  logWrites: PaymentLog[]
  voids: Array<{ id: string; voidedAt: string; voidReason: string }>
} {
  const piWrites: VexPi[] = []
  const logWrites: PaymentLog[] = []
  const voids: Array<{ id: string; voidedAt: string; voidReason: string }> = []
  const deps: VexPaymentDeps = {
    pis: [pi],
    logs,
    users: [makeUser()],
    updatePi: async (p) => {
      piWrites.push(p)
    },
    updateLog: async (l) => {
      logWrites.push(l)
    },
    voidLog: async (id, args) => {
      voids.push({ id, voidedAt: args.voidedAt, voidReason: args.voidReason })
    },
    now: () => new Date(NOW),
  }
  return { deps, piWrites, logWrites, voids }
}

describe('recomputeVexPiStatus', () => {
  it('zero balance rewinds to Generated', () => {
    expect(recomputeVexPiStatus(0, 1000, 'Delivery Pending')).toBe('Generated')
    expect(recomputeVexPiStatus(-5, 1000, 'Completed')).toBe('Generated')
  })
  it('partial balance is Payment Pending', () => {
    expect(recomputeVexPiStatus(400, 1000, 'Delivery Pending')).toBe('Payment Pending')
  })
  it('full balance is Delivery Pending, preserving Completed', () => {
    expect(recomputeVexPiStatus(1000, 1000, 'Payment Pending')).toBe('Delivery Pending')
    expect(recomputeVexPiStatus(1200, 1000, 'Completed')).toBe('Completed')
  })
  it('a whole-rupee receipt within Rs 1 of a paise-carrying total is fully paid', () => {
    // the reported bug: total 1,14,284.18, bank remits 1,14,284 (0.18 short)
    expect(recomputeVexPiStatus(114284, 114284.18, 'Payment Pending')).toBe('Delivery Pending')
    expect(recomputeVexPiStatus(1149917, 1149917.08, 'Payment Pending')).toBe('Delivery Pending')
  })
  it('a genuine partial (short by more than Rs 1) stays Payment Pending', () => {
    expect(recomputeVexPiStatus(1, 4.72, 'Payment Pending')).toBe('Payment Pending')
    expect(recomputeVexPiStatus(99998, 100000, 'Generated')).toBe('Payment Pending')
  })
  it('fully paid never rewinds dispatch progress', () => {
    expect(recomputeVexPiStatus(1000, 1000, 'Partially Dispatched')).toBe('Partially Dispatched')
  })
})

describe('voidVexPayment (the Funscholar correction, as a button)', () => {
  it('drops the log id, decrements the balance, recomputes status, tombstones the log', async () => {
    const pi = makePi() // received 821032 (2x), ids [LOG-A, LOG-B], total 410516.10
    const { deps, piWrites, voids } = makeDeps(pi, [makeLog()])
    const res = await voidVexPayment(
      { piId: pi.id, logId: 'LOG-B', reason: 'duplicate receipt logged twice', recordedBy: 'fin1' },
      deps,
    )
    expect(res.ok).toBe(true)
    expect(piWrites).toHaveLength(1)
    expect(piWrites[0]!.paymentReceivedAmount).toBe(410516)
    expect(piWrites[0]!.paymentLogIds).toEqual(['LOG-A'])
    // 410516 is Rs 0.10 short of total 410516.10 = GST rounding -> effectively
    // paid, so the surviving single receipt holds the PI at Delivery Pending
    // (matches the owner's real Funscholar VEXPI-UP-26-27-013 adjudication).
    expect(piWrites[0]!.status).toBe('Delivery Pending')
    expect(piWrites[0]!.auditLog.at(-1)?.notes).toContain('voided')
    expect(voids).toHaveLength(1)
    expect(voids[0]!.id).toBe('LOG-B')
    expect(voids[0]!.voidReason).toBe('duplicate receipt logged twice')
  })

  it('rejects a log that is not on the PI', async () => {
    const pi = makePi({ paymentLogIds: ['LOG-A'] })
    const { deps } = makeDeps(pi, [makeLog()])
    const res = await voidVexPayment(
      { piId: pi.id, logId: 'LOG-B', reason: 'long enough reason', recordedBy: 'fin1' },
      deps,
    )
    expect(res).toEqual({ ok: false, reason: 'not-on-pi' })
  })

  it('rejects an already-voided log', async () => {
    const pi = makePi()
    const { deps } = makeDeps(pi, [makeLog({ voidedAt: '2026-06-26T00:00:00Z' })])
    const res = await voidVexPayment(
      { piId: pi.id, logId: 'LOG-B', reason: 'long enough reason', recordedBy: 'fin1' },
      deps,
    )
    expect(res).toEqual({ ok: false, reason: 'already-voided' })
  })

  it('requires a reason of at least 10 characters', async () => {
    const pi = makePi()
    const { deps, piWrites, voids } = makeDeps(pi, [makeLog()])
    const res = await voidVexPayment({ piId: pi.id, logId: 'LOG-B', reason: 'short', recordedBy: 'fin1' }, deps)
    expect(res).toEqual({ ok: false, reason: 'missing-reason' })
    expect(piWrites).toHaveLength(0)
    expect(voids).toHaveLength(0)
  })
})

describe('editVexPayment', () => {
  it('moves the balance by the amount delta and recomputes status', async () => {
    // received 100000, single log LOG-B 100000, total 410516.10 -> Payment Pending
    const pi = makePi({ paymentReceivedAmount: 100000, paymentLogIds: ['LOG-B'], status: 'Payment Pending' })
    const { deps, piWrites, logWrites } = makeDeps(pi, [makeLog({ amount: 100000 })])
    const res = await editVexPayment(
      { piId: pi.id, logId: 'LOG-B', amount: 410516.1, date: '2026-06-27', mode: 'Bank Transfer', reference: 'X', recordedBy: 'fin1' },
      deps,
    )
    expect(res.ok).toBe(true)
    expect(logWrites[0]!.amount).toBe(410516.1)
    expect(piWrites[0]!.paymentReceivedAmount).toBe(410516.1)
    expect(piWrites[0]!.status).toBe('Delivery Pending')
  })

  it('rejects a non-positive amount', async () => {
    const pi = makePi({ paymentLogIds: ['LOG-B'] })
    const { deps } = makeDeps(pi, [makeLog()])
    const res = await editVexPayment(
      { piId: pi.id, logId: 'LOG-B', amount: 0, date: '2026-06-27', mode: 'Cash', reference: null, recordedBy: 'fin1' },
      deps,
    )
    expect(res).toEqual({ ok: false, reason: 'invalid-amount' })
  })
})
