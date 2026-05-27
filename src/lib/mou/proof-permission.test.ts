import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { applyCountChange } from '@/lib/mou/applyCountChange'
import type { MOU, Payment, User, StudentCountEvent } from '@/lib/types'

beforeAll(() => { process.env.TESTING_OPEN_ACCESS = 'false' })
afterAll(() => { delete process.env.TESTING_OPEN_ACCESS })

const baseMou: MOU = {
  id: 'MOU-TEST', schoolId: 'SCH-X', schoolName: 'Test',
  programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
  schoolGroupId: null, status: 'Active', cohortStatus: 'active',
  academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
  studentsMou: 500, studentsActual: 500, studentsVariance: 0,
  studentsVariancePct: 0, spWithoutTax: 1695, spWithTax: 2000,
  contractValue: 1000000, received: 0, tds: 0, balance: 1000000,
  receivedPct: 0, paymentSchedule: '50-50 half-yearly',
  trainerModel: null, salesPersonId: null, templateVersion: null,
  generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null,
  auditLog: [],
} as MOU

const basePayment: Payment = {
  id: 'MOU-TEST-i1', mouId: 'MOU-TEST', schoolName: 'Test',
  programme: 'STEAM', instalmentLabel: '1 of 2', instalmentSeq: 1,
  totalInstalments: 2, description: '', dueDateRaw: null, dueDateIso: null,
  expectedAmount: 500000, receivedAmount: 0, receivedDate: null,
  paymentMode: null, bankReference: null, piNumber: null,
  taxInvoiceNumber: null, status: 'Pending', notes: null,
  piSentDate: null, piSentTo: null, piGeneratedAt: null,
  studentCountActual: null, partialPayments: null, auditLog: [],
} as Payment

function user(role: User['role'], dept: string | null, id: string): User {
  return { id, name: id, email: id+'@test', role, department: dept,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [] } as User
}

const deps = {
  mous: [baseMou],
  payments: [basePayment, { ...basePayment, id: 'MOU-TEST-i2', instalmentSeq: 2 }],
  users: [
    user('OpsEmployee', 'ops', 'ops-emp'),
    user('Admin', 'ops', 'ops-admin'),
    user('Admin', null, 'full-admin'),
  ],
  events: [] as StudentCountEvent[],
  now: () => new Date('2026-05-27'),
}

const args = (by: string, skip?: boolean) => ({
  mouId: 'MOU-TEST', newCount: 400, effectiveDate: '2026-05-27',
  reason: 'Permission proof test', recordedBy: by,
  ...(skip ? { skipPermissionCheck: true } : {}),
})

describe('skipPermissionCheck security proof', () => {
  it('OpsEmployee WITHOUT skip -> REJECTED', () => {
    const r = applyCountChange(args('ops-emp'), deps)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('permission')
  })

  it('OpsEmployee WITH skip -> ALLOWED (cascade path)', () => {
    const r = applyCountChange(args('ops-emp', true), deps)
    expect(r.ok).toBe(true)
  })

  it('Ops Admin WITHOUT skip -> REJECTED (the original bug)', () => {
    const r = applyCountChange(args('ops-admin'), deps)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('permission')
  })

  it('Ops Admin WITH skip -> ALLOWED (the fix)', () => {
    const r = applyCountChange(args('ops-admin', true), deps)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payloads.paymentUpdates.length).toBe(2)
      expect(r.payloads.paymentUpdates[0]!.expectedAmount).toBe(400000)
    }
  })

  it('Unknown user WITH skip -> still REJECTED', () => {
    const r = applyCountChange(args('nobody', true), deps)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown-user')
  })

  it('Full admin WITHOUT skip -> ALLOWED (always was)', () => {
    const r = applyCountChange(args('full-admin'), deps)
    expect(r.ok).toBe(true)
  })
})
