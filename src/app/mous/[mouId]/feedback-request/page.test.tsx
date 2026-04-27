import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const notFoundMock = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })

vi.mock('@/lib/auth/session', () => ({ getCurrentUser: () => getCurrentUserMock() }))
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

const mockComms = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/data/communications.json', () => ({
  get default() { return mockComms.value },
}))

// W3-A.2: post-import every school carries email=null, so the SPOC-email-missing
// branch in feedback-request/page.tsx supersedes the role-lock branch. Tests
// that exercise the role-lock branch inject a school override with email set.
const mockSchools = vi.hoisted(() => ({ value: null as unknown[] | null }))
vi.mock('@/data/schools.json', async () => {
  const actual = (await vi.importActual<{ default: unknown[] }>('@/data/schools.json')).default
  return {
    get default() { return mockSchools.value ?? actual },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockComms.value = []
  mockSchools.value = null
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

async function loadPage() {
  return (await import('./page')).default
}

describe('/mous/[mouId]/feedback-request page (compose state)', () => {
  it('OpsHead sees the compose form posting to /api/communications/compose', async () => {
    // Inject school with email set so the page reaches the compose-form branch
    // (default upstream school has email=null which would surface the SPOC alert).
    mockSchools.value = [{
      id: 'SCH-MUTAHHARY_PUBLIC_SCH', name: 'Mutahhary Public School Baroo',
      legalEntity: null, city: 'Kargil', state: 'Union Territory of Ladakh',
      region: 'North', pinCode: null, contactPerson: 'SPOC Test',
      email: 'spoc@example.test', phone: null, billingName: null,
      pan: null, gstNumber: null, notes: null,
      active: true, createdAt: '2026-04-27T12:00:00Z', auditLog: [],
    }]
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('action="/api/communications/compose"')
    expect(html).toContain('Compose feedback request')
    expect(html).not.toContain('Phase 1 note: this submit endpoint is wired')
  })

  it('SalesRep on own MOU also sees the form (Phase 1 W3-B: UI gates disabled)', async () => {
    // sp-roveena owns MOU-STEAM-2627-001. Inject a school with email set so
    // the page reaches the form branch (default upstream school has email=null
    // which would surface the SPOC alert instead).
    mockSchools.value = [{
      id: 'SCH-MUTAHHARY_PUBLIC_SCH', name: 'Mutahhary Public School Baroo',
      legalEntity: null, city: 'Kargil', state: 'Union Territory of Ladakh',
      region: 'North', pinCode: null, contactPerson: 'SPOC Test',
      email: 'spoc@example.test', phone: null, billingName: null,
      pan: null, gstNumber: null, notes: null,
      active: true, createdAt: '2026-04-27T12:00:00Z', auditLog: [],
    }]
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-roveena'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('action="/api/communications/compose"')
  })

  it('error=school-email-missing surfaces a friendly message', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ error: 'school-email-missing' }),
      }),
    )
    expect(html).toContain('SPOC email is missing')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})

describe('/mous/[mouId]/feedback-request page (composed-content state)', () => {
  it('renders the ComposedFeedbackRequestPanel when communicationId resolves', async () => {
    mockComms.value = [
      {
        id: 'COM-FBR-test', type: 'feedback-request',
        schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH', mouId: 'MOU-STEAM-2627-001',
        installmentSeq: 1, channel: 'email',
        subject: 'Your feedback on the STEAM sessions at Greenfield Academy',
        bodyEmail: '<html><body>Dear Priya...</body></html>',
        bodyWhatsApp: 'Hi Priya, please share feedback...',
        toEmail: 'spoc.greenfield@example.test', toPhone: null,
        ccEmails: [], queuedAt: '2026-04-26T10:00:00Z', queuedBy: 'pradeep.r',
        sentAt: null, copiedAt: null, status: 'queued-for-manual',
        bounceDetail: null, auditLog: [],
      },
    ]
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ communicationId: 'COM-FBR-test' }),
      }),
    )
    expect(html).toContain('Email draft')
    expect(html).toContain('WhatsApp draft')
    expect(html).toContain('Copy email content')
    expect(html).toContain('Copy WhatsApp draft')
    expect(html).toContain('Mark as sent')
    expect(html).toContain('action="/api/communications/COM-FBR-test/mark-sent"')
  })

  it('hides compose form when composed content is shown', async () => {
    mockComms.value = [
      {
        id: 'COM-FBR-test', type: 'feedback-request',
        schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH', mouId: 'MOU-STEAM-2627-001',
        installmentSeq: 1, channel: 'email',
        subject: 'X', bodyEmail: '<p>X</p>', bodyWhatsApp: 'X',
        toEmail: 'x@example.test', toPhone: null,
        ccEmails: [], queuedAt: '2026-04-26T10:00:00Z', queuedBy: 'pradeep.r',
        sentAt: null, copiedAt: null, status: 'queued-for-manual',
        bounceDetail: null, auditLog: [],
      },
    ]
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ communicationId: 'COM-FBR-test' }),
      }),
    )
    expect(html).not.toContain('action="/api/communications/compose"')
  })

  it('shows "Marked as sent" confirmation when ?marked=sent is in query', async () => {
    mockComms.value = [
      {
        id: 'COM-FBR-test', type: 'feedback-request',
        schoolId: 'SCH-MUTAHHARY_PUBLIC_SCH', mouId: 'MOU-STEAM-2627-001',
        installmentSeq: 1, channel: 'email',
        subject: 'X', bodyEmail: '<p>X</p>', bodyWhatsApp: 'X',
        toEmail: 'x@example.test', toPhone: null,
        ccEmails: [], queuedAt: '2026-04-26T10:00:00Z', queuedBy: 'pradeep.r',
        sentAt: '2026-04-26T11:00:00Z', copiedAt: null, status: 'sent',
        bounceDetail: null, auditLog: [],
      },
    ]
    getCurrentUserMock.mockResolvedValue(user('OpsHead', 'pradeep.r'))
    const Page = await loadPage()
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ mouId: 'MOU-STEAM-2627-001' }),
        searchParams: Promise.resolve({ communicationId: 'COM-FBR-test', marked: 'sent' }),
      }),
    )
    expect(html).toContain('Marked as sent')
  })
})
