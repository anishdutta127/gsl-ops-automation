import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TransitionDialog } from './TransitionDialog'
import type { TransitionClassification } from '@/lib/kanban/transitions'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function classification(overrides: Partial<TransitionClassification>): TransitionClassification {
  return {
    kind: 'forward-by-one',
    fromStage: 'actuals-confirmed',
    toStage: 'cross-verification',
    reasonRequired: false,
    forwardFormPath: '/mous/M-T/pi',
    copyKey: 'forward-by-one',
    ...overrides,
  }
}

describe('TransitionDialog (server-render markup checks)', () => {
  it('renders nothing when open=false', () => {
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={false}
        classification={classification({})}
        mouId="M-T"
        schoolName="Test School"
        onClose={() => {}}
        onConfirm={async () => null}
      />,
    )
    expect(html).toBe('')
  })

  it('renders nothing when classification is null', () => {
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true}
        classification={null}
        mouId="M-T"
        schoolName="Test School"
        onClose={() => {}}
        onConfirm={async () => null}
      />,
    )
    expect(html).toBe('')
  })

  it('forward-by-one: renders title + body + Continue button + NO reason field', () => {
    const c = classification({ kind: 'forward-by-one', copyKey: 'forward-by-one', reasonRequired: false })
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).toContain('Continue to next stage')
    expect(html).toContain('Test School')
    expect(html).toContain('Continue to form')
    expect(html).not.toContain('Reason (logged in audit)')
    expect(html).not.toContain('data-testid="transition-reason"')
  })

  it('forward-skip: shows reason field + skip-warning copy', () => {
    const c = classification({
      kind: 'forward-skip',
      fromStage: 'mou-signed', toStage: 'kit-dispatched',
      copyKey: 'forward-skip', reasonRequired: true,
      forwardFormPath: '/mous/M-T/dispatch',
    })
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).toContain('Skip stages')
    expect(html).toContain('skipping intermediate stages')
    expect(html).toContain('Reason (logged in audit)')
    expect(html).toContain('data-testid="transition-reason"')
    expect(html).toContain('Continue to form')
  })

  it('backward: reason field + "Record move" button (no nav)', () => {
    const c = classification({
      kind: 'backward',
      fromStage: 'invoice-raised', toStage: 'actuals-confirmed',
      copyKey: 'backward', reasonRequired: true, forwardFormPath: null,
    })
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).toContain('Move back to a prior stage')
    // Apostrophe is HTML-escaped to &#x27; by react-dom/server.
    expect(html).toContain('Lifecycle data won')
    expect(html).toContain('auto-revert')
    expect(html).toContain('Record move')
    expect(html).toContain('Reason (logged in audit)')
    expect(html).toContain('/mous/M-T')
  })

  it('pre-ops-exit: reason field + triage copy + Continue button when forward path exists', () => {
    const c = classification({
      kind: 'pre-ops-exit',
      fromStage: 'pre-ops', toStage: 'invoice-raised',
      copyKey: 'pre-ops-exit', reasonRequired: true,
      forwardFormPath: '/mous/M-T/pi',
    })
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).toContain('Triage decision')
    expect(html).toContain('Pre-Ops is a triage holding bay')
    expect(html).toContain('Reason (logged in audit)')
    expect(html).toContain('Continue to form')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const c = classification({ kind: 'forward-skip', copyKey: 'forward-skip', reasonRequired: true })
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('Cancel + Confirm buttons meet touch target spec (min-h-11 = 44px)', () => {
    const c = classification({})
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    // Both Cancel and Confirm carry min-h-11 (44px on Tailwind's 4px scale).
    const matches = html.match(/min-h-11/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('aria attributes for accessibility (role=dialog, aria-modal, aria-labelledby, aria-describedby)', () => {
    const c = classification({})
    const html = renderToStaticMarkup(
      <TransitionDialog
        open={true} classification={c} mouId="M-T" schoolName="Test School"
        onClose={() => {}} onConfirm={async () => null}
      />,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('aria-describedby=')
  })
})
