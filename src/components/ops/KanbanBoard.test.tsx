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
    status: 'Active', academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: 1000, spWithTax: 1180, contractValue: 100000, received: 0, tds: 0,
    balance: 100000, receivedPct: 0, paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null, daysToExpiry: null, auditLog: [],
    ...overrides,
  }
}

const emptyBuckets: Record<KanbanStageKey, MOU[]> = {
  'pre-ops': [],
  'mou-signed': [],
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
})
