import { describe, expect, it } from 'vitest'
import {
  p2OverridesTile,
  salesDriftQueueTile,
  legacyWorkloadTile,
  piBlocksTile,
  emailBounceRateTile,
  assignmentQueueTile,
  buildTriggerTiles,
} from './triggers'
import type { Communication, Dispatch, Escalation, MOU, School } from '@/lib/types'

const NOW = new Date('2026-04-26T12:00:00Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', academicYear: '2026-27', startDate: null, endDate: null,
    studentsMou: 100, studentsActual: 100, studentsVariance: 0, studentsVariancePct: 0,
    spWithoutTax: 4000, spWithTax: 5000, contractValue: 500000, received: 0, tds: 0,
    balance: 500000, receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram', templateVersion: null, generatedAt: null, notes: null,
    daysToExpiry: null, auditLog: [], ...overrides,
  }
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-X', name: 'X', legalEntity: null, city: 'Pune', state: 'Maharashtra',
    region: 'South-West', pinCode: null, contactPerson: null, email: null,
    phone: null, billingName: null, pan: null, gstNumber: '27ABCDE1234F1Z5',
    notes: null, active: true, createdAt: '', auditLog: [], ...overrides,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'D', mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
    stage: 'pending', installment1Paid: false, overrideEvent: null,
    poRaisedAt: null, dispatchedAt: null, deliveredAt: null,
    acknowledgedAt: null, acknowledgementUrl: null, notes: null,
    auditLog: [], ...overrides,
  }
}

function comm(overrides: Partial<Communication> = {}): Communication {
  return {
    id: 'C', type: 'welcome-note', schoolId: 'SCH-X', mouId: 'MOU-X',
    installmentSeq: null, channel: 'email', subject: null, bodyEmail: null,
    bodyWhatsApp: null, toEmail: null, toPhone: null, ccEmails: [],
    queuedAt: '2026-04-25T10:00:00Z', queuedBy: 'system', sentAt: '2026-04-25T10:01:00Z',
    copiedAt: null, status: 'sent', bounceDetail: null, auditLog: [],
    ...overrides,
  }
}

const empty = {
  mous: [], schools: [], dispatches: [], escalations: [], communications: [], now: NOW,
}

describe('p2OverridesTile', () => {
  it('counts overrides in last 7d only', () => {
    const result = p2OverridesTile({
      ...empty,
      dispatches: [
        dispatch({ overrideEvent: { overriddenBy: 'a', overriddenAt: '2026-04-22T00:00:00Z', reason: 'r', acknowledgedBy: null, acknowledgedAt: null } }),
        dispatch({ id: 'D2', overrideEvent: { overriddenBy: 'a', overriddenAt: '2026-03-01T00:00:00Z', reason: 'old', acknowledgedBy: null, acknowledgedAt: null } }),
      ],
    })
    expect(result.primary).toBe('1')
    expect(result.status).toBe('ok')
  })

  it('alert when >3 in 7d', () => {
    const dispatches = Array.from({ length: 4 }, (_, i) =>
      dispatch({ id: `D${i}`, overrideEvent: { overriddenBy: 'a', overriddenAt: '2026-04-22T00:00:00Z', reason: 'r', acknowledgedBy: null, acknowledgedAt: null } }),
    )
    expect(p2OverridesTile({ ...empty, dispatches }).status).toBe('alert')
  })
})

describe('salesDriftQueueTile', () => {
  it('counts MOUs with |variance| > 10%', () => {
    const mous = [
      mou({ studentsVariancePct: 0.05 }),
      mou({ id: 'M2', studentsVariancePct: 0.15 }),
      mou({ id: 'M3', studentsVariancePct: -0.20 }),
    ]
    expect(salesDriftQueueTile({ ...empty, mous }).primary).toBe('2')
  })
})

describe('legacyWorkloadTile', () => {
  it('returns informational EXCLUDED state', () => {
    const result = legacyWorkloadTile(empty)
    expect(result.primary).toBe('EXCLUDED')
    expect(result.status).toBe('neutral')
  })
})

describe('piBlocksTile', () => {
  it('alert when >30% of active MOUs have null GSTIN school', () => {
    const mous = [
      mou({ schoolId: 'SCH-OK' }),
      mou({ id: 'M2', schoolId: 'SCH-NULL' }),
    ]
    const schools = [
      school({ id: 'SCH-OK' }),
      school({ id: 'SCH-NULL', gstNumber: null }),
    ]
    expect(piBlocksTile({ ...empty, mous, schools }).status).toBe('alert')
  })

  it('ok when GSTIN populated', () => {
    const mous = [mou()]
    const schools = [school()]
    expect(piBlocksTile({ ...empty, mous, schools }).status).toBe('ok')
  })
})

describe('emailBounceRateTile', () => {
  it('alert when bounce rate > 5%', () => {
    const recent = Array.from({ length: 19 }, (_, i) => comm({ id: `C${i}` }))
    const bounced = comm({ id: 'CB', status: 'bounced' })
    expect(emailBounceRateTile({ ...empty, communications: [...recent, bounced] }).status).toBe('ok')

    const half = Array.from({ length: 5 }, (_, i) => comm({ id: `H${i}` }))
    const halfBounced = Array.from({ length: 5 }, (_, i) => comm({ id: `HB${i}`, status: 'bounced' }))
    expect(emailBounceRateTile({ ...empty, communications: [...half, ...halfBounced] }).status).toBe('alert')
  })
})

describe('assignmentQueueTile', () => {
  it('counts active MOUs without salesPersonId', () => {
    const mous = [
      mou({ salesPersonId: 'sp-x' }),
      mou({ id: 'M2', salesPersonId: null }),
      mou({ id: 'M3', salesPersonId: null }),
    ]
    expect(assignmentQueueTile({ ...empty, mous }).primary).toBe('2')
  })
})

describe('buildTriggerTiles', () => {
  it('returns 10 tiles', () => {
    expect(buildTriggerTiles(empty)).toHaveLength(10)
  })
})
