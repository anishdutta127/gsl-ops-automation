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
import {
  claimEscalation,
  transferEscalation,
} from '@/lib/escalations/transferEscalation'
import type {
  EscalationCategory,
  EscalationSeverity,
  EscalationStatus,
  EscalationType,
} from '@/lib/types'

const VALID_STATUSES: ReadonlyArray<EscalationStatus> = [
  'Open', 'WIP', 'Closed', 'Transferred',
  'Dispatched', 'In Transit',
]
const VALID_SEVERITIES: ReadonlyArray<EscalationSeverity> = [
  'critical', 'high', 'medium', 'low',
]
const VALID_CATEGORIES: ReadonlyArray<EscalationCategory> = [
  'Dispatch Delay', 'Payment Issue', 'Quality Complaint', 'Training Issue',
  'School Communication', 'Inventory Shortfall', 'Vendor Issue', 'Other',
]
const VALID_TYPES: ReadonlyArray<EscalationType> = [
  'Internal', 'Customer-facing', 'Vendor-facing', 'Regulatory', 'Operational',
]

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
    const raw = nullIfBlank(String(formData.get('category') ?? ''))
    if (raw !== null && !VALID_CATEGORIES.includes(raw as EscalationCategory)) {
      redirect(`/escalations/${encodeURIComponent(id)}/edit?error=invalid-category`)
    }
    patch.category = raw as EscalationCategory | null
  }
  if (formData.has('type')) {
    const raw = nullIfBlank(String(formData.get('type') ?? ''))
    if (raw !== null && !VALID_TYPES.includes(raw as EscalationType)) {
      redirect(`/escalations/${encodeURIComponent(id)}/edit?error=invalid-type`)
    }
    patch.type = raw as EscalationType | null
  }
  if (formData.has('assignedTo')) {
    patch.assignedTo = nullIfBlank(String(formData.get('assignedTo') ?? ''))
  }
  if (formData.has('description')) {
    patch.description = String(formData.get('description') ?? '')
  }
  if (formData.has('waitingOn')) {
    patch.waitingOn = nullIfBlank(String(formData.get('waitingOn') ?? ''))
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

const VALID_TARGETS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

export async function transferEscalationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fescalations')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/escalations?error=missing-id')

  const target = String(formData.get('targetDepartment') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()

  if (!VALID_TARGETS.includes(target as 'sales' | 'ops' | 'finance')) {
    redirect(`/escalations/${encodeURIComponent(id)}?error=invalid-target`)
  }
  if (reason === '') {
    redirect(`/escalations/${encodeURIComponent(id)}?error=missing-reason`)
  }

  const result = await transferEscalation({
    id,
    targetDepartment: target as 'sales' | 'ops' | 'finance',
    reason,
    transferredBy: user.id,
  })
  if (!result.ok) {
    redirect(`/escalations/${encodeURIComponent(id)}?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/escalations/${encodeURIComponent(id)}?notice=transferred`)
}

export async function claimEscalationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fescalations')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/escalations?error=missing-id')

  const result = await claimEscalation({ id, claimedBy: user.id })
  if (!result.ok) {
    redirect(`/escalations/${encodeURIComponent(id)}?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/escalations/${encodeURIComponent(id)}?notice=claimed`)
}
