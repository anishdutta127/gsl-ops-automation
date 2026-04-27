import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ops/TopNav', () => ({ TopNav: () => null }))

describe('/schools list page', () => {
  it('renders school rows from fixture data', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(await SchoolsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('Mutahhary Public School Baroo')
    expect(html).toContain('Don Bosco Bandel')
  })

  it('region filter narrows the list', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ region: 'East' }) }),
    )
    expect(html).toContain('Don Bosco Bandel')
    expect(html).toContain('NARAYANA')
    expect(html).not.toContain('Mutahhary Public School Baroo')
  })

  it('GSTIN missing filter surfaces schools with null gstNumber', async () => {
    // Post Week 3 import every school has gstNumber=null pending pilot backfill,
    // so any imported school name surfaces.
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ gstin: 'missing' }) }),
    )
    expect(html).toContain('Mutahhary Public School Baroo')
  })

  it('chain membership filter (yes) only surfaces SchoolGroup members', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(
      await SchoolsPage({ searchParams: Promise.resolve({ group: 'yes' }) }),
    )
    // SG-CARMEL members include Carmel Convent High School Durgapur etc.
    expect(html).toContain('Carmel')
    expect(html).not.toContain('Mutahhary Public School Baroo')
  })

  it('contains no raw hex codes (token discipline)', async () => {
    const { default: SchoolsPage } = await import('./page')
    const html = renderToStaticMarkup(await SchoolsPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
