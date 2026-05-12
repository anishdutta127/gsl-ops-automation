import { describe, expect, it } from 'vitest'
import {
  planApprove,
  planReject,
  planRequest,
  readOverride,
} from './dispatchOverride'
import type { MOU } from '@/lib/types'

const NOW = new Date('2026-05-12T12:00:00.000Z')

function baseMou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Sunrise High',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 5000,
    spWithTax: 5900,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '50-50',
    trainerModel: 'GSL-T',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

describe('readOverride', () => {
  it('returns the empty default when dispatchOverride is undefined', () => {
    const mou = baseMou()
    const o = readOverride(mou)
    expect(o.status).toBe('none')
    expect(o.requestedBy).toBeNull()
  })
})

describe('planRequest', () => {
  it('rejects an empty reason', () => {
    const r = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: '   ',
      now: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('empty-reason')
  })

  it('records the request, sets state requested, appends audit', () => {
    const r = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'Pilot launch on Monday; PI takes 3 days.',
      now: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.alreadyRequested).toBe(false)
    expect(r.next.dispatchOverride?.status).toBe('requested')
    expect(r.next.dispatchOverride?.requestedBy).toBe('misba.m')
    expect(r.next.dispatchOverride?.requestReason).toBe(
      'Pilot launch on Monday; PI takes 3 days.',
    )
    expect(r.next.auditLog).toHaveLength(1)
    expect(r.next.auditLog[0]?.action).toBe('dispatch-override-requested')
  })

  it('returns alreadyRequested when state is already requested', () => {
    const first = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'first',
      now: NOW,
    })
    if (!first.ok) throw new Error('expected ok')
    const second = planRequest({
      mou: first.next,
      byUserId: 'pradeep.r',
      reason: 'second',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.alreadyRequested).toBe(true)
    expect(second.next.auditLog).toHaveLength(1)
  })

  it('returns invalid-state when override is already approved', () => {
    const requested = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'a',
      now: NOW,
    })
    if (!requested.ok) throw new Error('expected ok')
    const approved = planApprove({
      mou: requested.next,
      byUserId: 'shashank.s',
      notes: 'ok',
      now: NOW,
    })
    if (!approved.ok) throw new Error('expected ok')
    const second = planRequest({
      mou: approved.next,
      byUserId: 'misba.m',
      reason: 'b',
      now: NOW,
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.reason).toBe('invalid-state')
  })

  it('allows re-request after rejection', () => {
    const requested = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'a',
      now: NOW,
    })
    if (!requested.ok) throw new Error('expected ok')
    const rejected = planReject({
      mou: requested.next,
      byUserId: 'shashank.s',
      reason: 'need PI first',
      now: NOW,
    })
    if (!rejected.ok) throw new Error('expected ok')
    const second = planRequest({
      mou: rejected.next,
      byUserId: 'misba.m',
      reason: 'urgent again',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.next.dispatchOverride?.status).toBe('requested')
  })
})

describe('planApprove', () => {
  it('rejects when override is not requested', () => {
    const r = planApprove({
      mou: baseMou(),
      byUserId: 'shashank.s',
      notes: '',
      now: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('invalid-state')
  })

  it('approves a requested override and appends audit', () => {
    const req = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'pilot',
      now: NOW,
    })
    if (!req.ok) throw new Error('expected ok')
    const r = planApprove({
      mou: req.next,
      byUserId: 'shashank.s',
      notes: 'Approved for pilot batch',
      now: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.next.dispatchOverride?.status).toBe('approved')
    expect(r.next.dispatchOverride?.approvedBy).toBe('shashank.s')
    expect(r.next.dispatchOverride?.approvalNotes).toBe('Approved for pilot batch')
    expect(r.next.auditLog).toHaveLength(2)
    expect(r.next.auditLog[1]?.action).toBe('dispatch-override-approved')
  })

  it('preserves null when approval notes are empty', () => {
    const req = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'pilot',
      now: NOW,
    })
    if (!req.ok) throw new Error('expected ok')
    const r = planApprove({
      mou: req.next,
      byUserId: 'shashank.s',
      notes: '   ',
      now: NOW,
    })
    if (!r.ok) throw new Error('expected ok')
    expect(r.next.dispatchOverride?.approvalNotes).toBeNull()
  })

  it('returns alreadyApproved when re-approving', () => {
    const req = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'pilot',
      now: NOW,
    })
    if (!req.ok) throw new Error('expected ok')
    const first = planApprove({
      mou: req.next,
      byUserId: 'shashank.s',
      notes: '',
      now: NOW,
    })
    if (!first.ok) throw new Error('expected ok')
    const second = planApprove({
      mou: first.next,
      byUserId: 'shashank.s',
      notes: 'second',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.alreadyApproved).toBe(true)
    expect(second.next.auditLog).toHaveLength(2)
  })
})

describe('planReject', () => {
  it('rejects an empty reason', () => {
    const req = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'pilot',
      now: NOW,
    })
    if (!req.ok) throw new Error('expected ok')
    const r = planReject({
      mou: req.next,
      byUserId: 'shashank.s',
      reason: '   ',
      now: NOW,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('empty-reason')
  })

  it('rejects a requested override and appends audit', () => {
    const req = planRequest({
      mou: baseMou(),
      byUserId: 'misba.m',
      reason: 'pilot',
      now: NOW,
    })
    if (!req.ok) throw new Error('expected ok')
    const r = planReject({
      mou: req.next,
      byUserId: 'shashank.s',
      reason: 'Need PI raised first',
      now: NOW,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.next.dispatchOverride?.status).toBe('rejected')
    expect(r.next.dispatchOverride?.rejectionReason).toBe('Need PI raised first')
    expect(r.next.auditLog).toHaveLength(2)
    expect(r.next.auditLog[1]?.action).toBe('dispatch-override-rejected')
  })

  it('returns invalid-state on a non-requested override', () => {
    const r = planReject({
      mou: baseMou(),
      byUserId: 'shashank.s',
      reason: 'no',
      now: NOW,
    })
    expect(r.ok).toBe(false)
  })
})
