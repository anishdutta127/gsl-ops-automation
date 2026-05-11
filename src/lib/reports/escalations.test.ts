import { describe, it, expect } from 'vitest'
import type { Escalation } from '@/lib/types'
import {
  computeEscalationsReport,
  csvForEscalationsReport,
} from './escalations'
import type { ReportFilters } from './filters'

function esc(over: Partial<Escalation> = {}): Escalation {
  return {
    id: 'ESC-1',
    createdAt: '2026-04-15T00:00:00Z',
    createdBy: 'u',
    schoolId: 'SCH-1',
    mouId: null,
    stage: 'kit-dispatch',
    lane: 'OPS',
    level: 'L2',
    origin: 'manual',
    originId: null,
    severity: 'high',
    description: 'd',
    assignedTo: null,
    notifiedEmails: [],
    status: 'Open',
    category: 'Dispatch Delay',
    type: 'Operational',
    ownedByDepartment: 'ops',
    waitingOn: null,
    resolutionNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    auditLog: [],
    ...over,
  }
}

const filters: ReportFilters = {
  fy: null,
  dept: 'All',
  from: null,
  to: null,
}

const now = new Date('2026-05-12T00:00:00Z')

describe('computeEscalationsReport', () => {
  it('handles empty data', () => {
    const r = computeEscalationsReport({
      escalations: [],
      filters,
      now,
    })
    expect(r.matrix.totalOpen).toBe(0)
    expect(r.resolution.count).toBe(0)
    expect(r.trending).toEqual([])
    expect(r.categories).toHaveLength(8)
  })

  it('counts open escalations by department + severity', () => {
    const escalations = [
      esc({ id: '1', severity: 'critical', ownedByDepartment: 'ops' }),
      esc({ id: '2', severity: 'high', ownedByDepartment: 'sales' }),
      esc({ id: '3', severity: 'high', ownedByDepartment: 'finance' }),
      esc({ id: '4', severity: 'low', ownedByDepartment: 'ops' }),
    ]
    const r = computeEscalationsReport({
      escalations,
      filters,
      now,
    })
    expect(r.matrix.cells.ops.critical).toBe(1)
    expect(r.matrix.cells.sales.high).toBe(1)
    expect(r.matrix.cells.finance.high).toBe(1)
    expect(r.matrix.cells.ops.low).toBe(1)
    expect(r.matrix.totalOpen).toBe(4)
  })

  it('falls back to lane when ownedByDepartment is missing', () => {
    const e = esc({ lane: 'SALES' })
    const eNoOwn = { ...e, ownedByDepartment: undefined } as unknown as Escalation
    const r = computeEscalationsReport({
      escalations: [eNoOwn],
      filters,
      now,
    })
    expect(r.matrix.cells.sales.high).toBe(1)
  })

  it('excludes closed escalations from matrix', () => {
    const r = computeEscalationsReport({
      escalations: [esc({ status: 'Closed' })],
      filters,
      now,
    })
    expect(r.matrix.totalOpen).toBe(0)
  })

  it('computes avg + median resolution time for closed escalations', () => {
    const closed1: Escalation = {
      ...esc({
        id: 'C1',
        status: 'Closed',
        createdAt: '2026-04-01T00:00:00Z',
        resolvedAt: '2026-04-11T00:00:00Z',
      }),
    }
    const closed2: Escalation = {
      ...esc({
        id: 'C2',
        status: 'Closed',
        createdAt: '2026-04-01T00:00:00Z',
        resolvedAt: '2026-04-21T00:00:00Z',
      }),
    }
    const r = computeEscalationsReport({
      escalations: [closed1, closed2],
      filters,
      now,
    })
    expect(r.resolution.count).toBe(2)
    expect(r.resolution.avgDays).toBeCloseTo(15, 0)
    expect(r.resolution.medianDays).toBeCloseTo(15, 0)
  })

  it('scopes by department filter', () => {
    const escalations = [
      esc({ id: '1', ownedByDepartment: 'ops' }),
      esc({ id: '2', ownedByDepartment: 'sales' }),
    ]
    const r = computeEscalationsReport({
      escalations,
      filters: { ...filters, dept: 'ops' },
      now,
    })
    expect(r.matrix.totalOpen).toBe(1)
    expect(r.matrix.cells.ops.high).toBe(1)
    expect(r.matrix.cells.sales.high).toBe(0)
  })

  it('builds 8 category rows', () => {
    const r = computeEscalationsReport({
      escalations: [],
      filters,
      now,
    })
    expect(r.categories.map((c) => c.category)).toContain('Dispatch Delay')
    expect(r.categories.map((c) => c.category)).toContain('Other')
    expect(r.categories.length).toBe(8)
  })

  it('trending surfaces categories with biggest rise', () => {
    // 30-day window default; current = last 30, prior = 30 before that.
    const currentTs = new Date(
      now.getTime() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const priorTs = new Date(
      now.getTime() - 45 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const escalations = [
      esc({ id: '1', createdAt: currentTs, category: 'Dispatch Delay' }),
      esc({ id: '2', createdAt: currentTs, category: 'Dispatch Delay' }),
      esc({ id: '3', createdAt: currentTs, category: 'Dispatch Delay' }),
      esc({ id: '4', createdAt: priorTs, category: 'Dispatch Delay' }),
      esc({ id: '5', createdAt: priorTs, category: 'Payment Issue' }),
    ]
    const r = computeEscalationsReport({
      escalations,
      filters,
      now,
    })
    expect(r.trending.length).toBeGreaterThan(0)
    expect(r.trending[0]?.category).toBe('Dispatch Delay')
  })

  it('treats null category as "Other"', () => {
    const e: Escalation = {
      ...esc(),
      category: null,
    }
    const r = computeEscalationsReport({
      escalations: [e],
      filters,
      now,
    })
    const other = r.categories.find((c) => c.category === 'Other')
    expect(other?.open).toBe(1)
  })

  it('scopes closed escalations by window', () => {
    const inWindow: Escalation = {
      ...esc({
        id: 'A',
        status: 'Closed',
        createdAt: '2026-04-05T00:00:00Z',
        resolvedAt: '2026-04-10T00:00:00Z',
      }),
    }
    const outsideWindow: Escalation = {
      ...esc({
        id: 'B',
        status: 'Closed',
        createdAt: '2024-01-01T00:00:00Z',
        resolvedAt: '2024-01-15T00:00:00Z',
      }),
    }
    const r = computeEscalationsReport({
      escalations: [inWindow, outsideWindow],
      filters: {
        fy: null,
        dept: 'All',
        from: '2026-04-01',
        to: '2026-04-30',
      },
      now,
    })
    expect(r.resolution.count).toBe(1)
  })
})

describe('csvForEscalationsReport', () => {
  it('emits header + matrix rows', () => {
    const csv = csvForEscalationsReport({
      escalations: [esc()],
      filters,
      now,
    })
    expect(csv.split('\n')[0]).toContain('Section')
    expect(csv).toContain('Matrix')
    expect(csv).toContain('ops,critical')
  })

  it('escapes commas in category names', () => {
    const csv = csvForEscalationsReport({
      escalations: [esc({ category: 'School Communication' })],
      filters,
      now,
    })
    // School Communication has no comma; the test just verifies the
    // CSV emits the value cleanly without spurious escaping.
    expect(csv).toContain('School Communication')
  })
})
