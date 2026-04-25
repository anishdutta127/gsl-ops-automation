import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title and role=status', () => {
    const html = renderToStaticMarkup(<EmptyState title="No items here." />)
    expect(html).toContain('role="status"')
    expect(html).toContain('No items here.')
  })

  it('renders description when provided', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="X" description="Long explanation." />,
    )
    expect(html).toContain('Long explanation.')
  })

  it('renders action slot when provided', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="X" action={<a href="/foo">Do it</a>} />,
    )
    expect(html).toContain('Do it')
    expect(html).toContain('href="/foo"')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<EmptyState title="X" description="Y" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
