/*
 * W4-F.3 did-you-mean school-match helper.
 *
 * Pure function. Given a SalesOpportunity row's free-text schoolName +
 * the schools.json directory, returns the top token-overlap candidate
 * when:
 *   - the opportunity has no linked schoolId yet
 *   - the operator has not dismissed the suggestion
 *   - the best Jaccard token-overlap score crosses the 0.7 threshold
 *
 * Independence axis: pure name jaccard (different from W4-E.2 city-
 * weighted match). The detail page uses this only as a hint; final
 * link decision rests with the operator.
 */

import type { School } from '@/lib/types'

const STOPWORDS = new Set([
  'school', 'schools', 'public', 'academy', 'academic', 'international',
  'global', 'memorial', 'sr', 'jr', 'senior', 'junior', 'secondary',
  'higher', 'high', 'primary', 'mission', 'convent', 'group', 'limited',
  'pvt', 'ltd', 'and', 'the', 'of', 'for', 'in', 'on', 'at', 'a', 'an',
  'st', 'edu', 'educational', 'trust', 'institute', 'institution',
])

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const t of Array.from(a)) if (b.has(t)) intersect++
  return intersect / (a.size + b.size - intersect)
}

export interface SchoolMatchSuggestion {
  schoolId: string
  schoolName: string
  city: string
  score: number
}

export const SCHOOL_MATCH_THRESHOLD = 0.7

export function findSchoolMatch(
  schoolName: string,
  schools: School[],
): SchoolMatchSuggestion | null {
  const target = tokens(schoolName)
  if (target.size === 0) return null
  let best: SchoolMatchSuggestion | null = null
  for (const s of schools) {
    const score = jaccard(target, tokens(s.name))
    if (score < SCHOOL_MATCH_THRESHOLD) continue
    if (best === null || score > best.score) {
      best = {
        schoolId: s.id,
        schoolName: s.name,
        city: s.city,
        score,
      }
    }
  }
  return best
}
