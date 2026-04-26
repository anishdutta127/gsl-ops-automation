import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from './page'

describe('/feedback/link-expired', () => {
  it('renders the canonical expired-link copy', () => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).toContain('no longer active')
    expect(html).toContain('48 hours')
    expect(html).toContain('GSL ops team')
  })

  it('does not leak the precise failure mode (single canonical copy)', () => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).not.toContain('HMAC')
    expect(html).not.toMatch(/signature/i)
    expect(html).not.toMatch(/already submitted/i)
  })
})
