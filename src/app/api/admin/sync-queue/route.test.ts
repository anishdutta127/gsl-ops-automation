/*
 * /api/admin/sync-queue route tests (W4-I.3.B).
 *
 * Auth flavour: bearer token only (Vercel cron sends
 * `Authorization: Bearer $CRON_SECRET`). No session check; no per-user
 * permission gate. The drain itself is mocked so the tests focus on
 * the auth boundary and the response shape.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { DrainResult } from '@/lib/sync/drainQueue'

const drainMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sync/drainQueue', () => ({
  drainQueue: drainMock,
}))

import { POST } from './route'

function makeRequest(opts: {
  authorization?: string
  body?: string
}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (opts.authorization !== undefined) {
    headers['authorization'] = opts.authorization
  }
  return new Request('http://localhost/api/admin/sync-queue', {
    method: 'POST',
    headers,
    body: opts.body,
  })
}

const sampleResult: DrainResult = {
  ok: true,
  drainedCount: 2,
  failedCount: 0,
  remainingCount: 0,
  perEntity: [
    { entity: 'school', drained: 2, skipped: 0, failed: 0 },
  ],
  anomalies: [],
  triggeredBy: 'cron',
  startedAt: '2026-04-30T12:00:00.000Z',
  finishedAt: '2026-04-30T12:00:01.000Z',
  durationMs: 1000,
}

const originalSecret = process.env.CRON_SECRET

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret-value'
  drainMock.mockResolvedValue(sampleResult)
})

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

describe('POST /api/admin/sync-queue', () => {
  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makeRequest({ authorization: 'Bearer anything' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.reason).toBe('cron-secret-not-configured')
    expect(drainMock).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.reason).toBe('unauthorized')
    expect(drainMock).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header does not match', async () => {
    const res = await POST(makeRequest({ authorization: 'Bearer wrong-token' }))
    expect(res.status).toBe(401)
    expect(drainMock).not.toHaveBeenCalled()
  })

  it('returns 200 + DrainResult on valid auth', async () => {
    const res = await POST(
      makeRequest({ authorization: 'Bearer test-secret-value' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as DrainResult
    expect(body.ok).toBe(true)
    expect(body.drainedCount).toBe(2)
    expect(drainMock).toHaveBeenCalledWith({ triggeredBy: 'cron' })
  })

  it('honours triggeredBy from JSON body when present', async () => {
    const res = await POST(
      makeRequest({
        authorization: 'Bearer test-secret-value',
        body: JSON.stringify({ triggeredBy: 'cli' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(drainMock).toHaveBeenCalledWith({ triggeredBy: 'cli' })
  })

  it('propagates drain failure in response body (200, ok=false)', async () => {
    drainMock.mockResolvedValueOnce({
      ...sampleResult,
      ok: false,
      anomalies: ['school batch failed: simulated error'],
    })
    const res = await POST(
      makeRequest({ authorization: 'Bearer test-secret-value' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as DrainResult
    expect(body.ok).toBe(false)
    expect(body.anomalies[0]).toMatch(/school batch failed/)
  })
})
