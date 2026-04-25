import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LaneBadge } from './LaneBadge'

describe('LaneBadge', () => {
  it('renders OPS with text + Wrench icon (svg present) + colour redundancy', () => {
    const html = renderToStaticMarkup(<LaneBadge lane="OPS" />)
    expect(html).toContain('OPS')
    expect(html).toContain('aria-label="Operations lane"')
    expect(html).toMatch(/<svg/)
  })

  it('renders SALES with text + Briefcase icon + sales-lane label', () => {
    const html = renderToStaticMarkup(<LaneBadge lane="SALES" />)
    expect(html).toContain('SALES')
    expect(html).toContain('aria-label="Sales lane"')
    expect(html).toMatch(/<svg/)
  })

  it('renders ACADEMICS with text + GraduationCap icon + academics-lane label', () => {
    const html = renderToStaticMarkup(<LaneBadge lane="ACADEMICS" />)
    expect(html).toContain('ACADEMICS')
    expect(html).toContain('aria-label="Academics lane"')
    expect(html).toMatch(/<svg/)
  })

  it('size=md renders larger pill chrome', () => {
    const sm = renderToStaticMarkup(<LaneBadge lane="OPS" size="sm" />)
    const md = renderToStaticMarkup(<LaneBadge lane="OPS" size="md" />)
    // md uses px-3 py-1; sm uses px-2 py-0.5
    expect(md).toContain('px-3')
    expect(sm).toContain('px-2')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<LaneBadge lane="ACADEMICS" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
