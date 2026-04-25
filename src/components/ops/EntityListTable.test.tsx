import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntityListTable, type ColumnDef } from './EntityListTable'

interface Row { id: string; name: string }

const rows: Row[] = [
  { id: 'r1', name: 'Alpha' },
  { id: 'r2', name: 'Bravo' },
]

const columns: ColumnDef<Row>[] = [
  { key: 'id', header: 'ID', render: (r) => r.id },
  { key: 'name', header: 'Name', render: (r) => r.name },
]

describe('EntityListTable', () => {
  it('renders rows and headers', () => {
    const html = renderToStaticMarkup(
      <EntityListTable rows={rows} columns={columns} rowKey={(r) => r.id} />,
    )
    expect(html).toContain('Alpha')
    expect(html).toContain('Bravo')
    expect(html).toContain('<th')
    expect(html).toContain('ID')
    expect(html).toContain('Name')
  })

  it('renders empty slot when rows is empty', () => {
    const html = renderToStaticMarkup(
      <EntityListTable
        rows={[]}
        columns={columns}
        rowKey={(r) => r.id}
        empty={<div>Nothing here</div>}
      />,
    )
    expect(html).toContain('Nothing here')
  })

  it('rowHref wraps each cell in a Link to the row href', () => {
    const html = renderToStaticMarkup(
      <EntityListTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    )
    expect(html).toContain('href="/x/r1"')
    expect(html).toContain('href="/x/r2"')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(
      <EntityListTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/x/${r.id}`}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
