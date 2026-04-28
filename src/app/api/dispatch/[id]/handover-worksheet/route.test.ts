/*
 * /api/dispatch/[id]/handover-worksheet route handler tests.
 *
 * Mocks the data fixtures, getCurrentSession, generateHandoverWorksheet,
 * and enqueueUpdate. Asserts the happy path (200 + Content-Disposition),
 * auth redirect, 404 for missing dispatch, audit dedup behaviour, and
 * the template-missing 500 path.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const sessionMock = vi.fn()
const enqueueMock = vi.fn(async (_args: Record<string, unknown>) => ({}))
const generateMock = vi.fn(async (_args: Record<string, unknown>) => ({} as unknown))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => sessionMock(),
}))
vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: (args: Record<string, unknown>) => enqueueMock(args),
}))
vi.mock('@/lib/dispatch/generateHandoverWorksheet', () => ({
  generateHandoverWorksheet: (args: Record<string, unknown>) => generateMock(args),
}))

vi.mock('@/data/dispatches.json', () => ({
  default: [
    {
      id: 'DSP-MOU-X-i1',
      mouId: 'MOU-X',
      schoolId: 'SCH-X',
      installmentSeq: 1,
      stage: 'po-raised',
      installment1Paid: true,
      overrideEvent: null,
      poRaisedAt: '2026-04-26T10:00:00.000Z',
      dispatchedAt: null,
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgementUrl: null,
      notes: null,
      lineItems: [{ kind: 'flat', skuName: 'STEAM kit set', quantity: 200 }],
      requestId: null,
      raisedBy: 'misba.m',
      raisedFrom: 'ops-direct',
      auditLog: [],
    },
    {
      // Same dispatch with a recent download audit (used for dedup test).
      id: 'DSP-RECENT',
      mouId: 'MOU-X',
      schoolId: 'SCH-X',
      installmentSeq: 2,
      stage: 'po-raised',
      installment1Paid: true,
      overrideEvent: null,
      poRaisedAt: '2026-04-26T10:00:00.000Z',
      dispatchedAt: null,
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgementUrl: null,
      notes: null,
      lineItems: [{ kind: 'flat', skuName: 'STEAM kit set', quantity: 100 }],
      requestId: null,
      raisedBy: 'misba.m',
      raisedFrom: 'ops-direct',
      auditLog: [
        {
          // Will be evaluated against `now` in each test (set to ~30s
          // before the test's now timestamp via the dynamic dedup window).
          timestamp: '2099-01-01T00:00:00.000Z',
          user: 'misba.m',
          action: 'handover-worksheet-downloaded',
          after: { dispatchId: 'DSP-RECENT' },
          notes: 'recent',
        },
      ],
    },
  ],
}))

vi.mock('@/data/mous.json', () => ({
  default: [
    {
      id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'X', programme: 'STEAM',
      programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
      status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
      startDate: '2026-04-01', endDate: '2027-03-31',
      studentsMou: 200, studentsActual: 200, studentsVariance: 0, studentsVariancePct: 0,
      spWithoutTax: 1000, spWithTax: 1180, contractValue: 118000,
      received: 0, tds: 0, balance: 118000, receivedPct: 0,
      paymentSchedule: '50-50',
      trainerModel: 'GSL-T', salesPersonId: null, templateVersion: null,
      generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
    },
  ],
}))

vi.mock('@/data/schools.json', () => ({
  default: [
    {
      id: 'SCH-X', name: 'Test School', legalEntity: 'Test Trust',
      city: 'Pune', state: 'MH', region: 'South-West', pinCode: '411001',
      contactPerson: null, email: null, phone: null,
      billingName: null, pan: null, gstNumber: '27AAAPL1234C1ZX',
      notes: null, active: true, createdAt: '2026-01-01T00:00:00Z', auditLog: [],
    },
  ],
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  generateMock.mockResolvedValue({
    ok: true,
    docxBytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // PK\x03\x04 zip header
    rowCount: 1,
    totalQuantity: 200,
  })
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/dispatch/[id]/handover-worksheet', () => {
  it('redirects unauthenticated callers to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/handover-worksheet')
    const res = await GET(req, params('DSP-MOU-X-i1'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('returns 404 when dispatch is unknown', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', name: 'Misba', role: 'OpsHead', email: 'm@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-NOPE/handover-worksheet')
    const res = await GET(req, params('DSP-NOPE'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'dispatch-not-found' })
  })

  it('happy path: 200 + correct content-disposition + audit enqueued', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', name: 'Misba', role: 'OpsHead', email: 'm@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/handover-worksheet')
    const res = await GET(req, params('DSP-MOU-X-i1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="HandoverWorksheet-DSP-MOU-X-i1.docx"',
    )
    expect(res.headers.get('x-row-count')).toBe('1')
    expect(res.headers.get('x-total-quantity')).toBe('200')
    // Allow microtask for the fire-and-forget enqueue.
    await new Promise((r) => setTimeout(r, 0))
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    const arg = enqueueMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg).toMatchObject({
      entity: 'dispatch',
      operation: 'update',
      queuedBy: 'misba.m',
    })
    const payload = arg.payload as { auditLog: Array<Record<string, unknown>> }
    const audit = payload.auditLog[payload.auditLog.length - 1]!
    expect(audit.action).toBe('handover-worksheet-downloaded')
    expect(audit.user).toBe('misba.m')
    expect(String(audit.notes)).toContain('Misba')
  })

  it('dedup: re-click within 60s does not enqueue a second audit entry', async () => {
    // Set the fixture audit timestamp 30s before real-time "now" so the
    // route (which calls new Date() at runtime) sees the entry inside
    // the 60s dedup window. We avoid fake timers because the route's
    // setTimeout-based fire-and-forget enqueue would never flush.
    const recentTs = new Date(Date.now() - 30_000).toISOString()
    const mod = await import('@/data/dispatches.json')
    const arr = (mod as unknown as { default: Array<{ id: string; auditLog: Array<{ timestamp: string }> }> }).default
    const target = arr.find((d) => d.id === 'DSP-RECENT')!
    target.auditLog[0]!.timestamp = recentTs

    sessionMock.mockResolvedValue({ sub: 'misba.m', name: 'Misba', role: 'OpsHead', email: 'm@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-RECENT/handover-worksheet')
    const res = await GET(req, params('DSP-RECENT'))
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 0))
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('returns 500 when generator reports template-missing', async () => {
    generateMock.mockResolvedValue({
      ok: false,
      reason: 'template-missing',
      templateError: { message: 'Handover template not yet authored.' },
    })
    sessionMock.mockResolvedValue({ sub: 'misba.m', name: 'Misba', role: 'OpsHead', email: 'm@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/handover-worksheet')
    const res = await GET(req, params('DSP-MOU-X-i1'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('template-missing')
    expect(body.message).toContain('Handover template')
  })
})
