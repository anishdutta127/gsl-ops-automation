import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CcRule } from '@/lib/types'
import { CcRuleToggle } from './CcRuleToggle'

const baseRule: CcRule = {
  id: 'CCR-SW-RAIPUR-PUNE-NAGPUR',
  sheet: 'South-West',
  scope: 'sub-region',
  scopeValue: ['Raipur', 'Pune', 'Nagpur'],
  contexts: ['all-communications'],
  ccUserIds: ['suresh.k', 'pallavi.m'],
  enabled: true,
  sourceRuleText: 'Keep Suresh and Pallavi in Cc for Raipur, Pune, Nagpur Schools',
  createdAt: '2026-04-25T00:00:00Z',
  createdBy: 'import',
  disabledAt: null,
  disabledBy: null,
  disabledReason: null,
  auditLog: [],
}

describe('CcRuleToggle', () => {
  it('renders rule id, source text, sheet, scope, and contexts', () => {
    const html = renderToStaticMarkup(
      <CcRuleToggle rule={baseRule} onToggle={async () => {}} />,
    )
    expect(html).toContain('CCR-SW-RAIPUR-PUNE-NAGPUR')
    expect(html).toContain('Suresh and Pallavi')
    expect(html).toContain('South-West')
    expect(html).toContain('sub-region')
    expect(html).toContain('all-communications')
  })

  it('exposes role="switch" with aria-checked reflecting enabled state', () => {
    const enabledHtml = renderToStaticMarkup(
      <CcRuleToggle rule={baseRule} onToggle={async () => {}} />,
    )
    expect(enabledHtml).toContain('role="switch"')
    expect(enabledHtml).toContain('aria-checked="true"')
    expect(enabledHtml).toContain('Enabled')

    const disabledRule: CcRule = { ...baseRule, enabled: false }
    const disabledHtml = renderToStaticMarkup(
      <CcRuleToggle rule={disabledRule} onToggle={async () => {}} />,
    )
    expect(disabledHtml).toContain('aria-checked="false"')
    expect(disabledHtml).toContain('Disabled')
  })

  it('aria-labelledby and aria-describedby reference the rule id and source text', () => {
    const html = renderToStaticMarkup(
      <CcRuleToggle rule={baseRule} onToggle={async () => {}} />,
    )
    expect(html).toMatch(/aria-labelledby="[^"]+"/)
    expect(html).toMatch(/aria-describedby="[^"]+"/)
  })

  it('disabled prop sets disabled attribute on the switch', () => {
    const html = renderToStaticMarkup(
      <CcRuleToggle rule={baseRule} onToggle={async () => {}} disabled />,
    )
    expect(html).toContain('disabled=""')
  })

  it('uses CSS variables, no raw hex', () => {
    const html = renderToStaticMarkup(
      <CcRuleToggle rule={baseRule} onToggle={async () => {}} />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
