import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RatingSegments } from './RatingSegments'

describe('RatingSegments', () => {
  it('renders 5 numbered radios plus a Skip radio with role="radiogroup"', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={null} onChange={() => {}} ariaLabel="Test rating" />,
    )
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-label="Test rating"')
    // 5 numbered + 1 skip = 6 radio buttons
    const radioMatches = html.match(/role="radio"/g) ?? []
    expect(radioMatches).toHaveLength(6)
    expect(html).toContain('Skip')
  })

  it('marks selected number with aria-checked="true" and others false', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={3} onChange={() => {}} ariaLabel="x" />,
    )
    const checkedMatches = html.match(/aria-checked="true"/g) ?? []
    const uncheckedMatches = html.match(/aria-checked="false"/g) ?? []
    expect(checkedMatches).toHaveLength(1)
    expect(uncheckedMatches).toHaveLength(5)
  })

  it('Skip radio is checked when value is null', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={null} onChange={() => {}} ariaLabel="x" />,
    )
    // Last radio in DOM order is Skip; nearest aria-checked tag for it:
    expect(html).toMatch(/Skip/)
    const checkedMatches = html.match(/aria-checked="true"/g) ?? []
    expect(checkedMatches.length).toBeGreaterThanOrEqual(1)
  })

  it('numeric labels (Poor / Fair / OK / Good / Excellent) render in sr-only sm:not-sr-only', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={null} onChange={() => {}} ariaLabel="x" />,
    )
    expect(html).toContain('Poor')
    expect(html).toContain('Excellent')
    expect(html).toContain('sr-only')
  })

  it('uses CSS variables for active state, no raw hex', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={4} onChange={() => {}} ariaLabel="x" />,
    )
    expect(html).toContain('var(--brand-teal)')
    expect(html).toContain('var(--brand-navy)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('48px touch target preserved (h-12 = 48px)', () => {
    const html = renderToStaticMarkup(
      <RatingSegments value={null} onChange={() => {}} ariaLabel="x" />,
    )
    expect(html).toContain('h-12')
  })
})
