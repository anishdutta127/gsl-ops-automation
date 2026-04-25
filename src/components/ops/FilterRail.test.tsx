import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FilterRail, type FilterDimension } from './FilterRail'

const dimensions: FilterDimension[] = [
  {
    key: 'region',
    label: 'Region',
    options: [
      { value: 'East', label: 'East' },
      { value: 'North', label: 'North' },
    ],
  },
  {
    key: 'programme',
    label: 'Programme',
    options: [{ value: 'STEAM', label: 'STEAM' }],
  },
]

describe('FilterRail', () => {
  it('renders dimension headings + chip labels', () => {
    const html = renderToStaticMarkup(
      <FilterRail basePath="/x" dimensions={dimensions} active={{ region: [], programme: [] }} />,
    )
    expect(html).toContain('Region')
    expect(html).toContain('Programme')
    expect(html).toContain('East')
    expect(html).toContain('North')
    expect(html).toContain('STEAM')
  })

  it('inactive chip href adds value to query string', () => {
    const html = renderToStaticMarkup(
      <FilterRail basePath="/x" dimensions={dimensions} active={{ region: [], programme: [] }} />,
    )
    expect(html).toContain('href="/x?region=East"')
  })

  it('active chip href removes value from query string', () => {
    const html = renderToStaticMarkup(
      <FilterRail
        basePath="/x"
        dimensions={dimensions}
        active={{ region: ['East'], programme: [] }}
      />,
    )
    // The East chip is active; clicking it should drop the region param.
    expect(html).toContain('href="/x"')
    expect(html).toMatch(/aria-pressed="true"/)
  })

  it('preserves search value through chip toggle hrefs', () => {
    const html = renderToStaticMarkup(
      <FilterRail
        basePath="/x"
        dimensions={dimensions}
        active={{ region: [], programme: [] }}
        search={{ value: 'green', placeholder: 'p' }}
      />,
    )
    expect(html).toContain('q=green')
  })

  it('shows Clear all link only when at least one filter is active', () => {
    const noFilter = renderToStaticMarkup(
      <FilterRail basePath="/x" dimensions={dimensions} active={{ region: [], programme: [] }} />,
    )
    expect(noFilter).not.toContain('Clear all filters')

    const active = renderToStaticMarkup(
      <FilterRail
        basePath="/x"
        dimensions={dimensions}
        active={{ region: ['East'], programme: [] }}
      />,
    )
    expect(active).toContain('Clear all filters')
  })

  it('search form preserves active dimensions as hidden inputs', () => {
    const html = renderToStaticMarkup(
      <FilterRail
        basePath="/x"
        dimensions={dimensions}
        active={{ region: ['East', 'North'], programme: [] }}
        search={{ value: '', placeholder: 'search' }}
      />,
    )
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="region"[^>]*value="East,North"/)
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(
      <FilterRail
        basePath="/x"
        dimensions={dimensions}
        active={{ region: ['East'], programme: [] }}
        search={{ value: 'green', placeholder: 'p' }}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
