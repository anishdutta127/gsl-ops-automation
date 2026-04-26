/*
 * /api/feedback/submit route handler tests.
 *
 * Mocks the queue + autoEscalation. Uses real magicLink sign/verify
 * with a test signing key so the HMAC round-trip is genuinely
 * exercised in pass-path tests.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_KEY = 'unit-test-magic-link-key-32-bytes-of-entropy'

vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(async () => ({ id: 'p' })),
}))

vi.mock('@/lib/feedback/autoEscalation', () => ({
  feedbackAutoEscalation: vi.fn(async () => null),
}))

const mockTokens = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/data/magic_link_tokens.json', () => ({
  get default() { return mockTokens.value },
}))

const mockMous = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/data/mous.json', () => ({
  get default() { return mockMous.value },
}))

import { POST } from './route'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { feedbackAutoEscalation } from '@/lib/feedback/autoEscalation'
import { signMagicLink } from '@/lib/magicLink'

const enqueueMock = enqueueUpdate as ReturnType<typeof vi.fn>
const escalateMock = feedbackAutoEscalation as ReturnType<typeof vi.fn>

const validToken = {
  id: 'MLT-FB-001',
  purpose: 'feedback-submit' as const,
  mouId: 'MOU-X',
  installmentSeq: 1,
  spocEmail: 'spoc@example.test',
  issuedAt: '2026-04-25T10:00:00Z',
  expiresAt: '2099-04-27T10:00:00Z',
  usedAt: null, usedByIp: null, lastViewedAt: null, viewCount: 0,
  communicationId: 'COM-X',
}

function buildBody(overrides: Record<string, unknown> = {}): URLSearchParams {
  const body = new URLSearchParams()
  body.set('tokenId', validToken.id)
  body.set('h', signMagicLink({
    purpose: validToken.purpose,
    mouId: validToken.mouId,
    installmentSeq: validToken.installmentSeq,
    spocEmail: validToken.spocEmail,
    issuedAt: validToken.issuedAt,
  }))
  body.set('ratings', JSON.stringify([
    { category: 'training-quality', rating: 5, comment: null },
    { category: 'kit-condition', rating: 4, comment: null },
    { category: 'delivery-timing', rating: 5, comment: null },
    { category: 'trainer-rapport', rating: 4, comment: null },
  ]))
  for (const [k, v] of Object.entries(overrides)) {
    body.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  return body
}

function buildRequest(body: URLSearchParams): Request {
  return new Request('http://localhost/api/feedback/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

let originalKey: string | undefined

beforeAll(() => {
  originalKey = process.env.GSL_SNAPSHOT_SIGNING_KEY
  process.env.GSL_SNAPSHOT_SIGNING_KEY = TEST_KEY
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.GSL_SNAPSHOT_SIGNING_KEY
  else process.env.GSL_SNAPSHOT_SIGNING_KEY = originalKey
})

const validMou = {
  id: 'MOU-X', schoolId: 'SCH-GREENFIELD-PUNE', schoolName: 'Greenfield',
  programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
  schoolGroupId: null, status: 'Active', academicYear: '2026-27',
  startDate: '2026-04-01', endDate: '2027-03-31',
  studentsMou: 200, studentsActual: null, studentsVariance: null,
  studentsVariancePct: null, spWithoutTax: 4000, spWithTax: 5000,
  contractValue: 1000000, received: 0, tds: 0, balance: 1000000,
  receivedPct: 0, paymentSchedule: '', trainerModel: 'GSL-T',
  salesPersonId: null, templateVersion: null, generatedAt: null,
  notes: null, daysToExpiry: null, auditLog: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockTokens.value = [validToken]
  mockMous.value = [validMou]
})

describe('POST /api/feedback/submit', () => {
  it('happy path: 201 + enqueues token update + Feedback create + fires autoEscalation hook', async () => {
    const res = await POST(buildRequest(buildBody()))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.feedbackId).toMatch(/^FBK-/)
    expect(enqueueMock).toHaveBeenCalledTimes(2)
    expect(enqueueMock.mock.calls[0]![0]).toMatchObject({ entity: 'magicLinkToken' })
    expect(enqueueMock.mock.calls[1]![0]).toMatchObject({ entity: 'feedback' })
    expect(escalateMock).toHaveBeenCalledTimes(1)
  })

  it('rejects HMAC mismatch with 403', async () => {
    const body = buildBody()
    body.set('h', '0'.repeat(64))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('hmac-failed')
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('rejects unknown tokenId with 404', async () => {
    const body = buildBody({ tokenId: 'MLT-DOES-NOT-EXIST' })
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(404)
  })

  it('rejects token with purpose mismatch (status-view used for feedback) with 403', async () => {
    mockTokens.value = [{ ...validToken, purpose: 'status-view' }]
    const res = await POST(buildRequest(buildBody()))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('wrong-purpose')
  })

  it('rejects expired token with 410', async () => {
    mockTokens.value = [{ ...validToken, expiresAt: '2020-01-01T00:00:00Z' }]
    const res = await POST(buildRequest(buildBody()))
    expect(res.status).toBe(410)
    const json = await res.json()
    expect(json.error).toBe('token-expired')
  })

  it('rejects already-used token with 410', async () => {
    mockTokens.value = [{ ...validToken, usedAt: '2026-04-26T00:00:00Z' }]
    const res = await POST(buildRequest(buildBody()))
    expect(res.status).toBe(410)
    const json = await res.json()
    expect(json.error).toBe('token-used')
  })

  it('rejects ratings array of wrong length with 400', async () => {
    const body = buildBody()
    body.set('ratings', JSON.stringify([
      { category: 'training-quality', rating: 5, comment: null },
    ]))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid-ratings')
  })

  it('rejects unknown category with 400', async () => {
    const body = buildBody()
    body.set('ratings', JSON.stringify([
      { category: 'made-up-category', rating: 5, comment: null },
      { category: 'kit-condition', rating: 4, comment: null },
      { category: 'delivery-timing', rating: 5, comment: null },
      { category: 'trainer-rapport', rating: 4, comment: null },
    ]))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(400)
  })

  it('rejects rating outside 1..5 with 400', async () => {
    const body = buildBody()
    body.set('ratings', JSON.stringify([
      { category: 'training-quality', rating: 7, comment: null },
      { category: 'kit-condition', rating: 4, comment: null },
      { category: 'delivery-timing', rating: 5, comment: null },
      { category: 'trainer-rapport', rating: 4, comment: null },
    ]))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(400)
  })

  it('accepts null rating (skip)', async () => {
    const body = buildBody()
    body.set('ratings', JSON.stringify([
      { category: 'training-quality', rating: null, comment: null },
      { category: 'kit-condition', rating: 4, comment: null },
      { category: 'delivery-timing', rating: 5, comment: null },
      { category: 'trainer-rapport', rating: 4, comment: null },
    ]))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(201)
  })

  it('rejects duplicate categories with 400', async () => {
    const body = buildBody()
    body.set('ratings', JSON.stringify([
      { category: 'training-quality', rating: 5, comment: null },
      { category: 'training-quality', rating: 4, comment: null },
      { category: 'delivery-timing', rating: 5, comment: null },
      { category: 'trainer-rapport', rating: 4, comment: null },
    ]))
    const res = await POST(buildRequest(body))
    expect(res.status).toBe(400)
  })

  it('captures usedByIp from x-forwarded-for header', async () => {
    const req = new Request('http://localhost/api/feedback/submit', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': '203.0.113.42',
      },
      body: buildBody().toString(),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const tokenUpdatePayload = enqueueMock.mock.calls[0]![0].payload
    expect(tokenUpdatePayload.usedByIp).toBe('203.0.113.42')
  })

  it('passes the Feedback record to the autoEscalation hook (caller wires the integration)', async () => {
    await POST(buildRequest(buildBody()))
    const arg = escalateMock.mock.calls[0]![0]
    expect(arg.mouId).toBe('MOU-X')
    expect(arg.installmentSeq).toBe(1)
    expect(arg.submittedBy).toBe('spoc')
  })

  it('resolves Feedback.schoolId from MOU before write (queue payload non-empty)', async () => {
    await POST(buildRequest(buildBody()))
    const feedbackPayload = enqueueMock.mock.calls[1]![0].payload
    expect(feedbackPayload.schoolId).toBe('SCH-GREENFIELD-PUNE')
    expect(feedbackPayload.schoolId).not.toBe('')
  })

  it('autoEscalation hook receives the populated schoolId (Escalation reference is correct)', async () => {
    await POST(buildRequest(buildBody()))
    const arg = escalateMock.mock.calls[0]![0]
    expect(arg.schoolId).toBe('SCH-GREENFIELD-PUNE')
  })

  it('returns 404 when the MOU referenced by the token is missing from mous.json', async () => {
    mockMous.value = []
    const res = await POST(buildRequest(buildBody()))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('mou-not-found')
    expect(enqueueMock).not.toHaveBeenCalled()
    expect(escalateMock).not.toHaveBeenCalled()
  })
})
