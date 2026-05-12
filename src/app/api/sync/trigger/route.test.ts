import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sync/drainQueue', () => ({
  drainQueue: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))

import { POST } from './route'
import { drainQueue } from '@/lib/sync/drainQueue'
import { getCurrentSession } from '@/lib/auth/session'
import { __resetSyncTriggerRateLimit } from '@/lib/sync/rateLimit'

const drainMock = drainQueue as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  __resetSyncTriggerRateLimit()
})

function okDrainResult(overrides: Partial<{ drainedCount: number; remainingCount: number; failedCount: number; anomalies: string[] }> = {}) {
  return {
    ok: true,
    drainedCount: overrides.drainedCount ?? 3,
    remainingCount: overrides.remainingCount ?? 0,
    failedCount: overrides.failedCount ?? 0,
    perEntity: [],
    anomalies: overrides.anomalies ?? [],
    triggeredBy: 'manual:misba.m',
    startedAt: '2026-05-12T12:00:00.000Z',
    finishedAt: '2026-05-12T12:00:01.000Z',
    durationMs: 1000,
  }
}

describe('POST /api/sync/trigger', () => {
  it('401 when not authenticated', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('401 when session refers to unknown or inactive user', async () => {
    sessionMock.mockResolvedValue({ sub: 'ghost', email: 'g@x', name: 'Ghost', role: 'Admin' })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('happy path returns drained + remaining counts', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x', name: 'Misba', role: 'Admin' })
    drainMock.mockResolvedValue(okDrainResult({ drainedCount: 2 }))
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      drained: 2,
      remaining: 0,
      failed: 0,
      anomalies: [],
    })
    expect(drainMock).toHaveBeenCalledWith({ triggeredBy: 'manual:misba.m' })
  })

  it('rate-limits second call within 60s', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x', name: 'Misba', role: 'Admin' })
    drainMock.mockResolvedValue(okDrainResult())
    const first = await POST()
    expect(first.status).toBe(200)
    const second = await POST()
    expect(second.status).toBe(429)
    const body = await second.json()
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('rate-limited')
    expect(typeof body.retryAfterMs).toBe('number')
    expect(body.retryAfterMs).toBeGreaterThan(0)
  })

  it('different users are rate-limited independently', async () => {
    drainMock.mockResolvedValue(okDrainResult())
    sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x', name: 'Misba', role: 'Admin' })
    expect((await POST()).status).toBe(200)
    sessionMock.mockResolvedValue({ sub: 'anish.d', email: 'a@x', name: 'Anish', role: 'Admin' })
    expect((await POST()).status).toBe(200)
  })

  it('passes anomalies through to the body', async () => {
    sessionMock.mockResolvedValue({ sub: 'misba.m', email: 'm@x', name: 'Misba', role: 'Admin' })
    drainMock.mockResolvedValue(okDrainResult({ anomalies: ['mou batch failed: 409'] }))
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.anomalies).toEqual(['mou batch failed: 409'])
  })
})
