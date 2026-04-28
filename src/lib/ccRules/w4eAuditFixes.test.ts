/*
 * W4-E.3 Phase 2 mutation tests.
 *
 * Confirms the 2 cc_rules entries added by
 * scripts/w4e-cc-rules-mutation.mjs (CCR-SW-TAMIL-NADU,
 * CCR-NORTH-GR-INTERNATIONAL) match the right schools / contexts
 * and that the resolver still unions ccUserIds across multiple
 * matching rules (proving CCR-TTT-ALL will combine cleanly with
 * CCR-TTT-FEEDBACK once Shushankita's user.id is mapped and the
 * D-022 deferral lands).
 */

import { describe, expect, it } from 'vitest'
import { resolveCcList, type CcResolverDeps } from '../ccResolver'
import type { CcRule, MOU, SalesPerson, School, User } from '../types'
import ccRulesJson from '@/data/cc_rules.json'
import schoolsJson from '@/data/schools.json'

const ccRules = ccRulesJson as unknown as CcRule[]
const schools = schoolsJson as unknown as School[]

function findRule(id: string): CcRule | undefined {
  return ccRules.find((r) => r.id === id)
}

describe('W4-E.3 Phase 2: cc_rules.json size + new entries', () => {
  it('cc_rules.json grows from 10 to 12 entries (2 added; 3 deferred)', () => {
    expect(ccRules.length).toBe(12)
  })

  it('CCR-SW-TAMIL-NADU is sub-region scoped on Tamil Nadu, all-communications, with sp-balu_r', () => {
    const r = findRule('CCR-SW-TAMIL-NADU')
    expect(r).toBeDefined()
    expect(r!.scope).toBe('sub-region')
    expect(r!.scopeValue).toBe('Tamil Nadu')
    expect(r!.contexts).toEqual(['all-communications'])
    expect(r!.ccUserIds).toEqual(['sp-balu_r'])
    expect(r!.enabled).toBe(true)
    expect(r!.sourceRuleText).toContain('R. Balu')
    expect(r!.sourceRuleText).toContain('Tamil Nadu')
    expect(r!.auditLog.length).toBeGreaterThanOrEqual(1)
    expect(r!.auditLog[0]!.action).toBe('cc-rule-created')
    expect(r!.auditLog[0]!.notes).toContain('W4-E.3')
  })

  it('CCR-NORTH-GR-INTERNATIONAL is school-scoped on SCH-GR_INTERNATIONAL_SCH with sp-sahil', () => {
    const r = findRule('CCR-NORTH-GR-INTERNATIONAL')
    expect(r).toBeDefined()
    expect(r!.scope).toBe('school')
    expect(r!.scopeValue).toBe('SCH-GR_INTERNATIONAL_SCH')
    expect(r!.contexts).toEqual(['all-communications'])
    expect(r!.ccUserIds).toEqual(['sp-sahil'])
    expect(r!.enabled).toBe(true)
    expect(r!.auditLog[0]!.action).toBe('cc-rule-created')
  })

  it('CCR-TTT-FEEDBACK stays narrow (feedback-request only); CCR-TTT-ALL not yet added (D-022 defer)', () => {
    const ttt = findRule('CCR-TTT-FEEDBACK')
    expect(ttt).toBeDefined()
    expect(ttt!.contexts).toEqual(['feedback-request'])
    expect(findRule('CCR-TTT-ALL')).toBeUndefined()
  })

  it('referenced school SCH-GR_INTERNATIONAL_SCH exists in schools.json', () => {
    expect(schools.some((s) => s.id === 'SCH-GR_INTERNATIONAL_SCH')).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Synthetic union test: when CCR-TTT-ALL eventually lands alongside the
// existing CCR-TTT-FEEDBACK, the resolver must union ccUserIds rather
// than over-write. This locks the resolver contract so the D-022
// deferral can land without code changes.
// ----------------------------------------------------------------------------

describe('W4-E.3 ccResolver union contract (proof for D-022 CCR-TTT-ALL landing)', () => {
  function tttSchool(): School {
    return {
      id: 'SCH-T-TTT-UNION',
      name: 'TTT Union Test School',
      legalEntity: null,
      city: 'Test City',
      state: 'Test State',
      region: 'East',
      pinCode: null,
      contactPerson: null,
      email: null,
      phone: null,
      billingName: null,
      pan: null,
      gstNumber: null,
      notes: null,
      active: true,
      createdAt: '2026-04-28T00:00:00Z',
      auditLog: [],
    }
  }

  function tttMou(): MOU {
    return {
      id: 'MOU-T-TTT-UNION',
      schoolId: 'SCH-T-TTT-UNION',
      schoolName: 'TTT Union Test School',
      programme: 'STEAM',
      programmeSubType: null,
      schoolScope: 'SINGLE',
      schoolGroupId: null,
      status: 'Active',
      cohortStatus: 'active',
      academicYear: '2026-27',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      studentsMou: 100,
      studentsActual: null,
      studentsVariance: null,
      studentsVariancePct: null,
      spWithoutTax: 0,
      spWithTax: 0,
      contractValue: 0,
      received: 0,
      tds: 0,
      balance: 0,
      receivedPct: 0,
      paymentSchedule: '',
      trainerModel: 'TT',
      salesPersonId: null,
      templateVersion: null,
      generatedAt: null,
      notes: null,
      delayNotes: null,
      daysToExpiry: null,
      auditLog: [],
    }
  }

  const baseUsers: User[] = [
    {
      id: 'shashank.s',
      name: 'Shashank S.',
      email: 'shashank.s@getsetlearn.info',
      role: 'TrainerHead',
      testingOverride: false,
      active: true,
      passwordHash: 'X',
      createdAt: '2026-01-01T00:00:00Z',
      auditLog: [],
    },
    {
      id: 'placeholder.shushankita',
      name: 'Shushankita (placeholder)',
      email: 'shushankita@getsetlearn.info',
      role: 'Admin',
      testingOverride: false,
      active: true,
      passwordHash: 'X',
      createdAt: '2026-04-28T00:00:00Z',
      auditLog: [],
    },
  ]

  const baseSalesTeam: SalesPerson[] = []

  function makeRule(id: string, contexts: CcRule['contexts'], userIds: string[]): CcRule {
    return {
      id,
      sheet: 'derived',
      scope: 'training-mode',
      scopeValue: 'TTT',
      contexts,
      ccUserIds: userIds,
      enabled: true,
      sourceRuleText: id,
      createdAt: '2026-04-28T00:00:00Z',
      createdBy: 'test',
      disabledAt: null,
      disabledBy: null,
      disabledReason: null,
      auditLog: [],
    }
  }

  it('CCR-TTT-FEEDBACK (narrow) + synthetic CCR-TTT-ALL produce union of ccUserIds on TTT feedback-request', () => {
    const tttFeedback = makeRule('CCR-TTT-FEEDBACK', ['feedback-request'], ['shashank.s'])
    const tttAll = makeRule('CCR-TTT-ALL', ['all-communications'], ['placeholder.shushankita'])
    const deps: CcResolverDeps = {
      rules: [tttFeedback, tttAll],
      schools: [tttSchool()],
      mous: [tttMou()],
      users: baseUsers,
      salesTeam: baseSalesTeam,
    }

    const result = resolveCcList(
      { context: 'feedback-request', schoolId: 'SCH-T-TTT-UNION', mouId: 'MOU-T-TTT-UNION' },
      deps,
    )
    expect(result.sort()).toEqual(
      ['shushankita@getsetlearn.info', 'shashank.s@getsetlearn.info'].sort(),
    )
  })

  it('on TTT non-feedback context (e.g., welcome-note), only CCR-TTT-ALL fires (CCR-TTT-FEEDBACK stays narrow)', () => {
    const tttFeedback = makeRule('CCR-TTT-FEEDBACK', ['feedback-request'], ['shashank.s'])
    const tttAll = makeRule('CCR-TTT-ALL', ['all-communications'], ['placeholder.shushankita'])
    const deps: CcResolverDeps = {
      rules: [tttFeedback, tttAll],
      schools: [tttSchool()],
      mous: [tttMou()],
      users: baseUsers,
      salesTeam: baseSalesTeam,
    }

    const result = resolveCcList(
      { context: 'welcome-note', schoolId: 'SCH-T-TTT-UNION', mouId: 'MOU-T-TTT-UNION' },
      deps,
    )
    expect(result).toEqual(['shushankita@getsetlearn.info'])
  })
})
