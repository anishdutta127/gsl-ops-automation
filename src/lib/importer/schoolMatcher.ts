/*
 * School identity resolution for the Q-A importer.
 *
 * Pure read function. Given an incoming school descriptor (name +
 * city + state) and the current Ops schools.json, returns the set of
 * candidate matches under deterministic normalisation:
 *
 *   - Lowercase the school name
 *   - Strip punctuation; collapse whitespace
 *   - Apply name aliases (Saint <-> St, School <-> Sch, etc.)
 *   - Apply city aliases via the shared cityAliases module
 *   - State: lowercase + trim
 *
 * The match key is the joined tuple `name|city|state`. A candidate
 * is anything in Ops's schools.json with the same key.
 *
 * Result: { matches, matchKey }. Matches are sorted ascending by
 * `schoolId` so that callers (specifically the quarantine writer)
 * see a stable ordering across runs and across insertion orders in
 * the source data.
 *
 * Phase 1.1 deferred: fuzzy match (Levenshtein, token overlap),
 * PIN-code-derived city inference, state-name canonicalisation
 * across "Karnataka" / "KA" forms.
 */

import type { School } from '@/lib/types'
import { normaliseCity } from '@/lib/cityAliases'

export interface SchoolMatchInput {
  schoolName: string
  city: string
  state: string
}

export interface SchoolMatchCandidate {
  schoolId: string
  schoolName: string
  matchKey: string
}

export interface SchoolMatchResult {
  matches: SchoolMatchCandidate[]
  matchKey: string
}

const NAME_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\bsaint\b/g, 'st'],
  [/\bschool\b/g, 'sch'],
  [/\bpublic\b/g, 'pub'],
  [/\bsenior\b/g, 'sr'],
  [/\bjunior\b/g, 'jr'],
]

export function normaliseSchoolName(name: string): string {
  let n = name.toLowerCase().trim()
  n = n.replace(/[^a-z0-9\s]/g, ' ')
  n = n.replace(/\s+/g, ' ').trim()
  for (const [pattern, replacement] of NAME_ALIASES) {
    n = n.replace(pattern, replacement)
  }
  return n.replace(/\s+/g, ' ').trim()
}

export function buildMatchKey(input: SchoolMatchInput): string {
  return `${normaliseSchoolName(input.schoolName)}|${normaliseCity(input.city)}|${input.state.toLowerCase().trim()}`
}

export function findCandidates(
  input: SchoolMatchInput,
  schools: School[],
): SchoolMatchResult {
  const targetKey = buildMatchKey(input)
  const matches: SchoolMatchCandidate[] = []
  for (const school of schools) {
    const schoolKey = buildMatchKey({
      schoolName: school.name,
      city: school.city,
      state: school.state,
    })
    if (schoolKey === targetKey) {
      matches.push({
        schoolId: school.id,
        schoolName: school.name,
        matchKey: schoolKey,
      })
    }
  }
  matches.sort((a, b) => a.schoolId.localeCompare(b.schoolId))
  return { matches, matchKey: targetKey }
}
