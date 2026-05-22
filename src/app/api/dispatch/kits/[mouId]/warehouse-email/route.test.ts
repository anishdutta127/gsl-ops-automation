/*
 * Phase 6H regression: warehouse-email enqueue must pass the full
 * KitDispatch record directly, not wrap it under a `.record` field.
 *
 * Pre-fix, the route enqueued `{ id, mouId, record: nextRecord }`.
 * The drain handler finds the record by `payload.id` (present, OK)
 * and then does `next[idx] = payload`, replacing the kitDispatch row
 * with the wrapper, nesting the real data under `.record` and
 * wiping every top-level field (status, lineItems, dispatchSummary
 * at top level, auditLog).
 *
 * This route had never fired in production because the upstream
 * kit-details bug blocked allocations. Fixing both at once
 * (per Phase 6H scope) prevents the corruption from manifesting on
 * first use.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(),
}))

vi.mock('@/data/kit_dispatches.json', () => ({
  default: [
    {
      id: 'KD-PHASE6H-TEST',
      mouId: 'MOU-PHASE6H-TEST',
      schoolId: 'SCH-TEST',
      schoolName: 'Test School',
      status: 'Allocated',
      lineItems: [
        {
          skuName: 'Tinkrpython',
          inventoryItemId: 'INV-TINKRPYTHON',
          quantity: 100,
          productName: 'Tinkrpython',
        },
      ],
      dispatchSummary: {
        warehouseEmailLoggedAt: null,
        deliveryChallanPath: null,
      },
      auditLog: [
        {
          timestamp: '2026-05-01T00:00:00Z',
          user: 'system',
          action: 'create',
          before: null,
          after: { id: 'KD-PHASE6H-TEST' },
          notes: 'seed for warehouse-email test',
        },
      ],
    },
  ],
}))

import { POST } from './route'
import { getCurrentUser } from '@/lib/auth/session'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { drainQueue, type DrainDeps } from '@/lib/sync/drainQueue'

const getUserMock = getCurrentUser as ReturnType<typeof vi.fn>
const enqueueMock = enqueueUpdate as ReturnType<typeof vi.fn>

const ctx = { params: Promise.resolve({ mouId: 'MOU-PHASE6H-TEST' }) }

beforeEach(() => {
  vi.clearAllMocks()
  getUserMock.mockResolvedValue({
    id: 'anish.d',
    name: 'Anish',
    email: 'a@x.test',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  })
  enqueueMock.mockResolvedValue({ id: 'pu-1' })
})

interface MockState {
  files: Map<string, unknown>
  health: SyncHealthEntry[]
}

function makeDrainDeps(state: MockState): DrainDeps {
  return {
    read: async <T>(path: string): Promise<T | null> => {
      return (state.files.get(path) as T) ?? null
    },
    atomicUpdate: (async <T>(
      path: string,
      mutate: (current: T) => { next: T; commitMessage: string },
      options: { defaultValue: T; maxRetries?: number },
    ) => {
      const current = (state.files.get(path) as T) ?? options.defaultValue
      const { next } = mutate(current)
      state.files.set(path, next)
      return { next, commitSha: 'sha-mock' }
    }) as DrainDeps['atomicUpdate'],
    appendHealth: async (entry: SyncHealthEntry) => {
      state.health.push(entry)
      return state.health
    },
    now: () => new Date('2026-05-22T00:00:00.000Z'),
  }
}

describe('POST /api/dispatch/kits/[mouId]/warehouse-email (Phase 6H fix)', () => {
  it('returns 200 ok on a valid log', async () => {
    const res = await POST(new Request('http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/warehouse-email', { method: 'POST' }), ctx)
    expect(res.status).toBe(200)
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })

  it('enqueued payload IS the KitDispatch record (no .record wrapper, was the bug)', async () => {
    await POST(new Request('http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/warehouse-email', { method: 'POST' }), ctx)
    const call = enqueueMock.mock.calls[0]![0] as {
      entity: string
      payload: Record<string, unknown>
    }
    expect(call.entity).toBe('kitDispatch')
    expect(call.payload.id).toBe('KD-PHASE6H-TEST')
    expect(call.payload.status).toBe('Allocated')
    expect(Array.isArray(call.payload.lineItems)).toBe(true)
    // Pre-Phase-6H the payload was `{ id, mouId, record: { ... } }`;
    // the `.record` key MUST NOT exist on the new shape because the
    // drain's replace-by-id would otherwise nest everything inside it.
    expect('record' in call.payload).toBe(false)
  })

  it('enqueued payload appends the warehouse-email audit entry to the existing auditLog', async () => {
    await POST(new Request('http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/warehouse-email', { method: 'POST' }), ctx)
    const payload = enqueueMock.mock.calls[0]![0].payload as {
      auditLog: Array<{ action: string; notes: string }>
      dispatchSummary: { warehouseEmailLoggedAt: string | null }
    }
    expect(payload.auditLog.length).toBe(2)
    expect(payload.auditLog[0]!.action).toBe('create')
    expect(payload.auditLog[1]!.notes).toContain('warehouse-email-intent')
    expect(payload.dispatchSummary.warehouseEmailLoggedAt).not.toBeNull()
  })

  it('drain end-to-end: the kitDispatch record is replaced cleanly (no .record nesting, all top-level fields preserved)', async () => {
    await POST(new Request('http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/warehouse-email', { method: 'POST' }), ctx)
    const payload = enqueueMock.mock.calls[0]![0].payload as Record<string, unknown>
    const existingKitDispatch = {
      id: 'KD-PHASE6H-TEST',
      mouId: 'MOU-PHASE6H-TEST',
      status: 'Allocated',
      lineItems: [],
    }
    const state: MockState = { files: new Map(), health: [] }
    state.files.set('src/data/kit_dispatches.json', [existingKitDispatch])
    const pendingEntry: PendingUpdate = {
      id: 'pu-wh-test',
      queuedAt: '2026-05-22T00:00:00.000Z',
      queuedBy: 'anish.d',
      retryCount: 0,
      entity: 'kitDispatch',
      operation: 'update',
      payload,
    }
    state.files.set('src/data/pending_updates.json', [pendingEntry])
    const deps = makeDrainDeps(state)

    const result = await drainQueue({ triggeredBy: 'phase-6h-test' }, deps)

    expect(result.drainedCount).toBe(1)
    expect(result.perEntity.find((p) => p.entity === 'kitDispatch')?.skipped).toBe(0)

    const kds = state.files.get('src/data/kit_dispatches.json') as Array<Record<string, unknown>>
    const drained = kds.find((k) => k.id === 'KD-PHASE6H-TEST')!
    expect(drained.status).toBe('Allocated')
    expect(Array.isArray(drained.lineItems)).toBe(true)
    expect((drained.dispatchSummary as { warehouseEmailLoggedAt: string | null }).warehouseEmailLoggedAt).not.toBeNull()
    // The bug class: `.record` nesting would mean drained.record exists
    // and the real fields are under it. The fixed shape has the fields
    // at the top level.
    expect('record' in drained).toBe(false)
  })

  it('rejects unauthenticated request with 401', async () => {
    getUserMock.mockResolvedValue(null)
    const res = await POST(new Request('http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/warehouse-email', { method: 'POST' }), ctx)
    expect(res.status).toBe(401)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
