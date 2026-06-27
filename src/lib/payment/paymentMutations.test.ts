import { describe, expect, it, vi } from 'vitest'
import type { MOU, Payment, PaymentLog, User } from '@/lib/types'
import { unmatchPayment, type PaymentMutationDeps } from './paymentMutations'

const NOW = '2026-06-27T10:00:00.000Z'

function makeUser(): User {
  return {
    id: 'fin1', name: 'Fin', email: 'fin@x.io', role: 'Admin', department: null,
    testingOverride: false, active: true, passwordHash: '', createdAt: '2026-01-01T00:00:00Z', auditLog: [],
  } as User
}

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: 'PAY-i2', mouId: 'MOU-1', schoolName: 'St Paul', instalmentLabel: 'i2',
    expectedAmount: 372000, receivedAmount: 372000, receivedDate: '2026-05-27',
    paymentMode: 'Bank Transfer', bankReference: 'PUNBH26147595072', status: 'Paid',
    partialPayments: [], auditLog: [], ...over,
  } as Payment
}

function makeLog(over: Partial<PaymentLog> = {}): PaymentLog {
  return {
    id: 'PL-DUP', date: '2026-05-27', amount: 372000, mode: 'Bank Transfer',
    reference: 'PUNBH26147595072', narration: null, salesPersonId: null,
    matchedInstallmentIds: ['PAY-i2'], unmatched: false, loggedBy: 'fin1',
    loggedAt: NOW, notes: null, auditLog: [], ...over,
  } as PaymentLog
}

function makeDeps(payment: Payment, logs: PaymentLog[]): {
  deps: PaymentMutationDeps
  enqueue: ReturnType<typeof vi.fn>
} {
  const enqueue = vi.fn(async () => {})
  const deps: PaymentMutationDeps = {
    payments: [payment],
    users: [makeUser()],
    mous: [{ id: 'MOU-1', schoolId: 'S1' } as unknown as MOU],
    paymentLogs: logs,
    enqueue: enqueue as unknown as PaymentMutationDeps['enqueue'],
    now: () => new Date(NOW),
  }
  return { deps, enqueue }
}

describe('unmatchPayment resets the source payment_log (St Paul flow enabler)', () => {
  it('reverts the instalment AND returns the source log to unmatched', async () => {
    const { deps, enqueue } = makeDeps(makePayment(), [makeLog()])
    const res = await unmatchPayment({ paymentId: 'PAY-i2', reason: 'duplicate receipt', recordedBy: 'fin1' }, deps)
    expect(res.ok).toBe(true)

    const calls = enqueue.mock.calls.map((c) => c[0] as { entity: string; payload: Record<string, unknown> })
    const paymentUpdate = calls.find((c) => c.entity === 'payment')
    const logUpdate = calls.find((c) => c.entity === 'paymentLog')

    // instalment reverted
    expect(paymentUpdate?.payload.receivedAmount).toBeNull()
    expect(paymentUpdate?.payload.status).toBe('Pending')

    // source log reset so it can now be voided
    expect(logUpdate).toBeDefined()
    expect(logUpdate?.payload.id).toBe('PL-DUP')
    expect(logUpdate?.payload.matchedInstallmentIds).toEqual([])
    expect(logUpdate?.payload.unmatched).toBe(true)
  })

  it('a log split across instalments only drops the unmatched one and stays matched', async () => {
    const log = makeLog({ matchedInstallmentIds: ['PAY-i2', 'PAY-i3'] })
    const { deps, enqueue } = makeDeps(makePayment(), [log])
    await unmatchPayment({ paymentId: 'PAY-i2', reason: 'wrong split', recordedBy: 'fin1' }, deps)
    const logUpdate = enqueue.mock.calls
      .map((c) => c[0] as { entity: string; payload: Record<string, unknown> })
      .find((c) => c.entity === 'paymentLog')
    expect(logUpdate?.payload.matchedInstallmentIds).toEqual(['PAY-i3'])
    expect(logUpdate?.payload.unmatched).toBe(false)
  })

  it('does not touch logs that do not reference this instalment', async () => {
    const { deps, enqueue } = makeDeps(makePayment(), [makeLog({ matchedInstallmentIds: ['PAY-other'] })])
    await unmatchPayment({ paymentId: 'PAY-i2', reason: 'duplicate receipt', recordedBy: 'fin1' }, deps)
    const logUpdate = enqueue.mock.calls
      .map((c) => c[0] as { entity: string })
      .find((c) => c.entity === 'paymentLog')
    expect(logUpdate).toBeUndefined()
  })
})
