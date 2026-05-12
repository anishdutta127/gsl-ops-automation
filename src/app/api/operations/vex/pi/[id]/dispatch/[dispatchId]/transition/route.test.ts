/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the VEX dispatch transition route enqueues a payload with
 * the VexDispatch.id at the top level (not nested under
 * `vexDispatchId`). The pre-fix wrapper left payload.id undefined and
 * the drain silently skipped the entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import type { VexDispatch } from '@/lib/mouSystem/types'
import vexDispatchesJson from '@/data/vex_dispatches.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

const sampleDispatch = (vexDispatchesJson as unknown as VexDispatch[])[0]!

const OPS_USER: User = {
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

describe('POST /api/operations/vex/pi/[id]/dispatch/[dispatchId]/transition (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a payload carrying VexDispatch.id at the top level', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)

    // Forward transitions only; pick the next status after current.
    const STATUS_ORDER = [
      'Requested',
      'Request Raised to Warehouse',
      'Invoiced',
      'Shipped',
    ] as const
    const currentIdx = STATUS_ORDER.indexOf(sampleDispatch.status as (typeof STATUS_ORDER)[number])
    const next = STATUS_ORDER[currentIdx + 1]
    if (!next) {
      // Already terminal; nothing to transition to. Pass trivially.
      return
    }

    const { POST } = await import('./route')
    const res = await POST(
      new Request(
        `http://localhost/api/operations/vex/pi/${sampleDispatch.piId}/dispatch/${sampleDispatch.id}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status: next }),
        },
      ),
      {
        params: Promise.resolve({
          id: sampleDispatch.piId,
          dispatchId: sampleDispatch.id,
        }),
      },
    )
    expect(res.status).toBe(200)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.entity).toBe('vexDispatch')
    expect(call.operation).toBe('update')
    expect(call.payload.id).toBe(sampleDispatch.id)
    expect(call.payload.status).toBe(next)
    expect(Array.isArray(call.payload.auditLog)).toBe(true)
    expect(call.payload.auditLog.at(-1)?.action).toBe('status_change')
  })
})
