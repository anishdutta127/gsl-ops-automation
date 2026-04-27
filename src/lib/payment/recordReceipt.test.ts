import { describe, expect, it, vi } from 'vitest'
import {
  recordReceipt,
  type RecordReceiptDeps,
} from './recordReceipt'
import type { Payment, PendingUpdate, User } from '@/lib/types'

const FIXED_TS = '2026-04-27T22:30:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-X-i1',
    mouId: 'MOU-X',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'STEAM - Instalment 1 of 4',
    dueDateRaw: null,
    dueDateIso: '2026-05-15',
    expectedAmount: 200000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: 'GSL/OPS/26-27/0001',
    taxInvoiceNumber: null,
    status: 'PI Sent',
    notes: null,
    piSentDate: '2026-04-20T10:00:00Z',
    piSentTo: 'spoc@example.test',
    piGeneratedAt: '2026-04-20T10:00:00Z',
    studentCountActual: 200,
    partialPayments: null,
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: {
  payments: Payment[]
  users: User[]
}): { deps: RecordReceiptDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      payments: opts.payments, users: opts.users,
      enqueue: enqueue as unknown as RecordReceiptDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('recordReceipt', () => {
  it('happy path: Finance records exact-match receipt; status flips to Paid; audit captures before/after', async () => {
    const p = payment()
    const { deps, calls } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 200000,
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-ABC123',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.payment.receivedAmount).toBe(200000)
      expect(res.payment.status).toBe('Paid')
      expect(res.payment.bankReference).toBe('UTR-ABC123')
      expect(res.varianceRs).toBe(0)
      expect(res.hasVariance).toBe(false)
      expect(res.payment.auditLog?.[0]?.action).toBe('payment-recorded')
      expect(res.payment.auditLog?.[0]?.notes).toBe('Exact match.')
    }
    expect(calls).toHaveLength(1)
    expect(calls[0]?.entity).toBe('payment')
  })

  it('partial-payment variance: receivedAmount < expected; hasVariance true; audit notes capture the gap', async () => {
    const p = payment({ expectedAmount: 200000 })
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 150000,  // 50k short
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-PARTIAL',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.varianceRs).toBe(-50000)
      expect(res.hasVariance).toBe(true)
      // Indian number format uses lakhs (e.g., '2,00,000' for two lakh).
      // Both the variance and the expected value are formatted via
      // toLocaleString('en-IN'), so the assertions match the Indian
      // grouping rather than the western thousand-separator one.
      expect(res.payment.auditLog?.[0]?.notes).toContain('-50,000')
      expect(res.payment.auditLog?.[0]?.notes).toContain('2,00,000')
    }
  })

  it('overpayment variance: receivedAmount > expected; hasVariance true; positive variance Rs', async () => {
    const p = payment({ expectedAmount: 200000 })
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 250000,
        paymentMode: 'Bank Transfer',
        bankReference: null,
        notes: 'School paid extra; refund coordination pending.',
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.varianceRs).toBe(50000)
      expect(res.hasVariance).toBe(true)
      expect(res.payment.notes).toBe('School paid extra; refund coordination pending.')
    }
  })

  it('idempotent re-record: edit-mode allows correcting a wrong reference; appends a fresh audit entry', async () => {
    const initialEntry = {
      timestamp: '2026-05-10T11:00:00.000Z',
      user: 'shubhangi.g',
      action: 'payment-recorded' as const,
      notes: 'Exact match.',
    }
    const p = payment({
      expectedAmount: 200000,
      receivedAmount: 200000,
      receivedDate: '2026-05-10',
      paymentMode: 'Bank Transfer',
      bankReference: 'UTR-WRONG',
      status: 'Paid',
      auditLog: [initialEntry],
    })
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 200000,
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR-CORRECT',
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.payment.bankReference).toBe('UTR-CORRECT')
      expect(res.payment.auditLog).toHaveLength(2)
      expect(res.payment.auditLog?.[0]).toEqual(initialEntry)
      expect(res.payment.auditLog?.[1]?.action).toBe('payment-recorded')
      const after = res.payment.auditLog?.[1]?.after as { bankReference?: string }
      expect(after.bankReference).toBe('UTR-CORRECT')
    }
  })

  it('OpsHead rejected with permission (payment:reconcile is Finance-only)', async () => {
    const p = payment()
    const { deps, calls } = makeDeps({
      payments: [p],
      users: [user('OpsHead', 'misba.m')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 200000,
        paymentMode: 'Bank Transfer',
        bankReference: 'UTR',
        notes: null,
        recordedBy: 'misba.m',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('permission')
    expect(calls).toHaveLength(0)
  })

  it('Admin can record (wildcard)', async () => {
    const p = payment()
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Admin', 'anish.d')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 200000,
        paymentMode: 'UPI',
        bankReference: null,
        notes: null,
        recordedBy: 'anish.d',
      },
      deps,
    )
    expect(res.ok).toBe(true)
  })

  it('invalid-amount on zero / negative', async () => {
    const p = payment()
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 0,
        paymentMode: 'Bank Transfer',
        bankReference: null,
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-amount')
  })

  it('invalid-date on non-ISO string', async () => {
    const p = payment()
    const { deps } = makeDeps({
      payments: [p],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-X-i1',
        receivedDate: '10/05/2026',
        receivedAmount: 200000,
        paymentMode: 'Bank Transfer',
        bankReference: null,
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('invalid-date')
  })

  it('payment-not-found short-circuits with no queue write', async () => {
    const { deps, calls } = makeDeps({
      payments: [],
      users: [user('Finance', 'shubhangi.g')],
    })
    const res = await recordReceipt(
      {
        paymentId: 'MOU-NOPE-i1',
        receivedDate: '2026-05-10',
        receivedAmount: 1,
        paymentMode: 'UPI',
        bankReference: null,
        notes: null,
        recordedBy: 'shubhangi.g',
      },
      deps,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('payment-not-found')
    expect(calls).toHaveLength(0)
  })
})
