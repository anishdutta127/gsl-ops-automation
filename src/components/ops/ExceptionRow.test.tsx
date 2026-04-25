import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ExceptionRow } from './ExceptionRow'

describe('ExceptionRow', () => {
  it('renders school name, description, and days-since', () => {
    const html = renderToStaticMarkup(
      <ExceptionRow
        schoolName="Don Bosco Bandel"
        description="Actuals overdue for installment 2"
        daysSince={5}
        priority="alert"
        iconType="late-actuals"
        href="/mous/MOU-STEAM-2627-001"
      />,
    )
    expect(html).toContain('Don Bosco Bandel')
    expect(html).toContain('Actuals overdue')
    expect(html).toContain('5d')
    expect(html).toContain('href="/mous/MOU-STEAM-2627-001"')
  })

  it('singular day label reads "1d"', () => {
    const html = renderToStaticMarkup(
      <ExceptionRow
        schoolName="Test School"
        description="x"
        daysSince={1}
        priority="attention"
        iconType="overdue-invoice"
        href="/x"
      />,
    )
    expect(html).toContain('1d')
  })

  it('aria-label names school, description, priority, and days-since', () => {
    const html = renderToStaticMarkup(
      <ExceptionRow
        schoolName="Carmel"
        description="Dispatch stuck"
        daysSince={3}
        priority="alert"
        iconType="stuck-dispatch"
        href="/x"
      />,
    )
    expect(html).toMatch(/aria-label="[^"]*Carmel[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*Action required[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*3d[^"]*"/)
  })

  it('uses CSS variables for priority dot, no raw hex', () => {
    const html = renderToStaticMarkup(
      <ExceptionRow
        schoolName="x"
        description="x"
        daysSince={1}
        priority="alert"
        iconType="late-actuals"
        href="/x"
      />,
    )
    expect(html).toContain('var(--signal-alert)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
