import { describe, expect, it, vi } from 'vitest'
import {
  rejectImportReview,
  type RejectImportReviewDeps,
} from './rejectImportReview'
import type {
  MouImportReviewItem,
  PendingUpdate,
  User,
} from '@/lib/types'

const FIXED_TS = '2026-04-26T10:00:00.000Z'

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

function item(overrides: Partial<MouImportReviewItem> = {}): MouImportReviewItem {
  return {
    queuedAt: '2026-04-22T13:45:00Z',
    rawRecord: { id: 'MOU-VEX-2627-XX1', schoolName: 'X', programme: 'VEX' },
    validationFailed: 'tax_inversion',
    quarantineReason: 'tax-inverted pricing',
    candidates: null,
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    rejectionReason: null,
    rejectionNotes: null,
    ...overrides,
  }
}

function makeDeps(opts: {
  items: MouImportReviewItem[]
  users: User[]
}): { deps: RejectImportReviewDeps; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  const enqueue = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(params)
    const stub: PendingUpdate = {
      id: 'p', queuedAt: FIXED_TS, queuedBy: String(params.queuedBy),
      entity: params.entity as PendingUpdate['entity'],
      operation: params.operation as PendingUpdate['operation'],
      payload: params.payload as Record<string, unknown>, retryCount: 0,
    }
    return stub
  })
  return {
    deps: {
      items: opts.items, users: opts.users,
      enqueue: enqueue as unknown as RejectImportReviewDeps['enqueue'],
      now: () => new Date(FIXED_TS),
    },
    calls,
  }
}

describe('rejectImportReview', () => {
  it('happy path: OpsHead rejects with data-quality-issue, item updated, queue enqueued', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps, calls } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'data-quality-issue',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.resolution).toBe('rejected')
    expect(result.item.resolvedBy).toBe('misba.m')
    expect(result.item.resolvedAt).toBe(FIXED_TS)
    expect(result.item.rejectionReason).toBe('data-quality-issue')
    expect(result.item.rejectionNotes).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ entity: 'mouImportReview', operation: 'update' })
  })

  it('Admin can reject (wildcard)', async () => {
    const u = user('Admin', 'anish.d')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'duplicate-of-existing',
        rejectedBy: 'anish.d',
      },
      deps,
    )
    expect(result.ok).toBe(true)
  })

  it('SalesHead is REJECTED (mou-import-review:resolve not granted)', async () => {
    const u = user('SalesHead', 'pratik.d')
    const i = item()
    const { deps, calls } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'data-quality-issue',
        rejectedBy: 'pratik.d',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'permission' })
    expect(calls).toHaveLength(0)
  })

  it('rejects unknown user', async () => {
    const { deps } = makeDeps({ items: [item()], users: [] })
    const result = await rejectImportReview(
      {
        queuedAt: '2026-04-22T13:45:00Z',
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'data-quality-issue',
        rejectedBy: 'ghost',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects item-not-found (queuedAt + rawRecordId tuple does not match)', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-NOPE',
        rejectionReason: 'data-quality-issue',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'item-not-found' })
  })

  it('rejects already-resolved (item already imported or rejected)', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item({ resolution: 'imported', resolvedAt: FIXED_TS, resolvedBy: 'anish.d' })
    const { deps, calls } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'data-quality-issue',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'already-resolved' })
    expect(calls).toHaveLength(0)
  })

  it('rejects "other" reason without notes', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'other',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'notes-required' })
  })

  it('accepts "other" reason with notes', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'other',
        rejectionNotes: 'School being decommissioned next AY; do not import',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.rejectionNotes).toContain('decommissioned')
  })

  it('rejects whitespace-only notes when reason is "other"', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'other',
        rejectionNotes: '   ',
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'notes-required' })
  })

  it('rejects invalid-rejection-reason', async () => {
    const u = user('OpsHead', 'misba.m')
    const i = item()
    const { deps } = makeDeps({ items: [i], users: [u] })
    const result = await rejectImportReview(
      {
        queuedAt: i.queuedAt,
        rawRecordId: 'MOU-VEX-2627-XX1',
        rejectionReason: 'made-up-category' as never,
        rejectedBy: 'misba.m',
      },
      deps,
    )
    expect(result).toEqual({ ok: false, reason: 'invalid-rejection-reason' })
  })
})
