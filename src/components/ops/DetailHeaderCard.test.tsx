import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetailHeaderCard } from './DetailHeaderCard'

describe('DetailHeaderCard', () => {
  it('renders title + h2', () => {
    const html = renderToStaticMarkup(<DetailHeaderCard title="MOU-X" />)
    expect(html).toContain('<h2')
    expect(html).toContain('MOU-X')
  })

  it('renders subtitle + status badge slot', () => {
    const html = renderToStaticMarkup(
      <DetailHeaderCard
        title="X"
        subtitle="STEAM / GSLT-Cretile"
        statusBadge={<span>Active</span>}
      />,
    )
    expect(html).toContain('STEAM / GSLT-Cretile')
    expect(html).toContain('Active')
  })

  it('renders metadata as dl/dt/dd', () => {
    const html = renderToStaticMarkup(
      <DetailHeaderCard
        title="X"
        metadata={[
          { label: 'School', value: 'Greenfield Academy' },
          { label: 'Sales person', value: 'sp-vikram' },
        ]}
      />,
    )
    expect(html).toContain('<dl')
    expect(html).toContain('<dt')
    expect(html).toContain('School')
    expect(html).toContain('Greenfield Academy')
    expect(html).toContain('Sales person')
    expect(html).toContain('sp-vikram')
  })

  it('renders actions slot when provided', () => {
    const html = renderToStaticMarkup(
      <DetailHeaderCard
        title="X"
        actions={<a href="/x/edit">Edit</a>}
      />,
    )
    expect(html).toContain('Edit')
    expect(html).toContain('href="/x/edit"')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(
      <DetailHeaderCard
        title="X"
        subtitle="Y"
        statusBadge={<span>Active</span>}
        metadata={[{ label: 'a', value: 'b' }]}
        actions={<a href="/y">Y</a>}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
