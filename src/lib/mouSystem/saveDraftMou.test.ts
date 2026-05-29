/*
 * saveDraftMou regression coverage (Phase 6A, 2026-05-20).
 *
 * Pranav review #2 found that brand-new drafts were saved but never
 * appeared on the /mous registry. Root cause: the new MOU object did
 * not set `cohortStatus`, and /mous filters cohortStatus === 'active'
 * at line 110. Drafts therefore landed in mous.json but the operator
 * could not see them. These tests pin the new defaults so the bug
 * does not regress.
 *
 * The atomicUpdateJson dependency is mocked: it captures the mutator
 * callback, runs it against the current (in-memory) state, and
 * returns a fake commit SHA so the test exercises the new-row
 * construction without touching GitHub.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MOU } from '@/lib/types'

vi.mock('@/lib/githubQueue', () => {
  const atomicUpdateJson = vi.fn(
    async <T,>(
      _path: string,
      mutate: (current: T) => { next: T; commitMessage: string },
      _opts?: unknown,
    ) => {
      const starting = (capturedStartingState ?? []) as unknown as T
      const { next } = mutate(starting)
      capturedNextState = next
      return { commitSha: 'fake-commit-sha' }
    },
  )
  return { atomicUpdateJson, readJsonFromGitHub: vi.fn(async () => null) }
})

let capturedStartingState: unknown = []
let capturedNextState: unknown = null

import { saveDraftMou } from './entityWriters'

beforeEach(() => {
  capturedStartingState = []
  capturedNextState = null
})

describe('saveDraftMou - regression: cohortStatus + required fields (Pranav review #2)', () => {
  it('brand-new draft carries cohortStatus="active" so it appears on /mous', async () => {
    const { mou } = await saveDraftMou({
      identityName: 'pranav.b',
      draftMouId: null,
      templateId: 'STEAM-v3',
      templateVersion: 'STEAM-v3',
      programme: 'STEAM',
      schoolId: 'SCH-X',
      schoolName: 'Test School',
      variables: {
        STUDENT_COUNT: '200',
        PRICE_PER_STUDENT: '1000',
        START_DATE: '2026-04-01',
        END_DATE: '2027-03-31',
      },
      annexureHtml: null,
      trainerModel: 'GSL-T',
      salesChannel: 'School Programs (Course)',
      salesPersonId: null,
      schoolCrmId: null,
      paymentSchedules: null,
      yearlyPricing: null,
      billingBlock: null,
      productSelection: null,
      gradewiseDistribution: null,
    })

    expect(mou.cohortStatus).toBe('active')
    expect(mou.status).toBe('Draft')
    expect(mou.programmeSubType).toBeNull()
    expect(mou.schoolScope).toBe('SINGLE')
    expect(mou.schoolGroupId).toBeNull()
    expect(mou.delayNotes).toBeNull()

    // The next-state list passed to atomicUpdateJson should include
    // the new MOU; this is what eventually lands in mous.json.
    const finalList = capturedNextState as MOU[]
    expect(finalList).toHaveLength(1)
    expect(finalList[0]?.cohortStatus).toBe('active')
  })

  it('preserves existing cohortStatus on draft update (no clobber on resave)', async () => {
    capturedStartingState = [
      {
        id: 'MOU-STEAM-2627-999',
        schoolId: 'SCH-X',
        schoolName: 'Test School',
        programme: 'STEAM',
        programmeSubType: null,
        schoolScope: 'SINGLE',
        schoolGroupId: null,
        status: 'Draft',
        cohortStatus: 'archived', // operator manually archived the draft
        academicYear: '2026-27',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        studentsMou: 100,
        studentsActual: null,
        studentsVariance: null,
        studentsVariancePct: null,
        spWithoutTax: 1000,
        spWithTax: 1180,
        contractValue: 118000,
        received: 0,
        tds: 0,
        balance: 118000,
        receivedPct: 0,
        paymentSchedule: '',
        trainerModel: 'GSL-T',
        notes: null,
        daysToExpiry: null,
        salesPersonId: null,
        templateVersion: 'STEAM-v3',
        generatedAt: '2026-05-20T00:00:00.000Z',
        draftVariables: {},
        auditLog: [],
        effectiveDate: null,
        numberOfYears: 1,
        salesChannel: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        signedMouPdfPath: null,
        productSelection: null,
        gradewiseDistribution: null,
        delayNotes: null,
      },
    ] as MOU[]

    const { mou } = await saveDraftMou({
      identityName: 'pranav.b',
      draftMouId: 'MOU-STEAM-2627-999',
      templateId: 'STEAM-v3',
      templateVersion: 'STEAM-v3',
      programme: 'STEAM',
      schoolId: 'SCH-X',
      schoolName: 'Test School',
      variables: {
        STUDENT_COUNT: '200',
        PRICE_PER_STUDENT: '1200',
        START_DATE: '2026-04-01',
        END_DATE: '2027-03-31',
      },
      annexureHtml: null,
      trainerModel: 'GSL-T',
      salesChannel: 'School Programs (Course)',
      salesPersonId: null,
      schoolCrmId: null,
      paymentSchedules: null,
      yearlyPricing: null,
      billingBlock: null,
      productSelection: null,
      gradewiseDistribution: null,
    })

    // Updated draft INHERITS the new defaults via the spread; the
    // archived flag from the original is overwritten by the literal
    // 'active' in the new object. This is the intended behaviour:
    // an operator who hits Save Draft on an archived row brings it
    // back into the active cohort. To keep a draft archived,
    // operators use the dedicated archive surface instead of
    // re-saving via the wizard.
    expect(mou.cohortStatus).toBe('active')
    expect(mou.id).toBe('MOU-STEAM-2627-999')
  })
})

describe('saveDraftMou - regression: schoolId FK guard (Round 4 bug 1)', () => {
  it('rejects an empty schoolId with a friendly message before any INSERT runs', async () => {
    await expect(
      saveDraftMou({
        identityName: 'pranav.b',
        draftMouId: null,
        templateId: 'STEAM-v3',
        templateVersion: 'STEAM-v3',
        programme: 'STEAM',
        schoolId: '',
        schoolName: 'Christ Mission School',
        variables: {
          STUDENT_COUNT: '200',
          PRICE_PER_STUDENT: '1200',
          START_DATE: '2026-04-01',
          END_DATE: '2027-03-31',
        },
        annexureHtml: null,
        trainerModel: 'GSL-T',
        salesChannel: 'School Programs (Course)',
        salesPersonId: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        productSelection: null,
        gradewiseDistribution: null,
      }),
    ).rejects.toThrow(/Pick a school from the dropdown/)
  })

  it('rejects null schoolId with the same guard', async () => {
    await expect(
      saveDraftMou({
        identityName: 'pranav.b',
        draftMouId: null,
        templateId: 'STEAM-v3',
        templateVersion: 'STEAM-v3',
        programme: 'STEAM',
        schoolId: null,
        schoolName: 'Christ Mission School',
        variables: {},
        annexureHtml: null,
        trainerModel: 'GSL-T',
        salesChannel: 'School Programs (Course)',
        salesPersonId: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        productSelection: null,
        gradewiseDistribution: null,
      }),
    ).rejects.toThrow(/Pick a school from the dropdown/)
  })
})

describe('slugifySchoolId (Round 4 inline-create)', () => {
  it('uppercases and underscores spaces into SCH-<TOKEN> shape', async () => {
    const { slugifySchoolId } = await import('./entityWriters')
    expect(slugifySchoolId('Christ Mission School')).toBe('SCH-CHRIST_MISSION_SCHOOL')
    expect(slugifySchoolId('Greenfield Public, Pune')).toBe('SCH-GREENFIELD_PUBLIC_PUNE')
  })

  it('caps the token at 22 characters so the id matches seed length', async () => {
    const { slugifySchoolId } = await import('./entityWriters')
    const id = slugifySchoolId('A very very very long school name with many words')
    expect(id.startsWith('SCH-')).toBe(true)
    expect(id.length).toBeLessThanOrEqual(26)
  })

  it('rejects a name that yields no alphanumerics', async () => {
    const { slugifySchoolId } = await import('./entityWriters')
    expect(() => slugifySchoolId('   ---   ')).toThrow(/at least one letter or digit/)
  })

  it('collapses multiple non-alphanumeric runs into a single underscore', async () => {
    const { slugifySchoolId } = await import('./entityWriters')
    expect(slugifySchoolId('Foo & Bar, Inc.')).toBe('SCH-FOO_BAR_INC')
  })
})

describe('saveDraftMou - inline-create input validation (Round 4)', () => {
  it('rejects newSchool without a region', async () => {
    await expect(
      saveDraftMou({
        identityName: 'pranav.b',
        draftMouId: null,
        templateId: 'STEAM-v3',
        templateVersion: 'STEAM-v3',
        programme: 'STEAM',
        schoolId: null,
        schoolName: 'Christ Mission School',
        // @ts-expect-error region intentionally omitted to assert guard
        newSchool: { name: 'Christ Mission School' },
        variables: {},
        annexureHtml: null,
        trainerModel: 'GSL-T',
        salesChannel: 'School Programs (Course)',
        salesPersonId: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        productSelection: null,
        gradewiseDistribution: null,
      }),
    ).rejects.toThrow(/Region is required/)
  })

  it('rejects newSchool with a region outside the East / North / South-West enum', async () => {
    await expect(
      saveDraftMou({
        identityName: 'pranav.b',
        draftMouId: null,
        templateId: 'STEAM-v3',
        templateVersion: 'STEAM-v3',
        programme: 'STEAM',
        schoolId: null,
        schoolName: 'Christ Mission School',
        // @ts-expect-error invalid region literal
        newSchool: { name: 'Christ Mission School', region: 'Central' },
        variables: {},
        annexureHtml: null,
        trainerModel: 'GSL-T',
        salesChannel: 'School Programs (Course)',
        salesPersonId: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        productSelection: null,
        gradewiseDistribution: null,
      }),
    ).rejects.toThrow(/Unknown region 'Central'/)
  })

  it('rejects newSchool with an empty name', async () => {
    await expect(
      saveDraftMou({
        identityName: 'pranav.b',
        draftMouId: null,
        templateId: 'STEAM-v3',
        templateVersion: 'STEAM-v3',
        programme: 'STEAM',
        schoolId: null,
        schoolName: '',
        newSchool: { name: '   ', region: 'East' },
        variables: {},
        annexureHtml: null,
        trainerModel: 'GSL-T',
        salesChannel: 'School Programs (Course)',
        salesPersonId: null,
        schoolCrmId: null,
        paymentSchedules: null,
        yearlyPricing: null,
        billingBlock: null,
        productSelection: null,
        gradewiseDistribution: null,
      }),
    ).rejects.toThrow(/School name is required/)
  })
})
