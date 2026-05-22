/*
 * Phase 6H regression: kit-details enqueue must spread the full existing
 * MOU into the payload, not send a partial { mouId, ... } shape.
 *
 * Pre-fix, the route enqueued `{ mouId, productSelection,
 * gradewiseDistribution, audit }` with no top-level `id`. The drain
 * handler at src/lib/sync/drainQueue.ts looks up records by
 * `payload.id`; missing id => entry silently skipped AND trimmed,
 * losing every form submission since Gate 3 Step 1. Allocation then
 * read `mou.productSelection === null` and rendered an empty SKU
 * dropdown.
 *
 * These tests assert:
 *   1. The enqueued payload has `id` and matches the existing MOU
 *      record byte-for-byte except for the three changed fields.
 *   2. When that payload is fed through drainQueue (the cron's per-
 *      tick application function), the outcome is drained (not
 *      skipped), and every existing MOU field is preserved on the
 *      resulting record.
 *   3. The downstream allocation read works against the saved MOU:
 *      eligibleSkusForMou returns a non-empty list when productSelection
 *      is set on the record.
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

vi.mock('@/data/mous.json', () => ({
  default: [
    {
      id: 'MOU-PHASE6H-TEST',
      schoolId: 'SCH-TEST',
      schoolName: 'Test School',
      programme: 'STEAM',
      programmeSubType: null,
      status: 'Active',
      cohortStatus: 'active',
      students: 200,
      totalAmount: 500000,
      effectiveDate: '2026-04-01',
      startDate: '2026-04-15',
      endDate: '2027-03-31',
      salesPersonId: 'sp-vikram',
      productSelection: null,
      gradewiseDistribution: null,
      auditLog: [
        {
          timestamp: '2026-04-01T00:00:00Z',
          user: 'system',
          action: 'create',
          before: null,
          after: { id: 'MOU-PHASE6H-TEST' },
          notes: 'seed for kits-details test',
        },
      ],
    },
  ],
}))

import { POST } from './route'
import { getCurrentUser } from '@/lib/auth/session'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { drainQueue, type DrainDeps } from '@/lib/sync/drainQueue'
import { eligibleSkusForMou } from '@/lib/kitDispatch/lookup'

const getUserMock = getCurrentUser as ReturnType<typeof vi.fn>
const enqueueMock = enqueueUpdate as ReturnType<typeof vi.fn>

function buildRequest(body: unknown): Request {
  return new Request(
    'http://localhost/api/mou/MOU-PHASE6H-TEST/kits-details',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

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

// Mock drainer state: in-memory files keyed by path. Mirrors the
// pattern used by src/lib/sync/drainQueue.test.ts.
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

describe('POST /api/mou/[mouId]/kits-details (Phase 6H fix)', () => {
  it('returns 200 ok on a valid save', async () => {
    const res = await POST(
      buildRequest({
        productSelection: 'TinkRworks',
        gradewiseDistribution: [
          { grade: 6, students: 100, kitType: 'Reusable' },
          { grade: 7, students: 100, kitType: 'Reusable' },
        ],
      }),
      ctx,
    )
    expect(res.status).toBe(200)
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })

  it('enqueued payload carries top-level id matching the existing MOU (was the bug: payload had mouId not id)', async () => {
    await POST(
      buildRequest({
        productSelection: 'TinkRworks',
        gradewiseDistribution: null,
      }),
      ctx,
    )
    const call = enqueueMock.mock.calls[0]![0] as {
      entity: string
      operation: string
      payload: Record<string, unknown>
    }
    expect(call.entity).toBe('mou')
    expect(call.operation).toBe('update')
    expect(call.payload.id).toBe('MOU-PHASE6H-TEST')
    // Pre-Phase-6H this was `mouId`, which the drain handler did not
    // recognise. The fix replaces the partial shape with a full MOU
    // spread, so `mouId` must NOT be a top-level key on the payload.
    expect('mouId' in call.payload).toBe(false)
  })

  it('enqueued payload preserves every existing MOU field (schoolId, students, totalAmount, etc.)', async () => {
    await POST(
      buildRequest({
        productSelection: 'Cretile',
        gradewiseDistribution: null,
      }),
      ctx,
    )
    const payload = enqueueMock.mock.calls[0]![0].payload as Record<string, unknown>
    expect(payload.schoolId).toBe('SCH-TEST')
    expect(payload.schoolName).toBe('Test School')
    expect(payload.programme).toBe('STEAM')
    expect(payload.students).toBe(200)
    expect(payload.totalAmount).toBe(500000)
    expect(payload.salesPersonId).toBe('sp-vikram')
    expect(payload.endDate).toBe('2027-03-31')
  })

  it('enqueued payload sets the new productSelection + gradewiseDistribution and appends to auditLog', async () => {
    await POST(
      buildRequest({
        productSelection: 'Both',
        gradewiseDistribution: [
          { grade: 5, students: 50, kitType: 'Reusable' },
        ],
      }),
      ctx,
    )
    const payload = enqueueMock.mock.calls[0]![0].payload as {
      productSelection: string
      gradewiseDistribution: Array<{ grade: number; students: number; kitType: string }>
      auditLog: Array<{ action: string; notes: string }>
    }
    expect(payload.productSelection).toBe('Both')
    expect(payload.gradewiseDistribution).toEqual([
      { grade: 5, students: 50, kitType: 'Reusable' },
    ])
    // Audit appended to the existing list; the seeded 'create' entry
    // must still be present.
    expect(payload.auditLog.length).toBe(2)
    expect(payload.auditLog[0]!.action).toBe('create')
    expect(payload.auditLog[1]!.action).toBe('update')
    expect(payload.auditLog[1]!.notes).toBe('kits-details edit')
  })

  it('drain end-to-end: the enqueued payload lands in mous.json with every field preserved + new fields applied', async () => {
    await POST(
      buildRequest({
        productSelection: 'TinkRworks',
        gradewiseDistribution: [
          { grade: 8, students: 75, kitType: 'Consumable' },
        ],
      }),
      ctx,
    )
    const payload = enqueueMock.mock.calls[0]![0].payload as Record<string, unknown>
    // Replay through drainQueue with a mock state that mirrors a real
    // mous.json with the existing record present.
    const existingMou = {
      id: 'MOU-PHASE6H-TEST',
      schoolId: 'SCH-TEST',
      schoolName: 'Test School',
      students: 200,
      totalAmount: 500000,
    }
    const state: MockState = { files: new Map(), health: [] }
    state.files.set('src/data/mous.json', [existingMou])
    const pendingEntry: PendingUpdate = {
      id: 'pu-test',
      queuedAt: '2026-05-22T00:00:00.000Z',
      queuedBy: 'anish.d',
      retryCount: 0,
      entity: 'mou',
      operation: 'update',
      payload,
    }
    state.files.set('src/data/pending_updates.json', [pendingEntry])
    const deps = makeDrainDeps(state)

    const result = await drainQueue({ triggeredBy: 'phase-6h-test' }, deps)

    // The entry was drained (not skipped) and trimmed from pending.
    expect(result.drainedCount).toBe(1)
    expect(result.remainingCount).toBe(0)
    expect(result.perEntity.find((p) => p.entity === 'mou')?.skipped).toBe(0)

    const mous = state.files.get('src/data/mous.json') as Array<Record<string, unknown>>
    const drained = mous.find((m) => m.id === 'MOU-PHASE6H-TEST')!
    expect(drained.productSelection).toBe('TinkRworks')
    expect(Array.isArray(drained.gradewiseDistribution)).toBe(true)
    // Every field from the payload survives the replace-by-id (the
    // catastrophic-replace scenario the spread pattern prevents).
    expect(drained.schoolName).toBe('Test School')
    expect(drained.students).toBe(200)
    expect(drained.totalAmount).toBe(500000)
  })

  it('downstream allocation read: eligibleSkusForMou returns non-empty for a saved TinkRworks productSelection', async () => {
    await POST(
      buildRequest({
        productSelection: 'TinkRworks',
        gradewiseDistribution: null,
      }),
      ctx,
    )
    const payload = enqueueMock.mock.calls[0]![0].payload as {
      productSelection: 'TinkRworks' | 'Cretile' | 'Both' | null
    }
    const inventory = [
      { active: true, category: 'TinkRworks', skuName: 'Tinkrpython' },
      { active: true, category: 'Cretile', skuName: 'Cretile-G5' },
      { active: false, category: 'TinkRworks', skuName: 'Tinkr-sunset' },
    ]
    const eligible = eligibleSkusForMou({
      inventory,
      productSelection: payload.productSelection,
    })
    // One active TinkRworks SKU survives the filter; the Cretile + the
    // inactive TinkRworks are excluded.
    expect(eligible).toHaveLength(1)
    expect(eligible[0]?.skuName).toBe('Tinkrpython')
  })

  it('rejects unauthenticated request with 401', async () => {
    getUserMock.mockResolvedValue(null)
    const res = await POST(
      buildRequest({ productSelection: 'TinkRworks', gradewiseDistribution: null }),
      ctx,
    )
    expect(res.status).toBe(401)
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid product value with 400', async () => {
    const res = await POST(
      buildRequest({ productSelection: 'Hardware', gradewiseDistribution: null }),
      ctx,
    )
    expect(res.status).toBe(400)
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('rejects an unknown mouId with 404', async () => {
    const res = await POST(
      buildRequest({ productSelection: 'TinkRworks', gradewiseDistribution: null }),
      { params: Promise.resolve({ mouId: 'MOU-DOES-NOT-EXIST' }) },
    )
    expect(res.status).toBe(404)
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
