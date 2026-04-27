import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KanbanOverviewTabs } from './KanbanOverviewTabs'

describe('KanbanOverviewTabs', () => {
  it('renders both tab links', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="kanban" />)
    expect(html).toContain('data-testid="tab-kanban"')
    expect(html).toContain('data-testid="tab-overview"')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/overview"')
  })

  it('Kanban tab has aria-current="page" when activeTab=kanban', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="kanban" />)
    // Kanban tab is active
    expect(html).toMatch(/data-testid="tab-kanban"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-kanban"/)
    // Overview tab is NOT active
    expect(html).not.toMatch(/data-testid="tab-overview"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-overview"/)
  })

  it('Overview tab has aria-current="page" when activeTab=overview', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="overview" />)
    expect(html).toMatch(/data-testid="tab-overview"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-overview"/)
    expect(html).not.toMatch(/data-testid="tab-kanban"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="tab-kanban"/)
  })

  it('underlined-active styling: active tab has border-brand-navy; inactive has border-transparent', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="kanban" />)
    // The kanban tab carries the navy underline; the overview tab does not.
    expect(html).toContain('border-brand-navy')
    expect(html).toContain('border-transparent')
  })

  it('touch targets meet the 44px spec (min-h-11)', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="overview" />)
    const matches = html.match(/min-h-11/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(<KanbanOverviewTabs activeTab="kanban" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
