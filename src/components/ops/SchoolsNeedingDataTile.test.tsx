import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SchoolsNeedingDataTile } from './SchoolsNeedingDataTile'

describe('SchoolsNeedingDataTile', () => {
  it('renders amber state when count > 0', () => {
    const html = renderToStaticMarkup(<SchoolsNeedingDataTile count={119} total={124} />)
    expect(html).toContain('Schools needing data')
    expect(html).toContain('119 of 124 schools missing')
    expect(html).toContain('signal-attention')
    expect(html).toContain('href="/schools?incomplete=yes"')
  })

  it('renders green state when count === 0', () => {
    const html = renderToStaticMarkup(<SchoolsNeedingDataTile count={0} total={124} />)
    expect(html).toContain('All 124 schools have complete data.')
    expect(html).toContain('signal-ok')
    expect(html).not.toContain('signal-attention')
  })

  it('exposes count via data-attribute for tests', () => {
    const html = renderToStaticMarkup(<SchoolsNeedingDataTile count={42} total={50} />)
    expect(html).toContain('data-count="42"')
  })

  it('contains no raw hex codes', () => {
    const html = renderToStaticMarkup(<SchoolsNeedingDataTile count={5} total={10} />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
