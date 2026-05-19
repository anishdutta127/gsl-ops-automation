/*
 * Gate 2 Step 5 verification: POST /api/mou/signed-values/save.
 *
 * Confirms V4 + V6:
 *   - canEditMOU gate (Sales + cross-functional Admin).
 *   - Validation of required fields.
 *   - 303 redirect to /mous/[id]/signed-values?notice=saved on success.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const upsertMock = vi.fn()
const getCurrentUserMock = vi.fn()

// Strict-gate tests: force production-mode so canEditMOU enforces
// Sales-only. Testing-open default opens EDIT for every active user.
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
  upsertSignedValues: (...args: unknown[]) => upsertMock(...args),
}))

import { POST } from './route'
import type { User } from '@/lib/types'

function user(args: { role: User['role']; department: User['department']; id?: string }): User {
  return {
    id: args.id ?? 'u-test',
    name: args.id ?? 'Test User',
    email: `${args.id ?? 'test'}@example.test`,
    role: args.role,
    department: args.department,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  }
}

function buildRequest(form: Record<string, string>): Request {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(form)) params.set(k, v)
  return new Request('http://localhost/api/mou/signed-values/save', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertMock.mockResolvedValue(undefined)
})

const VALID_FORM = {
  mouId: 'MOU-STEAM-2627-001',
  pricePerStudent: '5000',
  studentCount: '200',
  duration: '1 year',
  signedDate: '2026-04-15',
  signedScanUrl: 'https://drive.google.com/file/d/abc',
  notes: 'Captured by Pratik',
}

describe('POST /api/mou/signed-values/save', () => {
  it('redirects to login when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const res = await POST(buildRequest(VALID_FORM))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain(
      'next=%2Fmous%2FMOU-STEAM-2627-001%2Fsigned-values',
    )
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('redirects with error=permission for Ops (canEditMOU false)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'misba.m', role: 'Admin', department: 'ops' }),
    )
    const res = await POST(buildRequest(VALID_FORM))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=permission')
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('redirects with error=permission for Finance', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'shubhangi.g', role: 'Admin', department: 'finance' }),
    )
    const res = await POST(buildRequest(VALID_FORM))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=permission')
  })

  it('succeeds for SalesRep', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest(VALID_FORM))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      'http://localhost/mous/MOU-STEAM-2627-001/signed-values?notice=saved',
    )
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(upsertMock).toHaveBeenCalledWith(
      'pratik.d',
      'MOU-STEAM-2627-001',
      expect.objectContaining({
        pricePerStudent: 5000,
        studentCount: 200,
        duration: '1 year',
        signedDate: '2026-04-15',
      }),
    )
  })

  it('succeeds for cross-functional Admin (department null)', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'anish.d', role: 'Admin', department: null }),
    )
    const res = await POST(buildRequest(VALID_FORM))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('notice=saved')
  })

  it('rejects invalid pricePerStudent', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(
      buildRequest({ ...VALID_FORM, pricePerStudent: '0' }),
    )
    expect(res.headers.get('location')).toContain('error=invalid-price')
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('rejects invalid studentCount', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(
      buildRequest({ ...VALID_FORM, studentCount: 'abc' }),
    )
    expect(res.headers.get('location')).toContain('error=invalid-students')
  })

  it('rejects missing duration', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest({ ...VALID_FORM, duration: '' }))
    expect(res.headers.get('location')).toContain('error=missing-duration')
  })

  it('rejects missing signedDate', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    const res = await POST(buildRequest({ ...VALID_FORM, signedDate: '' }))
    expect(res.headers.get('location')).toContain('error=missing-date')
  })

  it('normalises empty signedScanUrl + notes to null', async () => {
    getCurrentUserMock.mockResolvedValue(
      user({ id: 'pratik.d', role: 'Admin', department: 'sales' }),
    )
    await POST(
      buildRequest({ ...VALID_FORM, signedScanUrl: '', notes: '' }),
    )
    expect(upsertMock).toHaveBeenCalledWith(
      'pratik.d',
      'MOU-STEAM-2627-001',
      expect.objectContaining({ signedScanUrl: null, notes: null }),
    )
  })
})
