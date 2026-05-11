/*
 * computePendingPi (Gate 4 Step 6 carry-forward; relocated for Next.js
 * prod build compatibility).
 *
 * Pure shortlist function: payments that need a PI generated soon.
 * Lives in src/lib/ because Next.js page.tsx files only accept the
 * default export plus a fixed set of named exports (metadata, dynamic,
 * revalidate, generateStaticParams, viewport, etc.). Helper functions
 * declared in a page module fail the prod build with
 *   Type error: "computePendingPi" is not a valid Page export field.
 *
 * Filter criteria:
 *   - Payment.status not in {Paid, Received}
 *   - Payment.piGeneratedAt is null (no PI raised yet)
 *   - Due within next 30 days OR already past due
 *   - Underlying MOU is Active
 *   - Underlying School is active
 *   - MOU has a billingBlock populated (prerequisite for PI render)
 *
 * Sort: overdue first, then by ascending days-until-due.
 */

import type { MOU, Payment, School } from '@/lib/types'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export interface PendingPiRow {
  paymentId: string
  mouId: string
  schoolName: string
  schoolId: string
  installmentLabel: string
  dueDateIso: string | null
  expectedAmount: number
  status: Payment['status']
  daysUntilDue: number | null
  isOverdue: boolean
  hasBillingBlock: boolean
  generateHref: string
}

export function computePendingPi(args: {
  mous: MOU[]
  schools: School[]
  payments: Payment[]
  now: Date
}): PendingPiRow[] {
  const { mous, schools, payments, now } = args
  const nowMs = now.getTime()
  const activeMouById = new Map(
    mous.filter((m) => m.status === 'Active').map((m) => [m.id, m]),
  )
  const activeSchoolIds = new Set(
    schools.filter((s) => s.active).map((s) => s.id),
  )

  const rows: PendingPiRow[] = []
  for (const p of payments) {
    if (p.status === 'Paid' || p.status === 'Received') continue
    if (p.piGeneratedAt !== null) continue
    const mou = activeMouById.get(p.mouId)
    if (!mou) continue
    if (!activeSchoolIds.has(mou.schoolId)) continue

    const dueMs = p.dueDateIso ? new Date(p.dueDateIso).getTime() : null
    if (dueMs === null || Number.isNaN(dueMs)) continue
    const daysUntilDue = Math.round((dueMs - nowMs) / (24 * 60 * 60 * 1000))
    const isOverdue = dueMs < nowMs
    const withinWindow = dueMs - nowMs <= THIRTY_DAYS_MS
    if (!isOverdue && !withinWindow) continue

    rows.push({
      paymentId: p.id,
      mouId: p.mouId,
      schoolName: p.schoolName,
      schoolId: mou.schoolId,
      installmentLabel: p.instalmentLabel,
      dueDateIso: p.dueDateIso,
      expectedAmount: p.expectedAmount,
      status: p.status,
      daysUntilDue,
      isOverdue,
      hasBillingBlock: Boolean(mou.billingBlock),
      generateHref: `/mous/${p.mouId}/installments`,
    })
  }

  rows.sort((a, b) => {
    // Overdue first, then by ascending days-until-due.
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0)
  })
  return rows
}
