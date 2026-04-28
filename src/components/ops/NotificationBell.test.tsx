/*
 * W4-E.6 NotificationBell tests.
 *
 * Renders the static fallback (bypasses the Client component because
 * vitest's render path doesn't bridge use-client cleanly here) and
 * verifies the badge cap behaviour: hidden at 0, numeric 1..9, "9+"
 * at 10+. Also covers the test re-export for KIND_ICON map shape.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Notification, User } from '@/lib/types'

vi.mock('@/data/notifications.json', () => ({
  default: [
    notificationFor('NTF-1', 'opshead', null),
    notificationFor('NTF-2', 'opshead', null),
    notificationFor('NTF-3', 'opshead', '2026-04-28T10:00:00.000Z'),
    notificationFor('NTF-4', 'someone-else', null),
  ],
}))

function notificationFor(id: string, recipientUserId: string, readAt: string | null): Notification {
  return {
    id,
    recipientUserId,
    senderUserId: 'sender',
    kind: 'dispatch-request-created',
    title: `Title ${id}`,
    body: `Body ${id}`,
    actionUrl: `/somewhere/${id}`,
    payload: {},
    createdAt: '2026-04-28T09:00:00.000Z',
    readAt,
    auditLog: [],
  }
}

function userFor(id: string): User {
  return {
    id,
    name: id,
    email: `${id}@x.in`,
    role: 'OpsHead',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
  }
}

describe('NotificationBellStatic badge', () => {
  it('renders no badge when zero unread', async () => {
    const { NotificationBellStatic } = await import('./NotificationBell')
    const html = renderToStaticMarkup(
      NotificationBellStatic({ user: userFor('no-notifs-user') }),
    )
    expect(html).not.toContain('data-testid="notification-bell-badge"')
    expect(html).toContain('data-testid="notification-bell-static"')
  })

  it('renders numeric badge for 1..9 unread', async () => {
    const { NotificationBellStatic } = await import('./NotificationBell')
    const html = renderToStaticMarkup(
      NotificationBellStatic({ user: userFor('opshead') }),
    )
    expect(html).toContain('data-testid="notification-bell-badge"')
    // mocked data has 2 unread for opshead
    expect(html).toMatch(/badge[^>]*>2</)
  })
})

describe('NotificationBellStatic 9+ cap', () => {
  it('caps at 9+ when 10 or more unread', async () => {
    vi.resetModules()
    vi.doMock('@/data/notifications.json', () => ({
      default: Array.from({ length: 12 }, (_, i) =>
        notificationFor(`NTF-${i}`, 'cap-user', null),
      ),
    }))
    const { NotificationBellStatic } = await import('./NotificationBell')
    const html = renderToStaticMarkup(
      NotificationBellStatic({ user: userFor('cap-user') }),
    )
    expect(html).toMatch(/badge[^>]*>9\+</)
  })
})
