/*
 * Gate 3.5 Step 2: Leadership dashboard rebuild tests.
 *
 * Asserts: three sections render with the right data-testids, KPIs
 * compute from snapshot data, attention items respect priority order
 * + empty state, drill-down links resolve to existing routes.
 *
 * Uses renderToStaticMarkup (project pattern) rather than testing-
 * library/react. The LeadershipDashboard imports getCurrentUser
 * which we mock so the page renders without a real session.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'leadership-test',
    name: 'Test Leader',
    email: 'leader@example.test',
    role: 'Leadership',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  })),
}))

import {
  computeAttentionItems,
  computeFinancialHealth,
  fiscalYearOfIso,
  priorFy,
} from '@/lib/dashboard/leadershipData'
import type { Escalation, MOU, Payment, School } from '@/lib/types'

describe('leadershipData: fiscal-year helpers', () => {
  it('Apr-Mar fiscal boundary', () => {
    expect(fiscalYearOfIso('2026-04-01')).toBe('2026-27')
    expect(fiscalYearOfIso('2026-03-31')).toBe('2025-26')
    expect(fiscalYearOfIso('2027-03-31')).toBe('2026-27')
    expect(fiscalYearOfIso('2027-04-01')).toBe('2027-28')
  })

  it('priorFy returns the previous FY label', () => {
    expect(priorFy('2026-27')).toBe('2025-26')
    expect(priorFy('2025-26')).toBe('2024-25')
  })
})

describe('computeFinancialHealth (Section 1)', () => {
  function makeMou(over: Partial<MOU>): MOU {
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
    }
  }

  it('aggregates signed contract value for the chosen FY only', () => {
    const mous = [
      makeMou({ id: 'MOU-1', academicYear: '2026-27', contractValue: 500000 }),
      makeMou({ id: 'MOU-2', academicYear: '2026-27', contractValue: 300000 }),
      makeMou({ id: 'MOU-3', academicYear: '2025-26', contractValue: 200000 }),
    ]
    const out = computeFinancialHealth({
      mous,
      payments: [],
      fy: '2026-27',
      now: new Date('2026-05-01'),
    })
    expect(out.signedContractValueFy).toBe(800000)
    expect(out.signedContractValuePriorFy).toBe(200000)
    expect(out.signedContractValueDeltaPct).toBeCloseTo(300, 0)
  })

  it('collectionPct = receivedFy / signedContractValueFy', () => {
    const mous = [
      makeMou({ id: 'MOU-1', academicYear: '2026-27', contractValue: 100000 }),
    ]
    const payments: Payment[] = [
      {
        id: 'P-1',
        mouId: 'MOU-1',
        schoolName: 'X',
        programme: 'STEAM',
        instalmentLabel: '1',
        instalmentSeq: 1,
        totalInstalments: 1,
        description: '',
        dueDateRaw: null,
        dueDateIso: null,
        expectedAmount: 100000,
        receivedAmount: 25000,
        receivedDate: '2026-04-15',
        paymentMode: null,
        bankReference: null,
        piNumber: null,
        taxInvoiceNumber: null,
        status: 'Partial',
        notes: null,
        piSentDate: null,
        piSentTo: null,
        piGeneratedAt: null,
        studentCountActual: null,
        partialPayments: null,
        auditLog: null,
      },
    ]
    const out = computeFinancialHealth({
      mous,
      payments,
      fy: '2026-27',
      now: new Date('2026-05-01'),
    })
    expect(out.receivedFy).toBe(25000)
    expect(out.collectionPct).toBe(25)
    expect(out.outstanding).toBe(75000)
  })
})

describe('computeAttentionItems (Section 3)', () => {
  it('returns max 5 items, sorted by priority (P0 first)', () => {
    const fixedNow = new Date('2026-05-10T00:00:00Z')
    const escalations: Escalation[] = [
      {
        id: 'ESC-1',
        createdAt: '2026-05-01T00:00:00Z',
        createdBy: 'admin',
        schoolId: 'SCH-1',
        mouId: null,
        stage: 'pre-mou',
        lane: 'sales',
        level: 1,
        origin: 'manual',
        originId: null,
        severity: 'critical',
        description: 'Test critical issue',
        assignedTo: null,
        notifiedEmails: [],
        status: 'Open',
        category: 'Other',
        type: 'Internal',
        slaBreached: false,
        slaTargetAt: '2026-05-02T00:00:00Z',
        auditLog: [],
      } as unknown as Escalation,
    ]
    const out = computeAttentionItems({
      mous: [],
      schools: [{ id: 'SCH-1', name: 'Demo School' } as unknown as School],
      escalations,
      dispatches: [],
      payments: [],
      now: fixedNow,
    })
    expect(out.length).toBeGreaterThan(0)
    expect(out[0]?.severity).toBe('p0-escalation')
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('returns empty array when the platform is healthy', () => {
    const out = computeAttentionItems({
      mous: [],
      schools: [],
      escalations: [],
      dispatches: [],
      payments: [],
      now: new Date('2026-05-10T00:00:00Z'),
    })
    expect(out).toEqual([])
  })
})

describe('LeadershipDashboard page renders', () => {
  it('renders three sections + two tiles + the page title', async () => {
    const { default: LeadershipDashboard } = await import('./page')
    const html = renderToStaticMarkup(await LeadershipDashboard())
    expect(html).toContain('data-testid="leadership-dashboard"')
    expect(html).toContain('Leadership console')
    expect(html).toContain('data-testid="money-section"')
    expect(html).toContain('Are we making money?')
    expect(html).toContain('data-testid="delivery-section"')
    expect(html).toContain('Are we delivering?')
    expect(html).toContain('data-testid="attention-section"')
    expect(html).toContain('Needs leadership attention')
    expect(html).toContain('data-testid="tile-finance-health"')
    expect(html).toContain('data-testid="tile-operations-health"')
  })

  it('Operations health tile links to / (canonical Ops dashboard)', async () => {
    const { default: LeadershipDashboard } = await import('./page')
    const html = renderToStaticMarkup(await LeadershipDashboard())
    expect(html).toMatch(/data-testid="tile-operations-health"[^>]*href="\/"/)
  })

  it('Finance health tile links to /dashboard/finance', async () => {
    const { default: LeadershipDashboard } = await import('./page')
    const html = renderToStaticMarkup(await LeadershipDashboard())
    expect(html).toMatch(/data-testid="tile-finance-health"[^>]*href="\/dashboard\/finance"/)
  })
})
