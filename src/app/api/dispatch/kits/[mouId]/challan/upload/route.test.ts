/*
 * Phase 6H regression: challan-upload enqueue must pass the full
 * KitDispatch record directly, not wrap it under a `.record` field.
 *
 * Same bug class as the warehouse-email route. See
 * src/app/api/dispatch/kits/[mouId]/warehouse-email/route.test.ts
 * for the full rationale.
 */

import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { PendingUpdate } from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/pendingUpdates', () => ({
  enqueueUpdate: vi.fn(),
}))

// The route writes the PDF to public/delivery-challans/<id>.pdf via
// node:fs/promises. vi.mock of `node:fs` does not reliably reach the
// route's `import { promises as fs } from 'node:fs'` destructuring on
// this rig, so we clean up the artefact in afterAll instead of trying
// to silence the IO. The mock here is left as a hint for future
// refactors that pull the IO behind a deps boundary.

vi.mock('@/data/kit_dispatches.json', () => ({
  default: [
    {
      id: 'KD-PHASE6H-CHALLAN',
      mouId: 'MOU-PHASE6H-TEST',
      schoolId: 'SCH-TEST',
      schoolName: 'Test School',
      status: 'Shipped',
      lineItems: [
        {
          skuName: 'Tinkrpython',
          inventoryItemId: 'INV-TINKRPYTHON',
          quantity: 100,
          productName: 'Tinkrpython',
        },
      ],
      dispatchSummary: {
        warehouseEmailLoggedAt: '2026-05-21T10:00:00Z',
        deliveryChallanPath: null,
      },
      auditLog: [
        {
          timestamp: '2026-05-01T00:00:00Z',
          user: 'system',
          action: 'create',
          before: null,
          after: { id: 'KD-PHASE6H-CHALLAN' },
          notes: 'seed for challan-upload test',
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

// Node 24 + undici's request.formData() is unreliable on this test
// rig, AND the File class shipped by some Node + jsdom environments
// lacks arrayBuffer on the instance. We stub formData() directly on
// the Request and hand it a File-shaped object that the route's
// `file instanceof File` check accepts (we extend the real File so
// the instanceof passes) and whose arrayBuffer() resolves.
class TestFile extends File {
  private readonly _bytes: Uint8Array
  constructor(body: string, name: string, type: string) {
    super([body], name, { type })
    this._bytes = new TextEncoder().encode(body)
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(this._bytes.buffer.slice(this._bytes.byteOffset, this._bytes.byteOffset + this._bytes.byteLength) as ArrayBuffer)
  }
}

function buildRequestWithFile(filename: string, mime: string, body: string): Request {
  const file = new TestFile(body, filename, mime)
  const fakeFormData = {
    get: (name: string) => (name === 'file' ? file : null),
  } as unknown as FormData
  const req = new Request(
    'http://localhost/api/dispatch/kits/MOU-PHASE6H-TEST/challan/upload',
    { method: 'POST', body: 'unused' },
  )
  Object.defineProperty(req, 'formData', {
    value: () => Promise.resolve(fakeFormData),
    writable: false,
  })
  return req
}

function buildRequestWithPdf(): Request {
  return buildRequestWithFile('challan.pdf', 'application/pdf', '%PDF-1.4')
}

function buildRequestWithPng(): Request {
  return buildRequestWithFile('note.png', 'image/png', 'hello')
}

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

// Clean up the on-disk PDF artefact this test creates. node:fs's mock
// did not reach the route's destructured promises import, so the
// happy-path test writes a real (4-byte) file. Remove it after the
// suite finishes so the working tree stays clean.
afterAll(() => {
  const artefact = join(process.cwd(), 'public', 'delivery-challans', 'KD-PHASE6H-CHALLAN.pdf')
  if (existsSync(artefact)) rmSync(artefact, { force: true })
})

describe('POST /api/dispatch/kits/[mouId]/challan/upload (Phase 6H fix)', () => {
  it('returns 200 ok on a valid PDF upload', async () => {
    const res = await POST(buildRequestWithPdf(), ctx)
    if (res.status !== 200) {
      const body = await res.clone().json().catch(() => ({}))
      throw new Error(`expected 200, got ${res.status} body=${JSON.stringify(body)}`)
    }
    expect(res.status).toBe(200)
    expect(enqueueMock).toHaveBeenCalledTimes(1)
  })

  it('enqueued payload IS the KitDispatch record (no .record wrapper, was the bug)', async () => {
    await POST(buildRequestWithPdf(), ctx)
    const call = enqueueMock.mock.calls[0]![0] as {
      entity: string
      payload: Record<string, unknown>
    }
    expect(call.entity).toBe('kitDispatch')
    expect(call.payload.id).toBe('KD-PHASE6H-CHALLAN')
    expect(call.payload.status).toBe('Shipped')
    expect(Array.isArray(call.payload.lineItems)).toBe(true)
    expect('record' in call.payload).toBe(false)
  })

  it('enqueued payload sets deliveryChallanPath and appends file_upload audit entry', async () => {
    await POST(buildRequestWithPdf(), ctx)
    const payload = enqueueMock.mock.calls[0]![0].payload as {
      dispatchSummary: { deliveryChallanPath: string | null; warehouseEmailLoggedAt: string | null }
      auditLog: Array<{ action: string; notes?: string }>
    }
    expect(payload.dispatchSummary.deliveryChallanPath).toBe('/delivery-challans/KD-PHASE6H-CHALLAN.pdf')
    // Existing warehouseEmailLoggedAt is preserved.
    expect(payload.dispatchSummary.warehouseEmailLoggedAt).toBe('2026-05-21T10:00:00Z')
    expect(payload.auditLog.length).toBe(2)
    expect(payload.auditLog[1]!.action).toBe('file_upload')
  })

  it('drain end-to-end: kitDispatch row updates cleanly with deliveryChallanPath at top level (no .record nesting)', async () => {
    await POST(buildRequestWithPdf(), ctx)
    const payload = enqueueMock.mock.calls[0]![0].payload as Record<string, unknown>
    const existingKitDispatch = {
      id: 'KD-PHASE6H-CHALLAN',
      mouId: 'MOU-PHASE6H-TEST',
      status: 'Shipped',
      lineItems: [],
    }
    const state: MockState = { files: new Map(), health: [] }
    state.files.set('src/data/kit_dispatches.json', [existingKitDispatch])
    const pendingEntry: PendingUpdate = {
      id: 'pu-chl-test',
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
    const drained = kds.find((k) => k.id === 'KD-PHASE6H-CHALLAN')!
    expect(drained.status).toBe('Shipped')
    expect((drained.dispatchSummary as { deliveryChallanPath: string }).deliveryChallanPath).toBe(
      '/delivery-challans/KD-PHASE6H-CHALLAN.pdf',
    )
    expect('record' in drained).toBe(false)
  })

  it('rejects unauthenticated request with 401', async () => {
    getUserMock.mockResolvedValue(null)
    const res = await POST(buildRequestWithPdf(), ctx)
    expect(res.status).toBe(401)
    expect(enqueueMock).not.toHaveBeenCalled()
  })

  it('rejects non-PDF uploads with 400 (and the reason is pdf-only, not invalid-form)', async () => {
    const res = await POST(buildRequestWithPng(), ctx)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('pdf-only')
    expect(enqueueMock).not.toHaveBeenCalled()
  })
})
