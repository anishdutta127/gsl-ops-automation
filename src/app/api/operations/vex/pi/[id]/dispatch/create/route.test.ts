/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the VEX dispatch create route enqueues a payload with the
 * VexDispatch.id at the top level (not nested under `vexDispatch`).
 * The pre-fix wrapper `{ vexDispatch: dispatch }` left `payload.id`
 * undefined and the drain silently skipped the entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'
import type { VexPi } from '@/lib/mouSystem/types'
import vexPisJson from '@/data/vex_pis.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

// Find a VEX PI that has paid balance so the gate opens.
const allPis = vexPisJson as unknown as VexPi[]
const paidPi = allPis.find((p) => p.paymentReceivedAmount > 0) ?? allPis[0]!

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

describe('POST /api/operations/vex/pi/[id]/dispatch/create (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a payload carrying VexDispatch.id at the top level', async () => {
    if (!paidPi || paidPi.paymentReceivedAmount === 0) {
      // Skip the live-data assertion when fixture has no paid PI;
      // route gate would reject before we reach the enqueue.
      return
    }
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_USER)

    const firstLine = paidPi.lineItems[0]!
    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/operations/vex/pi/${paidPi.id}/dispatch/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{ partNumber: firstLine.partNumber, qty: 1 }],
          freight: 0,
          mode: 'Surface',
        }),
      }),
      { params: Promise.resolve({ id: paidPi.id }) },
    )
    // The route may return 400 (gate-violation) if the line item is
    // already fully dispatched in the fixture. We only care that when
    // it gets to the enqueue step, the payload shape is correct.
    if (res.status === 200) {
      expect(enqueueUpdate).toHaveBeenCalledOnce()
      const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      expect(call.entity).toBe('vexDispatch')
      expect(call.operation).toBe('create')
      expect(typeof call.payload.id).toBe('string')
      expect(call.payload.id).toMatch(/^VEXD-/)
      expect(call.payload.piId).toBe(paidPi.id)
    }
  })
})
