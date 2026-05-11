import { describe, it, expect } from 'vitest'
import type { KitDispatch, MOU } from '@/lib/types'
import {
  computeDispatchPerformance,
  csvForDispatchPerformance,
} from './dispatchPerformance'
import type { ReportFilters } from './filters'

function mou(over: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'S',
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
    spWithoutTax: 1000,
    spWithTax: 1180,
    contractValue: 100000,
    received: 0,
    tds: 0,
    balance: 100000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
    trainerModel: 'GSL-T',
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    delayNotes: null,
    daysToExpiry: 365,
    auditLog: [],
    ...over,
  }
}

function dispatch(over: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'D-1',
    mouId: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'S',
    productSelected: 'Cretile',
    dispatchStatus: 'Pending',
    allocations: [],
    salesApprovalStatus: 'Pending',
    salesApprovedBy: null,
    salesApprovedAt: null,
    salesRejectionReason: null,
    dispatchSummary: null,
    shipmentTracking: null,
    pod: null,
    auditLog: [
      {
        timestamp: '2026-04-15T00:00:00Z',
        user: 'system',
        action: 'create',
      },
    ],
    createdAt: '2026-04-15T00:00:00Z',
    ...over,
  }
}

const filters: ReportFilters = {
  fy: '2026-27',
  dept: 'All',
  from: null,
  to: null,
}

const now = new Date('2026-05-12T00:00:00Z')

describe('computeDispatchPerformance', () => {
  it('handles empty data', () => {
    const r = computeDispatchPerformance({
      dispatches: [],
      mous: [],
      filters,
      now,
    })
    expect(r.headline.dispatchCount).toBe(0)
    expect(r.programmes).toHaveLength(4)
    expect(r.stalled).toEqual([])
  })

  it('computes avg days from MOU sign to dispatch', () => {
    const mous = [mou({ startDate: '2026-04-01' })]
    const dispatches = [
      dispatch({ id: 'D1', createdAt: '2026-04-11T00:00:00Z' }),
      dispatch({ id: 'D2', createdAt: '2026-04-21T00:00:00Z' }),
    ]
    const r = computeDispatchPerformance({
      dispatches,
      mous,
      filters,
      now,
    })
    expect(r.headline.avgDaysSignToDispatch).toBeCloseTo(15, 0)
  })

  it('null sign-to-dispatch when MOU has no startDate', () => {
    const r = computeDispatchPerformance({
      dispatches: [dispatch()],
      mous: [mou({ startDate: null })],
      filters,
      now,
    })
    expect(r.headline.avgDaysSignToDispatch).toBeNull()
  })

  it('counts delivered separately', () => {
    const r = computeDispatchPerformance({
      dispatches: [
        dispatch({ id: 'D1' }),
        dispatch({ id: 'D2', dispatchStatus: 'Delivered' }),
      ],
      mous: [mou()],
      filters,
      now,
    })
    expect(r.headline.deliveredCount).toBe(1)
    expect(r.headline.dispatchCount).toBe(2)
  })

  it('computes dispatch-to-delivered using audit entry with after.dispatchStatus=Delivered', () => {
    const dispatches = [
      dispatch({
        id: 'D1',
        createdAt: '2026-04-01T00:00:00Z',
        dispatchStatus: 'Delivered',
        auditLog: [
          { timestamp: '2026-04-01T00:00:00Z', user: 'system', action: 'create' },
          {
            timestamp: '2026-04-11T00:00:00Z',
            user: 'ops',
            action: 'update',
            after: { dispatchStatus: 'Delivered' },
          },
        ],
      }),
    ]
    const r = computeDispatchPerformance({
      dispatches,
      mous: [mou()],
      filters,
      now,
    })
    expect(r.headline.avgDaysDispatchToDelivered).toBeCloseTo(10, 0)
  })

  it('flags stalled dispatches > 14 days at same status', () => {
    const old = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString()
    const fresh = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const dispatches = [
      dispatch({
        id: 'D1',
        createdAt: old,
        auditLog: [
          { timestamp: old, user: 'system', action: 'create' },
        ],
      }),
      dispatch({
        id: 'D2',
        createdAt: fresh,
        auditLog: [
          { timestamp: fresh, user: 'system', action: 'create' },
        ],
      }),
    ]
    const r = computeDispatchPerformance({
      dispatches,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.stalled).toHaveLength(1)
    expect(r.stalled[0]?.dispatchId).toBe('D1')
  })

  it('scopes by explicit window via createdAt', () => {
    const dispatches = [
      dispatch({ id: 'D1', createdAt: '2026-04-15T00:00:00Z' }),
      dispatch({ id: 'D2', createdAt: '2024-01-01T00:00:00Z' }),
    ]
    const r = computeDispatchPerformance({
      dispatches,
      mous: [mou()],
      filters: {
        fy: null,
        dept: 'All',
        from: '2026-04-01',
        to: '2026-12-31',
      },
      now,
    })
    expect(r.headline.dispatchCount).toBe(1)
  })

  it('programme rows always cover the 4 canonical programmes', () => {
    const r = computeDispatchPerformance({
      dispatches: [dispatch()],
      mous: [mou()],
      filters,
      now,
    })
    expect(r.programmes.map((p) => p.programme).sort()).toEqual(
      ['Harvard HBPE', 'Robotics', 'STEAM', 'Young Pioneers'].sort(),
    )
  })

  it('stalled list is sorted by daysAtStatus desc', () => {
    const t1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const t2 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString()
    const dispatches = [
      dispatch({
        id: 'D1',
        auditLog: [{ timestamp: t2, user: 'u', action: 'update' }],
      }),
      dispatch({
        id: 'D2',
        auditLog: [{ timestamp: t1, user: 'u', action: 'update' }],
      }),
    ]
    const r = computeDispatchPerformance({
      dispatches,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.stalled[0]?.dispatchId).toBe('D2')
  })

  it('Delivered dispatches never appear in stalled list', () => {
    const old = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const r = computeDispatchPerformance({
      dispatches: [
        dispatch({
          id: 'D1',
          dispatchStatus: 'Delivered',
          auditLog: [{ timestamp: old, user: 'u', action: 'create' }],
        }),
      ],
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(r.stalled).toEqual([])
  })
})

describe('csvForDispatchPerformance', () => {
  it('header has the canonical columns', () => {
    const csv = csvForDispatchPerformance({
      dispatches: [],
      mous: [],
      filters,
      now,
    })
    const header = csv.split('\n')[0]
    expect(header).toContain('Section')
    expect(header).toContain('Avg days sign-to-dispatch')
  })

  it('escapes school names that contain commas', () => {
    const old = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString()
    const dispatches = [
      dispatch({
        id: 'D1',
        schoolName: 'School, Inc.',
        auditLog: [{ timestamp: old, user: 'u', action: 'update' }],
      }),
    ]
    const csv = csvForDispatchPerformance({
      dispatches,
      mous: [mou()],
      filters: { ...filters, fy: null },
      now,
    })
    expect(csv).toContain('"School, Inc. (MOU-1)"')
  })
})
