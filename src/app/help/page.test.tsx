import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'

const getCurrentUserMock = vi.fn()
const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
})

function user(role: User['role'], id = 'u'): User {
  return {
    id, name: id, email: `${id}@example.test`, role,
    testingOverride: false, active: true, passwordHash: 'X',
    createdAt: '', auditLog: [],
  }
}

describe('/help page (W3-E orientation doc)', () => {
  it('renders for any authenticated user (SalesRep)', async () => {
    getCurrentUserMock.mockResolvedValue(user('SalesRep', 'sp-vikram'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Help')
    expect(html).toContain('What is this system?')
  })

  it('renders all 7 sections with jump-anchor ids', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('id="what-is-this"')
    expect(html).toContain('id="lifecycle-stages"')
    expect(html).toContain('id="glossary"')
    expect(html).toContain('id="workflows"')
    expect(html).toContain('id="what-i-can-change"')
    expect(html).toContain('id="change-semantics"')
    expect(html).toContain('id="contact"')
  })

  it('jump-nav sidebar lists all 7 section links', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="help-jump-nav"')
    expect(html).toContain('href="#what-is-this"')
    expect(html).toContain('href="#glossary"')
    expect(html).toContain('href="#workflows"')
    expect(html).toContain('href="#contact"')
  })

  it('renders all 8 lifecycle stages', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="help-stage-mou-signed"')
    expect(html).toContain('data-testid="help-stage-actuals-confirmed"')
    expect(html).toContain('data-testid="help-stage-cross-verification"')
    expect(html).toContain('data-testid="help-stage-invoice-raised"')
    expect(html).toContain('data-testid="help-stage-payment-received"')
    expect(html).toContain('data-testid="help-stage-kit-dispatched"')
    expect(html).toContain('data-testid="help-stage-delivery-acknowledged"')
    expect(html).toContain('data-testid="help-stage-feedback-submitted"')
  })

  it('glossary surface carries the alphabetical entries (W3-E target: 38 terms)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="help-glossary-list"')
    // Sample five canonical terms cover the operational vocabulary.
    expect(html).toContain('Actuals')
    expect(html).toContain('GSTIN')
    expect(html).toContain('Magic link')
    expect(html).toContain('Pre-Ops Legacy')
    expect(html).toContain('Server-side enforcement')
    expect(html).toContain('Idempotent')
  })

  it('renders the per-role orientation framings (Sales / Ops / Finance / Leadership)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Sales (Pratik, Vishwanath)')
    expect(html).toContain('Ops core team (Pradeep, Misba, Swati, Shashank)')
    expect(html).toContain('Finance (Shubhangi, Pranav)')
    expect(html).toContain('Leadership (Ameet)')
  })

  it('workflows section enumerates the common tasks', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('data-testid="help-workflow-list"')
    expect(html).toContain('Confirming actuals on a MOU')
    expect(html).toContain('Generating a Proforma Invoice')
    expect(html).toContain('Raising a dispatch')
    expect(html).toContain('Sending a feedback request')
    expect(html).toContain('Recording a signed delivery acknowledgement')
    expect(html).toContain('Editing a lifecycle rule duration')
    expect(html).toContain('Moving a kanban card forward')
    // W4-D.7: 3 new dispatch workflow articles + glossary additions
    expect(html).toContain('Submitting a dispatch request as Sales')
    expect(html).toContain('Reviewing and approving a dispatch request as Ops')
    expect(html).toContain('Workflow-aware /mous/[id]/dispatch')
    expect(html).toContain('DispatchRequest')
    expect(html).toContain('raisedFrom origin')
    expect(html).toContain('Line items (dispatch)')
  })

  it('footer carries the doc-vs-system drift note', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('This guide reflects the system as of')
    expect(html).toContain('tell Anish on Teams')
  })

  it('redirects unauthenticated viewers to /login with next preserved', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const { default: Page } = await import('./page')
    await expect(Page()).rejects.toThrow('REDIRECT:/login?next=%2Fhelp')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('W4-E.7 glossary additions render (Notification, Reminder, SchoolSPOC, Reminder thresholds)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Notification')
    expect(html).toContain('Reminder thresholds')
    expect(html).toContain('SchoolSPOC')
    expect(html).toContain('reminder_thresholds.json')
  })

  it('W4-E.7 workflow additions render (Sending reminders, Notifications inbox, SPOC database)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Sending reminders to schools (W4-E.4)')
    expect(html).toContain('Notifications inbox and bell (W4-E.5/E.6)')
    expect(html).toContain('Using the SPOC database (W4-E.2)')
  })

  it('user-facing strings use British "Instalment" not American "Installment" (W3-E sweep)', async () => {
    getCurrentUserMock.mockResolvedValue(user('Admin', 'anish.d'))
    const { default: Page } = await import('./page')
    const html = renderToStaticMarkup(await Page())
    // The glossary defines "Instalment" as a term; American spelling should
    // not appear in the rendered prose. Schema field names like
    // installmentSeq are not user-facing and stay unchanged.
    const userVisibleAmericanCount = (html.match(/Installment\b/g) ?? []).length
    expect(userVisibleAmericanCount).toBe(0)
  })
})
