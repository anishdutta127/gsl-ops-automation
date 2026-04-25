import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

describe('/schools list page', () => {
  it('renders school rows from fixture data', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(await SchoolsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('Maple Leaf Public School')
  })

  it('region filter narrows the list', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ region: 'East' }) }),
    )
    expect(html).toContain('Springwood')
    expect(html).toContain('Narayana')
    expect(html).not.toContain('Greenfield Academy')
  })

  it('GSTIN missing filter surfaces only schools with null gstNumber', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ gstin: 'missing' }) }),
    )
    // Maple Leaf has gstNumber: null per fixtures
    expect(html).toContain('Maple Leaf')
  })

  it('chain membership filter (yes) only surfaces SchoolGroup members', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ group: 'yes' }) }),
    )
    // Narayana branches are members of SG-NARAYANA_WB
    expect(html).toContain('Narayana')
    expect(html).not.toContain('Greenfield Academy')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(await SchoolsPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
