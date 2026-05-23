/**
 * @vitest-environment node
 *
 * The DNS fallback in src/lib/db/client.ts patches `dns.lookup` to
 * route around ISP refusals on Neon hostnames. In vitest's default
 * jsdom env Vite externalises `node:dns` and the patch never installs,
 * so this file declares the node environment explicitly.
 */

/*
 * Parity + write-parity for the JSONB-heavy finance/dispatch entities:
 *   - paymentRepo (partial_payments JSONB + audit_log)
 *   - dispatchRepo (line_items + override_event + audit_log)
 *   - kitDispatchRepo (allocations + dispatch_summary + shipment_tracking + pod + audit_log)
 *
 * Read parity: findAll + findById + one filter helper, comparing
 * the json-mode and postgres-mode returns deep-equal (normalised).
 *
 * Write parity (postgres-only, commits + restores): mutate a JSONB
 * payload, write, read back, assert deep-equal. The Phase 6H bug
 * class lived on kit_dispatches; this is the proof.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { paymentRepo } from '../payment'
import { dispatchRepo } from '../dispatch'
import { kitDispatchRepo } from '../kitDispatch'
import { hasPostgres, withBackend, parityEqual } from '../../__test__/parity'
import { closeSql } from '../../client'
import type { Payment, Dispatch } from '@/lib/types'

const desc = hasPostgres() ? describe : describe.skip

// ---------------------------------------------------------------------------
// paymentRepo
// ---------------------------------------------------------------------------

desc('paymentRepo parity', () => {
  it('findAll: same id set (json and postgres both carry the 9 archive payments)', async () => {
    const j = await withBackend('json', () => paymentRepo.findAll())
    const p = await withBackend('postgres', () => paymentRepo.findAll())
    expect(p.map((x) => x.id).sort()).toEqual(j.map((x) => x.id).sort())
  })

  it('findById: same shape for a known payment', async () => {
    const target = 'MOU-STEAM-2627-001-i1'
    const j = await withBackend('json', () => paymentRepo.findById(target))
    const p = await withBackend('postgres', () => paymentRepo.findById(target))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(j!.mouId, p!.mouId)
    parityEqual(j!.status, p!.status)
    parityEqual(j!.expectedAmount, p!.expectedAmount)
    parityEqual(j!.piNumber ?? null, p!.piNumber ?? null)
  })

  it('findByMouId: same set per mou', async () => {
    const j = await withBackend('json', () => paymentRepo.findByMouId('MOU-STEAM-2627-001'))
    const p = await withBackend('postgres', () => paymentRepo.findByMouId('MOU-STEAM-2627-001'))
    expect(p.map((x) => x.id).sort()).toEqual(j.map((x) => x.id).sort())
  })

  it('archive payments land with correct amounts (postgres-side spot check)', async () => {
    const archive = await withBackend('postgres', () =>
      paymentRepo.findByMouId('MOU-YP-2526-001'),
    )
    expect(archive).toHaveLength(2)
    const i1 = archive.find((p) => p.instalmentSeq === 1)
    expect(i1?.receivedAmount).toBe(183750)
    expect(i1?.piNumber).toBe('MTPL/25-26/1')
  })
})

desc('paymentRepo write-parity (postgres-only)', () => {
  let original: Payment | null = null
  const TARGET = 'MOU-STEAM-2627-001-i1'

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    original = await paymentRepo.findById(TARGET)
  })

  afterAll(async () => {
    if (original) await paymentRepo.update(original)
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('partial_payments JSONB round-trips exactly + audit appends correctly', async () => {
    if (!original) throw new Error('original payment missing')
    const mutated: Payment = {
      ...original,
      partialPayments: [
        { receivedAt: '2026-05-25T00:00:00Z', amount: 1500, mode: 'NEFT', reference: 'TEST-001', notes: 'parity-test' },
        { receivedAt: '2026-05-26T00:00:00Z', amount: 2500, mode: 'UPI', reference: null, notes: null },
      ],
      auditLog: [
        ...(original.auditLog ?? []),
        {
          timestamp: new Date().toISOString(),
          user: 'parity-test',
          action: 'update',
          notes: 'payment write-parity',
        },
      ],
    }
    await paymentRepo.update(mutated)
    const readBack = await paymentRepo.findById(TARGET)
    parityEqual(readBack!.partialPayments, mutated.partialPayments)
    expect(readBack!.auditLog?.length).toBe((original.auditLog?.length ?? 0) + 1)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// dispatchRepo
// ---------------------------------------------------------------------------

desc('dispatchRepo parity', () => {
  it('findAll: postgres has no demo orphans; json-only set is the documented demo cohort', async () => {
    const j = await withBackend('json', () => dispatchRepo.findAll())
    const p = await withBackend('postgres', () => dispatchRepo.findAll())
    const jIds = new Set(j.map((d) => d.id))
    const pIds = new Set(p.map((d) => d.id))
    // 4 demo dispatches (DIS-001/002/004/005) are json-only.
    const jOnly = [...jIds].filter((id) => !pIds.has(id)).sort()
    expect(jOnly).toEqual(['DIS-001', 'DIS-002', 'DIS-004', 'DIS-005'])
    const pOnly = [...pIds].filter((id) => !jIds.has(id)).sort()
    expect(pOnly).toEqual([])
  })

  it('findById (DIS-003 which survived): same shape', async () => {
    const j = await withBackend('json', () => dispatchRepo.findById('DIS-003'))
    const p = await withBackend('postgres', () => dispatchRepo.findById('DIS-003'))
    expect(j).toBeTruthy()
    expect(p).toBeTruthy()
    parityEqual(j!.mouId, p!.mouId)
    parityEqual(j!.stage, p!.stage)
    parityEqual(j!.schoolId, p!.schoolId)
  })
})

desc('dispatchRepo write-parity (postgres-only)', () => {
  let original: Dispatch | null = null
  const TARGET = 'DIS-003'

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    original = await dispatchRepo.findById(TARGET)
  })

  afterAll(async () => {
    if (original) await dispatchRepo.update(original)
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('lineItems JSONB array round-trips exactly', async () => {
    if (!original) throw new Error('original dispatch missing')
    const mutated: Dispatch = {
      ...original,
      lineItems: [
        { kind: 'flat', skuName: 'TEST-SKU-1', quantity: 12 },
        { kind: 'per-grade', skuName: 'TEST-SKU-2', gradeAllocations: [
          { grade: 1, quantity: 5 },
          { grade: 2, quantity: 7 },
        ] },
      ] as Dispatch['lineItems'],
    }
    await dispatchRepo.update(mutated)
    const readBack = await dispatchRepo.findById(TARGET)
    parityEqual(readBack!.lineItems, mutated.lineItems)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// kitDispatchRepo
// ---------------------------------------------------------------------------

desc('kitDispatchRepo parity', () => {
  it('findAll: same set (both backends start empty pre-allocation; created lazily)', async () => {
    const j = await withBackend('json', () => kitDispatchRepo.findAll())
    const p = await withBackend('postgres', () => kitDispatchRepo.findAll())
    expect(p.map((k) => k.id).sort()).toEqual(j.map((k) => k.id).sort())
  })

  it('findByMouId(unknown): both return null', async () => {
    const j = await withBackend('json', () => kitDispatchRepo.findByMouId('MOU-UNKNOWN'))
    const p = await withBackend('postgres', () => kitDispatchRepo.findByMouId('MOU-UNKNOWN'))
    expect(j).toBeNull()
    expect(p).toBeNull()
  })
})

desc('kitDispatchRepo write-parity (postgres-only): create + JSONB round-trip', () => {
  const TEST_ID = 'DISPATCH-MOU-STEAM-2627-001'

  beforeAll(async () => {
    process.env.DATA_BACKEND = 'postgres'
    // Clean any prior test run.
    const { getSql } = await import('../../client')
    const sql = getSql()
    await sql`DELETE FROM kit_dispatches WHERE id = ${TEST_ID}`
  })

  afterAll(async () => {
    const { getSql } = await import('../../client')
    const sql = getSql()
    await sql`DELETE FROM kit_dispatches WHERE id = ${TEST_ID}`
    delete process.env.DATA_BACKEND
    await closeSql()
  })

  it('create then findById: every JSONB column round-trips (allocations, dispatch_summary, shipment_tracking, pod)', async () => {
    const rec = {
      id: TEST_ID,
      mouId: 'MOU-STEAM-2627-001',
      schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH',
      schoolName: 'Mutahhary Public School',
      productSelected: 'TinkRworks',
      dispatchStatus: 'Allocated',
      allocations: [
        { grade: 1, productName: 'Tinkrpython', skuName: 'Tinkrpython', quantity: 5, kitType: 'Reusable' },
        { grade: 2, productName: 'Tinkrpython', skuName: 'Tinkrpython', quantity: 7, kitType: 'Reusable' },
      ],
      salesApprovalStatus: 'Pending',
      salesApprovedBy: null,
      salesApprovedAt: null,
      salesRejectionReason: null,
      dispatchSummary: {
        warehouseEmailLoggedAt: '2026-05-25T10:00:00Z',
        deliveryChallanPath: '/delivery-challans/TEST.pdf',
      },
      shipmentTracking: { courier: 'BlueDart', awb: 'TEST-AWB-001' },
      pod: { podPath: '/pods/TEST.pdf', podUploadedAt: '2026-05-26T15:00:00Z' },
      auditLog: [{ timestamp: '2026-05-25T10:00:00Z', user: 'parity', action: 'create' }],
      createdAt: '2026-05-25T10:00:00Z',
      importNotes: null,
    } as unknown as Parameters<typeof kitDispatchRepo.create>[0]
    await kitDispatchRepo.create(rec)
    const readBack = await kitDispatchRepo.findById(TEST_ID)
    expect(readBack).toBeTruthy()
    parityEqual(readBack!.allocations, rec.allocations)
    parityEqual(readBack!.dispatchSummary, rec.dispatchSummary)
    parityEqual(readBack!.shipmentTracking, rec.shipmentTracking)
    parityEqual(readBack!.pod, rec.pod)
  }, 30_000)
})
