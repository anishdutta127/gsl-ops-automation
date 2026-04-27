import { describe, expect, it } from 'vitest'
import { collectAuditRows } from './aggregate'

describe('collectAuditRows', () => {
  it('returns rows sorted newest first', () => {
    const rows = collectAuditRows()
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.entry.timestamp >= rows[i]!.entry.timestamp).toBe(true)
    }
  })

  it('every row carries the metadata required for AuditRow render', () => {
    const rows = collectAuditRows()
    for (const row of rows) {
      expect(row.entry).toBeTruthy()
      expect(row.entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(typeof row.entry.user).toBe('string')
      expect(typeof row.entry.action).toBe('string')
      expect(typeof row.entityType).toBe('string')
      expect(typeof row.entityId).toBe('string')
      expect(typeof row.entityLabel).toBe('string')
      expect(typeof row.entityHref).toBe('string')
    }
  })

  it('Escalation rows carry laneOfEntry from the entity', () => {
    const rows = collectAuditRows()
    const escRows = rows.filter((r) => r.entityType === 'Escalation')
    for (const row of escRows) {
      expect(row.laneOfEntry).toBeDefined()
      expect(['OPS', 'SALES', 'ACADEMICS']).toContain(row.laneOfEntry)
    }
  })

  it('Dispatch rows are marked OPS lane regardless of who triggered', () => {
    const rows = collectAuditRows()
    const dispatchRows = rows.filter((r) => r.entityType === 'Dispatch')
    for (const row of dispatchRows) {
      expect(row.laneOfEntry).toBe('OPS')
    }
  })

  it('CcRule rows are marked OPS lane', () => {
    const rows = collectAuditRows()
    const ccRows = rows.filter((r) => r.entityType === 'CcRule')
    for (const row of ccRows) {
      expect(row.laneOfEntry).toBe('OPS')
    }
  })

  it('MOU entityHref points at /mous/<id>', () => {
    const rows = collectAuditRows()
    const mouRows = rows.filter((r) => r.entityType === 'MOU')
    for (const row of mouRows) {
      expect(row.entityHref).toMatch(/^\/mous\//)
    }
  })

  it('every MOU audit row has a recognized action (auto-link-exact-match for imported MOUs etc.)', () => {
    // Post Week 3 import the fixture MOUs are sourced from the
    // gsl-mou-system upstream and carry 'auto-link-exact-match' /
    // 'manual-relink' / 'create' audit entries (the GSLT-Cretile
    // normalisation path that Phase A4 added has zero exercising
    // records in the upstream cohort, surfaced in W3-A.1 report).
    const rows = collectAuditRows()
    const mouRows = rows.filter((r) => r.entityType === 'MOU')
    const recognizedActions = new Set([
      'auto-link-exact-match', 'manual-relink', 'gslt-cretile-normalisation',
      'create', 'update', 'status_change', 'reassignment', 'file_upload',
      'actuals-confirmed', 'pi-issued', 'dispatch-raised',
      'delivery-acknowledged', 'feedback-submitted', 'legacy-include-import',
      // W4-A.2 added cohort tagging on every MOU; rows here are 'system-w4-a-2'
      'mou-cohort-status-changed',
      // W4-B.3 introduces delay-notes auto-save audit entries.
      'mou-delay-notes-updated',
    ])
    for (const row of mouRows) {
      expect(recognizedActions.has(row.entry.action)).toBe(true)
    }
  })

  it('contains the auto-create-from-feedback entry (Update 3 trigger)', () => {
    const rows = collectAuditRows()
    const found = rows.find(
      (r) => r.entry.action === 'auto-create-from-feedback',
    )
    expect(found).toBeDefined()
    expect(found?.entityType).toBe('Escalation')
    expect(found?.laneOfEntry).toBe('ACADEMICS')
  })

  it('contains the p2-override entry from DIS-002 (Q-J exception path)', () => {
    const rows = collectAuditRows()
    const found = rows.find((r) => r.entry.action === 'p2-override')
    expect(found).toBeDefined()
    expect(found?.entityType).toBe('Dispatch')
    expect(found?.entityId).toBe('DIS-002')
    expect(found?.laneOfEntry).toBe('OPS')
  })
})
