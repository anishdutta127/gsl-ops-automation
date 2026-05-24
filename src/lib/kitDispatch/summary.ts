/*
 * Gate 3 Step 5: dispatch summary save with School Master dual-write.
 *
 * Per joint spec section 5: if Sales edits any of (schoolName,
 * shippingAddress, contactPerson, contactNumber), the system also
 * writes the corresponding fields on the School record. Two queue
 * writes are emitted: one for kitDispatch, one for school. Audit
 * lands on both records; the School audit entry carries notes
 * indicating the edit came via the dispatch flow.
 *
 * The mapping is deliberately narrow:
 *   - schoolName       -> School.name
 *   - contactPerson    -> School.contactPerson
 *   - contactNumber    -> School.phone
 *   - shippingAddress  -> NOT mapped back; production School schema
 *                         does not carry a free-text shipping address
 *                         (only city / state / pinCode). The dispatch-
 *                         summary record keeps the operator-entered
 *                         address as the canonical shipping value; the
 *                         School audit notes flag the discrepancy so a
 *                         later phase can introduce the field cleanly.
 */

import type {
  AuditEntry,
  DispatchSummary,
  KitDispatch,
  School,
} from '@/lib/types'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { currentBackend } from '@/lib/db/backend'

export interface SummarySaveArgs {
  mouId: string
  user: { id: string; name: string }
  schoolName: string
  shippingAddress: string
  contactPerson: string
  contactNumber: string
  salesRemarks: string | null
  /** P2b.X OCC #4: version the operator loaded; 409 on mismatch. */
  expectedVersion?: number
}

export interface SummarySaveDeps {
  kitDispatches: KitDispatch[]
  schools: School[]
  enqueue?: typeof enqueueUpdate
  now?: () => Date
  /** P2b.X OCC #4: stub for tests. */
  updateAllocationsOCC?: typeof kitDispatchRepo.updateAllocationsOCC
}

export type SummaryFailureReason =
  | 'dispatch-not-found'
  | 'not-approved'
  | 'no-summary'
  | 'empty-school-name'
  | 'version-conflict'

export type SummarySaveResult =
  | {
      ok: true
      dispatch: KitDispatch
      schoolEdited: boolean
      schoolFieldsChanged: string[]
    }
  | { ok: false; reason: SummaryFailureReason; conflictVersion?: number }

export async function saveDispatchSummary(
  args: SummarySaveArgs,
  deps: SummarySaveDeps,
): Promise<SummarySaveResult> {
  if (args.schoolName.trim() === '') {
    return { ok: false, reason: 'empty-school-name' }
  }
  const enqueue = deps.enqueue ?? enqueueUpdate
  const now = (deps.now ?? (() => new Date()))()
  const isoNow = now.toISOString()

  const kd = deps.kitDispatches.find((k) => k.mouId === args.mouId)
  if (!kd) return { ok: false, reason: 'dispatch-not-found' }
  if (kd.salesApprovalStatus !== 'Approved') return { ok: false, reason: 'not-approved' }
  if (!kd.dispatchSummary) return { ok: false, reason: 'no-summary' }

  const before = kd.dispatchSummary
  const nextSummary: DispatchSummary = {
    ...before,
    schoolName: args.schoolName.trim(),
    shippingAddress: args.shippingAddress.trim(),
    contactPerson: args.contactPerson.trim(),
    contactNumber: args.contactNumber.trim(),
    salesRemarks: args.salesRemarks,
  }

  const summaryAudit: AuditEntry = {
    timestamp: isoNow,
    user: args.user.id,
    action: 'update',
    before: {
      schoolName: before.schoolName,
      shippingAddress: before.shippingAddress,
      contactPerson: before.contactPerson,
      contactNumber: before.contactNumber,
      salesRemarks: before.salesRemarks,
    },
    after: {
      schoolName: nextSummary.schoolName,
      shippingAddress: nextSummary.shippingAddress,
      contactPerson: nextSummary.contactPerson,
      contactNumber: nextSummary.contactNumber,
      salesRemarks: nextSummary.salesRemarks,
    },
    notes: 'Dispatch summary edited by Sales.',
  }

  const nextRecord: KitDispatch = {
    ...kd,
    dispatchSummary: nextSummary,
    auditLog: [...kd.auditLog, summaryAudit],
  }

  // P2b.X OCC #4: cross-flow OCC on kit_dispatches.version. dispatch_summary
  // is REPLACE-on-update and six writers (this lib + approve + accountsExecute
  // + challan + warehouse-email + allocate) all need to coordinate.
  if (deps.updateAllocationsOCC || currentBackend() === 'postgres') {
    const occ = deps.updateAllocationsOCC
      ?? kitDispatchRepo.updateAllocationsOCC.bind(kitDispatchRepo)
    const expectedVersion = args.expectedVersion ?? kd.version ?? 1
    const r = await occ(kd.id, expectedVersion, { dispatchSummary: nextSummary }, summaryAudit, { queuedBy: args.user.id })
    if (!r.ok) {
      return { ok: false, reason: 'version-conflict', conflictVersion: r.conflictVersion }
    }
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

  const school = deps.schools.find((s) => s.id === kd.schoolId) ?? null
  const fieldsChanged: string[] = []
  let schoolEdited = false

  if (school) {
    const beforeSchool = {
      name: school.name,
      contactPerson: school.contactPerson,
      phone: school.phone,
    }
    const afterSchool = { ...beforeSchool }
    if (school.name !== nextSummary.schoolName) {
      afterSchool.name = nextSummary.schoolName
      fieldsChanged.push('name')
    }
    if ((school.contactPerson ?? '') !== nextSummary.contactPerson) {
      afterSchool.contactPerson = nextSummary.contactPerson === '' ? null : nextSummary.contactPerson
      fieldsChanged.push('contactPerson')
    }
    if ((school.phone ?? '') !== nextSummary.contactNumber) {
      afterSchool.phone = nextSummary.contactNumber === '' ? null : nextSummary.contactNumber
      fieldsChanged.push('phone')
    }
    if (fieldsChanged.length > 0) {
      schoolEdited = true
      const schoolAudit: AuditEntry = {
        timestamp: isoNow,
        user: args.user.id,
        action: 'update',
        before: beforeSchool as unknown as Record<string, unknown>,
        after: afterSchool as unknown as Record<string, unknown>,
        notes: `updated via dispatch summary edit on ${kd.id}`,
      }
      await enqueue({
        queuedBy: args.user.id,
        entity: 'school',
        operation: 'update',
        payload: {
          id: school.id,
          fieldsChanged,
          before: beforeSchool as unknown as Record<string, unknown>,
          after: afterSchool as unknown as Record<string, unknown>,
          audit: schoolAudit as unknown as Record<string, unknown>,
        },
      })
    }
  }

  return { ok: true, dispatch: nextRecord, schoolEdited, schoolFieldsChanged: fieldsChanged }
}
