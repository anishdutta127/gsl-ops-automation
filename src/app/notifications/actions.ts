'use server'

/*
 * /notifications server actions (W4-E.6).
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { markAllRead } from '@/lib/notifications/markRead'

export async function markAllReadAction(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fnotifications')
  const result = await markAllRead(user.id)
  redirect(`/notifications?marked=${result.updated}`)
}
