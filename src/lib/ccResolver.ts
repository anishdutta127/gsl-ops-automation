/*
 * CcRule resolver (step 6.5 Item D + step 8 Q-I).
 *
 * Pure read function. For a given (context, schoolId, mouId), returns
 * the deduped Cc email list to be added to the outgoing Communication.
 * Called at send-time (queue handler), never at compose-time, so a
 * rule toggle takes effect on the very next send.
 *
 * Match contract:
 *   - rule.enabled must be true. Disabled rules contribute nothing.
 *   - rule.contexts must include the call's `context` OR the literal
 *     'all-communications'. Step 6.5 Item D: a rule for "welcome
 *     notes" does NOT fire on cadence pings; the SPOC-DB phrasing is
 *     load-bearing.
 *   - rule.scope must match the school per the per-scope rules below.
 *
 * Scope semantics:
 *   - region          : school.region === scopeValue, OR scopeValue
 *                       is the sentinel 'ALL' (matches every school).
 *   - sub-region      : school.city matches one of scopeValue (string
 *                       or string[]). City names are normalised so
 *                       Bengaluru ≡ Bangalore, Bombay ≡ Mumbai, etc.,
 *                       because SPOC-DB rule text uses varied legacy
 *                       names while school records carry the official
 *                       current name.
 *   - school          : scopeValue === school.id (exact).
 *   - training-mode   : mou.trainerModel matches scopeValue under
 *                       alias normalisation (TTT ≡ TT,
 *                       GSL-Trainer ≡ GSL-T). Returns false when mouId
 *                       is null or trainerModel is null.
 *   - sr-no-range     : '<lo>..<hi>' against the North-sheet sr-no
 *                       lookup table. Sr-no is a SPOC-DB attribute,
 *                       not a first-class School field; the lookup is
 *                       maintained inline here.
 *
 * ccUserIds resolution:
 *   - First try users.json by id; if no match, try sales_team.json by
 *     id. The 10 pre-seeded SPOC-DB rules name sales-team coordinators
 *     by id (sp-rohan, sp-vikram, ...) plus a few staff (shashank.s,
 *     ameet.z), so both sources must be searched.
 *   - Unknown ids are skipped (do not crash; do not include).
 *   - Returned list is deduped by email.
 *
 * Testability:
 *   - The single-arg form `resolveCcList(args)` reads from JSON
 *     fixtures (the production path).
 *   - The two-arg form `resolveCcList(args, deps)` accepts an explicit
 *     dependency bundle, used by tests to inject custom rule sets,
 *     test for disabled-rule behaviour, or isolate single-rule
 *     behaviour without cross-rule interference.
 */

import type {
  CcRule,
  CcRuleContext,
  MOU,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import schoolsJson from '@/data/schools.json'
import mousJson from '@/data/mous.json'
import usersJson from '@/data/users.json'
import salesTeamJson from '@/data/sales_team.json'
import { normaliseCity } from '@/lib/cityAliases'

// SPOC-DB rule text uses 'TTT' / 'GSL-Trainer'; the canonical
// TrainerModel enum uses 'TT' / 'GSL-T'. Normalise both sides through
// this table before comparing.
const TRAINER_MODE_ALIASES: Record<string, string> = {
  TTT: 'TT',
  TT: 'TT',
  'GSL-Trainer': 'GSL-T',
  'GSL-T': 'GSL-T',
  Bootcamp: 'Bootcamp',
  Other: 'Other',
}

// North-sheet sr-no lookup. Sr-no is a SPOC-DB-only attribute (not a
// first-class School field); preserved here so CCR-NORTH-1-7 and any
// future sr-no-range rule can match without bloating the School type.
// Covers all 5 currently-seeded North schools; the rule scope of '1..7'
// in source data accommodates schools beyond the dev fixture, so the
// map will grow as production North schools are imported.
const NORTH_SR_NO: Record<string, number> = {
  'SCH-OAKWOOD-DEL': 1,
  'SCH-NORTHWOOD-CHD': 2,
  'SCH-HERITAGE-IND': 3,
  'SCH-BRIGHTSIDE-LKO': 4,
  'SCH-PEARL-JAI': 5,
}

function ruleMatchesContext(rule: CcRule, context: CcRuleContext): boolean {
  return (
    rule.contexts.includes(context) ||
    rule.contexts.includes('all-communications')
  )
}

function ruleMatchesScope(
  rule: CcRule,
  school: School,
  mou: MOU | null,
): boolean {
  switch (rule.scope) {
    case 'region': {
      const value = rule.scopeValue as string
      if (value === 'ALL') return true
      return school.region === value
    }
    case 'sub-region': {
      const values = Array.isArray(rule.scopeValue)
        ? rule.scopeValue
        : [rule.scopeValue]
      const target = normaliseCity(school.city)
      return values.some((v) => normaliseCity(v) === target)
    }
    case 'school': {
      return rule.scopeValue === school.id
    }
    case 'training-mode': {
      if (!mou || !mou.trainerModel) return false
      const ruleMode = TRAINER_MODE_ALIASES[rule.scopeValue as string]
      const mouMode = TRAINER_MODE_ALIASES[mou.trainerModel]
      return Boolean(ruleMode && mouMode && ruleMode === mouMode)
    }
    case 'sr-no-range': {
      const range = rule.scopeValue as string
      const m = range.match(/^(\d+)\.\.(\d+)$/)
      if (!m) return false
      const lo = Number(m[1])
      const hi = Number(m[2])
      const srNo = NORTH_SR_NO[school.id]
      if (srNo === undefined) return false
      return srNo >= lo && srNo <= hi
    }
  }
}

function resolveIdToEmail(
  id: string,
  users: User[],
  salesTeam: SalesPerson[],
): string | null {
  const u = users.find((x) => x.id === id)
  if (u) return u.email
  const sp = salesTeam.find((x) => x.id === id)
  if (sp) return sp.email
  return null
}

export interface ResolveCcListArgs {
  context: CcRuleContext
  schoolId: string
  mouId: string | null
}

export interface CcResolverDeps {
  rules: CcRule[]
  schools: School[]
  mous: MOU[]
  users: User[]
  salesTeam: SalesPerson[]
}

const defaultDeps: CcResolverDeps = {
  rules: ccRulesJson as unknown as CcRule[],
  schools: schoolsJson as unknown as School[],
  mous: mousJson as unknown as MOU[],
  users: usersJson as unknown as User[],
  salesTeam: salesTeamJson as unknown as SalesPerson[],
}

export function resolveCcList(
  args: ResolveCcListArgs,
  deps: CcResolverDeps = defaultDeps,
): string[] {
  const { context, schoolId, mouId } = args
  const school = deps.schools.find((s) => s.id === schoolId)
  if (!school) return []
  const mou = mouId ? deps.mous.find((m) => m.id === mouId) ?? null : null

  const matchedIds = new Set<string>()
  for (const rule of deps.rules) {
    if (!rule.enabled) continue
    if (!ruleMatchesContext(rule, context)) continue
    if (!ruleMatchesScope(rule, school, mou)) continue
    for (const userId of rule.ccUserIds) matchedIds.add(userId)
  }

  const emails = new Set<string>()
  for (const id of Array.from(matchedIds)) {
    const email = resolveIdToEmail(id, deps.users, deps.salesTeam)
    if (email) emails.add(email)
  }
  return Array.from(emails)
}
