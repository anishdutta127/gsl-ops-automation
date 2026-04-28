import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Notification, User } from '@/lib/types'

const getCurrentUserMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`redirected:${url}`)
    },
  }
})

vi.mock('@/data/notifications.json', () => ({
  default: [
    notif('NTF-1', 'pradeep.r', null, 'dispatch-request-created'),
    notif('NTF-2', 'pradeep.r', null, 'intake-completed'),
    notif('NTF-3', 'pradeep.r', '2026-04-28T10:00:00.000Z', 'payment-recorded'),
    notif('NTF-4', 'someone-else', null, 'dispatch-request-created'),
  ],
}))

function notif(id: string, rid: string, readAt: string | null, kind: Notification['kind']): Notification {
  return {
    id,
    recipientUserId: rid,
    senderUserId: 'sender',
    kind,
    title: `Title ${id}`,
    body: `Body ${id}`,
    actionUrl: `/x/${id}`,
    payload: {},
    createdAt: '2026-04-28T09:00:00.000Z',
    readAt,
    auditLog: [],
  }
}

function admin(): User {
  return {
    id: 'pradeep.r',
    name: 'Pradeep',
    email: 'pradeep.r@gsl.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: '',
    createdAt: '',
    auditLog: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/notifications page', () => {
  it('redirects to /login when no session', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(
      Page({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow(/redirected:\/login/)
  })

  it('renders the 3 own notifications and skips someone-else (default filter all)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="notif-row-NTF-1"')
    expect(html).toContain('data-testid="notif-row-NTF-2"')
    expect(html).toContain('data-testid="notif-row-NTF-3"')
    expect(html).not.toContain('data-testid="notif-row-NTF-4"')
  })

  it('?filter=unread shows only unread', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ filter: 'unread' }) }),
    )
    expect(html).toContain('data-testid="notif-row-NTF-1"')
    expect(html).toContain('data-testid="notif-row-NTF-2"')
    // NTF-3 is read; should be filtered out
    expect(html).not.toContain('data-testid="notif-row-NTF-3"')
  })

  it('mark-all-read button visible only when unread > 0', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="notif-mark-all-read"')
    // 2 unread
    expect(html).toContain('Mark all read (2)')
  })

  it('marked-flash banner appears with ?marked=N', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ marked: '5' }) }),
    )
    expect(html).toContain('data-testid="notifications-marked-flash"')
    expect(html).toContain('Marked 5 notifications as read')
  })

  it('filter chips render for all + unread + 8 NotificationKind values (10 total)', async () => {
    getCurrentUserMock.mockResolvedValue(admin())
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-testid="notif-filter-all"')
    expect(html).toContain('data-testid="notif-filter-unread"')
    expect(html).toContain('data-testid="notif-filter-dispatch-request-created"')
    expect(html).toContain('data-testid="notif-filter-dispatch-request-approved"')
    expect(html).toContain('data-testid="notif-filter-dispatch-request-rejected"')
    expect(html).toContain('data-testid="notif-filter-dispatch-request-cancelled"')
    expect(html).toContain('data-testid="notif-filter-intake-completed"')
    expect(html).toContain('data-testid="notif-filter-payment-recorded"')
    expect(html).toContain('data-testid="notif-filter-escalation-assigned"')
    expect(html).toContain('data-testid="notif-filter-reminder-due"')
  })
})
