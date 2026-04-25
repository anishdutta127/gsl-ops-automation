import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseUrlFilters } from '@/lib/audit/urlFilters'
import { AuditFilterRail } from './AuditFilterRail'

const ENTITIES = ['MOU', 'School', 'Communication', 'Dispatch']
const ACTIONS = ['whatsapp-draft-copied', 'p2-override', 'cc-rule-toggle-off']

describe('AuditFilterRail', () => {
  it('renders quick filter chips with stable labels', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({})}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('communication-copy')
    expect(html).toContain('p2-overrides')
    expect(html).toContain('cc-rule-toggles')
    expect(html).toContain('import-auto-links')
  })

  it('renders date-range presets with active state on the current window', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({ days: '30' })}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('Last 24h')
    expect(html).toContain('Last 7 days')
    expect(html).toContain('Last 30 days')
    expect(html).toContain('All')
  })

  it('renders entity chips with aria-pressed reflecting active state', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({ entity: 'MOU' })}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('renders user typeahead form preserving entity + days as hidden inputs', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({ entity: 'MOU', days: '30', user: 'misba.m' })}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('id="audit-user-input"')
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="entity"[^>]*value="MOU"/)
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="days"[^>]*value="30"/)
    // The visible user input pre-fills with the current value.
    expect(html).toMatch(/<input[^>]*id="audit-user-input"[^>]*value="misba.m"/)
  })

  it('Clear all link returns to /admin/audit with no params', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({ entity: 'MOU', days: '30' })}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('href="/admin/audit"')
    expect(html).toContain('Clear all filters')
  })

  it('uses CSS variables for active states, no raw hex', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({ filter: 'p2-overrides' })}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('var(--brand-teal)')
    expect(html).toContain('var(--brand-navy)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('focus-visible navy outline on every interactive element', () => {
    const html = renderToStaticMarkup(
      <AuditFilterRail
        filters={parseUrlFilters({})}
        knownEntities={ENTITIES}
        knownActions={ACTIONS}
      />,
    )
    expect(html).toContain('focus-visible:outline-[var(--brand-navy)]')
  })
})
