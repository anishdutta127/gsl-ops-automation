/*
 * /api/dispatch/[id]/dispatch-note route handler tests.
 *
 * Mocks the buildPlaceholderBag + renderDispatchDocx helpers from
 * raiseDispatch.ts so the test does not depend on the real
 * dispatch-template.docx on disk. Asserts auth, 404, happy path
 * (200 + Content-Disposition), and the dedup audit enqueue.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const sessionMock = vi.fn()
const enqueueMock = vi.fn(async (_args: Record<string, unknown>) => ({}))
const buildBagMock = vi.fn((_args: Record<string, unknown>) => ({ DISPATCH_NUMBER: 'DSP-MOU-X-i1' }))
const renderMock = vi.fn(async (_bag: Record<string, unknown>, _load: unknown) => new Uint8Array([0x50, 0x4b, 0x03, 0x04]))

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => sessionMock(),
}))
vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: (args: Record<string, unknown>) => enqueueMock(args),
}))
vi.mock('@/lib/dispatch/raiseDispatch', () => ({
  buildPlaceholderBag: (args: Record<string, unknown>) => buildBagMock(args),
  renderDispatchDocx: (bag: Record<string, unknown>, load: unknown) => renderMock(bag, load),
}))

vi.mock('@/data/dispatches.json', () => ({
  default: [
    {
      id: 'DSP-MOU-X-i1',
      mouId: 'MOU-X', schoolId: 'SCH-X', installmentSeq: 1,
      stage: 'po-raised', installment1Paid: true, overrideEvent: null,
      poRaisedAt: '2026-04-26T10:00:00.000Z',
      dispatchedAt: null, deliveredAt: null, acknowledgedAt: null,
      acknowledgementUrl: null, notes: null,
      lineItems: [{ kind: 'flat', skuName: 'STEAM kit set', quantity: 200 }],
      requestId: null, raisedBy: 'misba.m', raisedFrom: 'ops-direct',
      auditLog: [],
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
vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'misba.m', name: 'Misba M.', email: 'm@x', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

import { GET } from './route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/dispatch/[id]/dispatch-note', () => {
  it('redirects unauthenticated callers to /login', async () => {
    sessionMock.mockResolvedValue(null)
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/dispatch-note')
    const res = await GET(req, params('DSP-MOU-X-i1'))
    expect(res.status).toBe(303)
  })

  it('returns 404 when dispatch is unknown', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', name: 'Misba', role: 'OpsHead', email: 'm@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-NOPE/dispatch-note')
    const res = await GET(req, params('DSP-NOPE'))
    expect(res.status).toBe(404)
  })

  it('happy path: passes original raisedByName (raiser, not downloader)', async () => {
    sessionMock.mockResolvedValue({ sub: 'pradeep.r', name: 'Pradeep R', role: 'Admin', email: 'p@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/dispatch-note')
    const res = await GET(req, params('DSP-MOU-X-i1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="DispatchNote-DSP-MOU-X-i1.docx"',
    )
    expect(buildBagMock).toHaveBeenCalledTimes(1)
    const bagArg = buildBagMock.mock.calls[0]![0] as unknown as { raisedByName: string; ts: string }
    expect(bagArg.raisedByName).toBe('Misba M.') // dispatch.raisedBy = misba.m, not the downloader
    expect(bagArg.ts).toBe('2026-04-26T10:00:00.000Z') // original poRaisedAt
  })

  it('happy path: appends dispatch-note-downloaded audit entry via enqueue', async () => {
    sessionMock.mockResolvedValue({ sub: 'pradeep.r', name: 'Pradeep R', role: 'Admin', email: 'p@x' })
    const req = new Request('http://localhost/api/dispatch/DSP-MOU-X-i1/dispatch-note')
    await GET(req, params('DSP-MOU-X-i1'))
    await new Promise((r) => setTimeout(r, 0))
    expect(enqueueMock).toHaveBeenCalledTimes(1)
    const arg = enqueueMock.mock.calls[0]![0] as Record<string, unknown>
    const payload = arg.payload as { auditLog: Array<Record<string, unknown>> }
    const audit = payload.auditLog[payload.auditLog.length - 1]!
    expect(audit.action).toBe('dispatch-note-downloaded')
    expect(audit.user).toBe('pradeep.r')
  })
})
