import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST } from './route'

const sessionMock = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: () => sessionMock(),
}))

const recordMock = vi.fn()
vi.mock('@/lib/kanban/recordTransition', () => ({
  recordTransition: (args: unknown) => recordMock(args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function req(body: unknown): Request {
  return new Request('http://localhost/api/kanban/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/kanban/transition', () => {
  it('rejects unauthenticated requests with 401', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(req({}))
    expect(res.status).toBe(401)
  })

  it('rejects malformed JSON with 400', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    const bad = new Request('http://localhost/api/kanban/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(bad)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, reason: 'invalid-json' })
  })

  it('rejects missing required fields with 400', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    const res = await POST(req({ mouId: '', fromStage: '', toStage: '' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, reason: 'missing-fields' })
  })

  it('on success returns 200 with the lib result', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    recordMock.mockResolvedValue({ ok: true, audited: true, mouId: 'M1', kind: 'forward-skip' })
    const res = await POST(req({
      mouId: 'M1', fromStage: 'mou-signed', toStage: 'kit-dispatched',
      reason: 'Imported mid-flight; kit was already dispatched.',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, audited: true, kind: 'forward-skip' })
  })

  it('on mou-not-found returns 404', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    recordMock.mockResolvedValue({ ok: false, reason: 'mou-not-found' })
    const res = await POST(req({ mouId: 'M-ghost', fromStage: 'mou-signed', toStage: 'invoice-raised', reason: null }))
    expect(res.status).toBe(404)
  })

  it('on reason-missing returns 400', async () => {
    sessionMock.mockResolvedValue({ sub: 'anish.d' })
    recordMock.mockResolvedValue({ ok: false, reason: 'reason-missing' })
    const res = await POST(req({ mouId: 'M1', fromStage: 'mou-signed', toStage: 'kit-dispatched', reason: '' }))
    expect(res.status).toBe(400)
  })
})
