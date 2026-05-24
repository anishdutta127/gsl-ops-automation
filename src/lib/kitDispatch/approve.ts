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
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { currentBackend } from '@/lib/db/backend'

export interface ApproveArgs {
  mouId: string
  user: { id: string; name: string }
  expectedVersion?: number
}
export interface RejectArgs {
  mouId: string
  user: { id: string; name: string }
  reason: string
  expectedVersion?: number
}
export interface ApproveDeps {
  mous: MOU[]
  kitDispatches: KitDispatch[]
  schools: School[]
  enqueue?: typeof enqueueUpdate
  now?: () => Date
  /** P2b.X OCC #4: stub for tests. */
  updateAllocationsOCC?: typeof kitDispatchRepo.updateAllocationsOCC
}

export type ApproveFailureReason =
  | 'mou-not-found'
  | 'dispatch-not-found'
  | 'not-pending'
  | 'no-allocations'
  | 'rejection-reason-required'
  | 'version-conflict'

export type ApproveResult =
  | { ok: true; dispatch: KitDispatch }
  | { ok: false; reason: ApproveFailureReason; conflictVersion?: number }

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

  if (deps.updateAllocationsOCC || currentBackend() === 'postgres') {
    const occ = deps.updateAllocationsOCC ?? kitDispatchRepo.updateAllocationsOCC.bind(kitDispatchRepo)
    const expectedVersion = args.expectedVersion ?? kd.version ?? 1
    const r = await occ(kd.id, expectedVersion, {
      salesApprovalStatus: 'Approved',
      salesApprovedBy: args.user.id,
      salesApprovedAt: isoNow,
      salesRejectionReason: null,
      dispatchSummary: nextRecord.dispatchSummary,
    }, audit, { queuedBy: args.user.id })
    if (!r.ok) return { ok: false, reason: 'version-conflict', conflictVersion: r.conflictVersion }
    nextRecord.version = r.newVersion
  } else {
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
  }
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

  if (deps.updateAllocationsOCC || currentBackend() === 'postgres') {
    const occ = deps.updateAllocationsOCC ?? kitDispatchRepo.updateAllocationsOCC.bind(kitDispatchRepo)
    const expectedVersion = args.expectedVersion ?? kd.version ?? 1
    const r = await occ(kd.id, expectedVersion, {
      salesApprovalStatus: 'Rejected',
      salesRejectionReason: args.reason.trim(),
    }, audit, { queuedBy: args.user.id })
    if (!r.ok) return { ok: false, reason: 'version-conflict', conflictVersion: r.conflictVersion }
    nextRecord.version = r.newVersion
  } else {
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
  }
  return { ok: true, dispatch: nextRecord }
}
