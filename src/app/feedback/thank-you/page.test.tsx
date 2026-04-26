import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Page from './page'

describe('/feedback/thank-you', () => {
  it('renders confirmation copy without surfacing escalation status', () => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).toContain('Thanks for your feedback')
    expect(html).toContain('We have received your responses')
    expect(html).not.toContain('escalation')
    expect(html).not.toContain('alert')
  })
})
