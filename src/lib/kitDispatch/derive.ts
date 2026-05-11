/*
 * Gate 3 Step 2: Kits for Dispatch list-row derivation.
 *
 * The KitDispatch entity exists in kit_dispatches.json only AFTER the
 * first allocation is submitted (id minted lazily per STEP9_QUESTIONS
 * Q2). The list view at /dispatch/kits must still show every MOU that
 * has reached lifecycle completion ("MOU is completed" in joint spec
 * section 2 vocabulary), so we merge two streams:
 *
 *   1. Real KitDispatch records from kit_dispatches.json.
 *   2. Stub rows synthesised from MOUs in eligible status with no
 *      backing KitDispatch yet (dispatchStatus = 'Not Started',
 *      allocations = []).
 *
 * Payment status is computed live from payments.json per joint spec
 * section 2 ("Payment status auto-fetch from Payment module"). One
 * aggregate per MOU: if any installment is Overdue -> 'Overdue';
 * else if every installment is Paid/Received -> 'Received'; else if
 * at least one Partial -> 'Partial'; else if at least one PI Sent ->
 * 'PI Sent'; otherwise 'Pending'. The fallback chain mirrors the
 * Finance dashboard derivation; we keep it local because list-view
 * aggregation does not need the row-level detail Finance uses.
 *
 * "MOU complete" semantics: the joint spec docx says "after MOU is
 * completed" but the production corpus has 0 MOUs in 'Completed' status
 * (134 Active, 9 Pending Signature at the time of writing). The
 * decision archived in STEP9_QUESTIONS Q5 is: treat 'Active' /
 * 'Completed' / 'Expired' / 'Renewed' as "MOU process is done, kits
 * can be allocated". Pending Signature / Draft do NOT appear.
 */

import type {
  KitDispatch,
  KitDispatchStatus,
  MOU,
  Payment,
  PaymentStatus,
} from '@/lib/types'

export interface KitDispatchListRow {
  /** KitDispatch.id when a record exists, else a synthetic 'STUB-<mouId>'. */
  id: string
  mouId: string
  schoolId: string
  schoolName: string
  /** Null when MOU has not yet captured productSelection (Sales/Ops will pick on the allocation form). */
  productSelected: 'TinkRworks' | 'Cretile' | 'Both' | null
  paymentStatus: PaymentStatus
  dispatchStatus: KitDispatchStatus
  /** Sales rep for filtering. Null when MOU has no rep assigned. */
  salesPersonId: string | null
  /** School region for filtering. */
  region: string | null
  /** True when the underlying KitDispatch record exists; false for synthetic stubs. */
  hasRecord: boolean
}

const ELIGIBLE_MOU_STATUSES: ReadonlyArray<MOU['status']> = [
  'Active',
  'Completed',
  'Expired',
  'Renewed',
]

export function isMouEligibleForKitDispatch(mou: MOU): boolean {
  return ELIGIBLE_MOU_STATUSES.includes(mou.status)
}

/**
 * Aggregate the per-MOU payment status from the per-installment Payment
 * rows. Priority: Overdue > Partial > PI Sent > Pending > Received.
 * "Received" requires every installment Paid/Received (or no rows at all).
 */
export function aggregatePaymentStatusForMou(
  mouId: string,
  payments: Payment[],
): PaymentStatus {
  const rows = payments.filter((p) => p.mouId === mouId)
  if (rows.length === 0) return 'Pending'
  let anyOverdue = false
  let anyPartial = false
  let anyPiSent = false
  let anyDueSoon = false
  let anyPending = false
  let allPaid = true
  for (const p of rows) {
    if (p.status === 'Overdue') anyOverdue = true
    else if (p.status === 'Partial') {
      anyPartial = true
      allPaid = false
    } else if (p.status === 'PI Sent') {
      anyPiSent = true
      allPaid = false
    } else if (p.status === 'Due Soon') {
      anyDueSoon = true
      allPaid = false
    } else if (p.status === 'Pending') {
      anyPending = true
      allPaid = false
    } else if (p.status !== 'Paid' && p.status !== 'Received') {
      allPaid = false
    }
  }
  if (anyOverdue) return 'Overdue'
  if (anyPartial) return 'Partial'
  if (anyPiSent) return 'PI Sent'
  if (anyDueSoon) return 'Due Soon'
  if (anyPending) return 'Pending'
  if (allPaid) return 'Received'
  return 'Pending'
}

/**
 * Merge real KitDispatch records with synthetic stubs for eligible MOUs
 * that don't yet carry a record. Returns one row per eligible MOU.
 */
export function deriveKitDispatchListRows(args: {
  mous: MOU[]
  kitDispatches: KitDispatch[]
  payments: Payment[]
  schoolRegionByMouId?: Record<string, string | null>
}): KitDispatchListRow[] {
  const byMouId = new Map<string, KitDispatch>()
  for (const kd of args.kitDispatches) {
    byMouId.set(kd.mouId, kd)
  }
  const rows: KitDispatchListRow[] = []
  for (const mou of args.mous) {
    if (!isMouEligibleForKitDispatch(mou)) continue
    const existing = byMouId.get(mou.id) ?? null
    const region = args.schoolRegionByMouId?.[mou.id] ?? null
    const paymentStatus = aggregatePaymentStatusForMou(mou.id, args.payments)
    if (existing) {
      rows.push({
        id: existing.id,
        mouId: existing.mouId,
        schoolId: existing.schoolId,
        schoolName: existing.schoolName,
        productSelected: existing.productSelected,
        paymentStatus,
        dispatchStatus: existing.dispatchStatus,
        salesPersonId: mou.salesPersonId ?? null,
        region,
        hasRecord: true,
      })
    } else {
      const productFromMou =
        (mou.productSelection as 'TinkRworks' | 'Cretile' | 'Both' | null | undefined) ?? null
      rows.push({
        id: `STUB-${mou.id}`,
        mouId: mou.id,
        schoolId: mou.schoolId,
        schoolName: mou.schoolName,
        productSelected: productFromMou,
        paymentStatus,
        dispatchStatus: 'Not Started',
        salesPersonId: mou.salesPersonId ?? null,
        region,
        hasRecord: false,
      })
    }
  }
  rows.sort((a, b) => a.schoolName.localeCompare(b.schoolName))
  return rows
}
