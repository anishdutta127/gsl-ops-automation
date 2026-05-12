/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the agreement edit route enqueues a payload with the
 * Agreement.id at the top level (not nested under `agreementId`).
 * The drain keys off `payload.id`; the pre-fix wrapper
 * `{ agreementId, agreement, audit }` left `payload.id` undefined and
 * the drain silently skipped the entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agreement, User } from '@/lib/types'
import agreementsJson from '@/data/agreements.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

const sampleAgreement = (agreementsJson as unknown as Agreement[])[0]!

const FINANCE_USER: User = {
  id: 'anish.d',
  name: 'Anish D.',
  email: 'anish.d@getsetlearn.info',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: '',
  createdAt: '2026-01-01T00:00:00Z',
  auditLog: [],
}

describe('POST /api/operations/agreements/[id]/edit (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a payload carrying Agreement.id at the top level (not wrapped)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/operations/agreements/${sampleAgreement.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...sampleAgreement,
          partyName: sampleAgreement.partyName + ' Updated',
        }),
      }),
      { params: Promise.resolve({ id: sampleAgreement.id }) },
    )
    expect(res.status).toBe(200)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.entity).toBe('agreement')
    expect(call.operation).toBe('update')
    expect(call.payload.id).toBe(sampleAgreement.id)
    expect(call.payload.partyName).toBe(sampleAgreement.partyName + ' Updated')
    expect(Array.isArray(call.payload.auditLog)).toBe(true)
    expect(call.payload.auditLog.at(-1)?.action).toBe('update')
  })
})
