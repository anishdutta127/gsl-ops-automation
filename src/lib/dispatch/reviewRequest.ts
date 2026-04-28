/*
 * W4-D.3 reviewRequest: Ops-side DispatchRequest lifecycle.
 *
 * Three operations:
 *
 *   approveRequest  Ops accepts the DR; creates a Dispatch with
 *                   raisedFrom='sales-request' and the DR's line items
 *                   (Ops may edit via lineItemsOverride per Specific B
 *                   path (b)); DR.status -> 'approved';
 *                   DR.conversionDispatchId set.
 *
 *   rejectRequest   Ops rejects the DR with a reason; DR.status ->
 *                   'rejected'; rejectionReason captured.
 *
 *   cancelRequest   Requester (or Ops) withdraws the DR before review;
 *                   DR.status -> 'cancelled'.
 *
 * Permission gates:
 *   approveRequest / rejectRequest -> 'dispatch-request:review'
 *                                     (Admin wildcard + OpsHead).
 *   cancelRequest                   -> implicit; the requester compares
 *                                     against DR.requestedBy (no Action
 *                                     gate). Ops with 'dispatch-request:
 *                                     review' may also cancel.
 *
 * Edge case (same-person scenario per W4-D brief): Pradeep submits AND
 * approves. requestedBy === reviewedBy === pradeep.r; both audit
 * entries land with that attribution at different timestamps. No
 * special handling.
 */

import type {
  AuditEntry,
  Dispatch,
  DispatchLineItem,
  DispatchRequest,
  InventoryItem,
  MOU,
  School,
  User,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import dispatchesJson from '@/data/dispatches.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'
import {
  broadcastNotification,
  createNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'
import {
  decrementInventory,
  type DecrementFailureReason,
} from '@/lib/inventory/decrementInventory'

// ----------------------------------------------------------------------------
// Approve
// ----------------------------------------------------------------------------

export interface ApproveRequestArgs {
  requestId: string
  reviewedBy: string
  lineItemsOverride?: DispatchLineItem[]   // Specific B path (b): Ops can edit during conversion
  installmentSeqOverride?: number
  notes?: string | null
}

export type ApproveFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'request-not-found'
  | 'request-not-pending'
  | 'mou-not-found'
  | 'school-not-found'
  | 'dispatch-already-exists'
  | 'invalid-line-items'
  | 'inventory-decrement-failed'

export type ApproveRequestResult =
  | { ok: true; request: DispatchRequest; dispatch: Dispatch }
  | {
      ok: false
      reason: ApproveFailureReason
      decrementFailureReason?: DecrementFailureReason
      decrementDetail?: string
      offendingSkuName?: string
    }

// ----------------------------------------------------------------------------
// Reject
// ----------------------------------------------------------------------------

export interface RejectRequestArgs {
  requestId: string
  reviewedBy: string
  rejectionReason: string                  // free text; mandatory non-empty
}

export type RejectFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'request-not-found'
  | 'request-not-pending'
  | 'missing-rejection-reason'

export type RejectRequestResult =
  | { ok: true; request: DispatchRequest }
  | { ok: false; reason: RejectFailureReason }

// ----------------------------------------------------------------------------
// Cancel
// ----------------------------------------------------------------------------

export interface CancelRequestArgs {
  requestId: string
  cancelledBy: string                      // user.id (requester or reviewer)
  notes: string | null
}

export type CancelFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'request-not-found'
  | 'request-not-pending'

export type CancelRequestResult =
  | { ok: true; request: DispatchRequest }
  | { ok: false; reason: CancelFailureReason }

// ----------------------------------------------------------------------------
// Deps
// ----------------------------------------------------------------------------

export interface ReviewRequestDeps {
  mous: MOU[]
  schools: School[]
  users: User[]
  dispatches: Dispatch[]
  dispatchRequests: DispatchRequest[]
  inventoryItems: InventoryItem[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: ReviewRequestDeps = {
  mous: mousJson as unknown as MOU[],
  schools: schoolsJson as unknown as School[],
  users: usersJson as unknown as User[],
  dispatches: dispatchesJson as unknown as Dispatch[],
  dispatchRequests: dispatchRequestsJson as unknown as DispatchRequest[],
  inventoryItems: inventoryItemsJson as unknown as InventoryItem[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function dispatchIdFor(mouId: string, installmentSeq: number): string {
  return `DSP-${mouId}-i${installmentSeq}`
}

// ----------------------------------------------------------------------------
// approveRequest
// ----------------------------------------------------------------------------

export async function approveRequest(
  args: ApproveRequestArgs,
  deps: ReviewRequestDeps = defaultDeps,
): Promise<ApproveRequestResult> {
  const reviewer = deps.users.find((u) => u.id === args.reviewedBy)
  if (!reviewer) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(reviewer, 'dispatch-request:review')) {
    return { ok: false, reason: 'permission' }
  }

  const request = deps.dispatchRequests.find((dr) => dr.id === args.requestId)
  if (!request) return { ok: false, reason: 'request-not-found' }
  if (request.status !== 'pending-approval') {
    return { ok: false, reason: 'request-not-pending' }
  }

  const lineItems = args.lineItemsOverride ?? request.lineItems
  if (lineItems.length === 0) return { ok: false, reason: 'invalid-line-items' }

  const installmentSeq = args.installmentSeqOverride ?? request.installmentSeq

  const mou = deps.mous.find((m) => m.id === request.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  const school = deps.schools.find((s) => s.id === request.schoolId)
  if (!school) return { ok: false, reason: 'school-not-found' }

  const dispatchId = dispatchIdFor(request.mouId, installmentSeq)
  if (deps.dispatches.find((d) => d.id === dispatchId) !== undefined) {
    return { ok: false, reason: 'dispatch-already-exists' }
  }

  const ts = deps.now().toISOString()

  const wasEdited =
    args.lineItemsOverride !== undefined
    && JSON.stringify(args.lineItemsOverride) !== JSON.stringify(request.lineItems)

  const conversionAuditCommon = {
    timestamp: ts,
    user: args.reviewedBy,
  } as const

  const dispatchAudit: AuditEntry = {
    ...conversionAuditCommon,
    action: 'dispatch-request-converted',
    after: {
      requestId: request.id,
      lineItemCount: lineItems.length,
      lineItemsEdited: wasEdited,
    },
    notes: wasEdited
      ? 'Converted from DispatchRequest with Ops-side line item edits.'
      : 'Converted from DispatchRequest as submitted.',
  }

  const dispatch: Dispatch = {
    id: dispatchId,
    mouId: request.mouId,
    schoolId: request.schoolId,
    installmentSeq,
    stage: 'pending',
    installment1Paid: false,                // resolved at raise time by raiseDispatch
    overrideEvent: null,
    poRaisedAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    acknowledgedAt: null,
    acknowledgementUrl: null,
    notes: args.notes ?? null,
    lineItems,
    requestId: request.id,
    raisedBy: args.reviewedBy,
    raisedFrom: 'sales-request',
    auditLog: [dispatchAudit],
  }

  const requestAuditApproved: AuditEntry = {
    ...conversionAuditCommon,
    action: 'dispatch-request-approved',
    before: { status: request.status },
    after: { status: 'approved', dispatchId },
    notes: wasEdited
      ? 'Approved with Ops-side line item edits.'
      : 'Approved as submitted.',
  }
  const requestAuditConverted: AuditEntry = {
    ...conversionAuditCommon,
    action: 'dispatch-request-converted',
    after: { dispatchId },
    notes: 'Mirrored on the resulting Dispatch auditLog.',
  }

  const updatedRequest: DispatchRequest = {
    ...request,
    status: 'approved',
    conversionDispatchId: dispatchId,
    reviewedBy: args.reviewedBy,
    reviewedAt: ts,
    lineItems,                              // store the final approved line items
    auditLog: [...request.auditLog, requestAuditApproved, requestAuditConverted],
  }

  // W4-G.4: decrement inventory BEFORE persisting the new Dispatch.
  // Hard-block on insufficient stock / sunset SKU / missing record;
  // operator adjusts line items via lineItemsOverride and re-approves.
  const decrement = decrementInventory(
    {
      dispatch: {
        id: dispatch.id,
        lineItems: dispatch.lineItems,
        raisedFrom: dispatch.raisedFrom,
      },
      decrementedBy: args.reviewedBy,
      now: deps.now(),
    },
    { inventoryItems: deps.inventoryItems },
  )
  if (!decrement.ok) {
    return {
      ok: false,
      reason: 'inventory-decrement-failed',
      decrementFailureReason: decrement.reason,
      decrementDetail: decrement.detail,
      offendingSkuName: decrement.offendingSkuName,
    }
  }

  if (decrement.summary.length > 0) {
    const dispatchInventoryAudit: AuditEntry = {
      timestamp: ts,
      user: args.reviewedBy,
      action: 'inventory-decremented-by-dispatch',
      after: {
        skuCount: decrement.summary.length,
        decrements: decrement.summary,
      },
      notes: `Decremented inventory for ${decrement.summary.length} SKU(s).`,
    }
    dispatch.auditLog = [...dispatch.auditLog, dispatchInventoryAudit]
  }

  await deps.enqueue({
    queuedBy: args.reviewedBy,
    entity: 'dispatch',
    operation: 'create',
    payload: dispatch as unknown as Record<string, unknown>,
  })
  await deps.enqueue({
    queuedBy: args.reviewedBy,
    entity: 'dispatchRequest',
    operation: 'update',
    payload: updatedRequest as unknown as Record<string, unknown>,
  })

  for (const item of decrement.updatedItems) {
    await deps.enqueue({
      queuedBy: args.reviewedBy,
      entity: 'inventoryItem',
      operation: 'update',
      payload: item as unknown as Record<string, unknown>,
    })
  }

  for (const trigger of decrement.lowStockTriggers) {
    await broadcastNotification({
      recipientUserIds: recipientsByRole(deps.users, ['Admin', 'OpsHead']),
      senderUserId: 'system',
      kind: 'inventory-low-stock',
      title: `Low stock: ${trigger.skuName}${trigger.cretileGrade ? ` (Grade ${trigger.cretileGrade})` : ''}`,
      body: `Stock dropped to ${trigger.currentStock} units (threshold ${trigger.threshold}) after dispatch ${dispatch.id}.`,
      actionUrl: `/admin/inventory/${encodeURIComponent(trigger.inventoryItemId)}`,
      payload: {
        inventoryItemId: trigger.inventoryItemId,
        skuName: trigger.skuName,
        currentStock: trigger.currentStock,
        threshold: trigger.threshold,
        dispatchId: dispatch.id,
      },
      relatedEntityId: trigger.inventoryItemId,
    }).catch((err) => {
      console.error('[approveRequest] inventory-low-stock fan-out failed', err)
    })
  }

  // W4-E.5 notify the original requester. Self-exclusion suppresses
  // when reviewer === requester (Pradeep approves his own DR).
  await createNotification({
    recipientUserId: request.requestedBy,
    senderUserId: args.reviewedBy,
    kind: 'dispatch-request-approved',
    title: `DR approved for ${mou.schoolName}`,
    body: `${reviewer.name} approved your dispatch request ${request.id}.`,
    actionUrl: `/admin/dispatch-requests/${request.id}`,
    payload: {
      requestId: request.id,
      reviewerName: reviewer.name,
      mouId: request.mouId,
      schoolName: mou.schoolName,
      conversionDispatchId: dispatchId,
    },
    relatedEntityId: request.id,
  }).catch((err) => {
    console.error('[approveRequest] notification failed', err)
  })

  return { ok: true, request: updatedRequest, dispatch }
}

// ----------------------------------------------------------------------------
// rejectRequest
// ----------------------------------------------------------------------------

export async function rejectRequest(
  args: RejectRequestArgs,
  deps: ReviewRequestDeps = defaultDeps,
): Promise<RejectRequestResult> {
  const reviewer = deps.users.find((u) => u.id === args.reviewedBy)
  if (!reviewer) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(reviewer, 'dispatch-request:review')) {
    return { ok: false, reason: 'permission' }
  }

  const reason = args.rejectionReason.trim()
  if (reason === '') return { ok: false, reason: 'missing-rejection-reason' }

  const request = deps.dispatchRequests.find((dr) => dr.id === args.requestId)
  if (!request) return { ok: false, reason: 'request-not-found' }
  if (request.status !== 'pending-approval') {
    return { ok: false, reason: 'request-not-pending' }
  }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.reviewedBy,
    action: 'dispatch-request-rejected',
    before: { status: request.status },
    after: { status: 'rejected' },
    notes: `Rejection reason: ${reason}`,
  }

  const updatedRequest: DispatchRequest = {
    ...request,
    status: 'rejected',
    rejectionReason: reason,
    reviewedBy: args.reviewedBy,
    reviewedAt: ts,
    auditLog: [...request.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.reviewedBy,
    entity: 'dispatchRequest',
    operation: 'update',
    payload: updatedRequest as unknown as Record<string, unknown>,
  })

  // W4-E.5 notify requester of the rejection. Reviewer self-suppress
  // applies if Pradeep rejects his own DR (he sees the audit either way).
  const mou = deps.mous.find((m) => m.id === request.mouId)
  await createNotification({
    recipientUserId: request.requestedBy,
    senderUserId: args.reviewedBy,
    kind: 'dispatch-request-rejected',
    title: `DR rejected for ${mou?.schoolName ?? request.mouId}`,
    body: `${reviewer.name} rejected your dispatch request ${request.id}: ${reason}`,
    actionUrl: `/admin/dispatch-requests/${request.id}`,
    payload: {
      requestId: request.id,
      reviewerName: reviewer.name,
      mouId: request.mouId,
      schoolName: mou?.schoolName ?? request.mouId,
      rejectionReason: reason,
    },
    relatedEntityId: request.id,
  }).catch((err) => {
    console.error('[rejectRequest] notification failed', err)
  })

  return { ok: true, request: updatedRequest }
}

// ----------------------------------------------------------------------------
// cancelRequest
// ----------------------------------------------------------------------------

export async function cancelRequest(
  args: CancelRequestArgs,
  deps: ReviewRequestDeps = defaultDeps,
): Promise<CancelRequestResult> {
  const user = deps.users.find((u) => u.id === args.cancelledBy)
  if (!user) return { ok: false, reason: 'unknown-user' }

  const request = deps.dispatchRequests.find((dr) => dr.id === args.requestId)
  if (!request) return { ok: false, reason: 'request-not-found' }
  if (request.status !== 'pending-approval') {
    return { ok: false, reason: 'request-not-pending' }
  }

  // Permission: requester can cancel their own; Ops with review permission
  // can also cancel. Anyone else is blocked.
  const isRequester = user.id === request.requestedBy
  const isReviewer = canPerform(user, 'dispatch-request:review')
  if (!isRequester && !isReviewer) return { ok: false, reason: 'permission' }

  const ts = deps.now().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: args.cancelledBy,
    action: 'dispatch-request-cancelled',
    before: { status: request.status },
    after: { status: 'cancelled' },
    notes: args.notes ?? (isRequester ? 'Cancelled by requester.' : 'Cancelled by Ops.'),
  }

  const updatedRequest: DispatchRequest = {
    ...request,
    status: 'cancelled',
    reviewedBy: args.cancelledBy,
    reviewedAt: ts,
    notes: args.notes ?? request.notes,
    auditLog: [...request.auditLog, audit],
  }

  await deps.enqueue({
    queuedBy: args.cancelledBy,
    entity: 'dispatchRequest',
    operation: 'update',
    payload: updatedRequest as unknown as Record<string, unknown>,
  })

  // W4-E.5 broadcast to Admin + OpsHead so the queue stays accurate.
  // Self-exclusion drops the canceller when they themselves are
  // Admin/OpsHead.
  const mou = deps.mous.find((m) => m.id === request.mouId)
  await broadcastNotification({
    recipientUserIds: recipientsByRole(deps.users, ['Admin', 'OpsHead']),
    senderUserId: args.cancelledBy,
    kind: 'dispatch-request-cancelled',
    title: `DR cancelled for ${mou?.schoolName ?? request.mouId}`,
    body: `${user.name} cancelled DR ${request.id} before review.`,
    actionUrl: `/admin/dispatch-requests/${request.id}`,
    payload: {
      requestId: request.id,
      cancellerName: user.name,
      mouId: request.mouId,
      schoolName: mou?.schoolName ?? request.mouId,
    },
    relatedEntityId: request.id,
  }).catch((err) => {
    console.error('[cancelRequest] notification fan-out failed', err)
  })

  return { ok: true, request: updatedRequest }
}
