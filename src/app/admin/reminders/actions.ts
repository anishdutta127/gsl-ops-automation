'use server'

/*
 * /admin/reminders server actions.
 *
 * Two flows:
 *   composeReminderAction   -> calls composeReminder lib, persists a
 *                              new Communication via the queue, then
 *                              redirects to the per-reminder compose
 *                              detail page where the operator copies
 *                              content to Outlook.
 *   markReminderSentAction  -> calls markReminderSent lib (flips the
 *                              Communication status to 'sent') and
 *                              redirects back to the list with a
 *                              success flash.
 *
 * Both gate on getCurrentUser; the libs themselves carry the
 * canPerform('reminder:create') check (defense in depth).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { composeReminder } from '@/lib/reminders/composeReminder'
import { markReminderSent } from '@/lib/reminders/markReminderSent'

export async function composeReminderAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin/reminders')

  const reminderId = String(formData.get('reminderId') ?? '').trim()
  if (reminderId === '') redirect('/admin/reminders?error=missing-reminder-id')

  const result = await composeReminder({ reminderId, composedBy: user.id })
  if (!result.ok) {
    redirect(`/admin/reminders?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(
    `/admin/reminders/${encodeURIComponent(reminderId)}?communicationId=${encodeURIComponent(result.communication.id)}&composed=1`,
  )
}

export async function markReminderSentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin/reminders')

  const communicationId = String(formData.get('communicationId') ?? '').trim()
  if (communicationId === '') redirect('/admin/reminders?error=missing-communication-id')

  const result = await markReminderSent({ communicationId, markedBy: user.id })
  if (!result.ok) {
    redirect(`/admin/reminders?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/admin/reminders?sent=${encodeURIComponent(communicationId)}`)
}
