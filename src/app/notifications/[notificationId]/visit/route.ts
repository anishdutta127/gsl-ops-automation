/*
 * GET /notifications/[notificationId]/visit
 *
 * One-shot route that marks a notification as read and redirects the
 * user to the notification's actionUrl. Used by both the
 * NotificationBell dropdown and the /notifications list page so that
 * clicking a notification is a single user gesture: mark + navigate.
 *
 * markRead failures (e.g., not-recipient, already-read) do NOT block
 * the redirect: the user clicked with intent to navigate; the
 * notification system is secondary.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import notificationsJson from '@/data/notifications.json'
import type { Notification } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { markRead } from '@/lib/notifications/markRead'

const allNotifications = notificationsJson as unknown as Notification[]

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
): Promise<NextResponse> {
  const { notificationId } = await context.params
  const user = await getCurrentUser()
  if (!user) {
    const loginUrl = new URL(`/login?next=%2Fnotifications%2F${encodeURIComponent(notificationId)}%2Fvisit`, request.url)
    return NextResponse.redirect(loginUrl)
  }

  const n = allNotifications.find((x) => x.id === notificationId)
  if (!n) {
    // Notification gone; bounce to the list so the user has somewhere
    // to land.
    return NextResponse.redirect(new URL('/notifications', request.url))
  }

  // Best-effort markRead; ignore failures (already-read, etc.).
  await markRead({ notificationId, markedBy: user.id }).catch((err) => {
    console.error('[notifications/visit] markRead failed', err)
  })

  return NextResponse.redirect(new URL(n.actionUrl, request.url))
}
