'use server'

/*
 * /admin/stage-responsibility server actions (Gate 4.9 Step 3).
 *
 * The matrix submits ALL 10 stages as a single form. The action walks
 * each stage, computes a per-stage patch, and calls
 * updateStageResponsibility for any stage with a non-empty diff. The
 * 'no-changes' result is silently ignored at the per-stage level; the
 * UI's success notice always renders so the leadership user gets
 * confirmation even when their save was a no-op.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { updateStageResponsibility } from '@/lib/stageResponsibility'
import { STAGE_ORDER, type LifecycleStage } from '@/lib/statusTracker'
import type { ResponsibilityDepartment } from '@/lib/types'

const VALID_DEPARTMENTS: ReadonlyArray<ResponsibilityDepartment> = [
  'sales',
  'ops',
  'finance',
  'leadership',
  'admin',
]

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export async function saveStageResponsibilityAction(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fstage-responsibility')
  if (!canPerform(user, 'stage-responsibility:configure')) {
    redirect('/admin/stage-responsibility?error=permission')
  }

  let savedCount = 0
  const errors: string[] = []

  for (const stage of STAGE_ORDER) {
    const responsibleDepartmentRaw = String(
      formData.get(`${stage}.responsibleDepartment`) ?? '',
    )
    const responsibleUserIdRaw = nullIfBlank(
      String(formData.get(`${stage}.responsibleUserId`) ?? ''),
    )
    const escalationDepartmentRaw = String(
      formData.get(`${stage}.escalationDepartment`) ?? '',
    )
    const notesRaw = nullIfBlank(String(formData.get(`${stage}.notes`) ?? ''))

    if (
      !VALID_DEPARTMENTS.includes(
        responsibleDepartmentRaw as ResponsibilityDepartment,
      )
    ) {
      errors.push(`${stage}: invalid responsible department`)
      continue
    }
    if (
      !VALID_DEPARTMENTS.includes(
        escalationDepartmentRaw as ResponsibilityDepartment,
      )
    ) {
      errors.push(`${stage}: invalid escalation department`)
      continue
    }

    const result = await updateStageResponsibility(
      {
        stage: stage as LifecycleStage,
        patch: {
          responsibleDepartment:
            responsibleDepartmentRaw as ResponsibilityDepartment,
          responsibleUserId: responsibleUserIdRaw,
          escalationDepartment:
            escalationDepartmentRaw as ResponsibilityDepartment,
          notes: notesRaw,
        },
        actorUserId: user.id,
      },
    )
    if (result.ok) savedCount += 1
    // 'no-changes' result is fine; the row simply did not need updating.
  }

  if (errors.length > 0) {
    redirect(
      `/admin/stage-responsibility?error=${encodeURIComponent(errors[0]!)}`,
    )
  }
  redirect(`/admin/stage-responsibility?saved=${savedCount}`)
}

/*
 * Gate 5A.6 Step 15: reset the entire matrix to the Gate 4.9 defaults.
 * Walks every stage and submits the DEFAULT_RESPONSIBILITY values plus
 * a null responsibleUserId. Each per-stage update logs an audit entry
 * with the operator-supplied reason in changeNotes; existing
 * customisations stay in each stage's audit array.
 */
export async function resetStageResponsibilityAction(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fstage-responsibility')
  if (!canPerform(user, 'stage-responsibility:configure')) {
    redirect('/admin/stage-responsibility?error=permission')
  }
  const reasonRaw = String(formData.get('reason') ?? '').trim()
  const reason = reasonRaw === '' ? 'Operator triggered Reset to defaults.' : reasonRaw

  // Lazily import the default mapping to keep the file purely server-side
  // and avoid circular issues during cold start.
  const { __testing__ } = await import('@/lib/stageResponsibility')
  const defaults = __testing__.DEFAULT_RESPONSIBILITY

  let resetCount = 0
  for (const stage of STAGE_ORDER) {
    const seed = defaults[stage as LifecycleStage]
    const result = await updateStageResponsibility({
      stage: stage as LifecycleStage,
      patch: {
        responsibleDepartment: seed.responsibleDepartment,
        responsibleUserId: null,
        escalationDepartment: seed.escalationDepartment,
        notes: seed.notes,
      },
      actorUserId: user.id,
      changeNotes: `Reset to Gate 4.9 defaults via /admin/stage-responsibility. ${reason}`,
    })
    if (result.ok) resetCount += 1
  }
  redirect(`/admin/stage-responsibility?reset=${resetCount}`)
}
