/*
 * Q-G Test 6: importerIntegration (TODO scaffold).
 *
 * This is a Q-G test scaffold landed via Item 15b. The subject is
 * `src/lib/importer/fromMou.ts` which is Phase 1 implementation
 * work scheduled for Week 2 (NOT Week 1 scaffolding scope per step
 * 10 Item 7). When the lib lands, replace each it.todo() with real
 * assertions per the given/when/then comments below.
 *
 * Per step 8 eng review Q-G Test 6:
 *   "end-to-end mock of MOU Contents API responses; drives
 *    fromMou.importOnce(); asserts import queue items, validation
 *    failures, and auto-link decisions match fixtures across 10
 *    representative input shapes."
 *
 * The 10 representative shapes (from step 8 Q-A validators):
 *   1. Single-school MOU (auto-link exact-match path)
 *   2. Chain MOU (Narayana-pattern; routes to GROUP review)
 *   3. Name+location exact match (auto-link)
 *   4. Near-duplicate name (review queue)
 *   5. Tax-inverted pricing (validator 1: tax_inversion)
 *   6. Date-inverted dates (validator 4: date_inversion)
 *   7. Unknown programme (validator 5: unknown_programme)
 *   8. Missing required field (validator 6 schoolname or 2 students)
 *   9. GSLT-Cretile programme (Update 1: rewritten to STEAM
 *      sub-type at ingestion via gslt-cretile-normalisation auditLog)
 *   10. Legacy academicYear (filtered by Q-A's flag-gate when
 *       Item C remains EXCLUDED; surfaces when flipped INCLUDED)
 */

import { describe, it } from 'vitest'

describe('Q-G Test 6: importerIntegration (Week 2 scope)', () => {
  it.todo(
    'single-school auto-link writes auditLog action=auto-link-exact-match on both MOU and School',
    /*
     * Given: MOU Contents API GET returns a single new MOU with
     *        schoolName matching exactly one entry in Ops's
     *        schools.json by (normalized_name, city, state).
     * When:  fromMou.importOnce() runs.
     * Then:  Ops mous.json contains the new MOU with schoolId set;
     *        both the MOU's auditLog and the School's auditLog have
     *        an entry with action 'auto-link-exact-match' recording
     *        source id, target id, normalized match key.
     */
  )

  it.todo(
    'chain MOU lands in mou_import_review.json with quarantineReason naming the GROUP heuristic',
    /*
     * Given: incoming MOU with schoolName containing "Group of
     *        Schools" or studentsMou exceeding 1500.
     * When:  fromMou.importOnce() runs.
     * Then:  mous.json is unchanged; mou_import_review.json
     *        gains an entry with quarantineReason mentioning
     *        SINGLE-vs-GROUP classification needed.
     */
  )

  it.todo(
    'tax-inversion fails validator 1 and lands in review with category tax_inversion',
    /*
     * Given: incoming MOU with spWithTax < spWithoutTax.
     * When:  fromMou.importOnce() runs.
     * Then:  mous.json is unchanged; review queue entry has
     *        validationFailed='tax_inversion'.
     */
  )

  it.todo(
    'GSLT-Cretile programme is rewritten to STEAM with programmeSubType=GSLT-Cretile',
    /*
     * Given: incoming MOU with programme='GSLT-Cretile' (the value
     *        ground-truth §1 saw in 18 of 24 source records).
     * When:  fromMou.importOnce() runs.
     * Then:  mous.json entry has programme='STEAM',
     *        programmeSubType='GSLT-Cretile', and an auditLog
     *        entry with action='gslt-cretile-normalisation'
     *        recording the normalisation. Per Update 1 / Q-D
     *        resolution.
     */
  )

  it.todo(
    'legacy academicYear MOUs are filtered out when Item C flag remains EXCLUDED',
    /*
     * Given: incoming MOU with academicYear='2025-26' (legacy)
     *        and the Q-A flag-gate set to academicYear>='2026-27'
     *        (default, EXCLUDED).
     * When:  fromMou.importOnce() runs.
     * Then:  mous.json and mou_import_review.json are both
     *        unchanged. Legacy MOU is silently dropped at the
     *        filter stage, not quarantined.
     */
  )

  it.todo(
    'missing required field (schoolName empty) lands in review with schoolname_implausible',
    /*
     * Given: incoming MOU with schoolName=''.
     * When:  fromMou.importOnce() runs.
     * Then:  review queue entry has
     *        validationFailed='schoolname_implausible'.
     */
  )

  it.todo(
    'date-inverted endDate before startDate lands in review with date_inversion',
    /*
     * Given: incoming MOU with endDate='2026-04-01' and startDate
     *        '2027-03-31' (swapped).
     * When:  fromMou.importOnce() runs.
     * Then:  review queue entry has validationFailed='date_inversion'.
     */
  )

  it.todo(
    'student count > threshold (20000) lands in review with student_count_implausible',
    /*
     * Given: incoming MOU with studentsMou=25000.
     * When:  fromMou.importOnce() runs.
     * Then:  review queue entry has
     *        validationFailed='student_count_implausible'.
     */
  )

  it.todo(
    'near-duplicate name (different city) lands in review for human disambiguation',
    /*
     * Given: schools.json has "Greenfield Academy, Pune" and
     *        incoming MOU references "Greenfield Academy" without
     *        city or with a different city.
     * When:  fromMou.importOnce() runs.
     * Then:  review queue entry surfaces both candidate matches
     *        for human resolution.
     */
  )

  it.todo(
    'unknown programme (not in 5-value Programme enum) lands in review with unknown_programme',
    /*
     * Given: incoming MOU with programme='SomeNewProgramme'.
     * When:  fromMou.importOnce() runs.
     * Then:  review queue entry has
     *        validationFailed='unknown_programme'. (Note: GSLT-
     *        Cretile is rewritten to STEAM at ingestion per
     *        Update 1; this test exercises a NEW programme that
     *        is genuinely unknown.)
     */
  )
})
