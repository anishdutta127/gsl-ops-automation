#!/usr/bin/env node

/*
 * W4-E.3: CC rules audit pass.
 *
 * READ-ONLY. No data mutation. Compares the 10 free-text top-of-sheet
 * CC rules in `ops-data/SCHOOL_SPOC_DATABASE.xlsx` against the 10
 * pre-seeded entries in `src/data/cc_rules.json` and produces a
 * structured audit report.
 *
 * Match criteria (per Anish's W4-E.3 brief):
 *   - scope type     (region / sub-region / school / training-mode / sr-no-range)
 *   - scopeValue     (region name, sub-region list, schoolId, mode, range)
 *   - contexts       (which Communication contexts the rule applies to)
 *   - ccUserIds list (informational only; cc_rules.json carries
 *                     placeholder sales-team ids while SPOC DB carries
 *                     real names; the placeholder->real-user mapping
 *                     is a separate Phase 1.1 concern, not an audit
 *                     diff per se)
 *
 * Outcomes (per row):
 *   - clean-match           SPOC DB rule has a cc_rule with same
 *                           scope + contexts; the user list is a known
 *                           placeholder mapping (informational)
 *   - context-drift         SPOC DB rule has a cc_rule with same scope
 *                           but contexts differ (e.g., N#1 closing
 *                           letters in source vs all-communications
 *                           in cc_rules)
 *   - unmatched-spoc-db     SPOC DB rule has no cc_rule covering it
 *   - derived-cc-rule       cc_rule is not from SPOC DB top-of-sheet
 *                           (intentional system extensions; not a
 *                           defect)
 *
 * North sheet rule 1 typo (D-016): the source text says "East Schools"
 * inside the North file (Misba's typo). The audit preserves the typo
 * verbatim per source-of-truth principle. CCR-NORTH-1-7 mirrors the
 * sr-no-range scope; the typo question is handled at source per D-016
 * round 2 fix, not in this audit.
 *
 * Output (read-only):
 *   scripts/w4e-cc-rules-audit-2026-04-28.json
 *
 * If the audit produces any non-clean rows, follow the locked-
 * discipline pattern: pause for Anish review before any cc_rules.json
 * mutation. The mutation script (if needed) is W4-E.3 Phase 2 and is
 * NOT written or executed by this audit pass.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const VERIFICATION_PATH = resolve(REPO_ROOT, 'scripts/w4e-spoc-import-verification-2026-04-28.json')
const CC_RULES_PATH = resolve(REPO_ROOT, 'src/data/cc_rules.json')
const REPORT_PATH = resolve(REPO_ROOT, 'scripts/w4e-cc-rules-audit-2026-04-28.json')

// ------------------------------------------------------------------
// SPOC DB top-of-sheet rules: hardcoded parse.
// Free-text rules are awkward to auto-parse reliably; we capture the
// parsed structure inline so the audit's matcher logic is auditable
// and the parse itself is reviewable.
// ------------------------------------------------------------------
const SPOC_DB_RULES = [
  {
    id: 'SW#1',
    sheet: 'South-West',
    rowNumber: 1,
    sourceText: 'Keep Suresh and Pallavi in Cc for Raipur,Pune,Nagpur Schools',
    parsedScope: 'sub-region',
    parsedScopeValue: ['Raipur', 'Pune', 'Nagpur'],
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Suresh', 'Pallavi'],
  },
  {
    id: 'SW#2',
    sheet: 'South-West',
    rowNumber: 2,
    sourceText: 'Keep Balachandran and Pallavi in Cc for Bangalore Schools',
    parsedScope: 'sub-region',
    parsedScopeValue: 'Bangalore',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Balachandran', 'Pallavi'],
  },
  {
    id: 'SW#3',
    sheet: 'South-West',
    rowNumber: 3,
    sourceText: 'Keep R. Balu and Rajesh in Cc for Tamil Nadu Schools',
    parsedScope: 'sub-region',
    parsedScopeValue: 'Tamil Nadu',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['R. Balu', 'Rajesh'],
  },
  {
    id: 'SW#4',
    sheet: 'South-West',
    rowNumber: 4,
    sourceText: 'Keep Kranthi and Pooja Sharma in Cc for Hyderabad Schools',
    parsedScope: 'sub-region',
    parsedScopeValue: 'Hyderabad',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Kranthi', 'Pooja Sharma'],
  },
  {
    id: 'SW#5',
    sheet: 'South-West',
    rowNumber: 5,
    sourceText: 'Keep Shushankita in Cc for Schools in Maharashtra and all TTT Schools',
    // Compound rule: two scopes (Maharashtra sub-region + TTT
    // training-mode). cc_rules schema has single scope per row, so
    // this audit splits into 2 expected entries; either one missing
    // surfaces as unmatched.
    compound: true,
    parsedScope: 'compound',
    parsedScopeAlternatives: [
      { scope: 'sub-region', scopeValue: 'Maharashtra' },
      { scope: 'training-mode', scopeValue: 'TTT' },
    ],
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Shushankita'],
  },
  {
    id: 'East#1',
    sheet: 'East',
    rowNumber: 1,
    sourceText: 'Keep Prodipto, Avishek,Deepjyoti in Cc while sending the welcome note for East Schools',
    parsedScope: 'region',
    parsedScopeValue: 'East',
    parsedContexts: ['welcome-note'],
    parsedCcNames: ['Prodipto', 'Avishek', 'Deepjyoti'],
  },
  {
    id: 'East#2',
    sheet: 'East',
    rowNumber: 2,
    sourceText: 'Keep Shushankita in Cc for Schools in all TTT Schools',
    parsedScope: 'training-mode',
    parsedScopeValue: 'TTT',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Shushankita'],
  },
  {
    id: 'North#1',
    sheet: 'North',
    rowNumber: 1,
    sourceText: 'Keep Roveena, Pooja Sharma from Sr.no 1 to 7 in Cc while sending the closing letters for East Schools',
    // D-016 typo: rule lives in North file but says "East Schools".
    // Audit captures the typo presence; cc_rules.json mirrors the
    // sr-no-range scope at face value (1..7 in the North sheet).
    typoNote: 'D-016: source text says "East Schools" while rule lives in North sheet (Misba typo). Source-of-truth principle preserves verbatim until upstream fix.',
    parsedScope: 'sr-no-range',
    parsedScopeValue: '1..7',
    parsedContexts: ['closing-letter'],
    parsedCcNames: ['Roveena', 'Pooja Sharma'],
  },
  {
    id: 'North#2',
    sheet: 'North',
    rowNumber: 2,
    sourceText: 'Keep Sahil Sharma, Pooja Sharma in Cc for GR International School',
    parsedScope: 'school',
    parsedScopeValue: 'SCH-GR_INTERNATIONAL_SCH',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Sahil Sharma', 'Pooja Sharma'],
  },
  {
    id: 'North#3',
    sheet: 'North',
    rowNumber: 3,
    sourceText: 'Keep Shushankita in Cc for all TTT schools',
    parsedScope: 'training-mode',
    parsedScopeValue: 'TTT',
    parsedContexts: ['all-communications'],
    parsedCcNames: ['Shushankita'],
  },
]

// ------------------------------------------------------------------
// Matchers
// ------------------------------------------------------------------
function arraysEqual(a, b) {
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    const sa = [...a].map(String).sort()
    const sb = [...b].map(String).sort()
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
    return true
  }
  return String(a) === String(b)
}

function scopeValueMatches(spocValue, ccValue) {
  if (Array.isArray(spocValue) || Array.isArray(ccValue)) {
    return arraysEqual(spocValue, ccValue)
  }
  return String(spocValue).trim().toLowerCase() === String(ccValue).trim().toLowerCase()
}

function contextsMatch(spocContexts, ccContexts) {
  return arraysEqual(spocContexts, ccContexts)
}

function findMatchingCcRule(spocRule, ccRules, options = {}) {
  const candidates = ccRules.filter((cr) => {
    const scope = options.scope ?? spocRule.parsedScope
    const scopeValue = options.scopeValue ?? spocRule.parsedScopeValue
    if (cr.scope !== scope) return false
    return scopeValueMatches(scopeValue, cr.scopeValue)
  })
  return candidates
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
function main() {
  const ccRules = JSON.parse(readFileSync(CC_RULES_PATH, 'utf-8'))
  const verification = JSON.parse(readFileSync(VERIFICATION_PATH, 'utf-8'))

  const result = {
    generatedAt: new Date().toISOString(),
    purpose: 'W4-E.3 audit pass: SPOC DB top-of-sheet rules vs cc_rules.json. Read-only output; no mutation.',
    inputs: {
      spocDbRulesCount: SPOC_DB_RULES.length,
      ccRulesCount: ccRules.length,
      sheetRulesFromVerification: verification.sheetRules,
    },
    outcomes: [],
    derivedCcRules: [],
    summary: {
      cleanMatch: 0,
      contextDrift: 0,
      unmatchedSpocDb: 0,
      partialCompound: 0,
      derivedCcRules: 0,
      auditClean: false,
    },
  }

  const matchedCcRuleIds = new Set()

  for (const spoc of SPOC_DB_RULES) {
    if (spoc.compound) {
      // SW#5: check each alternative independently.
      const altMatches = []
      for (const alt of spoc.parsedScopeAlternatives) {
        const candidates = findMatchingCcRule(spoc, ccRules, alt)
        let cleanCandidate = null
        let driftCandidate = null
        for (const c of candidates) {
          if (contextsMatch(spoc.parsedContexts, c.contexts)) {
            cleanCandidate = c
          } else if (!driftCandidate) {
            driftCandidate = c
          }
        }
        altMatches.push({
          alternative: alt,
          cleanMatchId: cleanCandidate?.id ?? null,
          driftMatchId: driftCandidate?.id ?? null,
          driftCcContexts: driftCandidate?.contexts ?? null,
        })
        // Only count the chosen candidate (clean wins; drift only when no clean).
        if (cleanCandidate) {
          matchedCcRuleIds.add(cleanCandidate.id)
        } else if (driftCandidate) {
          matchedCcRuleIds.add(driftCandidate.id)
        }
      }
      const cleanCount = altMatches.filter((m) => m.cleanMatchId).length
      let outcome = null
      if (cleanCount === altMatches.length) {
        outcome = 'clean-match'
        result.summary.cleanMatch += 1
      } else if (cleanCount > 0) {
        outcome = 'partial-compound'
        result.summary.partialCompound += 1
      } else {
        // No alternative matched cleanly: any drift counts as drift; otherwise unmatched.
        if (altMatches.some((m) => m.driftMatchId)) {
          outcome = 'context-drift'
          result.summary.contextDrift += 1
        } else {
          outcome = 'unmatched-spoc-db'
          result.summary.unmatchedSpocDb += 1
        }
      }
      result.outcomes.push({
        spocId: spoc.id,
        sheet: spoc.sheet,
        rowNumber: spoc.rowNumber,
        sourceText: spoc.sourceText,
        compound: true,
        alternatives: altMatches,
        outcome,
        notes: spoc.typoNote ?? null,
      })
      continue
    }

    const candidates = findMatchingCcRule(spoc, ccRules)
    let cleanCandidate = null
    let driftCandidate = null
    for (const c of candidates) {
      if (contextsMatch(spoc.parsedContexts, c.contexts)) {
        cleanCandidate = c
      } else if (!driftCandidate) {
        driftCandidate = c
      }
    }
    // Only count the chosen candidate. Clean wins; drift only when no clean.
    if (cleanCandidate) {
      matchedCcRuleIds.add(cleanCandidate.id)
    } else if (driftCandidate) {
      matchedCcRuleIds.add(driftCandidate.id)
    }

    let outcome = null
    let matchedId = null
    let diffDetail = null
    if (cleanCandidate) {
      outcome = 'clean-match'
      matchedId = cleanCandidate.id
      result.summary.cleanMatch += 1
    } else if (driftCandidate) {
      outcome = 'context-drift'
      matchedId = driftCandidate.id
      diffDetail = {
        spocContexts: spoc.parsedContexts,
        ccContexts: driftCandidate.contexts,
      }
      result.summary.contextDrift += 1
    } else {
      outcome = 'unmatched-spoc-db'
      result.summary.unmatchedSpocDb += 1
    }

    result.outcomes.push({
      spocId: spoc.id,
      sheet: spoc.sheet,
      rowNumber: spoc.rowNumber,
      sourceText: spoc.sourceText,
      parsedScope: spoc.parsedScope,
      parsedScopeValue: spoc.parsedScopeValue,
      parsedContexts: spoc.parsedContexts,
      parsedCcNames: spoc.parsedCcNames,
      outcome,
      matchedCcRuleId: matchedId,
      diffDetail,
      notes: spoc.typoNote ?? null,
    })
  }

  // cc_rules entries with no SPOC DB origin = derived rules.
  for (const cr of ccRules) {
    if (!matchedCcRuleIds.has(cr.id)) {
      result.derivedCcRules.push({
        id: cr.id,
        scope: cr.scope,
        scopeValue: cr.scopeValue,
        contexts: cr.contexts,
        sourceRuleText: cr.sourceRuleText,
        ccUserIds: cr.ccUserIds,
        rationale: 'Not from SPOC DB top-of-sheet free-text rules. Intentional system extension (chain MOU, escalation visibility, training-mode-specific contexts, etc.).',
      })
      result.summary.derivedCcRules += 1
    }
  }

  result.summary.auditClean =
    result.summary.contextDrift === 0
    && result.summary.unmatchedSpocDb === 0
    && result.summary.partialCompound === 0

  writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8')

  console.log('')
  console.log('W4-E.3 CC rules audit pass:')
  console.log(`  SPOC DB rules:           ${SPOC_DB_RULES.length}`)
  console.log(`  cc_rules.json entries:   ${ccRules.length}`)
  console.log(`    clean-match:           ${result.summary.cleanMatch}`)
  console.log(`    context-drift:         ${result.summary.contextDrift}`)
  console.log(`    partial-compound:      ${result.summary.partialCompound}`)
  console.log(`    unmatched-spoc-db:     ${result.summary.unmatchedSpocDb}`)
  console.log(`    derived-cc-rules:      ${result.summary.derivedCcRules}`)
  console.log(`  audit clean:             ${result.summary.auditClean}`)
  console.log('')
  console.log(`Wrote ${REPORT_PATH}`)

  if (!result.summary.auditClean) {
    console.log('')
    console.log('AUDIT NOT CLEAN. Per locked discipline, pause for Anish review before any cc_rules.json mutation.')
    console.log('Non-clean outcomes:')
    for (const o of result.outcomes) {
      if (o.outcome === 'clean-match') continue
      console.log(`  ${o.spocId} (${o.sheet} row ${o.rowNumber}): ${o.outcome}`)
      if (o.diffDetail) {
        console.log(`    SPOC contexts: ${JSON.stringify(o.diffDetail.spocContexts)}`)
        console.log(`    cc_rule contexts: ${JSON.stringify(o.diffDetail.ccContexts)}`)
      }
      if (o.compound) {
        for (const alt of o.alternatives) {
          console.log(`    alt ${alt.alternative.scope}=${JSON.stringify(alt.alternative.scopeValue)}: clean=${alt.cleanMatchId ?? 'none'}, drift=${alt.driftMatchId ?? 'none'}`)
        }
      }
    }
  }
}

main()
