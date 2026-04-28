'use server'

/*
 * /sales-pipeline server actions (W4-F.2).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import {
  createOpportunity,
  REGION_OPTIONS,
} from '@/lib/salesOpportunity/createOpportunity'
import type { Programme } from '@/lib/types'

const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'TinkRworks',
  'Young Pioneers',
  'Harvard HBPE',
  'VEX',
]

function nullIfBlank(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export async function createOpportunityAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline%2Fnew')
  if (!canPerform(user, 'sales-opportunity:create')) {
    redirect('/sales-pipeline?error=permission')
  }

  const schoolName = String(formData.get('schoolName') ?? '').trim()
  const schoolIdRaw = String(formData.get('schoolId') ?? '').trim()
  const city = String(formData.get('city') ?? '').trim()
  const state = String(formData.get('state') ?? '').trim()
  const region = String(formData.get('region') ?? '').trim()
  const salesRepId = String(formData.get('salesRepId') ?? '').trim()
  const programmeRaw = String(formData.get('programmeProposed') ?? '').trim()
  const status = String(formData.get('status') ?? '').trim()
  const gslModel = nullIfBlank(String(formData.get('gslModel') ?? ''))
  const commitmentsMade = nullIfBlank(String(formData.get('commitmentsMade') ?? ''))
  const outOfScopeRequirements = nullIfBlank(
    String(formData.get('outOfScopeRequirements') ?? ''),
  )
  const recceStatus = nullIfBlank(String(formData.get('recceStatus') ?? ''))
  const recceCompletedAt = nullIfBlank(String(formData.get('recceCompletedAt') ?? ''))
  const approvalNotes = nullIfBlank(String(formData.get('approvalNotes') ?? ''))

  if (!REGION_OPTIONS.includes(region)) {
    redirect('/sales-pipeline/new?error=invalid-region')
  }

  let programmeProposed: Programme | null = null
  if (programmeRaw !== '') {
    if (!VALID_PROGRAMMES.includes(programmeRaw as Programme)) {
      redirect('/sales-pipeline/new?error=invalid-programme')
    }
    programmeProposed = programmeRaw as Programme
  }

  const result = await createOpportunity({
    schoolName,
    schoolId: schoolIdRaw === '' ? null : schoolIdRaw,
    city,
    state,
    region,
    salesRepId,
    programmeProposed,
    gslModel,
    commitmentsMade,
    outOfScopeRequirements,
    recceStatus,
    recceCompletedAt,
    status,
    approvalNotes,
    createdBy: user.id,
  })

  if (!result.ok) {
    redirect(`/sales-pipeline/new?error=${encodeURIComponent(result.reason)}`)
  }
  // W4-F.3 will upgrade this redirect to point at the detail page.
  // For now W4-F.2 lands on the list with a created-flash; the new
  // row sorts to the top (most-recently-updated first).
  redirect(`/sales-pipeline?created=1&id=${encodeURIComponent(result.opportunity.id)}`)
}
