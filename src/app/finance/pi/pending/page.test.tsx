/*
 * /finance/pi/pending tests (Gate 4 Step 6).
 *
 * computePendingPi shortlist correctness + page-level permission gate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MOU, Payment, School, User } from '@/lib/types'
import { computePendingPi } from './page'

const NOW = new Date('2026-05-11T10:00:00.000Z')

function mou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-1',
    schoolId: 'SCH-1',
    schoolName: 'Test School',
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
    spWithoutTax: 4000,
    spWithTax: 5000,
    contractValue: 500000,
    received: 0,
    tds: 0,
    balance: 500000,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25',
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

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-1',
    name: 'Test School',
    legalEntity: null,
    city: 'Pune',
    state: 'MH',
    region: 'South-West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-1-i1',
    mouId: 'MOU-1',
    schoolName: 'Test School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: '',
    dueDateRaw: null,
    dueDateIso: '2026-05-25',
    expectedAmount: 125000,
    receivedAmount: null,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...overrides,
  }
}

describe('computePendingPi', () => {
  it('lists installments due within 30 days with no PI yet', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [payment({ id: 'P-1', dueDateIso: '2026-05-25' })],
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.paymentId).toBe('P-1')
  })

  it('lists overdue installments (past due date)', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [payment({ id: 'P-1', dueDateIso: '2026-04-01' })],
      now: NOW,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isOverdue).toBe(true)
  })

  it('excludes paid installments', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [payment({ status: 'Paid' })],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('excludes installments with PI already generated', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [
        payment({ piGeneratedAt: '2026-04-01T00:00:00Z' }),
      ],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('excludes installments more than 30 days out', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [payment({ dueDateIso: '2026-09-01' })],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('excludes installments on inactive MOUs', async () => {
    const rows = computePendingPi({
      mous: [mou({ status: 'Completed' })],
      schools: [school()],
      payments: [payment()],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('excludes installments on inactive schools', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school({ active: false })],
      payments: [payment()],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })

  it('flags row without billing block', async () => {
    const rows = computePendingPi({
      mous: [mou()], // no billingBlock
      schools: [school()],
      payments: [payment()],
      now: NOW,
    })
    expect(rows[0]?.hasBillingBlock).toBe(false)
  })

  it('orders overdue first, then by ascending days-until-due', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [
        payment({ id: 'P-A', dueDateIso: '2026-05-22' }), // 11 days out
        payment({ id: 'P-B', dueDateIso: '2026-04-10' }), // overdue 31d
        payment({ id: 'P-C', dueDateIso: '2026-05-13' }), // 2 days out
      ],
      now: NOW,
    })
    expect(rows.map((r) => r.paymentId)).toEqual(['P-B', 'P-C', 'P-A'])
  })

  it('empty payments returns empty list', async () => {
    const rows = computePendingPi({
      mous: [mou()],
      schools: [school()],
      payments: [],
      now: NOW,
    })
    expect(rows).toHaveLength(0)
  })
})

// ----------------------------------------------------------------------------
// Page tests
// ----------------------------------------------------------------------------

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (p: string) => redirectMock(p),
}))

vi.mock('@/components/ops/TopNav', () => ({
  TopNav: () => null,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function finance(): User {
  return {
    id: 'pranav.p',
    name: 'Pranav',
    email: 'p@example.test',
    role: 'Finance',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('/finance/pi/pending page', () => {
  it('redirects unauthenticated callers to /login', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page()).rejects.toThrow(
      'REDIRECT:/login?next=%2Ffinance%2Fpi%2Fpending',
    )
  })

  it('every authenticated user can view in testing mode (TESTING_OPEN_ACCESS default)', async () => {
    // VIEW gates open during testing per CLAUDE.md; only EDIT actions
    // stay department-scoped. A SalesRep should reach the page but the
    // inline Generate PI action is still gated by Finance ownership
    // downstream.
    getCurrentUserMock.mockResolvedValue({
      ...finance(),
      role: 'SalesRep',
      department: 'sales',
    } as User)
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Pending PIs')
  })

  it('renders header + page shell for Finance', async () => {
    getCurrentUserMock.mockResolvedValue(finance())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Pending PIs')
    expect(html).toContain('data-testid="pending-pi-list"')
  })
})
