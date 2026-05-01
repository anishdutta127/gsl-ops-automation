'use server'

/*
 * /escalations server actions (W4-I.4 MM5).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import {
  editEscalation,
  type EditEscalationPatch,
} from '@/lib/escalations/editEscalation'
import type { EscalationSeverity, EscalationStatus } from '@/lib/types'

const VALID_STATUSES: ReadonlyArray<EscalationStatus> = [
  'Open', 'WIP', 'Closed', 'Transfer to Other Department',
  'Dispatched', 'In Transit',
]
const VALID_SEVERITIES: ReadonlyArray<EscalationSeverity> = ['low', 'medium', 'high']

function nullIfBlank(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export async function editEscalationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fescalations')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/escalations?error=missing-id')

  const patch: EditEscalationPatch = {}

  if (formData.has('status')) {
    const raw = String(formData.get('status') ?? '')
    if (!VALID_STATUSES.includes(raw as EscalationStatus)) {
      redirect(`/escalations/${encodeURIComponent(id)}/edit?error=invalid-status`)
    }
    patch.status = raw as EscalationStatus
  }
  if (formData.has('severity')) {
    const raw = String(formData.get('severity') ?? '')
    if (!VALID_SEVERITIES.includes(raw as EscalationSeverity)) {
      redirect(`/escalations/${encodeURIComponent(id)}/edit?error=invalid-severity`)
    }
    patch.severity = raw as EscalationSeverity
  }
  if (formData.has('category')) {
    patch.category = nullIfBlank(String(formData.get('category') ?? ''))
  }
  if (formData.has('type')) {
    patch.type = nullIfBlank(String(formData.get('type') ?? ''))
  }
  if (formData.has('assignedTo')) {
    patch.assignedTo = nullIfBlank(String(formData.get('assignedTo') ?? ''))
  }
  if (formData.has('description')) {
    patch.description = String(formData.get('description') ?? '')
  }
  if (formData.has('resolutionNotes')) {
    patch.resolutionNotes = nullIfBlank(String(formData.get('resolutionNotes') ?? ''))
  }

  const result = await editEscalation({ id, patch, editedBy: user.id })
  if (!result.ok) {
    redirect(`/escalations/${encodeURIComponent(id)}/edit?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/escalations/${encodeURIComponent(id)}?edited=${result.changedFields.length}`)
}
