/*
 * Gate 5A.5 persistence regression test.
 *
 * Pins that the vendor edit route enqueues a payload with the
 * Vendor.id at the top level (not nested under `vendorId`). The
 * drain keys off `payload.id`; the pre-fix wrapper
 * `{ vendorId, vendor, audit }` left `payload.id` undefined and the
 * drain silently skipped the entry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User, Vendor } from '@/lib/types'
import vendorsJson from '@/data/vendors.json'

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/pendingUpdates', () => ({ enqueueUpdate: vi.fn() }))

// Synthesise a vendor if the fixture is empty (the production fixture
// is empty in Phase 1 because vendor create is deferred to Phase 1.1
// per Gate 5A.5 audit B8). Inject one row at the module level so the
// route's `allVendors.find` resolves it.
const baseVendor: Vendor = {
  id: 'VEN-TEST-001',
  name: 'Test Vendor Logistics',
  legalEntity: 'Test Logistics Pvt Ltd',
  category: 'Logistics',
  primaryContact: 'Test Contact',
  primaryEmail: 'test@vendor.example',
  primaryPhone: '+91 9999999999',
  address: 'Test address',
  pan: null,
  gstNumber: null,
  bankAccount: null,
  ifsc: null,
  notes: null,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  auditLog: [],
}
const vendors = vendorsJson as unknown as Vendor[]
if (vendors.length === 0) {
  // Push into the shared array the route module imports so it can find
  // the test vendor at id-lookup time.
  ;(vendors as Vendor[]).push(baseVendor)
}
const sampleVendor = vendors[0]!

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

describe('POST /api/operations/vendors/[id]/edit (Gate 5A.5 persistence fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues a payload carrying Vendor.id at the top level (not wrapped)', async () => {
    const { getCurrentUser } = await import('@/lib/auth/session')
    const { enqueueUpdate } = await import('@/lib/pendingUpdates')
    ;(getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(FINANCE_USER)

    const { POST } = await import('./route')
    const res = await POST(
      new Request(`http://localhost/api/operations/vendors/${sampleVendor.id}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...sampleVendor,
          name: sampleVendor.name + ' Updated',
        }),
      }),
      { params: Promise.resolve({ id: sampleVendor.id }) },
    )
    expect(res.status).toBe(200)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    const call = (enqueueUpdate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.entity).toBe('vendor')
    expect(call.operation).toBe('update')
    // Guard against the regression: payload was previously
    // { vendorId, vendor, audit } -> payload.id undefined -> drain skip.
    expect(call.payload.id).toBe(sampleVendor.id)
    expect(call.payload.name).toBe(sampleVendor.name + ' Updated')
    expect(Array.isArray(call.payload.auditLog)).toBe(true)
    expect(call.payload.auditLog.at(-1)?.action).toBe('update')
  })
})
