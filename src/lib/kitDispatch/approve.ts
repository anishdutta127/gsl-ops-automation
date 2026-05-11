/*
 * Gate 3 Step 4: Sales approval workflow.
 *
 * approveKitDispatch transitions salesApprovalStatus to 'Approved',
 * sets salesApprovedBy + salesApprovedAt, and generates the initial
 * DispatchSummary stub populated from MOU + School master.
 *
 * rejectKitDispatch transitions salesApprovalStatus to 'Rejected' with
 * a mandatory non-empty reason. The allocation becomes editable again
 * for Ops; the next allocation submit flips status back to 'Pending'.
 */

import type {
  AuditEntry,
  DispatchSummary,
  KitDispatch,
  MOU,
  School,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'

export interface ApproveArgs {
  mouId: string
  user: { id: string; name: string }
}
export interface RejectArgs {
  mouId: string
  user: { id: string; name: string }
  reason: string
}
export interface ApproveDeps {
  mous: MOU[]
  kitDispatches: KitDispatch[]
  schools: School[]
  enqueue?: typeof enqueueUpdate
  now?: () => Date
}

export type ApproveFailureReason =
  | 'mou-not-found'
  | 'dispatch-not-found'
  | 'not-pending'
  | 'no-allocations'
  | 'rejection-reason-required'

export type ApproveResult =
  | { ok: true; dispatch: KitDispatch }
  | { ok: false; reason: ApproveFailureReason }

function buildInitialDispatchSummary(args: {
  mou: MOU
  school: School | null
  approvedBy: string
  approvedAt: string
}): DispatchSummary {
  const { mou, school } = args
  return {
    schoolName: school?.name ?? mou.schoolName,
    shippingAddress: [school?.city, school?.state, school?.pinCode]
      .filter((v): v is string => !!v)
      .join(', '),
    contactPerson: school?.contactPerson ?? '',
    contactNumber: school?.phone ?? '',
    salesRemarks: null,
    approvedBy: args.approvedBy,
    approvedAt: args.approvedAt,
    accountsEntries: [],
    deliveryChallanPath: null,
    warehouseEmailLoggedAt: null,
  }
}

export async function approveKitDispatch(
  args: ApproveArgs,
  deps: ApproveDeps,
): Promise<ApproveResult> {
  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()
  const isoNow = now.toISOString()

  const mou = deps.mous.find((m) => m.id === args.mouId)
  if (!mou) return { ok: false, reason: 'mou-not-found' }
  const kd = deps.kitDispatches.find((k) => k.mouId === args.mouId)
  if (!kd) return { ok: false, reason: 'dispatch-not-found' }
  if (kd.salesApprovalStatus !== 'Pending') return { ok: false, reason: 'not-pending' }
  if (kd.allocations.length === 0) return { ok: false, reason: 'no-allocations' }

  const school = deps.schools.find((s) => s.id === mou.schoolId) ?? null

  const audit: AuditEntry = {
    timestamp: isoNow,
    user: args.user.id,
    action: 'status_change',
    before: { salesApprovalStatus: kd.salesApprovalStatus },
    after: { salesApprovalStatus: 'Approved' },
    notes: 'Sales approved kit dispatch; dispatch summary generated.',
  }

  const nextRecord: KitDispatch = {
    ...kd,
    salesApprovalStatus: 'Approved',
    salesApprovedBy: args.user.id,
    salesApprovedAt: isoNow,
    salesRejectionReason: null,
    dispatchSummary:
      kd.dispatchSummary ??
      buildInitialDispatchSummary({
        mou,
        school,
        approvedBy: args.user.id,
        approvedAt: isoNow,
      }),
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

  return { ok: true, dispatch: nextRecord }
}

export async function rejectKitDispatch(
  args: RejectArgs,
  deps: ApproveDeps,
): Promise<ApproveResult> {
  if (args.reason.trim() === '') {
    return { ok: false, reason: 'rejection-reason-required' }
  }

  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()
  const isoNow = now.toISOString()

  const kd = deps.kitDispatches.find((k) => k.mouId === args.mouId)
  if (!kd) return { ok: false, reason: 'dispatch-not-found' }
  if (kd.salesApprovalStatus !== 'Pending') return { ok: false, reason: 'not-pending' }

  const audit: AuditEntry = {
    timestamp: isoNow,
    user: args.user.id,
    action: 'status_change',
    before: { salesApprovalStatus: kd.salesApprovalStatus },
    after: { salesApprovalStatus: 'Rejected' },
    notes: `Sales rejected kit dispatch. Reason: ${args.reason.trim()}`,
  }

  const nextRecord: KitDispatch = {
    ...kd,
    salesApprovalStatus: 'Rejected',
    salesRejectionReason: args.reason.trim(),
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

  return { ok: true, dispatch: nextRecord }
}
