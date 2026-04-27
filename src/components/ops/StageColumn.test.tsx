import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageColumn } from './StageColumn'

describe('StageColumn', () => {
  it('renders label + count for the lifecycle variant', () => {
    const html = renderToStaticMarkup(
      <StageColumn
        columnKey="invoice-raised"
        label="Invoice raised"
        variant="lifecycle"
        count={91}
      >
        <div>card</div>
      </StageColumn>,
    )
    expect(html).toContain('Invoice raised')
    expect(html).toContain('>91<')
    expect(html).toContain('data-testid="stage-count-invoice-raised"')
  })

  it('renders "Needs triage: N" framing for the muted variant', () => {
    const html = renderToStaticMarkup(
      <StageColumn columnKey="pre-ops" label="Needs triage" variant="muted" count={9}>
        <div>card</div>
      </StageColumn>,
    )
    expect(html).toContain('Needs triage: 9')
    expect(html).toContain('italic')
  })

  it('headerHref turns the label into a Link with the right target (W3-C C3)', () => {
    const html = renderToStaticMarkup(
      <StageColumn
        columnKey="invoice-raised"
        label="Invoice raised"
        variant="lifecycle"
        count={1}
        headerHref="/mous?stage=invoice-raised"
      >
        <div>card</div>
      </StageColumn>,
    )
    expect(html).toContain('href="/mous?stage=invoice-raised"')
    expect(html).toContain('data-testid="stage-header-link-invoice-raised"')
  })

  it('without headerHref the label renders as a plain h2 (no link)', () => {
    const html = renderToStaticMarkup(
      <StageColumn columnKey="mou-signed" label="MOU signed" variant="lifecycle" count={0}>
        <div>card</div>
      </StageColumn>,
    )
    expect(html).not.toContain('data-testid="stage-header-link-')
    expect(html).toContain('<h2')
  })

  it('mobile vertical-stack: full width on small viewports, fixed width on tablet+', () => {
    const html = renderToStaticMarkup(
      <StageColumn columnKey="mou-signed" label="MOU signed" variant="lifecycle" count={0}>
        <div>card</div>
      </StageColumn>,
    )
    expect(html).toContain('w-full')
    expect(html).toContain('md:w-72')
  })
})
