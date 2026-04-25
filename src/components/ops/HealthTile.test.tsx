import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HealthTile } from './HealthTile'

describe('HealthTile', () => {
  it('renders label, primary, and unit', () => {
    const html = renderToStaticMarkup(
      <HealthTile label="Active MOUs" primary="24" unit="MOUs" />,
    )
    expect(html).toContain('Active MOUs')
    expect(html).toContain('24')
    expect(html).toContain('MOUs')
  })

  it('exposes a group role with an aria-label naming the metric and status', () => {
    const html = renderToStaticMarkup(
      <HealthTile label="Collection %" primary="78" unit="%" status="ok" />,
    )
    expect(html).toContain('role="group"')
    expect(html).toMatch(/aria-label="[^"]*Collection %[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*Healthy[^"]*"/)
  })

  it('renders trend with arrow icon when supplied', () => {
    const html = renderToStaticMarkup(
      <HealthTile
        label="Active MOUs"
        primary="24"
        trend={{ direction: 'up', magnitude: '4 this week' }}
        status="ok"
      />,
    )
    expect(html).toContain('4 this week')
  })

  it('uses CSS variables for status, never raw hex', () => {
    const html = renderToStaticMarkup(
      <HealthTile label="Schools" primary="5" status="alert" />,
    )
    expect(html).toContain('var(--signal-alert)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
