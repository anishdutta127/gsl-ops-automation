/*
 * Gate 3 Step 8: shipment tracking + POD upload.
 *
 * Two operations:
 *   saveShipmentTracking: records courier metadata. Cannot flip status
 *     to 'Delivered' without a POD record.
 *   uploadPOD: writes the POD file metadata + auto-flips dispatchStatus
 *     to 'Delivered' per joint spec section 11 updated logic.
 *
 * The POD path mirrors the challan path scheme: public/delivery-pods/
 * <dispatchId>.<ext>. Storage caveat is the same as the challan route
 * (see STEP9_QUESTIONS Q5).
 */

import type {
  AuditEntry,
  KitDispatch,
  KitDispatchStatus,
  PODRecord,
  ShipmentTracking,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export interface SaveShipmentArgs {
  mouId: string
  user: { id: string; name: string }
  courierName: string
  trackingId: string
  dispatchDate: string                // ISO YYYY-MM-DD
  expectedDelivery: string | null     // ISO YYYY-MM-DD
  deliveryStatus: 'In Transit' | 'Delivered'
}

export interface SaveShipmentDeps {
  kitDispatches: KitDispatch[]
  enqueue?: typeof enqueueUpdate
  now?: () => Date
}

export type ShipmentFailureReason =
  | 'dispatch-not-found'
  | 'not-yet-dispatched'
  | 'pod-required-for-delivered'
  | 'invalid-courier'

export type ShipmentResult =
  | { ok: true; dispatch: KitDispatch; newDispatchStatus: KitDispatchStatus }
  | { ok: false; reason: ShipmentFailureReason }

export async function saveShipmentTracking(
  args: SaveShipmentArgs,
  deps: SaveShipmentDeps,
): Promise<ShipmentResult> {
  if (args.courierName.trim() === '' || args.trackingId.trim() === '') {
    return { ok: false, reason: 'invalid-courier' }
  }
  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()
  const isoNow = now.toISOString()

  const kd = deps.kitDispatches.find((k) => k.mouId === args.mouId)
  if (!kd) return { ok: false, reason: 'dispatch-not-found' }
  if (kd.dispatchStatus !== 'In Transit' && kd.dispatchStatus !== 'Delivered') {
    return { ok: false, reason: 'not-yet-dispatched' }
  }
  if (args.deliveryStatus === 'Delivered' && !kd.pod) {
    return { ok: false, reason: 'pod-required-for-delivered' }
  }

  const tracking: ShipmentTracking = {
    courierName: args.courierName.trim(),
    trackingId: args.trackingId.trim(),
    dispatchDate: args.dispatchDate,
    expectedDelivery: args.expectedDelivery,
    deliveryStatus: args.deliveryStatus,
    updatedAt: isoNow,
    updatedBy: args.user.id,
  }

  const nextStatus: KitDispatchStatus =
    args.deliveryStatus === 'Delivered' ? 'Delivered' : 'In Transit'

  const audit: AuditEntry = {
    timestamp: isoNow,
    user: args.user.id,
    action: 'status_change',
    before: {
      shipmentTracking: kd.shipmentTracking as unknown as Record<string, unknown>,
      dispatchStatus: kd.dispatchStatus,
    },
    after: {
      shipmentTracking: tracking as unknown as Record<string, unknown>,
      dispatchStatus: nextStatus,
    },
    notes: 'Shipment tracking saved.',
  }

  const nextRecord: KitDispatch = {
    ...kd,
    shipmentTracking: tracking,
    dispatchStatus: nextStatus,
    auditLog: [...kd.auditLog, audit],
  }

  await enqueue({
    queuedBy: args.user.id,
    entity: 'kitDispatch',
    operation: 'update',
    payload: {
      id: kd.id,
      mouId: args.mouId,
      record: nextRecord as unknown as Record<string, unknown>,
    },
  })
  return { ok: true, dispatch: nextRecord, newDispatchStatus: nextStatus }
}

export interface RecordPODArgs {
  mouId: string
  user: { id: string; name: string }
  filePath: string
}

export async function recordPOD(
  args: RecordPODArgs,
  deps: SaveShipmentDeps,
): Promise<ShipmentResult> {
  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()
  const isoNow = now.toISOString()

  const kd = deps.kitDispatches.find((k) => k.mouId === args.mouId)
  if (!kd) return { ok: false, reason: 'dispatch-not-found' }
  if (kd.dispatchStatus !== 'In Transit' && kd.dispatchStatus !== 'Delivered') {
    return { ok: false, reason: 'not-yet-dispatched' }
  }

  const pod: PODRecord = {
    filePath: args.filePath,
    uploadedAt: isoNow,
    uploadedBy: args.user.id,
  }

  // Existing tracking gets its deliveryStatus flipped if present.
  const nextTracking: ShipmentTracking | null = kd.shipmentTracking
    ? {
        ...kd.shipmentTracking,
        deliveryStatus: 'Delivered',
        updatedAt: isoNow,
        updatedBy: args.user.id,
      }
    : null

  const audit: AuditEntry = {
    timestamp: isoNow,
    user: args.user.id,
    action: 'status_change',
    before: { pod: kd.pod, dispatchStatus: kd.dispatchStatus },
    after: { pod: pod as unknown as Record<string, unknown>, dispatchStatus: 'Delivered' },
    notes: 'POD uploaded; dispatch flipped to Delivered.',
  }

  const nextRecord: KitDispatch = {
    ...kd,
    pod,
    shipmentTracking: nextTracking,
    dispatchStatus: 'Delivered',
    auditLog: [...kd.auditLog, audit],
  }

  await enqueue({
    queuedBy: args.user.id,
    entity: 'kitDispatch',
    operation: 'update',
    payload: {
      id: kd.id,
      mouId: args.mouId,
      record: nextRecord as unknown as Record<string, unknown>,
    },
  })
  return { ok: true, dispatch: nextRecord, newDispatchStatus: 'Delivered' }
}
