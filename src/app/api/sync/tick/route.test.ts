import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/syncHealth/appendEntry', () => ({
  appendSyncHealth: vi.fn(async () => []),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn(),
}))
vi.mock('@/data/users.json', () => ({
  default: [
    { id: 'misba.m', name: 'Misba', email: 'm@example.test', role: 'OpsHead', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'anish.d', name: 'Anish', email: 'a@example.test', role: 'Admin', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
    { id: 'sp-vikram', name: 'Vikram', email: 'v@example.test', role: 'SalesRep', testingOverride: false, active: true, passwordHash: 'X', createdAt: '', auditLog: [] },
  ],
}))

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    default: { ...(actual.default as object), readFile: fsMock.readFile },
    readFile: fsMock.readFile,
  }
})

import { POST } from './route'
import { appendSyncHealth } from '@/lib/syncHealth/appendEntry'
import { getCurrentSession } from '@/lib/auth/session'

const appendMock = appendSyncHealth as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(): Request {
  return new Request('http://localhost/api/sync/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: '',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: clean state files
  fsMock.readFile.mockImplementation(async (p: string) => {
    if (p.endsWith('pi_counter.json')) return '{"fiscalYear":"26-27","next":5,"prefix":"GSL/OPS"}'
    if (p.endsWith('pending_updates.json')) return '[]'
    if (p.endsWith('sync_health.json')) return '[]'
    throw new Error('unexpected read: ' + p)
  })
})

describe('POST /api/sync/tick', () => {
  it('happy path: clean state -> appends health entry with ok=true, synced=health-ok', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    const res = await POST(buildRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('synced=health-ok')
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.kind).toBe('health')
    expect(entry.ok).toBe(true)
    expect(entry.healthChecks).toMatchObject({ jsonValid: true, queueDepth: 0 })
  })

  it('SalesRep is REJECTED with error=permission', async () => {
    sessionMock.mockResolvedValue({
      sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep',
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('error=permission')
    expect(appendMock).not.toHaveBeenCalled()
  })

  it('Admin can trigger (wildcard)', async () => {
    sessionMock.mockResolvedValue({
      sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin',
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=health-ok')
  })

  it('redirects to /login with next preserved when unauthenticated', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest())
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin')
  })

  it('corrupted pi_counter.json surfaces as anomaly + synced=health-anomaly', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    fsMock.readFile.mockImplementation(async (p: string) => {
      if (p.endsWith('pi_counter.json')) return '{not-json'
      if (p.endsWith('pending_updates.json')) return '[]'
      if (p.endsWith('sync_health.json')) return '[]'
      throw new Error('unexpected: ' + p)
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=health-anomaly')
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.healthChecks.jsonValid).toBe(false)
    expect(entry.anomalies.some((a: string) => a.includes('pi_counter.json failed to parse'))).toBe(true)
  })

  it('high queue depth surfaces as anomaly', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    const updates = JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({
        id: `p-${i}`, queuedAt: new Date().toISOString(), queuedBy: 'system',
        entity: 'mou', operation: 'update', payload: {}, retryCount: 0,
      })),
    )
    fsMock.readFile.mockImplementation(async (p: string) => {
      if (p.endsWith('pi_counter.json')) return '{"fiscalYear":"26-27","next":5,"prefix":"GSL/OPS"}'
      if (p.endsWith('pending_updates.json')) return updates
      if (p.endsWith('sync_health.json')) return '[]'
      throw new Error('unexpected: ' + p)
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=health-anomaly')
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.healthChecks.queueDepth).toBe(60)
    expect(entry.anomalies.some((a: string) => a.includes('queue depth 60'))).toBe(true)
  })

  it('append failure does not 500; the redirect still surfaces the report', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    appendMock.mockRejectedValueOnce(new Error('Contents API down'))
    const res = await POST(buildRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('synced=health-ok')
  })
})
