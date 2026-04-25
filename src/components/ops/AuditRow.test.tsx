import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AuditEntry } from '@/lib/types'
import { AuditRow } from './AuditRow'

const baseEntry: AuditEntry = {
  timestamp: '2026-04-25T11:32:00Z',
  user: 'misba.m',
  action: 'cc-rule-toggle-off',
  notes: 'Disabled per zonal-manager request',
}

describe('AuditRow', () => {
  it('renders timestamp, user with role badge, action, and entity link', () => {
    const html = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee' }}
        entityLabel="CCR-SW-RAIPUR-PUNE-NAGPUR"
        entityHref="/admin/cc-rules/CCR-SW-RAIPUR-PUNE-NAGPUR"
      />,
    )
    expect(html).toContain('Misba M.')
    expect(html).toContain('OpsEmployee')
    expect(html).toContain('cc-rule-toggle-off')
    expect(html).toContain('CCR-SW-RAIPUR-PUNE-NAGPUR')
    expect(html).toContain('href="/admin/cc-rules/CCR-SW-RAIPUR-PUNE-NAGPUR"')
  })

  it('formats timestamp as DD-MMM-YYYY HH:mm IST', () => {
    const html = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee' }}
        entityLabel="x"
        entityHref="/x"
      />,
    )
    expect(html).toMatch(/\d{2}-[A-Z][a-z]{2}-\d{4}/)
    expect(html).toContain('IST')
  })

  it('hides email by default; shows it when showEmail is true', () => {
    const hidden = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee', email: 'misba.m@getsetlearn.info' }}
        entityLabel="x"
        entityHref="/x"
      />,
    )
    expect(hidden).not.toContain('misba.m@getsetlearn.info')

    const shown = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee', email: 'misba.m@getsetlearn.info' }}
        entityLabel="x"
        entityHref="/x"
        showEmail
      />,
    )
    expect(shown).toContain('misba.m@getsetlearn.info')
  })

  it('renders notes text and surfaces it in title attribute for hover', () => {
    const html = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee' }}
        entityLabel="x"
        entityHref="/x"
      />,
    )
    expect(html).toContain('Disabled per zonal-manager request')
    expect(html).toContain('title="Disabled per zonal-manager request"')
  })

  it('uses CSS variables, no raw hex', () => {
    const html = renderToStaticMarkup(
      <AuditRow
        entry={baseEntry}
        user={{ name: 'Misba M.', role: 'OpsEmployee' }}
        entityLabel="x"
        entityHref="/x"
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
