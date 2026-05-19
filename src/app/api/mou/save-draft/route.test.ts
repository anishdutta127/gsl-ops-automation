/*
 * Gate 2 Step 5 verification: POST /api/mou/save-draft permission gates.
 *
 * Confirms V6 boundary semantics:
 *   - Unauthenticated requests get 401.
 *   - Authenticated callers without canEditMOU (Ops + Finance + non-Admin
 *     Leadership) get 403.
 *   - Sales + Admin (cross-functional) can write through.
 *   - The handler refuses missing templateId / programme.
 *
 * Permission writers (saveDraftMou) are mocked to keep tests free of
 * the GitHub Contents API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const saveDraftMouMock = vi.fn()
const getCurrentUserMock = vi.fn()

// These tests validate the strict department-scoped EDIT gate.
// Force production-mode so canEditMOU enforces Sales-only; the
// testing-open default would let every active user through.
const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
beforeEach(() => {
  process.env.TESTING_OPEN_ACCESS = 'false'
})
afterEach(() => {
  if (ORIGINAL_TESTING === undefined) {
    delete process.env.TESTING_OPEN_ACCESS
  } else {
    process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  }
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))

vi.mock('@/lib/mouSystem/entityWriters', () => ({
  saveDraftMou: (...args: unknown[]) => saveDraftMouMock(...args),
}))

import { POST } from './route'
import type { User } from '@/lib/types'

function user(overrides: Partial<User> & Pick<User, 'role' | 'department'>): User {
  const base: User = {
    id: 'u-test',
    name: 'Test User',
    email: 'test@example.test',
    role: overrides.role,
    department: overrides.department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  }
  return { ...base, ...overrides }
}

function buildRequest(body: object): Request {
  return new Request('http://localhost/api/mou/save-draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  saveDraftMouMock.mockResolvedValue({
    mou: { id: 'MOU-STEAM-2627-DRAFT-007' },
    commitSha: 'abc123',
  })
})

describe('POST /api/mou/save-draft', () => {
  it('401 when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(401)
    expect(saveDraftMouMock).not.toHaveBeenCalled()
  })

  it('403 for OpsHead (department=ops): MOU drafting is Sales-only', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'misba.m', role: 'Admin', department: 'ops' }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(403)
    expect(saveDraftMouMock).not.toHaveBeenCalled()
  })

  it('403 for Finance department', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'shubhangi.g', role: 'Admin', department: 'finance' }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(403)
  })

  it('403 for Leadership (read-only on edits)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'ameet.z', role: 'Leadership', department: null }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(403)
  })

  it('200 for SalesRep (canEditMOU)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'vishwanath.g', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.draft.id).toBe('MOU-STEAM-2627-DRAFT-007')
    expect(saveDraftMouMock).toHaveBeenCalledTimes(1)
  })

  it('200 for cross-functional Admin (department null)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'anish.d', role: 'Admin', department: null }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3', programme: 'STEAM' }))
    expect(res.status).toBe(200)
  })

  it('400 on missing templateId', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest({ programme: 'STEAM' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing-template')
  })

  it('400 on missing programme', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest({ templateId: 'steam-v3' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing-programme')
  })

  it('400 on invalid JSON body', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const req = new Request('http://localhost/api/mou/save-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid-body')
  })

  it('Robotics draft flows through to entityWriters', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    saveDraftMouMock.mockResolvedValue({
      mou: { id: 'MOU-ROBO-2627-DRAFT-001' },
      commitSha: 'abc123',
    })
    const res = await POST(
      buildRequest({
        templateId: 'robotics-v3',
        programme: 'Robotics',
        schoolName: 'Test School',
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.draft.id).toBe('MOU-ROBO-2627-DRAFT-001')
    expect(saveDraftMouMock).toHaveBeenCalledWith(
      expect.objectContaining({ programme: 'Robotics' }),
    )
  })
})
