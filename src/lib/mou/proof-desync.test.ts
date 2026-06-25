import { describe, it, expect, vi } from 'vitest'
import { confirmActuals } from '@/lib/mou/confirmActuals'
import type { MOU, Payment, User } from '@/lib/types'

// Simulate Sandipani scenario: count=372 already set on MOU, but
// payments still at old 450-student amounts (the desync Bug 1 created).
const mou: MOU = {
  id: 'MOU-SANDIPANI', schoolId: 'SCH-X', schoolName: 'Sandipani School',
  programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
  schoolGroupId: null, status: 'Active', cohortStatus: 'active',
  academicYear: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31',
  studentsMou: 450, studentsActual: 372,
  studentsVariance: -78, studentsVariancePct: -0.1733,
  spWithoutTax: 1694.92, spWithTax: 2000,
  contractValue: 900000, received: 0, tds: 0, balance: 900000,
  receivedPct: 0, paymentSchedule: '50-50 half-yearly',
  trainerModel: null, salesPersonId: null, templateVersion: null,
  generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null,
  auditLog: [],
} as MOU

// Payments still at OLD 450-student amounts (the desync)
const payment1: Payment = {
  id: 'MOU-SANDIPANI-i1', mouId: 'MOU-SANDIPANI', schoolName: 'Sandipani',
  programme: 'STEAM', instalmentLabel: '1 of 2', instalmentSeq: 1,
  totalInstalments: 2, description: '', dueDateRaw: null, dueDateIso: null,
  expectedAmount: 450000, receivedAmount: 0, receivedDate: null,
  paymentMode: null, bankReference: null, piNumber: null,
  taxInvoiceNumber: null, status: 'Pending', notes: null,
  piSentDate: null, piSentTo: null, piGeneratedAt: null,
  studentCountActual: null, partialPayments: null, auditLog: [],
} as Payment

const payment2 = { ...payment1, id: 'MOU-SANDIPANI-i2', instalmentSeq: 2, instalmentLabel: '2 of 2' } as Payment

const opsAdmin: User = {
  id: 'misba.m', name: 'Misba M.', email: 'misba@test.com',
  role: 'Admin', department: 'ops',
  testingOverride: false, active: true, passwordHash: 'X',
  createdAt: '', auditLog: [],
} as User

describe('Bug 1 desync repair: re-confirm same count triggers recalc', () => {
  it('detects desync and cascades even though count is unchanged (372→372)', async () => {
    const enqueueCalls: Array<Record<string, unknown>> = []
    const result = await confirmActuals(
      { mouId: 'MOU-SANDIPANI', studentsActual: 372, confirmedBy: 'misba.m' },
      {
        mous: [mou],
        users: [opsAdmin],
        payments: [payment1, payment2],
        events: [],
        enqueue: vi.fn(async (params) => { enqueueCalls.push(params); return {} as never }),
        now: () => new Date('2026-05-27T12:00:00Z'),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recalcCascadeApplied).toBe(true)

    // Payment updates should be in the enqueue calls
    const paymentUpdates = enqueueCalls.filter(c => c.entity === 'payment')
    expect(paymentUpdates.length).toBe(2)

    // Each payment should now have expectedAmount = 372000 (372 x 2000 / 2)
    const p1 = paymentUpdates.find(c => (c.payload as Payment).id === 'MOU-SANDIPANI-i1')
    const p2 = paymentUpdates.find(c => (c.payload as Payment).id === 'MOU-SANDIPANI-i2')
    expect((p1!.payload as Payment).expectedAmount).toBe(372000)
    expect((p2!.payload as Payment).expectedAmount).toBe(372000)

    // Total should be exactly 744000
    const totalCommitted = (p1!.payload as Payment).expectedAmount + (p2!.payload as Payment).expectedAmount
    expect(totalCommitted).toBe(744000)
    expect(totalCommitted).toBe(372 * 2000)

    console.log('BEFORE: i1=' + payment1.expectedAmount + ' i2=' + payment2.expectedAmount + ' total=' + (payment1.expectedAmount + payment2.expectedAmount))
    console.log('AFTER:  i1=' + (p1!.payload as Payment).expectedAmount + ' i2=' + (p2!.payload as Payment).expectedAmount + ' total=' + totalCommitted)
    console.log('Rs 19 drift check: 372 x 2000 = ' + (372*2000) + ', per inst = ' + (372*2000/2) + ', actual = ' + (p1!.payload as Payment).expectedAmount + ' -> ZERO DRIFT ✓')
  })

  it('does NOT cascade when payments ARE in sync (no desync)', async () => {
    const syncedP1 = { ...payment1, expectedAmount: 372000 } as Payment
    const syncedP2 = { ...payment2, expectedAmount: 372000 } as Payment
    const enqueueCalls: Array<Record<string, unknown>> = []
    const result = await confirmActuals(
      { mouId: 'MOU-SANDIPANI', studentsActual: 372, confirmedBy: 'misba.m' },
      {
        mous: [mou],
        users: [opsAdmin],
        payments: [syncedP1, syncedP2],
        events: [],
        enqueue: vi.fn(async (params) => { enqueueCalls.push(params); return {} as never }),
        now: () => new Date('2026-05-27T12:00:00Z'),
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recalcCascadeApplied).toBe(false)
    const paymentUpdates = enqueueCalls.filter(c => c.entity === 'payment')
    expect(paymentUpdates.length).toBe(0)
  })
})
