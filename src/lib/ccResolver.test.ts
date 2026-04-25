/*
 * Q-G Test 7: ccRuleResolver.
 *
 * Drives src/lib/ccResolver.ts against the 10 pre-seeded SPOC-DB
 * rules in src/data/_fixtures/cc_rules.json and the 15 schools +
 * 5 MOUs + 9 users + 5 sales people in the matching fixtures.
 *
 * Verifies step 6.5 Item D literal scoping (rule for "welcome notes"
 * does NOT fire on cadence pings) and the dedupe + disabled-rule
 * contracts. Final parametric block isolates each rule against an
 * empty rules array except itself, then asserts deep equality across
 * the 7-context matrix; this is the strongest possible assertion
 * because it removes cross-rule interference.
 */

import { describe, expect, it } from 'vitest'
import { resolveCcList, type CcResolverDeps } from './ccResolver'
import type {
  CcRule,
  CcRuleContext,
  MOU,
  SalesPerson,
  School,
  User,
} from './types'
import ccRulesJson from '@/data/cc_rules.json'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'

const allRules = ccRulesJson as unknown as CcRule[]
const allSchools = schoolsJson as unknown as School[]
const allMous = mousJson as unknown as MOU[]
const allUsers = usersJson as unknown as User[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

const defaultDeps: CcResolverDeps = {
  rules: allRules,
  schools: allSchools,
  mous: allMous,
  users: allUsers,
  salesTeam: allSalesTeam,
}

const ALL_CONTEXTS: CcRuleContext[] = [
  'welcome-note',
  'three-ping-cadence',
  'dispatch-notification',
  'feedback-request',
  'closing-letter',
  'escalation-notification',
  'all-communications',
]

function emailFor(id: string): string {
  const u = allUsers.find((x) => x.id === id)
  if (u) return u.email
  const sp = allSalesTeam.find((x) => x.id === id)
  if (sp) return sp.email
  throw new Error(`Test fixture mismatch: id ${id} not in users or sales`)
}

function ruleById(id: string): CcRule {
  const r = allRules.find((x) => x.id === id)
  if (!r) throw new Error(`Test fixture mismatch: rule ${id} not found`)
  return r
}

describe('Q-G Test 7: ccRuleResolver', () => {
  it('CCR-SW-RAIPUR-PUNE-NAGPUR fires on all 7 contexts for matching schools', () => {
    // Greenfield is in Pune, South-West.
    for (const context of ALL_CONTEXTS) {
      const result = resolveCcList(
        { context, schoolId: 'SCH-GREENFIELD-PUNE', mouId: 'MOU-STEAM-2627-001' },
        defaultDeps,
      )
      expect(result).toContain(emailFor('sp-vikram'))
    }
  })

  it('CCR-SW-RAIPUR-PUNE-NAGPUR does not fire for South-West schools outside the named cities', () => {
    // Sunrise is in Hyderabad, South-West, but not Raipur/Pune/Nagpur.
    // Isolate against just this rule.
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-SW-RAIPUR-PUNE-NAGPUR')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: 'SCH-SUNRISE-HYD', mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-EAST-WELCOME fires only on welcome-note (literal scoping)', () => {
    // Isolate against just CCR-EAST-WELCOME so other East rules don't pollute.
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-EAST-WELCOME')] }
    const expected = [emailFor('sp-rohan')]

    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: 'SCH-SPRINGWOOD-KOL', mouId: null },
        deps,
      ),
    ).toEqual(expected)

    for (const context of ALL_CONTEXTS) {
      if (context === 'welcome-note') continue
      const result = resolveCcList(
        { context, schoolId: 'SCH-SPRINGWOOD-KOL', mouId: null },
        deps,
      )
      expect(result).toEqual([])
    }
  })

  it('CCR-NORTH-1-7 sr-no-range matches schools in the named range', () => {
    // SCH-OAKWOOD-DEL is sr-no=1, in 1..7.
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-NORTH-1-7')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: 'SCH-OAKWOOD-DEL', mouId: null },
      deps,
    )
    expect(result).toEqual([emailFor('sp-neha')])
  })

  it('CCR-NORTH-1-7 does not match a North school outside the sr-no lookup', () => {
    // No sr-no entry beyond Pearl (sr-no 5); a school not in the
    // lookup table should not match even though the range goes to 7.
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-NORTH-1-7')] }
    const result = resolveCcList(
      { context: 'all-communications', schoolId: 'SCH-GREENFIELD-PUNE', mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-TTT-FEEDBACK fires only on TT-mode MOUs and only for feedback-request', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-TTT-FEEDBACK')] }
    // MOU-TINK-2627-002 is trainerModel='TT' (alias of TTT) for Oakwood.
    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: 'SCH-OAKWOOD-DEL', mouId: 'MOU-TINK-2627-002' },
        deps,
      ),
    ).toEqual([emailFor('shashank.s')])

    // Same school + same rule, wrong context -> empty.
    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: 'SCH-OAKWOOD-DEL', mouId: 'MOU-TINK-2627-002' },
        deps,
      ),
    ).toEqual([])

    // GSL-T MOU + feedback-request -> rule does not fire.
    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: 'SCH-GREENFIELD-PUNE', mouId: 'MOU-STEAM-2627-001' },
        deps,
      ),
    ).toEqual([])

    // mouId=null + feedback-request -> rule does not fire (no trainerModel resolvable).
    expect(
      resolveCcList(
        { context: 'feedback-request', schoolId: 'SCH-OAKWOOD-DEL', mouId: null },
        deps,
      ),
    ).toEqual([])
  })

  it('CCR-GSLT-ALL fires on every context for GSL-T MOUs (alias normalisation)', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-GSLT-ALL')] }
    for (const context of ALL_CONTEXTS) {
      const result = resolveCcList(
        { context, schoolId: 'SCH-GREENFIELD-PUNE', mouId: 'MOU-STEAM-2627-001' },
        deps,
      )
      expect(result).toEqual([emailFor('shashank.s')])
    }
  })

  it('overlapping ccUserIds dedupe across multiple matching rules', () => {
    // Narayana ASN is East AND school-specific. Both CCR-EAST-WELCOME
    // and CCR-NARAYANA-CHAIN name sp-rohan. On welcome-note both fire;
    // sp-rohan should appear exactly once.
    const result = resolveCcList(
      { context: 'welcome-note', schoolId: 'SCH-NARAYANA-ASN', mouId: 'MOU-STEAM-2627-004' },
      defaultDeps,
    )
    const rohan = emailFor('sp-rohan')
    const occurrences = result.filter((e) => e === rohan).length
    expect(occurrences).toBe(1)
  })

  it('disabled rules (enabled=false) do not contribute to the result', () => {
    // Disable CCR-EAST-WELCOME and assert sp-rohan disappears from
    // an East-school + welcome-note call (in isolation).
    const disabled: CcRule = { ...ruleById('CCR-EAST-WELCOME'), enabled: false }
    const deps: CcResolverDeps = { ...defaultDeps, rules: [disabled] }
    const result = resolveCcList(
      { context: 'welcome-note', schoolId: 'SCH-SPRINGWOOD-KOL', mouId: null },
      deps,
    )
    expect(result).toEqual([])
  })

  it('CCR-ESCALATION-LEADERSHIP region=ALL matches every school but only on escalation-notification', () => {
    const deps: CcResolverDeps = { ...defaultDeps, rules: [ruleById('CCR-ESCALATION-LEADERSHIP')] }
    const ameet = emailFor('ameet.z')
    // Every school, escalation-notification: fires.
    for (const school of allSchools) {
      const result = resolveCcList(
        { context: 'escalation-notification', schoolId: school.id, mouId: null },
        deps,
      )
      expect(result).toEqual([ameet])
    }
    // Same school, other context: empty.
    expect(
      resolveCcList(
        { context: 'welcome-note', schoolId: 'SCH-GREENFIELD-PUNE', mouId: null },
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
      { context: 'escalation-notification', schoolId: 'SCH-GREENFIELD-PUNE', mouId: null },
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

  // Parametric coverage. For each rule, isolate it (rules: [R]) and
  // pick a school + MOU known to satisfy its scope; then for each of
  // the 7 contexts assert: the email list equals R.ccUserIds (mapped
  // through emailFor) when the rule's contexts match C OR include
  // 'all-communications', else equals []. 70 assertions total.
  describe('parametric: 10 rules x 7 contexts in isolation', () => {
    interface Fixture { schoolId: string; mouId: string | null }
    const RULE_FIXTURES: Record<string, Fixture> = {
      'CCR-SW-RAIPUR-PUNE-NAGPUR': { schoolId: 'SCH-GREENFIELD-PUNE', mouId: 'MOU-STEAM-2627-001' },
      'CCR-SW-BANGALORE': { schoolId: 'SCH-MAPLELEAF-BLR', mouId: null },
      'CCR-EAST-WELCOME': { schoolId: 'SCH-SPRINGWOOD-KOL', mouId: null },
      'CCR-EAST-DISPATCH': { schoolId: 'SCH-SPRINGWOOD-KOL', mouId: null },
      'CCR-NORTH-1-7': { schoolId: 'SCH-OAKWOOD-DEL', mouId: null },
      'CCR-NORTH-WELCOME-CLOSE': { schoolId: 'SCH-OAKWOOD-DEL', mouId: null },
      'CCR-TTT-FEEDBACK': { schoolId: 'SCH-OAKWOOD-DEL', mouId: 'MOU-TINK-2627-002' },
      'CCR-GSLT-ALL': { schoolId: 'SCH-GREENFIELD-PUNE', mouId: 'MOU-STEAM-2627-001' },
      'CCR-NARAYANA-CHAIN': { schoolId: 'SCH-NARAYANA-ASN', mouId: 'MOU-STEAM-2627-004' },
      'CCR-ESCALATION-LEADERSHIP': { schoolId: 'SCH-GREENFIELD-PUNE', mouId: null },
    }

    for (const rule of allRules) {
      const fixture = RULE_FIXTURES[rule.id]
      if (!fixture) {
        it.fails(`fixture missing for rule ${rule.id}`, () => {})
        continue
      }
      for (const context of ALL_CONTEXTS) {
        const fires =
          rule.contexts.includes(context) ||
          rule.contexts.includes('all-communications')
        const expected = fires ? rule.ccUserIds.map((id) => emailFor(id)) : []
        it(`${rule.id} x ${context} -> ${fires ? expected.join(',') : '[]'}`, () => {
          const deps: CcResolverDeps = { ...defaultDeps, rules: [rule] }
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
