/**
 * @vitest-environment node
 */

/*
 * Regression (gate-sku-fix, 2026-06-22): a new VEX product never appeared
 * in the SKU master after saving. Root cause: in postgres mode (prod),
 * enqueueUpdate routes writes through dispatchToRepo, whose `vexProduct`
 * case handled only `update` and THREW on `create`. The throw was swallowed
 * by enqueueUpdate's catch, which fell back to the JSON queue; the cron then
 * drained the create into vex_products.json, a file postgres production never
 * reads. So the product was written to the wrong store and stayed invisible.
 *
 * These tests pin that a vexProduct create reaches vexProductRepo.create and
 * does NOT fall back to appendToQueue. Pre-fix, create() was never called and
 * appendToQueue WAS (the silent-success path).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createSpy = vi.fn().mockResolvedValue(undefined)
const updateSpy = vi.fn().mockResolvedValue(undefined)
const invCreateSpy = vi.fn().mockResolvedValue(undefined)
const feedbackCreateSpy = vi.fn().mockResolvedValue(undefined)
const communicationCreateSpy = vi.fn().mockResolvedValue(undefined)
const appendToQueueSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db/repos/vexProduct', () => ({
  vexProductRepo: { create: createSpy, update: updateSpy },
}))
vi.mock('@/lib/db/repos/inventoryItem', () => ({
  inventoryItemRepo: { create: invCreateSpy },
}))
vi.mock('@/lib/db/repos/leafRepos', () => ({
  feedbackRepo: { create: feedbackCreateSpy },
  communicationRepo: { create: communicationCreateSpy },
}))
vi.mock('@/lib/githubQueue', () => ({
  appendToQueue: appendToQueueSpy,
}))

const SAVED_BACKEND = process.env.DATA_BACKEND

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATA_BACKEND = 'postgres'
})

afterEach(() => {
  if (SAVED_BACKEND === undefined) delete process.env.DATA_BACKEND
  else process.env.DATA_BACKEND = SAVED_BACKEND
})

describe('enqueueUpdate vexProduct create dispatch (postgres mode)', () => {
  it('routes a create to vexProductRepo.create, not the JSON queue', async () => {
    const { enqueueUpdate } = await import('./pendingUpdates')
    const payload = {
      partNumber: 'TEST-PN-NEW',
      name: 'Test SKU',
      defaultUnitPrice: 1200,
      active: true,
    }

    await enqueueUpdate({
      queuedBy: 'tester',
      entity: 'vexProduct',
      operation: 'create',
      payload,
    })

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ partNumber: 'TEST-PN-NEW', name: 'Test SKU' }),
      { queuedBy: 'tester' },
    )
    // The bug: a thrown create fell back to the JSON queue. Must not happen.
    expect(appendToQueueSpy).not.toHaveBeenCalled()
  })

  it('still routes an update to vexProductRepo.update', async () => {
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'tester',
      entity: 'vexProduct',
      operation: 'update',
      payload: { partNumber: 'TEST-PN-NEW', name: 'Renamed', defaultUnitPrice: null, active: false },
    })
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(appendToQueueSpy).not.toHaveBeenCalled()
  })
})

describe('enqueueUpdate inventoryItem create dispatch (postgres mode)', () => {
  // Twin of the vexProduct bug: inventoryItem create also threw inside
  // dispatchToRepo and fell into the (disabled) JSON queue. Same SKU
  // (228-9258) was lost in production alongside the VEX product.
  it('routes a create to inventoryItemRepo.create, not the JSON queue', async () => {
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'tester',
      entity: 'inventoryItem',
      operation: 'create',
      payload: {
        id: 'INV-TEST-NEW',
        skuName: 'Test inventory item',
        category: 'Other',
        currentStock: 15,
        active: true,
        auditLog: [],
      },
    })
    expect(invCreateSpy).toHaveBeenCalledTimes(1)
    expect(invCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'INV-TEST-NEW', skuName: 'Test inventory item' }),
      { queuedBy: 'tester' },
    )
    expect(appendToQueueSpy).not.toHaveBeenCalled()
  })
})

describe('enqueueUpdate leaf-entity create dispatch (postgres mode)', () => {
  // These creates previously threw in dispatchToRepo and fell into the
  // disabled dead-letter queue. feedback = SPOC submissions lost;
  // communication = sent-email/WhatsApp logs lost.
  it('routes a feedback create to feedbackRepo.create, not the JSON queue', async () => {
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'feedback',
      operation: 'create',
      payload: { id: 'FB-TEST', schoolId: 'SCH-1', mouId: 'MOU-1', ratings: [], auditLog: [] },
    })
    expect(feedbackCreateSpy).toHaveBeenCalledTimes(1)
    expect(feedbackCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'FB-TEST' }),
      { queuedBy: 'system' },
    )
    expect(appendToQueueSpy).not.toHaveBeenCalled()
  })

  it('routes a communication create to communicationRepo.create, not the JSON queue', async () => {
    const { enqueueUpdate } = await import('./pendingUpdates')
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'communication',
      operation: 'create',
      payload: { id: 'COMM-TEST', type: 'welcome-note', schoolId: 'SCH-1', status: 'queued', auditLog: [] },
    })
    expect(communicationCreateSpy).toHaveBeenCalledTimes(1)
    expect(appendToQueueSpy).not.toHaveBeenCalled()
  })
})
