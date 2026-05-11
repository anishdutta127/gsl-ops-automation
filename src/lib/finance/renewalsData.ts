/*
 * Renewals drilldown lib (Gate 4.95 Session 4).
 *
 * Pure compute powering /finance/renewals. Bucketed view of MOUs that
 * either already expired or are due to expire within the next 90 days,
 * plus a separate "beyond" bucket for MOUs further out.
 *
 * Renewal status is computed off the MOU's audit log + status field
 * because there is no dedicated renewal-status column on MOU today.
 * The lib reads the latest signal: a 'Renewed' MOU.status wins (operator
 * pressed Mark as Renewed); else the most recent 'mou-renewal-declined'
 * audit entry indicates a decline; else heuristic search for 'renewal'
 * in audit notes catches in-flight discussions; else the row carries
 * 'Not yet'.
 */

import type { AuditEntry, MOU } from '@/lib/types'

export type RenewalBucket = 'expired' | 'week' | 'month' | 'ninety' | 'beyond'

export type RenewalStatusComputed =
  | 'Not yet'
  | 'Discussion'
  | 'Renewed'
  | 'Declined'

export interface RenewalRow {
  mouId: string
  schoolId: string
  schoolName: string
  programme: MOU['programme']
  status: MOU['status']
  endDate: string | null
  daysToExpiry: number | null
  isExpired: boolean
  contractValue: number
  salesPersonId: string | null
  renewalStatus: RenewalStatusComputed
  bucket: RenewalBucket
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Read the MOU's recent audit history and the status field to infer
 * the renewal lifecycle position. Latest signal wins so an operator
 * marking the MOU Renewed after an earlier decline correctly resolves
 * back to 'Renewed'.
 */
export function computeRenewalStatus(mou: MOU): RenewalStatusComputed {
  if (mou.status === 'Renewed') return 'Renewed'

  const log = mou.auditLog ?? []
  let lastDeclined: AuditEntry | null = null
  let lastStatusChange: AuditEntry | null = null
  let renewalDiscussionSeen = false

  for (const entry of log) {
    if (entry.action === 'mou-renewal-declined') {
      if (!lastDeclined || entry.timestamp > lastDeclined.timestamp) {
        lastDeclined = entry
      }
    }
    if (entry.action === 'status_change') {
      if (!lastStatusChange || entry.timestamp > lastStatusChange.timestamp) {
        lastStatusChange = entry
      }
    }
    if (!renewalDiscussionSeen && /renewal/i.test(entry.notes ?? '')) {
      renewalDiscussionSeen = true
    }
  }

  if (lastDeclined) {
    // A subsequent status_change to a non-Active value (e.g., the operator
    // manually marked Expired after the decline) does not override the
    // decline signal; only a Renewed status flip clears it, which we
    // already returned above.
    if (
      !lastStatusChange ||
      lastDeclined.timestamp >= lastStatusChange.timestamp
    ) {
      return 'Declined'
    }
  }

  if (renewalDiscussionSeen) return 'Discussion'
  return 'Not yet'
}

function bucketForDays(days: number, isExpired: boolean): RenewalBucket {
  if (isExpired) return 'expired'
  if (days <= 7) return 'week'
  if (days <= 30) return 'month'
  if (days <= 90) return 'ninety'
  return 'beyond'
}

export function bucketRenewals(args: {
  mous: MOU[]
  now: Date
}): Record<RenewalBucket, RenewalRow[]> {
  const { mous, now } = args
  const nowMs = now.getTime()

  const out: Record<RenewalBucket, RenewalRow[]> = {
    expired: [],
    week: [],
    month: [],
    ninety: [],
    beyond: [],
  }

  for (const mou of mous) {
    if (!mou.endDate) continue
    const endMs = new Date(mou.endDate + 'T00:00:00Z').getTime()
    if (Number.isNaN(endMs)) continue

    const days = Math.floor((endMs - nowMs) / MS_PER_DAY)
    const isExpired = endMs < nowMs
    const bucket = bucketForDays(days, isExpired)

    out[bucket].push({
      mouId: mou.id,
      schoolId: mou.schoolId,
      schoolName: mou.schoolName,
      programme: mou.programme,
      status: mou.status,
      endDate: mou.endDate,
      daysToExpiry: days,
      isExpired,
      contractValue: mou.contractValue ?? 0,
      salesPersonId: mou.salesPersonId ?? null,
      renewalStatus: computeRenewalStatus(mou),
      bucket,
    })
  }

  // Sort within each bucket: expired sorts by most-expired first
  // (most negative days first); future buckets by soonest first.
  out.expired.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
  for (const key of ['week', 'month', 'ninety', 'beyond'] as RenewalBucket[]) {
    out[key].sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
  }

  return out
}

/**
 * Count of MOUs that need attention in the next 90 days (expired +
 * within-90 window), used in the subtitle headline.
 */
export function countActionable(
  buckets: Record<RenewalBucket, RenewalRow[]>,
): number {
  return (
    buckets.expired.length +
    buckets.week.length +
    buckets.month.length +
    buckets.ninety.length
  )
}
