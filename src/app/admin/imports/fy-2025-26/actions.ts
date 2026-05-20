'use server'

/*
 * Phase 6C FY 2025-26 importer server action.
 *
 * Reads the static import JSON, rebuilds the plan against the current
 * data, and enqueues every create through the GitHub queue. The page
 * redirects with `?applied=1&counts=...` so the success state is
 * bookmarkable and a refresh does not re-apply.
 */

import { redirect } from 'next/navigation'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import importJson from '@/data/imports/fy-2025-26-import.json'
import type { MOU, Payment, School } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import {
  buildImportPlan,
  type ImportFile,
} from '@/lib/imports/fy2526Import'
import { applyImportPlan } from '@/lib/imports/fy2526Apply'

const PAGE = '/admin/imports/fy-2025-26'

export async function applyFy2526Import(): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'Admin') {
    redirect('/login?next=' + encodeURIComponent(PAGE))
  }
  const file = importJson as unknown as ImportFile
  const plan = buildImportPlan({
    records: file.records,
    existingSchools: schoolsJson as unknown as School[],
    existingMous: mousJson as unknown as MOU[],
    existingPayments: paymentsJson as unknown as Payment[],
    programme: 'STEAM',
    now: () => new Date(),
    createdBy: user!.id,
  })
  const result = await applyImportPlan({
    plan,
    queuedBy: user!.id,
  })
  const params = new URLSearchParams({
    applied: '1',
    schools: String(result.schoolsCreated),
    mous: String(result.mousCreated),
    instalments: String(result.instalmentsCreated),
    payments: String(result.paymentsCreated),
    errors: String(result.errors.length),
  })
  redirect(`${PAGE}?${params.toString()}`)
}
