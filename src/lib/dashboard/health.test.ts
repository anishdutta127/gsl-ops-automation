import { describe, expect, it } from 'vitest'
import {
  activeMousTile,
  accuracyHealthTile,
  collectionPctTile,
  dispatchesInFlightTile,
  schoolsNeedingActionTile,
  buildHealthTiles,
} from './health'
import type { Dispatch, MOU, User } from '@/lib/types'

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-X',
    schoolId: 'SCH-X',
    schoolName: 'X',
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
    studentsActual: 100,
    studentsVariance: 0,
    studentsVariancePct: 0,
    spWithoutTax: 4000,
    spWithTax: 5000,
    contractValue: 500000,
    received: 250000,
    tds: 0,
    balance: 250000,
    receivedPct: 50,
    paymentSchedule: '',
    trainerModel: 'GSL-T',
    salesPersonId: 'sp-vikram',
    templateVersion: null,
    generatedAt: null,
    notes: null,
    daysToExpiry: null, delayNotes: null,
    auditLog: [],
    ...overrides,
  }
}

function dispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  return {
    id: 'DIS-X',
    mouId: 'MOU-X',
    schoolId: 'SCH-X',
    installmentSeq: 1,
    stage: 'pending',
    installment1Paid: false,
    overrideEvent: null,
    poRaisedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes: null,
    auditLog: [],
    ...overrides,
  }
}

const empty = { mous: [], schools: [], dispatches: [], payments: [], user: null }

describe('activeMousTile', () => {
  it('counts MOUs with status=Active', () => {
    const result = activeMousTile({ ...empty, mous: [mou(), mou({ id: 'M2', status: 'Completed' })] })
    expect(result.primary).toBe('1')
  })

  it('SalesRep scoping returns only own-assigned MOUs', () => {
    const sales: User = {
      id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep',
      testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [],
    }
    const result = activeMousTile({
      ...empty,
      mous: [mou(), mou({ id: 'M2', salesPersonId: 'sp-other' })],
      user: sales,
    })
    expect(result.primary).toBe('1')
  })
})

describe('accuracyHealthTile', () => {
  it('ok when ≥95% within band', () => {
    const result = accuracyHealthTile({
      ...empty,
      mous: Array.from({ length: 20 }, (_, i) => mou({ id: `M${i}`, studentsActual: 100, studentsVariancePct: 0.05 })),
    })
    expect(result.status).toBe('ok')
    expect(result.primary).toBe('100%')
  })

  it('attention when 85-94% within band', () => {
    const within = Array.from({ length: 9 }, (_, i) => mou({ id: `W${i}`, studentsVariancePct: 0.05 }))
    const out = mou({ id: 'OUT', studentsVariancePct: 0.20 })
    const result = accuracyHealthTile({ ...empty, mous: [...within, out] })
    expect(result.status).toBe('attention')
  })

  it('alert when <85%', () => {
    const within = Array.from({ length: 1 }, (_, i) => mou({ id: `W${i}`, studentsVariancePct: 0.05 }))
    const out = Array.from({ length: 9 }, (_, i) => mou({ id: `O${i}`, studentsVariancePct: 0.30 }))
    const result = accuracyHealthTile({ ...empty, mous: [...within, ...out] })
    expect(result.status).toBe('alert')
  })

  it('neutral on empty', () => {
    expect(accuracyHealthTile(empty).status).toBe('neutral')
  })
})

describe('collectionPctTile', () => {
  it('ok at ≥75%', () => {
    const result = collectionPctTile({
      ...empty,
      mous: [mou({ received: 800000, contractValue: 1000000 })],
    })
    expect(result.status).toBe('ok')
    expect(result.primary).toBe('80%')
  })

  it('attention 50-74%', () => {
    expect(
      collectionPctTile({ ...empty, mous: [mou({ received: 600000, contractValue: 1000000 })] }).status,
    ).toBe('attention')
  })

  it('alert <50%', () => {
    expect(
      collectionPctTile({ ...empty, mous: [mou({ received: 100000, contractValue: 1000000 })] }).status,
    ).toBe('alert')
  })
})

describe('dispatchesInFlightTile', () => {
  it('counts po-raised + dispatched + in-transit', () => {
    const result = dispatchesInFlightTile({
      ...empty,
      mous: [mou()],
      dispatches: [
        dispatch({ stage: 'po-raised' }),
        dispatch({ id: 'D2', stage: 'dispatched' }),
        dispatch({ id: 'D3', stage: 'in-transit' }),
        dispatch({ id: 'D4', stage: 'delivered' }),
        dispatch({ id: 'D5', stage: 'pending' }),
      ],
    })
    expect(result.primary).toBe('3')
  })
})

describe('schoolsNeedingActionTile', () => {
  it('returns ok=0 with no flagged schools', () => {
    const result = schoolsNeedingActionTile({ ...empty, mous: [mou()] })
    expect(result.status).toBe('ok')
    expect(result.primary).toBe('0')
  })

  it('attention 1-5; alert >5', () => {
    const flagged = Array.from({ length: 6 }, (_, i) =>
      mou({ id: `M${i}`, schoolId: `S${i}`, studentsActual: null, startDate: '2026-01-01' }),
    )
    expect(schoolsNeedingActionTile({ ...empty, mous: flagged }).status).toBe('alert')
  })
})

describe('buildHealthTiles', () => {
  it('returns 5 tiles in order', () => {
    const result = buildHealthTiles({ ...empty, mous: [mou()] })
    expect(result).toHaveLength(5)
    expect(result.map((t) => t.label)).toEqual([
      'Active MOUs',
      'Accuracy health',
      'Collection',
      'Dispatches in flight',
      'Schools needing action',
    ])
  })
})
