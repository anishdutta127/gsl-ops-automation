import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/importer/fromMou', () => ({
  importOnce: vi.fn(),
}))
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

import { POST } from './route'
import { importOnce } from '@/lib/importer/fromMou'
import { appendSyncHealth } from '@/lib/syncHealth/appendEntry'
import { getCurrentSession } from '@/lib/auth/session'

const importMock = importOnce as ReturnType<typeof vi.fn>
const appendMock = appendSyncHealth as ReturnType<typeof vi.fn>
const sessionMock = getCurrentSession as ReturnType<typeof vi.fn>

function buildRequest(): Request {
  return new Request('http://localhost/api/mou/import-tick', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: '',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  importMock.mockResolvedValue({
    written: [],
    quarantined: [],
    filtered: 0,
    autoLinkedSchoolIds: [],
    errors: [],
  })
})

describe('POST /api/mou/import-tick', () => {
  it('happy path (OpsHead): runs importOnce, appends sync_health entry, redirects with synced=import-ok', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    const res = await POST(buildRequest())
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin')
    expect(loc).toContain('synced=import-ok')
    expect(importMock).toHaveBeenCalledTimes(1)
    expect(appendMock).toHaveBeenCalledTimes(1)
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.kind).toBe('import')
    expect(entry.triggeredBy).toBe('misba.m')
  })

  it('Admin can trigger (wildcard)', async () => {
    sessionMock.mockResolvedValue({
      sub: 'anish.d', email: 'a@example.test', name: 'Anish', role: 'Admin',
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=import-ok')
  })

  it('SalesRep is REJECTED with error=permission', async () => {
    sessionMock.mockResolvedValue({
      sub: 'sp-vikram', email: 'v@example.test', name: 'Vikram', role: 'SalesRep',
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('error=permission')
    expect(importMock).not.toHaveBeenCalled()
  })

  it('redirects to /login with next preserved when unauthenticated', async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(buildRequest())
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/login')
    expect(loc).toContain('next=%2Fadmin')
  })

  it('importer errors surface as anomaly + synced=import-anomaly', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    importMock.mockResolvedValue({
      written: [],
      quarantined: [],
      filtered: 0,
      autoLinkedSchoolIds: [],
      errors: [new Error('fetch upstream 502')],
    })
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=import-anomaly')
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.ok).toBe(false)
    expect(entry.anomalies.some((a: string) => a.includes('502'))).toBe(true)
  })

  it('thrown error in importOnce captured as anomaly + synced=import-anomaly', async () => {
    sessionMock.mockResolvedValue({
      sub: 'misba.m', email: 'm@example.test', name: 'Misba', role: 'OpsHead',
    })
    importMock.mockRejectedValue(new Error('GitHub Contents API rate limited'))
    const res = await POST(buildRequest())
    expect(res.headers.get('location')).toContain('synced=import-anomaly')
    expect(appendMock).toHaveBeenCalled()
    const entry = appendMock.mock.calls[0]![0]
    expect(entry.anomalies.some((a: string) => a.includes('rate limited'))).toBe(true)
  })
})
