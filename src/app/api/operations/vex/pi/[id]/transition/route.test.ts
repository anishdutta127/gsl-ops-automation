/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the VEX PI transition route enqueues a payload with the
 * VexPi.id at the top level (not nested under `vexPiId`). The drain
 * `applyOneToList` keys off `payload.id`; if the payload wraps the
 * record inside `{ vexPiId, status, audit }`, `payload.id` is
 * undefined and the drain silently skips the entry. The pre-fix code
 * shipped the wrapped shape; Misba's "data not showing after 5
 * minutes" report traced back to this drop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import type { VexPi } from '@/lib/mouSystem/types'
import vexPisJson from '@/data/vex_pis.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

const samplePi = (vexPisJson as unknown as VexPi[])[0]!

const ADMIN_USER: User = {
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

describe('POST /api/operations/vex/pi/[id]/transition (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function callRoute(piId: string, nextStatus: string): Promise<Response> {
    const { POST } = await import('./route')
    return POST(
      new Request(`http://localhost/api/operations/vex/pi/${piId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      }),
      { params: Promise.resolve({ id: piId }) },
    )
  }

  it('enqueues a payload carrying VexPi.id at the top level (not wrapped)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN_USER)

    const targetStatus = samplePi.status === 'Completed' ? 'Generated' : 'Completed'
    const res = await callRoute(samplePi.id, targetStatus)
    expect(res.status).toBe(200)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.entity).toBe('vexPi')
    expect(call.operation).toBe('update')
    // The bug we're guarding against: payload was previously
    // { vexPiId, status, audit } which left payload.id undefined.
    expect(call.payload).toBeDefined()
    expect(call.payload.id).toBe(samplePi.id)
    expect(call.payload.status).toBe(targetStatus)
    expect(Array.isArray(call.payload.auditLog)).toBe(true)
    expect(call.payload.auditLog.at(-1)?.action).toBe('status_change')
  })
})
