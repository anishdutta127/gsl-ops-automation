import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TriggerTile } from './TriggerTile'

describe('TriggerTile', () => {
  it('renders label, primary, and threshold', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="CEO Overrides (7d)"
        primary="2"
        threshold="Trigger: 3+/week × 2 weeks"
      />,
    )
    expect(html).toContain('CEO Overrides (7d)')
    expect(html).toContain('2')
    expect(html).toContain('Trigger: 3+/week')
  })

  it('aria-label combines label, primary, status, and threshold', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Bounce Rate"
        primary="6%"
        threshold="5% triggers alert"
        status="alert"
      />,
    )
    expect(html).toMatch(/aria-label="[^"]*Bounce Rate[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*Threshold breached[^"]*"/)
  })

  it('includes redundant icon plus sr-only status text alongside coloured number', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Drift Queue"
        primary="6"
        threshold="5+ triggers attention"
        status="attention"
      />,
    )
    expect(html).toContain('Drifting')
    expect(html).toContain('var(--signal-attention)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
