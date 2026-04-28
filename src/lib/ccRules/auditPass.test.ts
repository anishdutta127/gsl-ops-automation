/*
 * W4-E.3 CC rules audit-pass tests.
 *
 * The audit script (`scripts/w4e-cc-rules-audit.mjs`) emits a JSON
 * report; these tests load the report and assert structural facts so
 * the audit's findings stay tied to the system's invariants.
 *
 * The 2026-04-28 audit is NOT clean (4 context-drift, 3 unmatched
 * SPOC-DB rules). The diff is held for Anish review per the locked
 * discipline; cc_rules.json mutations land only after sign-off.
 */

import { describe, expect, it } from 'vitest'
import auditReport from '../../../scripts/w4e-cc-rules-audit-2026-04-28.json'

describe('W4-E.3 audit shape', () => {
  it('processes 10 SPOC DB rules vs 12 cc_rules.json entries (post-Phase-2 mutation)', () => {
    expect(auditReport.inputs.spocDbRulesCount).toBe(10)
    expect(auditReport.inputs.ccRulesCount).toBe(12)
    expect(auditReport.outcomes.length).toBe(10)
  })

  it('every outcome row carries a recognised classification', () => {
    const valid = new Set([
      'clean-match',
      'context-drift',
      'partial-compound',
      'unmatched-spoc-db',
    ])
    for (const o of auditReport.outcomes) {
      expect(valid.has(o.outcome)).toBe(true)
    }
  })
})

describe('W4-E.3 audit findings (post-mutation 2026-04-28)', () => {
  it('audit is NOT clean: 4 context-drift + 1 unmatched-spoc-db remain after Phase 2 mutation', () => {
    // Pre-mutation: 3 clean / 4 drift / 3 unmatched. Phase 2 added
    // CCR-SW-TAMIL-NADU and CCR-NORTH-GR-INTERNATIONAL, lifting
    // SW#3 + North#2 from unmatched to clean. The 4 drifts
    // (SW#5 / East#2 / North#1 / North#3) are intentional per
    // Anish's decisions (D-021 keeps CCR-NORTH-1-7 broad;
    // D-022 captures the deferred Shushankita rules).
    expect(auditReport.summary.auditClean).toBe(false)
    expect(auditReport.summary.contextDrift).toBe(4)
    expect(auditReport.summary.unmatchedSpocDb).toBe(1)
    expect(auditReport.summary.cleanMatch).toBe(5)
  })

  it('North#1 carries the D-016 typo note verbatim ("East Schools" inside North)', () => {
    const n1 = auditReport.outcomes.find((o) => o.spocId === 'North#1')
    expect(n1).toBeDefined()
    expect(n1!.notes).toContain('D-016')
    expect(n1!.sourceText).toContain('East Schools')
    expect(n1!.sheet).toBe('North')
  })

  it('only SW#4 Hyderabad remains unmatched after Phase 2 (D-022 deferral)', () => {
    const unmatched = auditReport.outcomes
      .filter((o) => o.outcome === 'unmatched-spoc-db')
      .map((o) => o.spocId)
    expect(unmatched).toEqual(['SW#4'])
  })

  it('CCR-TTT-FEEDBACK + CCR-NORTH-1-7 carry the context-drift signal vs SPOC-DB', () => {
    const driftRows = auditReport.outcomes.filter((o) => o.outcome === 'context-drift')
    expect(driftRows.length).toBe(4)
    const n1Drift = driftRows.find((o) => o.spocId === 'North#1')
    expect(n1Drift?.diffDetail?.spocContexts).toEqual(['closing-letter'])
    expect(n1Drift?.diffDetail?.ccContexts).toEqual(['all-communications'])
  })

  it('5 derived cc_rules entries have no SPOC DB origin (intentional system extensions)', () => {
    const derivedIds = auditReport.derivedCcRules.map((d) => d.id)
    expect(auditReport.summary.derivedCcRules).toBe(5)
    expect(derivedIds).toContain('CCR-EAST-DISPATCH')
    expect(derivedIds).toContain('CCR-NORTH-WELCOME-CLOSE')
    expect(derivedIds).toContain('CCR-GSLT-ALL')
    expect(derivedIds).toContain('CCR-NARAYANA-CHAIN')
    expect(derivedIds).toContain('CCR-ESCALATION-LEADERSHIP')
  })
})
