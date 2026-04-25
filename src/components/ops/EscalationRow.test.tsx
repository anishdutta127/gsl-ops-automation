import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EscalationRow } from './EscalationRow'

describe('EscalationRow', () => {
  it('renders school name, lane pill, level pill, and fan-out', () => {
    const html = renderToStaticMarkup(
      <EscalationRow
        schoolName="Narayana WB"
        description="Trainer mismatch flagged for cohort review"
        lane="ACADEMICS"
        level="L2"
        notifiedNames={['Shashank S.', 'Misba M.']}
        daysSince={2}
        href="/escalations/E-001"
      />,
    )
    expect(html).toContain('Narayana WB')
    expect(html).toContain('ACADEMICS')
    expect(html).toContain('L2')
    expect(html).toContain('Notified: Shashank S., Misba M.')
    expect(html).toContain('2d')
    expect(html).toContain('href="/escalations/E-001"')
  })

  it('OPS lane pill uses brand teal background with brand navy text (via LaneBadge)', () => {
    const html = renderToStaticMarkup(
      <EscalationRow
        schoolName="x"
        description="x"
        lane="OPS"
        level="L1"
        notifiedNames={[]}
        daysSince={1}
        href="/x"
      />,
    )
    expect(html).toContain('OPS')
    // Post-LaneBadge-extract: tokens come through Tailwind named classes,
    // not raw var() refs in the rendered HTML.
    expect(html).toContain('bg-brand-teal')
    expect(html).toContain('text-brand-navy')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('handles empty fan-out with explicit copy rather than empty list', () => {
    const html = renderToStaticMarkup(
      <EscalationRow
        schoolName="x"
        description="x"
        lane="SALES"
        level="L3"
        notifiedNames={[]}
        daysSince={1}
        href="/x"
      />,
    )
    expect(html).toContain('No notifications recorded')
  })

  it('aria-label names school, lane label, and level', () => {
    const html = renderToStaticMarkup(
      <EscalationRow
        schoolName="Techno India"
        description="x"
        lane="SALES"
        level="L2"
        notifiedNames={['Pratik D.']}
        daysSince={4}
        href="/x"
      />,
    )
    expect(html).toMatch(/aria-label="[^"]*Techno India[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*Sales lane[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*level L2[^"]*"/)
  })
})
