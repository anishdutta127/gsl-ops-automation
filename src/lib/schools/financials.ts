/*
 * Phase 6B: school header financial derivation.
 *
 * Three money tiles on /schools/[schoolId]:
 *   Contract value | Received | Balance
 *
 * They must reconcile: Contract = Received + Balance (within Rs 1
 * tolerance for rounding noise). Received is derived from the
 * linked-payments ledger to mirror the Phase 6A Bug 2 fix on
 * /mous/[mouId]; stored mou.received / mou.balance fields are left
 * untouched because they can carry TDS-inclusive stale values from
 * the Pratik Excel import (Blue Angels Global School at audit time
 * shows mou.received=Rs 2,08,000 but the ledger sums to Rs 1,80,000;
 * Pranav backfill pending).
 */

import type { MOU, Payment } from '@/lib/types'

export interface SchoolFinancials {
  /** Sum of m.contractValue across this school's MOUs. */
  contractValue: number
  /** Sum of p.receivedAmount across all payments linked to this school's MOUs. */
  received: number
  /** Math.max(0, contractValue - received) so the three tiles always sum. */
  balance: number
}

export function deriveSchoolFinancials(args: {
  schoolMous: MOU[]
  schoolPayments: Payment[]
}): SchoolFinancials {
  const contractValue = args.schoolMous.reduce(
    (s, m) => s + (m.contractValue ?? 0),
    0,
  )
  const received = args.schoolPayments.reduce(
    (s, p) => s + (p.receivedAmount ?? 0),
    0,
  )
  const balance = Math.max(0, contractValue - received)
  return { contractValue, received, balance }
}
