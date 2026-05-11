/*
 * Unit tests for renewalsData lib (Gate 4.95 Session 4).
 */

import { describe, it, expect } from 'vitest'
import type { AuditEntry, MOU } from '@/lib/types'
import {
  bucketRenewals,
  computeRenewalStatus,
  countActionable,
} from './renewalsData'

function mou(over: Partial<MOU> & Pick<MOU, 'id' | 'endDate'>): MOU {
  return {
    schoolId: 'SCH-T',
    schoolName: 'Test School',
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2025-26',
    startDate: '2025-04-01',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: null,
    auditLog: [],
    ...over,
  } as MOU
}

function entry(over: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: '2026-05-01T00:00:00.000Z',
    user: 'u',
    action: 'update',
    ...over,
  } as AuditEntry
}

// 2026-05-12 baseline matches the harness-injected "current date"
const NOW = new Date('2026-05-12T00:00:00.000Z')

describe('computeRenewalStatus', () => {
  it('returns Renewed when MOU.status is Renewed', () => {
    const m = mou({ id: 'M', endDate: '2026-06-01', status: 'Renewed' })
    expect(computeRenewalStatus(m)).toBe('Renewed')
  })

  it('returns Declined when the latest decline post-dates any status_change', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      auditLog: [
        entry({ action: 'status_change', timestamp: '2026-04-01T00:00:00Z' }),
        entry({
          action: 'mou-renewal-declined',
          timestamp: '2026-05-01T00:00:00Z',
          notes: 'School moving providers.',
        }),
      ],
    })
    expect(computeRenewalStatus(m)).toBe('Declined')
  })

  it('returns Discussion when audit notes mention renewal but no decline or Renewed status', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      auditLog: [
        entry({
          action: 'update',
          notes: 'Discussed renewal with SPOC; awaiting principal.',
        }),
      ],
    })
    expect(computeRenewalStatus(m)).toBe('Discussion')
  })

  it('returns Discussion when notes match RENEWAL case-insensitively', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      auditLog: [entry({ action: 'update', notes: 'RENEWAL plan agreed.' })],
    })
    expect(computeRenewalStatus(m)).toBe('Discussion')
  })

  it('returns Not yet when audit log is empty', () => {
    const m = mou({ id: 'M', endDate: '2026-06-01' })
    expect(computeRenewalStatus(m)).toBe('Not yet')
  })

  it('Renewed status overrides a prior decline entry', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      status: 'Renewed',
      auditLog: [
        entry({
          action: 'mou-renewal-declined',
          timestamp: '2026-04-01T00:00:00Z',
        }),
      ],
    })
    expect(computeRenewalStatus(m)).toBe('Renewed')
  })
})

describe('bucketRenewals', () => {
  it('drops MOUs with no endDate', () => {
    const m = mou({ id: 'M', endDate: null })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.expired).toHaveLength(0)
    expect(buckets.week).toHaveLength(0)
    expect(buckets.month).toHaveLength(0)
    expect(buckets.ninety).toHaveLength(0)
    expect(buckets.beyond).toHaveLength(0)
  })

  it('places an already-expired MOU in the expired bucket', () => {
    const m = mou({ id: 'M-EXP', endDate: '2026-05-01' })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.expired).toHaveLength(1)
    expect(buckets.expired[0]?.isExpired).toBe(true)
    expect(buckets.expired[0]?.bucket).toBe('expired')
  })

  it('today + 7 days exactly is in week bucket', () => {
    const m = mou({ id: 'M-WK', endDate: '2026-05-19' })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.week).toHaveLength(1)
    expect(buckets.month).toHaveLength(0)
  })

  it('+8 days crosses into month bucket', () => {
    const m = mou({ id: 'M-MO', endDate: '2026-05-20' })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.week).toHaveLength(0)
    expect(buckets.month).toHaveLength(1)
  })

  it('+30 days exactly is in month bucket', () => {
    const m = mou({ id: 'M-30', endDate: '2026-06-11' })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.month).toHaveLength(1)
    expect(buckets.ninety).toHaveLength(0)
  })

  it('+31 days crosses into ninety bucket', () => {
    const m = mou({ id: 'M-31', endDate: '2026-06-12' })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.month).toHaveLength(0)
    expect(buckets.ninety).toHaveLength(1)
  })

  it('+90 days is in ninety bucket; +91 is beyond', () => {
    const m90 = mou({ id: 'M-90', endDate: '2026-08-10' })
    const m91 = mou({ id: 'M-91', endDate: '2026-08-11' })
    const buckets = bucketRenewals({ mous: [m90, m91], now: NOW })
    expect(buckets.ninety.some((r) => r.mouId === 'M-90')).toBe(true)
    expect(buckets.beyond.some((r) => r.mouId === 'M-91')).toBe(true)
  })

  it('sorts expired bucket by most-expired first (smallest days)', () => {
    const m1 = mou({ id: 'M-A', endDate: '2026-05-10' }) // -2 days
    const m2 = mou({ id: 'M-B', endDate: '2026-04-01' }) // -41 days
    const m3 = mou({ id: 'M-C', endDate: '2026-05-01' }) // -11 days
    const buckets = bucketRenewals({ mous: [m1, m2, m3], now: NOW })
    expect(buckets.expired.map((r) => r.mouId)).toEqual([
      'M-B', // most expired
      'M-C',
      'M-A',
    ])
  })

  it('sorts future buckets by soonest first', () => {
    const m1 = mou({ id: 'M-A', endDate: '2026-05-18' }) // +6
    const m2 = mou({ id: 'M-B', endDate: '2026-05-13' }) // +1
    const m3 = mou({ id: 'M-C', endDate: '2026-05-15' }) // +3
    const buckets = bucketRenewals({ mous: [m1, m2, m3], now: NOW })
    expect(buckets.week.map((r) => r.mouId)).toEqual(['M-B', 'M-C', 'M-A'])
  })

  it('carries renewalStatus onto every row', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      auditLog: [
        entry({
          action: 'mou-renewal-declined',
          timestamp: '2026-05-01T00:00:00Z',
        }),
      ],
    })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.month[0]?.renewalStatus).toBe('Declined')
  })

  it('carries contractValue + salesPersonId + schoolId onto every row', () => {
    const m = mou({
      id: 'M',
      endDate: '2026-06-01',
      contractValue: 250000,
      salesPersonId: 'sp-vikram',
      schoolId: 'SCH-X',
    })
    const buckets = bucketRenewals({ mous: [m], now: NOW })
    expect(buckets.month[0]?.contractValue).toBe(250000)
    expect(buckets.month[0]?.salesPersonId).toBe('sp-vikram')
    expect(buckets.month[0]?.schoolId).toBe('SCH-X')
  })
})

describe('countActionable', () => {
  it('sums expired + week + month + ninety, ignoring beyond', () => {
    const buckets = bucketRenewals({
      mous: [
        mou({ id: 'M-EXP', endDate: '2026-05-01' }), // expired
        mou({ id: 'M-WK', endDate: '2026-05-15' }), // week
        mou({ id: 'M-MO', endDate: '2026-06-05' }), // month
        mou({ id: 'M-90', endDate: '2026-07-15' }), // ninety
        mou({ id: 'M-BE', endDate: '2027-01-01' }), // beyond
      ],
      now: NOW,
    })
    expect(countActionable(buckets)).toBe(4)
  })

  it('returns 0 when nothing is actionable', () => {
    const buckets = bucketRenewals({
      mous: [mou({ id: 'M-BE', endDate: '2027-01-01' })],
      now: NOW,
    })
    expect(countActionable(buckets)).toBe(0)
  })
})
