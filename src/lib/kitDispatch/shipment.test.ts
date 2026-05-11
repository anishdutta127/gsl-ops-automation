import { describe, expect, it, vi } from 'vitest'
import type {
  KitDispatch,
  PendingUpdate,
  ShipmentTracking,
} from '@/lib/types'
import { recordPOD, saveShipmentTracking } from './shipment'

const FIXED_NOW = new Date('2026-05-11T12:00:00.000Z')

function kd(overrides: Partial<KitDispatch> = {}): KitDispatch {
  return {
    id: 'DISPATCH-MOU-A',
    mouId: 'MOU-A',
    schoolId: 'SCH-A',
    schoolName: 'A',
    productSelected: 'TinkRworks',
    dispatchStatus: 'In Transit',
    allocations: [],
    salesApprovalStatus: 'Approved',
    salesApprovedBy: 'sp-x',
    salesApprovedAt: FIXED_NOW.toISOString(),
    salesRejectionReason: null,
    dispatchSummary: null,
    shipmentTracking: null,
    pod: null,
    auditLog: [],
    createdAt: FIXED_NOW.toISOString(),
    ...overrides,
  }
}

function makeEnqueue() {
  const queue: PendingUpdate[] = []
  const fn = vi.fn(async (params: Parameters<typeof import('@/lib/pendingUpdates').enqueueUpdate>[0]) => {
    const e: PendingUpdate = {
      id: 'f',
      queuedAt: FIXED_NOW.toISOString(),
      queuedBy: params.queuedBy,
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
      retryCount: 0,
    }
    queue.push(e)
    return e
  })
  return { fn, queue }
}

describe('saveShipmentTracking', () => {
  it('saves In Transit tracking when status is In Transit', async () => {
    const { fn } = makeEnqueue()
    const r = await saveShipmentTracking(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        courierName: 'DHL',
        trackingId: 'AWB-123',
        dispatchDate: '2026-05-10',
        expectedDelivery: null,
        deliveryStatus: 'In Transit',
      },
      { kitDispatches: [kd()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newDispatchStatus).toBe('In Transit')
  })

  it('rejects Delivered without a POD record', async () => {
    const { fn } = makeEnqueue()
    const r = await saveShipmentTracking(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        courierName: 'DHL',
        trackingId: 'A',
        dispatchDate: '2026-05-10',
        expectedDelivery: null,
        deliveryStatus: 'Delivered',
      },
      { kitDispatches: [kd()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('pod-required-for-delivered')
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects empty courier or tracking ID', async () => {
    const { fn } = makeEnqueue()
    const r = await saveShipmentTracking(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        courierName: '',
        trackingId: 'A',
        dispatchDate: '2026-05-10',
        expectedDelivery: null,
        deliveryStatus: 'In Transit',
      },
      { kitDispatches: [kd()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(false)
  })

  it('rejects when dispatch not yet in transit', async () => {
    const { fn } = makeEnqueue()
    const r = await saveShipmentTracking(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        courierName: 'DHL',
        trackingId: 'A',
        dispatchDate: '2026-05-10',
        expectedDelivery: null,
        deliveryStatus: 'In Transit',
      },
      { kitDispatches: [kd({ dispatchStatus: 'Pending' })], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('not-yet-dispatched')
  })
})

describe('recordPOD', () => {
  it('flips status to Delivered when POD lands', async () => {
    const { fn } = makeEnqueue()
    const r = await recordPOD(
      {
        mouId: 'MOU-A',
        user: { id: 'shashank.k', name: 'S' },
        filePath: '/delivery-pods/DISPATCH-MOU-A.pdf',
      },
      { kitDispatches: [kd()], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.newDispatchStatus).toBe('Delivered')
    expect(r.dispatch.pod?.filePath).toBe('/delivery-pods/DISPATCH-MOU-A.pdf')
  })
  it('flips tracking deliveryStatus when POD lands and tracking exists', async () => {
    const { fn } = makeEnqueue()
    const tracking: ShipmentTracking = {
      courierName: 'DHL',
      trackingId: 'AWB',
      dispatchDate: '2026-05-10',
      expectedDelivery: null,
      deliveryStatus: 'In Transit',
      updatedAt: FIXED_NOW.toISOString(),
      updatedBy: 'shashank.k',
    }
    const r = await recordPOD(
      { mouId: 'MOU-A', user: { id: 'shashank.k', name: 'S' }, filePath: '/x.pdf' },
      { kitDispatches: [kd({ shipmentTracking: tracking })], enqueue: fn, now: () => FIXED_NOW },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dispatch.shipmentTracking?.deliveryStatus).toBe('Delivered')
  })
})
