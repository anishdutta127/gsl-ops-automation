'use server'

/*
 * /sales-pipeline server actions (W4-F.2 + W4-F.3).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import {
  createOpportunity,
  REGION_OPTIONS,
} from '@/lib/salesOpportunity/createOpportunity'
import {
  editOpportunity,
  type EditOpportunityPatch,
} from '@/lib/salesOpportunity/editOpportunity'
import { markOpportunityLost } from '@/lib/salesOpportunity/markOpportunityLost'
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
  // Post-create lands on the detail page so the operator can verify
  // the row + see the did-you-mean suggestion if any.
  redirect(`/sales-pipeline/${encodeURIComponent(result.opportunity.id)}?created=1`)
}

// ----------------------------------------------------------------------------
// W4-F.3 edit / mark-lost / link-school / dismiss-school-match
// ----------------------------------------------------------------------------

export async function editOpportunityAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/sales-pipeline?error=missing-id')

  const patch: EditOpportunityPatch = {}

  // String fields with required-non-empty semantics.
  if (formData.has('schoolName')) {
    patch.schoolName = String(formData.get('schoolName') ?? '')
  }
  if (formData.has('city')) patch.city = String(formData.get('city') ?? '')
  if (formData.has('state')) patch.state = String(formData.get('state') ?? '')
  if (formData.has('region')) {
    const region = String(formData.get('region') ?? '')
    if (!REGION_OPTIONS.includes(region)) {
      redirect(`/sales-pipeline/${encodeURIComponent(id)}/edit?error=invalid-region`)
    }
    patch.region = region
  }
  if (formData.has('salesRepId')) {
    patch.salesRepId = String(formData.get('salesRepId') ?? '')
  }
  if (formData.has('status')) {
    patch.status = String(formData.get('status') ?? '')
  }

  // Optional / nullable fields.
  if (formData.has('schoolId')) {
    const v = String(formData.get('schoolId') ?? '').trim()
    patch.schoolId = v === '' ? null : v
  }
  if (formData.has('programmeProposed')) {
    const v = String(formData.get('programmeProposed') ?? '').trim()
    if (v === '') {
      patch.programmeProposed = null
    } else {
      const VALID: ReadonlyArray<Programme> = [
        'STEAM', 'TinkRworks', 'Young Pioneers', 'Harvard HBPE', 'VEX',
      ]
      if (!VALID.includes(v as Programme)) {
        redirect(`/sales-pipeline/${encodeURIComponent(id)}/edit?error=invalid-programme`)
      }
      patch.programmeProposed = v as Programme
    }
  }
  if (formData.has('gslModel')) patch.gslModel = String(formData.get('gslModel') ?? '')
  if (formData.has('commitmentsMade')) patch.commitmentsMade = String(formData.get('commitmentsMade') ?? '')
  if (formData.has('outOfScopeRequirements')) patch.outOfScopeRequirements = String(formData.get('outOfScopeRequirements') ?? '')
  if (formData.has('recceStatus')) patch.recceStatus = String(formData.get('recceStatus') ?? '')
  if (formData.has('recceCompletedAt')) {
    const v = String(formData.get('recceCompletedAt') ?? '').trim()
    patch.recceCompletedAt = v === '' ? null : v
  }
  if (formData.has('approvalNotes')) patch.approvalNotes = String(formData.get('approvalNotes') ?? '')

  const result = await editOpportunity({ id, patch, editedBy: user.id })
  if (!result.ok) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}/edit?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/sales-pipeline/${encodeURIComponent(id)}?edited=${result.changedFields.length}`)
}

export async function markOpportunityLostAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline')
  const id = String(formData.get('id') ?? '').trim()
  const lossReason = String(formData.get('lossReason') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim() || null
  if (id === '') redirect('/sales-pipeline?error=missing-id')

  const result = await markOpportunityLost({
    id,
    lossReason,
    markedBy: user.id,
    notes,
  })
  if (!result.ok) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}/mark-lost?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/sales-pipeline/${encodeURIComponent(id)}?marked-lost=1`)
}

export async function linkExistingSchoolAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline')
  const id = String(formData.get('id') ?? '').trim()
  const schoolId = String(formData.get('schoolId') ?? '').trim()
  if (id === '' || schoolId === '') {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=missing-school-id`)
  }
  const result = await editOpportunity(
    { id, patch: { schoolId, schoolMatchDismissed: false }, editedBy: user.id },
  )
  if (!result.ok) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/sales-pipeline/${encodeURIComponent(id)}?linked=1`)
}

export async function dismissSchoolMatchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fsales-pipeline')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/sales-pipeline?error=missing-id')
  const result = await editOpportunity(
    { id, patch: { schoolMatchDismissed: true }, editedBy: user.id },
  )
  if (!result.ok) {
    redirect(`/sales-pipeline/${encodeURIComponent(id)}?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/sales-pipeline/${encodeURIComponent(id)}?dismissed=1`)
}
