/*
 * POST /api/workflow/send-reminder (Gate 4 Step 4).
 *
 * Body: form-encoded
 *   mouId  : string
 *   stage  : string (the workflow stage that drove the banner)
 *
 * On submit:
 *   - Computes the current workflowState banner
 *   - Confirms reminderEligible + cooldown not active
 *   - Broadcasts an in-app Notification to the owning department's
 *     active members
 *   - Appends a 'workflow-reminder-sent' marker to the MOU auditLog
 *     so the cooldown check on the next request can read the last
 *     timestamp
 *   - 303-redirects back to /mous/[mouId]?notice=reminder-sent (or
 *     a reason code if the request was rejected)
 *
 * Cooldown: one reminder per (mou, stage) per 24 hours, enforced by
 * scanning the MOU auditLog for prior markers.
 */

import { NextResponse } from 'next/server'
import type { AuditEntry, MOU, User } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canSendReminder, computeWorkflowState } from '@/lib/workflowState'
import {
  broadcastNotification,
  recipientsByRole,
} from '@/lib/notifications/createNotification'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { userRepo } from '@/lib/db/repos/user'

const REMINDER_ACTION = 'workflow-reminder-sent'

const OWNER_ROLES: Record<
  'sales' | 'ops' | 'finance' | 'leadership',
  User['role'][]
> = {
  sales: ['SalesHead', 'SalesRep'],
  ops: ['OpsHead', 'OpsEmployee'],
  finance: ['Finance'],
  leadership: ['Leadership'],
}

function lastReminderAt(mou: MOU, stage: string): string | null {
  for (let i = mou.auditLog.length - 1; i >= 0; i--) {
    const entry = mou.auditLog[i]
    if (!entry) continue
    if (entry.action !== REMINDER_ACTION) continue
    const after = entry.after as Record<string, unknown> | undefined
    if (after?.stage === stage) {
      return entry.timestamp
    }
  }
  return null
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login?next=%2F', request.url), {
      status: 303,
    })
  }

  const form = await request.formData()
  const mouId = String(form.get('mouId') ?? '').trim()
  const stage = String(form.get('stage') ?? '').trim()
  if (mouId === '' || stage === '') {
    return NextResponse.redirect(
      new URL('/?error=missing-fields', request.url),
      { status: 303 },
    )
  }

  const mou = await mouRepo.findById(mouId)
  if (!mou) {
    return NextResponse.redirect(
      new URL(`/mous?error=mou-not-found`, request.url),
      { status: 303 },
    )
  }

  const [installments, kd] = await Promise.all([
    paymentRepo.findByMouId(mou.id),
    kitDispatchRepo.findByMouId(mou.id),
  ])
  const dispatches = kd ? [kd] : []
  const now = new Date()

  const banner = computeWorkflowState({ mou, payments: installments, dispatches, now })
  if (!banner || !banner.reminderEligible || !banner.reminderTemplate) {
    return NextResponse.redirect(
      new URL(`/mous/${mou.id}?notice=reminder-not-eligible`, request.url),
      { status: 303 },
    )
  }

  const cooldownPrev = lastReminderAt(mou, stage)
  if (!canSendReminder({ lastReminderAt: cooldownPrev, now })) {
    return NextResponse.redirect(
      new URL(`/mous/${mou.id}?notice=reminder-cooldown`, request.url),
      { status: 303 },
    )
  }

  // Fan-out the reminder to the owning department (or assignee).
  const roles = OWNER_ROLES[banner.owner]
  const allUsers = await userRepo.findAll()
  const recipientIds = recipientsByRole(allUsers, roles).filter(
    (id) => id !== user.id,
  )
  if (recipientIds.length > 0) {
    await broadcastNotification({
      recipientUserIds: recipientIds,
      senderUserId: user.id,
      kind: 'reminder-due',
      title: banner.reminderTemplate.title,
      body: banner.reminderTemplate.body,
      actionUrl: banner.cta?.href ?? `/mous/${mou.id}`,
      payload: { mouId: mou.id, stage },
      relatedEntityId: `${mou.id}-${stage}`,
    })
  }

  // Append cooldown marker to the MOU auditLog so the next request
  // reads the prior timestamp.
  const ts = now.toISOString()
  const auditEntry: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: REMINDER_ACTION,
    after: { stage, owner: banner.owner, recipients: recipientIds.length },
    notes: `Workflow reminder sent for stage=${stage} to ${recipientIds.length} ${banner.owner} recipient(s).`,
  }
  // ATOMIC: just append the audit marker. No scalar fields changed.
  await mouRepo.appendAudit(mou.id, auditEntry)

  return NextResponse.redirect(
    new URL(`/mous/${mou.id}?notice=reminder-sent`, request.url),
    { status: 303 },
  )
}
