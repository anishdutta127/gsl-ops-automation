/*
 * Q-G Test 7: ccRuleResolver.
 *
 * Drives src/lib/ccResolver.ts against synthetic inline rules,
 * schools, MOUs, users, and sales-team data. Each test constructs
 * its own deps so the suite is decoupled from the production
 * fixtures (W3-A.2 refactor: post-import the production fixtures
 * carry 124 schools / 140 MOUs / 19 sales reps and the previous
 * fixture-driven assertions did not survive the swap).
 *
 * Verifies step 6.5 Item D literal scoping (rule for "welcome notes"
 * does NOT fire on cadence pings) and the dedupe + disabled-rule
 * contracts. Final parametric block constructs each rule + its
 * fixture pair and asserts deep equality across the 7-context
 * matrix.
 *
 * Caveat on `sr-no-range`: the resolver consults a module-private
 * NORTH_SR_NO map keyed by school.id. The synthetic test uses the
 * canonical id 'SCH-OAKWOOD-DEL' (sr-no=1 in that map) so the rule
 * exercises the real lookup.
 */

import { describe, expect, it } from 'vitest'
import { resolveCcList, type CcResolverDeps } from './ccResolver'
import type {
  CcRule,
  CcRuleContext,
  CcRuleScope,
  MOU,
  SalesPerson,
  School,
  User,
} from './types'

const ALL_CONTEXTS: CcRuleContext[] = [
  'welcome-note',
  'three-ping-cadence',
  'dispatch-notification',
  'feedback-request',
  'closing-letter',
  'escalation-notification',
  'all-communications',
]

// ----------------------------------------------------------------------------
// Synthetic fixture factory
// ----------------------------------------------------------------------------

function school(overrides: Partial<School> & Pick<School, 'id'>): School {
  return {
    name: overrides.id,
    legalEntity: null,
    city: 'Pune',
    state: 'Maharashtra',
    region: 'South-West',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function mou(overrides: Partial<MOU> & Pick<MOU, 'id' | 'schoolId'>): MOU {
  return {
    schoolName: overrides.schoolId,
    programme: 'STEAM',
    programmeSubType: null,
    schoolScope: 'SINGLE',
    schoolGroupId: null,
    status: 'Active',
    cohortStatus: 'active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 200,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 4237,
    spWithTax: 5000,
    contractValue: 1000000,
    received: 0,
    tds: 0,
    balance: 1000000,
    receivedPct: 0,
    paymentSchedule: '',
    trainerModel: null,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    notes: null,
    daysToExpiry: null,
    auditLog: [],
    ...overrides,
  }
}

function user(overrides: Partial<User> & Pick<User, 'id'>): User {
  return {
    name: overrides.id,
    email: `${overrides.id}@getsetlearn.info`,
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function salesPerson(overrides: Partial<SalesPerson> & Pick<SalesPerson, 'id'>): SalesPerson {
  return {
    name: overrides.id,
    email: `${overrides.id}@getsetlearn.info`,
    phone: null,
    territories: [],
    programmes: ['STEAM'],
    active: true,
    joinedDate: '2025-04-01',
    ...overrides,
  }
}

function rule(
  id: string,
  scope: CcRuleScope,
  scopeValue: string | string[],
  contexts: CcRuleContext[],
  ccUserIds: string[],
): CcRule {
  return {
    id,
    sheet: 'derived',
    scope,
    scopeValue,
    contexts,
    ccUserIds,
    enabled: true,
    sourceRuleText: id,
    createdAt: '2026-04-01T00:00:00Z',
    createdBy: 'import',
    disabledAt: null,
    disabledBy: null,
    disabledReason: null,
    auditLog: [],
  }
}

// ----------------------------------------------------------------------------
// Canonical synthetic dataset (mirrors the SPOC-DB 10-rule structure)
// ----------------------------------------------------------------------------

const greenfieldPune = school({ id: 'SCH-T-GREEN', name: 'Greenfield', city: 'Pune', region: 'South-West' })
const sunriseHyd = school({ id: 'SCH-T-SUN', name: 'Sunrise', city: 'Hyderabad', region: 'South-West' })
const mapleLeafBlr = school({ id: 'SCH-T-MAPLE', name: 'Maple Leaf', city: 'Bangalore', region: 'South-West' })
const springwoodKol = school({ id: 'SCH-T-SPRING', name: 'Springwood', city: 'Kolkata', region: 'East', state: 'West Bengal' })
// Use the canonical id that's in ccResolver.ts:NORTH_SR_NO so sr-no-range matches
const oakwoodDelhi = school({ id: 'SCH-OAKWOOD-DEL', name: 'Oakwood', city: 'Delhi', region: 'North', state: 'Delhi' })
const narayanaAsn = school({ id: 'SCH-T-NARAYANA', name: 'Narayana ASN', city: 'Asansol', region: 'East', state: 'West Bengal' })

const allSchools: School[] = [greenfieldPune, sunriseHyd, mapleLeafBlr, springwoodKol, oakwoodDelhi, narayanaAsn]

const mouGreenfieldGsl = mou({ id: 'MOU-T-001', schoolId: greenfieldPune.id, trainerModel: 'GSL-T' })
const mouOakwoodTtt = mou({ id: 'MOU-T-002', schoolId: oakwoodDelhi.id, trainerModel: 'TT' })
const mouNarayana = mou({ id: 'MOU-T-003', schoolId: narayanaAsn.id, trainerModel: null })

const allMous: MOU[] = [mouGreenfieldGsl, mouOakwoodTtt, mouNarayana]

const allUsers: User[] = [
  user({ id: 'ameet.z', name: 'Ameet Zaveri', role: 'Leadership' }),
  user({ id: 'shashank.s', name: 'Shashank S.', role: 'TrainerHead' }),
]

const allSalesTeam: SalesPerson[] = [
  salesPerson({ id: 'sp-vikram', name: 'Vikram T.' }),
  salesPerson({ id: 'sp-vishwanath', name: 'Vishwanath G.' }),
  salesPerson({ id: 'sp-rohan', name: 'Rohan B.' }),
  salesPerson({ id: 'sp-neha', name: 'Neha A.' }),
]

const allRules: CcRule[] = [
  rule('CCR-SW-RAIPUR-PUNE-NAGPUR', 'sub-region', ['Raipur', 'Pune', 'Nagpur'], ['all-communications'], ['sp-vikram']),
  rule('CCR-SW-BANGALORE', 'sub-region', 'Bangalore', ['all-communications'], ['sp-vishwanath']),
  rule('CCR-EAST-WELCOME', 'region', 'East', ['welcome-note'], ['sp-rohan']),
  rule('CCR-EAST-DISPATCH', 'region', 'East', ['dispatch-notification'], ['sp-rohan']),
  rule('CCR-NORTH-1-7', 'sr-no-range', '1..7', ['all-communications'], ['sp-neha']),
  rule('CCR-NORTH-WELCOME-CLOSE', 'region', 'North', ['welcome-note', 'closing-letter'], ['sp-neha']),
  rule('CCR-TTT-FEEDBACK', 'training-mode', 'TTT', ['feedback-request'], ['shashank.s']),
  rule('CCR-GSLT-ALL', 'training-mode', 'GSL-Trainer', ['all-communications'], ['shashank.s']),
  rule('CCR-NARAYANA-CHAIN', 'school', narayanaAsn.id, ['all-communications'], ['sp-rohan']),
  rule('CCR-ESCALATION-LEADERSHIP', 'region', 'ALL', ['escalation-notification'], ['ameet.z']),
]

const defaultDeps: CcResolverDeps = {
  rules: allRules,
  schools: allSchools,
  mous: allMous,
  users: allUsers,
  salesTeam: allSalesTeam,
}

function emailFor(id: string): string {
  const u = allUsers.find((x) => x.id === id)
  if (u) return u.email
  const sp = allSalesTeam.find((x) => x.id === id)
  if (sp) return sp.email
  throw new Error(`Test fixture: id ${id} not in users or sales`)
}

function ruleById(id: string): CcRule {
  const r = allRules.find((x) => x.id === id)
  if (!r) throw new Error(`Test fixture: rule ${id} not found`)
  return r
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('Q-G Test 7: ccRuleResolver', () => {
  it('CCR-SW-RAIPUR-PUNE-NAGPUR fires on all 7 contexts for matching schools', () => {
    for (const context of ALL_CONTEXTS) {
      const result = resolveCcList(
        { context, schoolId: greenfieldPune.id, mouId: mouGreenfieldGsl.id },
        defaultDeps,
      )
      expect(result).toContain(emailFor('sp-vikram'))
    }
  })

  it('CCR-SW-RAIPUR-PUNE-NAGPUR does not fire for South-West schools outside the named cities', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-SW-RAIPUR-PUNE-NAGPUR')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: sunriseHyd.id, mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-EAST-WELCOME fires only on welcome-note (literal scoping)', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-EAST-WELCOME')] }
    const expected = [emailFor('sp-rohan')]

    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: springwoodKol.id, mouId: null },
        deps,
      ),
    ).toEqual(expected)

    for (const context of ALL_CONTEXTS) {
      if (context === 'welcome-note') continue
      const result = resolveCcList(
        { context, schoolId: springwoodKol.id, mouId: null },
        deps,
      )
      expect(result).toEqual([])
    }
  })

  it('CCR-NORTH-1-7 sr-no-range matches schools in the named range', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-NORTH-1-7')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: oakwoodDelhi.id, mouId: null },
      deps,
    )
    expect(result).toEqual([emailFor('sp-neha')])
  })

  it('CCR-NORTH-1-7 does not match a school outside the sr-no lookup', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-NORTH-1-7')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: greenfieldPune.id, mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-TTT-FEEDBACK fires only on TT-mode MOUs and only for feedback-request', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-TTT-FEEDBACK')] }
    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: oakwoodDelhi.id, mouId: mouOakwoodTtt.id },
        deps,
      ),
    ).toEqual([emailFor('shashank.s')])

    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: oakwoodDelhi.id, mouId: mouOakwoodTtt.id },
        deps,
      ),
    ).toEqual([])

    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: greenfieldPune.id, mouId: mouGreenfieldGsl.id },
        deps,
      ),
    ).toEqual([])

    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: oakwoodDelhi.id, mouId: null },
        deps,
      ),
    ).toEqual([])
  })

  it('CCR-GSLT-ALL fires on every context for GSL-T MOUs (alias normalisation)', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-GSLT-ALL')] }
    for (const context of ALL_CONTEXTS) {
      const result = resolveCcList(
        { context, schoolId: greenfieldPune.id, mouId: mouGreenfieldGsl.id },
        deps,
      )
      expect(result).toEqual([emailFor('shashank.s')])
    }
  })

  it('overlapping ccUserIds dedupe across multiple matching rules', () => {
    const result = resolveCcList(
      { context: 'welcome-note', schoolId: narayanaAsn.id, mouId: mouNarayana.id },
      defaultDeps,
    )
    const rohan = emailFor('sp-rohan')
    const occurrences = result.filter((e) => e === rohan).length
    expect(occurrences).toBe(1)
  })

  it('disabled rules (enabled=false) do not contribute to the result', () => {
    const disabled: CcRule = { ...ruleById('CCR-EAST-WELCOME'), enabled: false }
    const deps: CcResolverDeps = { ...defaultDeps, rules: [disabled] }
    const result = resolveCcList(
      { context: 'welcome-note', schoolId: springwoodKol.id, mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-ESCALATION-LEADERSHIP region=ALL matches every school but only on escalation-notification', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-ESCALATION-LEADERSHIP')] }
    const ameet = emailFor('ameet.z')
    for (const s of allSchools) {
      const result = resolveCcList(
        { context: 'escalation-notification', schoolId: s.id, mouId: null },
        deps,
      )
      expect(result).toEqual([ameet])
    }
    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: greenfieldPune.id, mouId: null },
        deps,
      ),
    ).toEqual([])
  })

  it('unknown ccUserId is silently skipped (not crashed on)', () => {
    const ghost: CcRule = {
      ...ruleById('CCR-ESCALATION-LEADERSHIP'),
      ccUserIds: ['does-not-exist', 'ameet.z'],
    }
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ghost] }
    const result = resolveCcList(
      { context: 'escalation-notification', schoolId: greenfieldPune.id, mouId: null },
      deps,
    )
    expect(result).toEqual([emailFor('ameet.z')])
  })

  it('unknown schoolId returns []', () => {
    const result = resolveCcList(
      { context: 'all-communications', schoolId: 'SCH-DOES-NOT-EXIST', mouId: null },
      defaultDeps,
    )
    expect(result).toEqual([])
  })

  describe('parametric: 10 rules x 7 contexts in isolation', () => {
    interface Fixture { schoolId: string; mouId: string | null }
    const RULE_FIXTURES: Record<string, Fixture> = {
      'CCR-SW-RAIPUR-PUNE-NAGPUR': { schoolId: greenfieldPune.id, mouId: mouGreenfieldGsl.id },
      'CCR-SW-BANGALORE': { schoolId: mapleLeafBlr.id, mouId: null },
      'CCR-EAST-WELCOME': { schoolId: springwoodKol.id, mouId: null },
      'CCR-EAST-DISPATCH': { schoolId: springwoodKol.id, mouId: null },
      'CCR-NORTH-1-7': { schoolId: oakwoodDelhi.id, mouId: null },
      'CCR-NORTH-WELCOME-CLOSE': { schoolId: oakwoodDelhi.id, mouId: null },
      'CCR-TTT-FEEDBACK': { schoolId: oakwoodDelhi.id, mouId: mouOakwoodTtt.id },
      'CCR-GSLT-ALL': { schoolId: greenfieldPune.id, mouId: mouGreenfieldGsl.id },
      'CCR-NARAYANA-CHAIN': { schoolId: narayanaAsn.id, mouId: mouNarayana.id },
      'CCR-ESCALATION-LEADERSHIP': { schoolId: greenfieldPune.id, mouId: null },
    }

    for (const r of allRules) {
      const fixture = RULE_FIXTURES[r.id]
      if (!fixture) {
        it.fails(`fixture missing for rule ${r.id}`, () => {})
        continue
      }
      for (const context of ALL_CONTEXTS) {
        const fires =
          r.contexts.includes(context) ||
          r.contexts.includes('all-communications')
        const expected = fires ? r.ccUserIds.map((id) => emailFor(id)) : []
        it(`${r.id} x ${context} -> ${fires ? expected.join(',') : '[]'}`, () => {
          const deps: CcResolverDeps = { ...defaultDeps, rules: [r] }
          const result = resolveCcList(
            { context, schoolId: fixture.schoolId, mouId: fixture.mouId },
            deps,
          )
          expect(result.sort()).toEqual(expected.sort())
        })
      }
    }
  })
})
