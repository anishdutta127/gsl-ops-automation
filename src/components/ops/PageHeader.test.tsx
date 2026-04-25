import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders title', () => {
    const html = renderToStaticMarkup(<PageHeader title="Ops at a glance" />)
    expect(html).toContain('Ops at a glance')
    expect(html).toContain('<h1')
  })

  it('renders subtitle when provided', () => {
    const html = renderToStaticMarkup(<PageHeader title="X" subtitle="Y" />)
    expect(html).toContain('Y')
  })

  it('renders breadcrumb with linked + current page semantics', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Detail"
        breadcrumb={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Detail' }]}
      />,
    )
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('aria-current="page"')
  })

  it('renders actions slot when provided', () => {
    const html = renderToStaticMarkup(
      <PageHeader title="X" actions={<button>Click me</button>} />,
    )
    expect(html).toContain('Click me')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<PageHeader title="X" subtitle="Y" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
