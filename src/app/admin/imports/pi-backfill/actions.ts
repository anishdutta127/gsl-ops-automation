'use server'

/*
 * Phase 6C PI backfill server action.
 *
 * Two entry points:
 *   - applyAllAutoMatches(): mints fresh PI numbers for every
 *     auto-matched paid-no-PI row.
 *   - applySingleRow(paymentId, manualPiNumber): one row at a time
 *     for the needs-review / impossible buckets where Pranav picks
 *     manually.
 */

import { redirect } from 'next/navigation'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import importJson from '@/data/imports/fy-2025-26-import.json'
import { getCurrentUser } from '@/lib/auth/session'
import { buildBackfillPlan } from '@/lib/imports/piBackfill'
import { applyBackfillRow } from '@/lib/imports/piBackfillApply'
import type { ImportFile } from '@/lib/imports/fy2526Import'

const PAGE = '/admin/imports/pi-backfill'

function requireAdmin(): Promise<void> {
  return getCurrentUser().then((user) => {
    if (!user || user.role !== 'Admin') {
      redirect('/login?next=' + encodeURIComponent(PAGE))
    }
  })
}

export async function applyAllAutoMatches(): Promise<void> {
  await requireAdmin()
  const user = await getCurrentUser()
  if (!user) return // unreachable after requireAdmin
  const file = importJson as unknown as ImportFile
  const [allPayments, allMous] = await Promise.all([
    paymentRepo.findAll(),
    mouRepo.findAll(),
  ])
  const plan = buildBackfillPlan({
    payments: allPayments,
    mous: allMous,
    importRecords: file.records,
  })
  const mouById = new Map(
    allMous.map((m) => [m.id, m]),
  )
  let applied = 0
  let failed = 0
  for (const row of plan.rows) {
    if (row.kind !== 'auto-matched') continue
    const mou = mouById.get(row.mouId) ?? null
    const result = await applyBackfillRow({
      payment: row.payment,
      mou,
      manualPiNumber: null,
      appliedBy: user.id,
      matchNotes: `auto-matched against Pratik instalment ${row.candidate.candidateId}`,
    })
    if (result.ok) applied += 1
    else failed += 1
  }
  const params = new URLSearchParams({
    applied: String(applied),
    failed: String(failed),
  })
  redirect(`${PAGE}?bulkApplied=1&${params.toString()}`)
}

export async function applySingleRow(formData: FormData): Promise<void> {
  await requireAdmin()
  const user = await getCurrentUser()
  if (!user) return
  const paymentId = String(formData.get('paymentId') ?? '')
  const manual = String(formData.get('manualPi') ?? '').trim() || null
  const matchNotes = String(formData.get('matchNotes') ?? '(manual entry)')
  const [payments, mous] = await Promise.all([
    paymentRepo.findAll(),
    mouRepo.findAll(),
  ])
  const payment = payments.find((p) => p.id === paymentId)
  if (!payment) {
    redirect(`${PAGE}?error=payment-not-found`)
  }
  const mou = mous.find(
    (m) => m.id === payment!.mouId,
  ) ?? null
  const result = await applyBackfillRow({
    payment: payment!,
    mou,
    manualPiNumber: manual,
    appliedBy: user.id,
    matchNotes,
  })
  const params = new URLSearchParams({
    rowApplied: paymentId,
    ok: result.ok ? '1' : '0',
    pi: result.ok ? result.piNumber : '',
    err: !result.ok ? result.reason : '',
  })
  redirect(`${PAGE}?${params.toString()}`)
}
