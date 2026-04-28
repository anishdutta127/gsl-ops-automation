#!/usr/bin/env node

/*
 * W4-E.3 Phase 2: cc_rules.json mutation per Anish's row-by-row
 * decisions on the W4-E.3 audit pass (audit JSON at
 * `scripts/w4e-cc-rules-audit-2026-04-28.json`).
 *
 * 7 audit diffs evaluated:
 *
 *   Item 1 SW#3 Tamil Nadu  ("Keep R. Balu and Rajesh in Cc for
 *                             Tamil Nadu Schools")
 *     -> ADD CCR-SW-TAMIL-NADU with sp-balu_r (R. Balu).
 *        "Rajesh" not in sales_team.json or users.json: surface in
 *        D-022 sub-item.
 *
 *   Item 2 SW#4 Hyderabad   ("Keep Kranthi and Pooja Sharma in Cc
 *                             for Hyderabad Schools")
 *     -> DEFER to D-022: neither "Kranthi" nor "Pooja Sharma"
 *        exists in sales_team.json or users.json. Per Anish:
 *        don't fabricate ccUserIds.
 *
 *   Item 3 SW#5 Maharashtra ("Keep Shushankita in Cc for Schools
 *                             in Maharashtra and all TTT Schools")
 *     -> Maharashtra portion DEFER to D-022: "Shushankita" not
 *        in sales_team.json or users.json. TTT portion handled in
 *        Item 4 (combined deferral).
 *
 *   Item 4 East#2 broad-TTT ("Keep Shushankita in Cc for Schools
 *                             in all TTT Schools")
 *     -> Decision was to ADD CCR-TTT-ALL, but DEFER because
 *        "Shushankita" not in users.json. Same rationale as
 *        Item 3. Existing CCR-TTT-FEEDBACK stays narrow
 *        (feedback-request only) per Anish.
 *
 *   Item 5 North#1 Sr.no 1-7 (over-broad context)
 *     -> KEEP CCR-NORTH-1-7 AS-IS per Anish (operational practice
 *        is all-communications; SPOC DB header text "closing
 *        letters" is too narrow). D-021 captures the upstream
 *        SPOC DB header fix.
 *
 *   Item 6 North#2 GR International School ("Keep Sahil Sharma,
 *                             Pooja Sharma in Cc for GR International")
 *     -> ADD CCR-NORTH-GR-INTERNATIONAL with sp-sahil (likely
 *        match for "Sahil Sharma"; partial-name convention in
 *        sales_team.json). "Pooja Sharma" not mapped: D-022
 *        sub-item. Surface unconfirmed sp-sahil mapping in commit.
 *
 *   Item 7 North#3 Shushankita TTT (same as Item 4)
 *     -> Combined into Item 4 deferral.
 *
 * Net mutation:
 *   - Add 2 cc_rules entries (CCR-SW-TAMIL-NADU,
 *     CCR-NORTH-GR-INTERNATIONAL).
 *   - Defer 3 cc_rules to D-022 (CCR-SW-HYDERABAD,
 *     CCR-SW-MAHARASHTRA, CCR-TTT-ALL).
 *
 * Audit per new rule: 'cc-rule-created' on rule.auditLog with
 * sheet/header reference + reasoning. The action enum already
 * contains 'cc-rule-created'; no schema change.
 *
 * ccResolver.ts union behaviour: verified by reading the existing
 * unit test 'overlapping ccUserIds dedupe across multiple matching
 * rules' (src/lib/ccResolver.test.ts L330). Multiple rules matching
 * the same school+context union their ccUserIds into a deduped Set;
 * CCR-TTT-ALL (when later added) will combine cleanly with
 * CCR-TTT-FEEDBACK on TTT feedback-request emails. No resolver
 * change needed.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CC_RULES_PATH = resolve(REPO_ROOT, 'src/data/cc_rules.json')
const FIXTURES_CC_RULES_PATH = resolve(REPO_ROOT, 'src/data/_fixtures/cc_rules.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4e-cc-rules-mutation-report-2026-04-28.json')
const TS = '2026-04-28T17:00:00.000Z'
const ACTOR = 'system-w4e-audit'

// ------------------------------------------------------------------
// New rules to add
// ------------------------------------------------------------------
const RULES_TO_ADD = [
  {
    id: 'CCR-SW-TAMIL-NADU',
    sheet: 'South-West',
    scope: 'sub-region',
    scopeValue: 'Tamil Nadu',
    contexts: ['all-communications'],
    ccUserIds: ['sp-balu_r'],
    enabled: true,
    sourceRuleText: 'Keep R. Balu and Rajesh in Cc for Tamil Nadu Schools',
    createdAt: TS,
    createdBy: ACTOR,
    disabledAt: null,
    disabledBy: null,
    disabledReason: null,
    auditLog: [
      {
        timestamp: TS,
        user: ACTOR,
        action: 'cc-rule-created',
        after: {
          source: 'W4-E.3 audit pass; SPOC DB South-West sheet row 3',
          sheetHeader: 'Keep R. Balu and Rajesh in Cc for Tamil Nadu Schools',
          ccUserIds: ['sp-balu_r'],
          gap: 'Rajesh has no entry in sales_team.json or users.json; D-022 captures the round 2 mapping.',
        },
        notes: 'Added per Anish W4-E.3 audit-pass decision item 1; partial CC list (sp-balu_r mapped to "R. Balu"); Rajesh deferred to D-022.',
      },
    ],
  },
  {
    id: 'CCR-NORTH-GR-INTERNATIONAL',
    sheet: 'North',
    scope: 'school',
    scopeValue: 'SCH-GR_INTERNATIONAL_SCH',
    contexts: ['all-communications'],
    ccUserIds: ['sp-sahil'],
    enabled: true,
    sourceRuleText: 'Keep Sahil Sharma, Pooja Sharma in Cc for GR International School',
    createdAt: TS,
    createdBy: ACTOR,
    disabledAt: null,
    disabledBy: null,
    disabledReason: null,
    auditLog: [
      {
        timestamp: TS,
        user: ACTOR,
        action: 'cc-rule-created',
        after: {
          source: 'W4-E.3 audit pass; SPOC DB North sheet row 2',
          sheetHeader: 'Keep Sahil Sharma, Pooja Sharma in Cc for GR International School',
          ccUserIds: ['sp-sahil'],
          gap: 'sp-sahil is the only Sahil in sales_team.json (single-name convention) but the mapping to "Sahil Sharma" is unconfirmed. "Pooja Sharma" has no entry. D-022 captures both.',
        },
        notes: 'Added per Anish W4-E.3 audit-pass decision item 6; partial CC list (sp-sahil tentative match for "Sahil Sharma"); Pooja Sharma deferred to D-022.',
      },
    ],
  },
]

// ------------------------------------------------------------------
// Rules deferred to D-022 (no mutation; surfaced in report only)
// ------------------------------------------------------------------
const RULES_DEFERRED = [
  {
    proposedId: 'CCR-SW-HYDERABAD',
    sheet: 'South-West',
    rowNumber: 4,
    sourceText: 'Keep Kranthi and Pooja Sharma in Cc for Hyderabad Schools',
    namedUsers: ['Kranthi', 'Pooja Sharma'],
    knownMappings: {},
    reason: 'Neither "Kranthi" nor "Pooja Sharma" exists in sales_team.json or users.json. Anish: do not fabricate ccUserIds. D-022.',
  },
  {
    proposedId: 'CCR-SW-MAHARASHTRA',
    sheet: 'South-West',
    rowNumber: 5,
    sourceText: 'Keep Shushankita in Cc for Schools in Maharashtra and all TTT Schools',
    namedUsers: ['Shushankita'],
    knownMappings: {},
    reason: '"Shushankita" not in sales_team.json or users.json. SW#5 is a compound rule; the Maharashtra sub-region portion needs Shushankita\'s ID before the rule can land. D-022.',
  },
  {
    proposedId: 'CCR-TTT-ALL',
    sheet: 'derived',
    rowNumber: null,
    sourceText: 'Keep Shushankita in Cc for Schools in all TTT Schools (East#2 + North#3 + SW#5 TTT portion)',
    namedUsers: ['Shushankita'],
    knownMappings: {},
    reason: '"Shushankita" not mapped. CCR-TTT-FEEDBACK stays narrow per Anish. CCR-TTT-ALL (training-mode TTT, all-communications) lands once Shushankita\'s ID is in users.json. D-022.',
  },
]

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const ccRules = JSON.parse(readFileSync(CC_RULES_PATH, 'utf-8'))
  const existingIds = new Set(ccRules.map((r) => r.id))

  const result = {
    generatedAt: TS,
    purpose: 'W4-E.3 Phase 2 mutation: cc_rules.json updates per Anish-signed audit-pass decisions on 2026-04-28.',
    decisions: {
      item1_tamilNadu: 'ADD CCR-SW-TAMIL-NADU with sp-balu_r; Rajesh -> D-022',
      item2_hyderabad: 'DEFER -> D-022 (neither Kranthi nor Pooja Sharma mapped)',
      item3_maharashtra: 'DEFER -> D-022 (Shushankita not mapped)',
      item4_ttt_all: 'DEFER -> D-022 (Shushankita not mapped); CCR-TTT-FEEDBACK stays narrow',
      item5_north_1_7: 'KEEP AS-IS per Anish (operational practice all-communications); D-021 SPOC-DB header fix',
      item6_grInternational: 'ADD CCR-NORTH-GR-INTERNATIONAL with sp-sahil; Pooja Sharma -> D-022; sp-sahil unconfirmed',
      item7_ttt_all_dup: 'Combined into item 4 deferral',
    },
    added: [],
    deferred: RULES_DEFERRED,
    ccResolverUnionBehaviour: {
      verified: true,
      reference: 'src/lib/ccResolver.test.ts L330 "overlapping ccUserIds dedupe across multiple matching rules"',
      conclusion: 'Resolver iterates every matching rule, accumulates ccUserIds into a Set, then resolves Set -> emails (also a Set). Multiple matching rules produce union of users without duplication. CCR-TTT-FEEDBACK and CCR-TTT-ALL (when later added) combine cleanly.',
    },
  }

  for (const rule of RULES_TO_ADD) {
    if (existingIds.has(rule.id)) {
      throw new Error(`cc_rule id ${rule.id} already exists; bailing to avoid duplicate.`)
    }
    ccRules.push(rule)
    result.added.push({
      id: rule.id,
      scope: rule.scope,
      scopeValue: rule.scopeValue,
      contexts: rule.contexts,
      ccUserIds: rule.ccUserIds,
      sourceRuleText: rule.sourceRuleText,
    })
  }

  writeFileSync(CC_RULES_PATH, JSON.stringify(ccRules, null, 2) + '\n', 'utf-8')
  writeFileSync(FIXTURES_CC_RULES_PATH, JSON.stringify(ccRules, null, 2) + '\n', 'utf-8')
  writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')

  console.log('')
  console.log(`[w4e.3.mut] added:    ${result.added.length} cc_rules entries`)
  for (const a of result.added) console.log(`              + ${a.id} (${a.scope}=${JSON.stringify(a.scopeValue)}, ccUsers=${JSON.stringify(a.ccUserIds)})`)
  console.log(`[w4e.3.mut] deferred: ${result.deferred.length} rules -> D-022`)
  for (const d of result.deferred) console.log(`              ! ${d.proposedId} (${d.namedUsers.join(' + ')})`)
  console.log(`[w4e.3.mut] cc_rules.json size: ${ccRules.length} (was ${ccRules.length - result.added.length})`)
  console.log(`[w4e.3.mut] report:   ${REPORT_PATH}`)
}

main()
