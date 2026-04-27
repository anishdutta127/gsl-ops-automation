import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KanbanBoard } from './KanbanBoard'
import type { MOU, Programme } from '@/lib/types'
import type { KanbanStageKey } from '@/lib/kanban/deriveStage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-T', schoolName: 'Test', programme: 'STEAM' as Programme,
    programmeSubType: null, schoolScope: 'SINGLE', schoolGroupId: null,
    status: 'Active', cohortStatus: 'active', academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null, daysToExpiry: null, delayNotes: null, auditLog: [],
    ...overrides,
  }
}

const emptyBuckets: Record<KanbanStageKey, MOU[]> = {
  'pre-ops': [],
  'mou-signed': [],
  'post-signing-intake': [],
  'actuals-confirmed': [],
  'cross-verification': [],
  'invoice-raised': [],
  'payment-received': [],
  'kit-dispatched': [],
  'delivery-acknowledged': [],
  'feedback-submitted': [],
}

describe('KanbanBoard', () => {
  it('renders all 9 columns wrapped in droppable surfaces', () => {
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={emptyBuckets} />)
    expect(html).toContain('data-testid="kanban-board"')
    expect(html).toContain('data-testid="droppable-pre-ops"')
    expect(html).toContain('data-testid="droppable-mou-signed"')
    expect(html).toContain('data-testid="droppable-actuals-confirmed"')
    expect(html).toContain('data-testid="droppable-cross-verification"')
    expect(html).toContain('data-testid="droppable-invoice-raised"')
    expect(html).toContain('data-testid="droppable-payment-received"')
    expect(html).toContain('data-testid="droppable-kit-dispatched"')
    expect(html).toContain('data-testid="droppable-delivery-acknowledged"')
    expect(html).toContain('data-testid="droppable-feedback-submitted"')
  })

  it('renders MouCards as draggable anchors with href to detail page', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' }), mou({ id: 'M-B' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).toContain('data-mou-id="M-A"')
    expect(html).toContain('data-mou-id="M-B"')
    expect(html).toContain('href="/mous/M-A"')
    expect(html).toContain('href="/mous/M-B"')
  })

  it('Pre-Ops column carries the muted "Needs triage" framing', () => {
    const buckets = { ...emptyBuckets, 'pre-ops': [mou({ id: 'M-PO', status: 'Pending Signature' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).toContain('Needs triage:')
    expect(html).toContain('data-mou-id="M-PO"')
  })

  it('empty column shows "Empty." placeholder', () => {
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={emptyBuckets} />)
    expect(html).toContain('Empty.')
  })

  it('TransitionDialog and toast are not rendered when no drag is in progress', () => {
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={emptyBuckets} />)
    expect(html).not.toContain('data-testid="transition-dialog"')
    expect(html).not.toContain('data-testid="kanban-toast"')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const buckets = { ...emptyBuckets, 'mou-signed': [mou({ id: 'M-X', studentsVariancePct: 0.20 })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('cards inside columns meet 88px touch target spec', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).toContain('min-h-[88px]')
  })

  // W3-F.5: drag handle on every card; click-vs-drag spatially distinct.
  it('renders a drag handle on every card with an aria-label naming the school', () => {
    const buckets = {
      ...emptyBuckets,
      'invoice-raised': [
        mou({ id: 'M-A', schoolName: 'Alpha School' }),
        mou({ id: 'M-B', schoolName: 'Beta School' }),
      ],
    }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    const handleMatches = html.match(/data-testid="mou-card-drag-handle"/g) ?? []
    expect(handleMatches.length).toBe(2)
    expect(html).toContain('aria-label="Drag Alpha School card to move it between stages"')
    expect(html).toContain('aria-label="Drag Beta School card to move it between stages"')
  })

  it('drag handle uses GripVertical icon and cursor-grab; active state cursor-grabbing', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).toContain('cursor-grab')
    expect(html).toContain('active:cursor-grabbing')
    // GripVertical lucide icon renders as an inline svg with the
    // `lucide-grip-vertical` class. Asserting the class proves the
    // icon is the intended one, not just any SVG.
    expect(html).toMatch(/class="[^"]*lucide-grip-vertical[^"]*"/)
  })

  it('drag handle wrapper hits the 44px touch target spec (size-11)', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    // Tailwind size-11 = 44px on both axes. The handle button is the
    // pointer / keyboard target; the icon inside is smaller (size-4)
    // for visual restraint.
    expect(html).toContain('size-11')
  })

  it('card body anchor (not handle) is the click-to-navigate target', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    // The href lives on the body <a>, not on the handle <button>; a
    // click anywhere on the card body therefore navigates.
    expect(html).toContain('href="/mous/M-A"')
    expect(html).toMatch(/<a[^>]+href="\/mous\/M-A"/)
    // Handle button has no href attribute (it's a <button type="button">).
    expect(html).toMatch(/<button[^>]+data-testid="mou-card-drag-handle"[^>]*>/)
    expect(html).not.toMatch(/<button[^>]+href=/)
  })

  // W4-A.8: scroll-snap + chevron buttons on the kanban grid.
  it('renders left + right scroll-control chevron buttons (md+ only)', () => {
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={emptyBuckets} />)
    expect(html).toContain('data-testid="kanban-scroll-left"')
    expect(html).toContain('data-testid="kanban-scroll-right"')
    expect(html).toContain('aria-label="Scroll to previous columns"')
    expect(html).toContain('aria-label="Scroll to next columns"')
    // Hidden on mobile via `hidden md:flex` to match the vertical-stack layout.
    // Match within the same <button> tag (class= comes before data-testid in
    // the rendered output; we anchor on the button start tag to avoid
    // crossing element boundaries).
    expect(html).toMatch(
      /<button[^>]*class="[^"]*\bhidden\b[^"]*\bmd:flex\b[^"]*"[^>]*data-testid="kanban-scroll-left"/,
    )
  })

  it('scroll buttons hit the 44px touch-target spec (size-11)', () => {
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={emptyBuckets} />)
    // size-11 = 44px on both axes; appears on both chevrons. Match either
    // attribute order on the button start tag.
    const sizeMatches = html.match(
      /<button[^>]*class="[^"]*\bsize-11\b[^"]*"[^>]*data-testid="kanban-scroll-(left|right)"/g,
    ) ?? []
    expect(sizeMatches.length).toBe(2)
  })

  it('kanban grid uses scroll-snap classes; columns carry md:snap-start', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).toContain('md:snap-x')
    expect(html).toContain('md:snap-mandatory')
    // Every column wrapper carries md:snap-start. Class precedes data-testid
    // in the rendered output.
    const snapMatches = html.match(
      /<div[^>]*class="[^"]*\bmd:snap-start\b[^"]*"[^>]*data-testid="droppable-[^"]+"/g,
    ) ?? []
    expect(snapMatches.length).toBe(10)
  })

  it('contains no raw hex codes in the scroll-control markup (token discipline)', () => {
    const buckets = { ...emptyBuckets, 'invoice-raised': [mou({ id: 'M-A' })] }
    const html = renderToStaticMarkup(<KanbanBoard initialBuckets={buckets} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
