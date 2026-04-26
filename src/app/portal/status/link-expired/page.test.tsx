import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from './page'

describe('/portal/status/link-expired', () => {
  it('renders the canonical expired-link copy for status portal', () => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).toContain('no longer active')
    expect(html).toContain('30 days')
    expect(html).toContain('GSL ops team')
  })
})
