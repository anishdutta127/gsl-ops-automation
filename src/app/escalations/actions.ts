'use server'

/*
 * /escalations server actions (W4-I.4 MM5 + Gate 4 Step 5).
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
import { createEscalation } from '@/lib/escalations/createEscalation'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'
import usersJson from '@/data/users.json'
import type {
  EscalationCategory,
  EscalationSeverity,
  EscalationStatus,
  EscalationType,
  User,
} from '@/lib/types'

const allUsers = usersJson as unknown as User[]

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

// ----------------------------------------------------------------------------
// Gate 4 Step 5: create new escalation via /escalations/new
// ----------------------------------------------------------------------------

const VALID_DEPARTMENTS: ReadonlyArray<'sales' | 'ops' | 'finance'> = [
  'sales',
  'ops',
  'finance',
]

const DEPT_ROLE_FANOUT: Record<'sales' | 'ops' | 'finance', User['role'][]> = {
  sales: ['SalesHead', 'SalesRep'],
  ops: ['OpsHead', 'OpsEmployee'],
  finance: ['Finance'],
}

export async function createEscalationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fescalations%2Fnew')

  const description = String(formData.get('description') ?? '').trim()
  const severityRaw = String(formData.get('severity') ?? '')
  const categoryRaw = nullIfBlank(String(formData.get('category') ?? ''))
  const typeRaw = nullIfBlank(String(formData.get('type') ?? ''))
  const deptRaw = String(formData.get('ownedByDepartment') ?? '')
  const schoolId = nullIfBlank(String(formData.get('schoolId') ?? ''))
  const mouId = nullIfBlank(String(formData.get('mouId') ?? ''))
  const assignedTo = nullIfBlank(String(formData.get('assignedTo') ?? ''))

  if (description === '') {
    redirect('/escalations/new?error=missing-description')
  }
  if (!VALID_SEVERITIES.includes(severityRaw as EscalationSeverity)) {
    redirect('/escalations/new?error=invalid-severity')
  }
  if (
    categoryRaw !== null
    && !VALID_CATEGORIES.includes(categoryRaw as EscalationCategory)
  ) {
    redirect('/escalations/new?error=invalid-category')
  }
  if (typeRaw !== null && !VALID_TYPES.includes(typeRaw as EscalationType)) {
    redirect('/escalations/new?error=invalid-type')
  }
  if (!VALID_DEPARTMENTS.includes(deptRaw as 'sales' | 'ops' | 'finance')) {
    redirect('/escalations/new?error=invalid-department')
  }

  const ownedByDepartment = deptRaw as 'sales' | 'ops' | 'finance'

  const result = await createEscalation({
    description,
    severity: severityRaw as EscalationSeverity,
    category: categoryRaw as EscalationCategory | null,
    type: typeRaw as EscalationType | null,
    ownedByDepartment,
    schoolId,
    mouId,
    assignedTo,
    createdBy: user.id,
  })

  if (!result.ok) {
    redirect(`/escalations/new?error=${encodeURIComponent(result.reason)}`)
  }

  // Fan-out: notify the owning department. If an assignedTo is set, fan
  // out to that user only (single-recipient); otherwise broadcast to
  // every active member of the department's role set. The createNotif
  // helper dedups self + inactive recipients.
  const recipientUserIds = assignedTo
    ? [assignedTo]
    : recipientsByRole(allUsers, DEPT_ROLE_FANOUT[ownedByDepartment])

  if (recipientUserIds.length > 0) {
    // School name resolution: the lib stores schoolId (possibly empty)
    // not schoolName, so we pass null when the operator left it blank.
    // The payload validator accepts isStringOrNull for both fields.
    await broadcastNotification({
      recipientUserIds,
      senderUserId: user.id,
      kind: 'escalation-assigned',
      title: `New ${result.escalation.severity} escalation`,
      body: result.escalation.description.slice(0, 120),
      actionUrl: `/escalations/${result.escalation.id}`,
      payload: {
        escalationId: result.escalation.id,
        mouId: result.escalation.mouId,
        schoolName: result.escalation.schoolId === '' ? null : result.escalation.schoolId,
        lane: result.escalation.lane,
        level: result.escalation.level,
        severity: result.escalation.severity,
        description: result.escalation.description,
      },
      relatedEntityId: result.escalation.id,
    })
  }

  redirect(`/escalations/${result.escalation.id}?notice=created`)
}
