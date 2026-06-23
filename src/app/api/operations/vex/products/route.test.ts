/**
 * @vitest-environment node
 */

/*
 * E2E walk (gate-sku-fix, 2026-06-22): the New VEX product create route,
 * end to end at the HTTP layer with a real form submission.
 *
 * Proves the success path: permission gate passes, validation passes, the
 * duplicate check runs against the real vex_products fixture, the create is
 * dispatched with operation:'create' (the operation that previously threw
 * inside dispatchToRepo and fell back to the unread JSON queue), and the
 * route returns the 303 success redirect (not an ?error= redirect).
 *
 * node environment: the route reads request.formData(); jsdom's FormData is
 * not undici's and yields 'invalid-form' (repo learning, pranav-refresh).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/types'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

const OPS_ADMIN: User = {
  id: 'misba.k',
  name: 'Misba K.',
  email: 'misba.k@getsetlearn.info',
  role: 'Admin',
  department: null,
  testingOverride: false,
  active: true,
  passwordHash: '',
  createdAt: '2026-01-01T00:00:00Z',
  auditLog: [],
}

const SAVED_OPEN = process.env.TESTING_OPEN_ACCESS

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TESTING_OPEN_ACCESS = 'true'
})
afterEach(() => {
  vi.restoreAllMocks()
  if (SAVED_OPEN === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = SAVED_OPEN
})

function formRequest(fields: Record<string, string>): Request {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return new Request('http://localhost/api/operations/vex/products', {
    method: 'POST',
    body: fd,
  })
}

describe('POST /api/operations/vex/products (create)', () => {
  it('dispatches a vexProduct create and 303-redirects to the SKU master', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_ADMIN)

    const { POST } = await import('./route')
    const res = await POST(
      formRequest({
        partNumber: '999-TESTNEW',
        name: 'E2E Test SKU',
        defaultUnitPrice: '4500',
        active: 'true',
      }),
    )

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      'http://localhost/operations/vex?product-created=999-TESTNEW',
    )

    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.entity).toBe('vexProduct')
    // The operation that the postgres dispatch must now handle.
    expect(call.operation).toBe('create')
    expect(call.payload).toMatchObject({
      partNumber: '999-TESTNEW',
      name: 'E2E Test SKU',
      defaultUnitPrice: 4500,
      active: true,
    })
  })

  it('rejects a duplicate part number with a clear error redirect (no dispatch)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    const vexProductsJson = (await import('@/data/vex_products.json')).default as Array<{ partNumber: string }>
    const existingPart = vexProductsJson[0]!.partNumber
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(OPS_ADMIN)

    const { POST } = await import('./route')
    const res = await POST(
      formRequest({ partNumber: existingPart, name: 'Dup', active: 'true' }),
    )

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=duplicate-part-number')
    expect(enqueueUpdate).not.toHaveBeenCalled()
  })
})
