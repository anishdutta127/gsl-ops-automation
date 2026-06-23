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
const appendToQueueSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/db/repos/vexProduct', () => ({
  vexProductRepo: { create: createSpy, update: updateSpy },
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
