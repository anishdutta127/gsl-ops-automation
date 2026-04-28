import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MouCard } from './MouCard'
import type { MOU, Programme } from '@/lib/types'

function mou(overrides: Partial<MOU> & Pick<MOU, 'id'>): MOU {
  return {
    schoolId: 'SCH-X',
    schoolName: 'Test School',
    programme: 'STEAM' as Programme,
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 200,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 4237,
    spWithTax: 5000,
    contractValue: 1_000_000,
    received: 0, tds: 0, balance: 1_000_000, receivedPct: 0,
    paymentSchedule: '', trainerModel: null, salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null,
    daysToExpiry: null, delayNotes: null, auditLog: [],
    ...overrides,
  }
}

describe('MouCard', () => {
  it('renders school name + MOU id + programme + click target href', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'MOU-T-1' })} />)
    expect(html).toContain('Test School')
    expect(html).toContain('MOU-T-1')
    expect(html).toContain('STEAM')
    expect(html).toContain('href="/mous/MOU-T-1"')
  })

  it('truncates long school names with ellipsis and preserves full name in title attribute', () => {
    const longName = 'A Very Long School Name That Exceeds The Display Maximum Length Setting'
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', schoolName: longName })} />)
    expect(html).toContain('…')
    expect(html).toContain(`title="${longName}"`)
  })

  it('shows programme + sub-type when sub-type is set', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', programmeSubType: 'GSLT-Cretile' })} />)
    expect(html).toContain('STEAM / GSLT-Cretile')
  })

  it('shows drift badge when studentsVariancePct exceeds +/- 10%', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.20 })} />)
    expect(html).toContain('Drift')
  })

  it('hides drift badge within tolerance', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.05 })} />)
    expect(html).not.toContain('Drift')
  })

  it('shows status badge for non-Active MOUs', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', status: 'Pending Signature' })} />)
    expect(html).toContain('Pending Signature')
  })

  it('omits status badge for Active MOUs (the default state needs no chrome)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', status: 'Active' })} />)
    // The status word "Active" should not surface as a badge; status badge container is absent.
    expect(html).not.toContain('>Active<')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X', studentsVariancePct: 0.20, status: 'Pending Signature' })} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })

  it('has min-h ≥ 44px (touch target spec)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'X' })} />)
    expect(html).toContain('min-h-[88px]')
  })

  // W4-B.1: per-stage next-step indicator on the card.
  it('renders the next-step label for each non-skipped stage', () => {
    const cases: Array<[string, string]> = [
      ['pre-ops', 'Triage: confirm next stage'],
      // W4-C.1 reframe: mou-signed's next-step is now Capture intake details.
      ['mou-signed', 'Capture intake details'],
      ['post-signing-intake', 'Confirm actuals'],
      ['actuals-confirmed', 'Generate PI'],
      ['invoice-raised', 'Record payment received'],
      ['payment-received', 'Raise dispatch'],
      ['kit-dispatched', 'Confirm delivery'],
      ['delivery-acknowledged', 'Compose feedback request'],
      ['feedback-submitted', 'MOU complete'],
    ]
    for (const [stage, label] of cases) {
      const html = renderToStaticMarkup(
        <MouCard mou={mou({ id: 'M' })} stage={stage as Parameters<typeof MouCard>[0]['stage']} />,
      )
      expect(html).toContain('data-testid="next-step"')
      expect(html).toContain(`Next: ${label}`)
    }
  })

  it('omits the next-step label for cross-verification (auto-skipped stage)', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="cross-verification" />,
    )
    // Defensive: even if a card lands here, do not show the placeholder
    // label because it would confuse operators. The page-level dev warn
    // surfaces the regression separately.
    expect(html).not.toContain('Auto-skipped')
    expect(html).not.toContain('data-testid="next-step"')
  })

  it('omits the next-step label when no stage prop is provided (static MouCard usage)', () => {
    const html = renderToStaticMarkup(<MouCard mou={mou({ id: 'M' })} />)
    expect(html).not.toContain('data-testid="next-step"')
  })
})

describe('MouCard W4-E.6.5 urgency stripe', () => {
  it('renders data-urgency=ok when daysInStage < 50% of stage limit', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="mou-signed" daysInStage={3} />,
    )
    expect(html).toContain('data-urgency="ok"')
    expect(html).toContain('border-l-signal-ok')
    expect(html).toContain('on track')
  })

  it('renders data-urgency=attention when daysInStage in the 50-100% band', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="mou-signed" daysInStage={10} />,
    )
    expect(html).toContain('data-urgency="attention"')
    expect(html).toContain('border-l-signal-attention')
  })

  it('renders data-urgency=alert when overdue (daysInStage > limit)', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="mou-signed" daysInStage={20} />,
    )
    expect(html).toContain('data-urgency="alert"')
    expect(html).toContain('border-l-signal-alert')
    expect(html).toContain('Overdue by')
  })

  it('renders data-urgency=none for terminal stages (feedback-submitted)', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="feedback-submitted" daysInStage={50} />,
    )
    expect(html).toContain('data-urgency="none"')
    expect(html).toContain('border-l-transparent')
  })

  it('renders data-urgency=none for pre-ops (no SLA per Anish W4-E.6.5)', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M' })} stage="pre-ops" daysInStage={45} />,
    )
    expect(html).toContain('data-urgency="none"')
  })
})

describe('MouCard W4-E.6.5 programme accent', () => {
  it('renders STEAM accent chip with brand-teal tokens', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M', programme: 'STEAM' as Programme })} />,
    )
    expect(html).toContain('data-testid="programme-accent"')
    expect(html).toContain('data-programme="STEAM"')
    expect(html).toContain('bg-brand-teal/10')
    expect(html).toContain('>STEAM<')
  })

  it('renders TinkRworks accent chip with brand-navy tokens', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M', programme: 'TinkRworks' as Programme })} />,
    )
    expect(html).toContain('data-programme="TinkRworks"')
    expect(html).toContain('bg-brand-navy/10')
    expect(html).toContain('>TinkR<')
  })

  it('renders Young Pioneers accent chip with violet tokens', () => {
    const html = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M', programme: 'Young Pioneers' as Programme })} />,
    )
    expect(html).toContain('data-programme="Young Pioneers"')
    expect(html).toContain('bg-violet-100')
    expect(html).toContain('>YP<')
  })

  it('omits accent chip for Harvard HBPE and VEX (subtle palette)', () => {
    const html1 = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M', programme: 'Harvard HBPE' as Programme })} />,
    )
    expect(html1).not.toContain('data-testid="programme-accent"')
    const html2 = renderToStaticMarkup(
      <MouCard mou={mou({ id: 'M', programme: 'VEX' as Programme })} />,
    )
    expect(html2).not.toContain('data-testid="programme-accent"')
  })
})
