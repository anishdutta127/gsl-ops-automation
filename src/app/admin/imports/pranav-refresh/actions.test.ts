/*
 * Server-action tests for /admin/imports/pranav-refresh (Gate 5A.8 Step 4).
 *
 * The actions use process.cwd() as the repo root. To keep the suite from
 * touching real src/data/*.json, every test chdirs into a fresh temp
 * directory that mirrors the layout {src/data/, import-data/}. The
 * temp tree is deleted at the end of each test.
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
)
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

const getCurrentUserMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: getCurrentUserMock,
}))

import { applyRefreshAction, uploadRefreshAction } from './actions'

const ORIGINAL_CWD = process.cwd()
let tempRoot = ''

async function setupRepoLayout(): Promise<void> {
  await mkdir(path.join(tempRoot, 'src/data'), { recursive: true })
  await mkdir(path.join(tempRoot, 'import-data'), { recursive: true })
  await writeFile(path.join(tempRoot, 'src/data/mous.json'), '[]', 'utf-8')
  await writeFile(path.join(tempRoot, 'src/data/payments.json'), '[]', 'utf-8')
  await writeFile(path.join(tempRoot, 'src/data/schools.json'), '[]', 'utf-8')
  await writeFile(path.join(tempRoot, 'src/data/sales_team.json'), '[]', 'utf-8')
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'gsl-pranav-actions-'))
  process.chdir(tempRoot)
  await setupRepoLayout()
  vi.clearAllMocks()
  getCurrentUserMock.mockResolvedValue({
    id: 'anish.d',
    name: 'Anish',
    email: 'a@example.test',
    role: 'Admin',
    active: true,
  })
})

afterEach(async () => {
  process.chdir(ORIGINAL_CWD)
  await rm(tempRoot, { recursive: true, force: true })
})

function fakeXlsxFile(name: string): File {
  // Build a tiny xlsx in-memory so parsePranavRefreshFromFile succeeds.
  // The parser only needs a sheet whose name starts with '2026-27PD' OR
  // it falls back to the first sheet.
  // We use the xlsx package directly to construct the bytes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const xlsx = require('xlsx') as typeof import('xlsx')
  const sheet = xlsx.utils.aoa_to_sheet([
    [], [], [], [], [],
    [
      'Sr. No.', 'Name of School', 'Status', 'No. of Schools', 'Sales Rep',
      'Physical', 'MOU', 'Kits', 'Model', 'Duration', 'City', 'State',
      'Students', 'Sale', 'Actual', 'SPwo', 'SPw', 'SA', 'Recv', 'TDS',
      'Bal', '%',
    ],
    [
      1, 'Brand New School', 'New', 1, 'Rep', 'No', 'No', '', 'TT',
      '01st April 2026 to 31st march 2027', 'CityX', 'StateX',
      100, 100000, null, 850, 1000, 100000, 0, 0, 100000, 0,
    ],
  ])
  const book = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(book, sheet, '2026-27PD')
  const buf = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  // Copy into a fresh ArrayBuffer so the File constructor type-checks
  // under the lib.dom BlobPart definition. Node's Buffer typings allow a
  // SharedArrayBuffer backing store which BlobPart rejects.
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  return new File([ab], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('uploadRefreshAction', () => {
  it('writes parsed.json + diff-report.json and appends an import_runs.json entry', async () => {
    const formData = new FormData()
    formData.append('file', fakeXlsxFile('pranav-refresh-2026-05-14.xlsx'))

    await expect(uploadRefreshAction(formData)).rejects.toThrow(/REDIRECT:/)

    const dir = path.join(tempRoot, 'import-data', 'pranav-refresh-2026-05-14')
    const parsed = JSON.parse(await readFile(path.join(dir, 'parsed.json'), 'utf-8')) as {
      rows: unknown[]
    }
    expect(parsed.rows).toHaveLength(1)

    const diff = JSON.parse(await readFile(path.join(dir, 'diff-report.json'), 'utf-8')) as {
      summary: Record<string, number>
      classified: { classification: string }[]
    }
    expect(diff.summary.NEW).toBe(1)
    expect(diff.classified[0]!.classification).toBe('NEW')

    const importRuns = JSON.parse(
      await readFile(path.join(tempRoot, 'src/data/import_runs.json'), 'utf-8'),
    ) as Array<{ kind: string; refreshTag: string }>
    expect(importRuns).toHaveLength(1)
    expect(importRuns[0]!.kind).toBe('upload')
    expect(importRuns[0]!.refreshTag).toBe('pranav-refresh-2026-05-14')
  })

  it('redirects non-Admin users to /dashboard without writing files', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'misba.m',
      name: 'Misba',
      email: 'm@example.test',
      role: 'OpsHead',
      active: true,
    })
    const formData = new FormData()
    formData.append('file', fakeXlsxFile('pranav-refresh-2026-05-14.xlsx'))
    await expect(uploadRefreshAction(formData)).rejects.toThrow(/REDIRECT:\/dashboard/)
  })
})

describe('applyRefreshAction', () => {
  async function seedDiff(): Promise<void> {
    const tag = 'pranav-refresh-2026-05-14'
    const dir = path.join(tempRoot, 'import-data', tag)
    await mkdir(dir, { recursive: true })
    const refreshRow = {
      rowNum: 7,
      srNo: 1,
      schoolName: 'Brand New School',
      schoolSlug: 'brand-new-school',
      acquisitionStatus: 'New',
      salesRepName: 'Rep',
      physicalCopyScanned: false,
      mouSigned: false,
      kitsSent: null,
      modelRaw: 'TT',
      trainerModel: 'TT',
      duration: { start: '2026-04-01', end: '2027-03-31', fallback: false },
      city: 'CityX',
      state: 'StateX',
      studentsMou: 100,
      contractValue: 100000,
      studentsActual: null,
      spWithoutTax: 850,
      spWithTax: 1000,
      received: 0,
      tds: 0,
      installments: [],
      needsReview: false,
      isContinuationRow: false,
      productLineKey: 'TT|100|100000',
      rowWarnings: [],
    }
    // parsed.json is what applyRefreshAction re-classifies from so it
    // remains idempotent on a second run.
    await writeFile(
      path.join(dir, 'parsed.json'),
      JSON.stringify({
        rows: [refreshRow],
        warnings: [],
        errors: [],
        skipped: [],
        summary: { totalRowsScanned: 1, parsed: 1, needsReview: 0, continuationRows: 0, multiProductSchools: [] },
        sourceMeta: { sheetName: '2026-27PD', headerRow: 6, dataStartRow: 7, dataEndRow: 7 },
      }, null, 2) + '\n',
      'utf-8',
    )
    await writeFile(
      path.join(dir, 'diff-report.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        summary: { NEW: 1, UPDATE: 0, UNCHANGED: 0, CONFLICT: 0, AMBIGUOUS: 0 },
        classified: [
          {
            classification: 'NEW',
            refreshRow,
            matchedMouId: null,
            candidateMatchIds: [],
            mouDiffs: [],
            installmentDiffs: [],
          },
        ],
      }, null, 2) + '\n',
      'utf-8',
    )
  }

  it('with all-skip decisions produces zero changes to live JSON files', async () => {
    await seedDiff()

    const formData = new FormData()
    formData.append('refreshTag', 'pranav-refresh-2026-05-14')
    // No apply-7 checkbox -> row 7 is skipped.

    await expect(applyRefreshAction(formData)).rejects.toThrow(/REDIRECT:/)

    const mous = JSON.parse(
      await readFile(path.join(tempRoot, 'src/data/mous.json'), 'utf-8'),
    ) as unknown[]
    expect(mous).toHaveLength(0)
    const schools = JSON.parse(
      await readFile(path.join(tempRoot, 'src/data/schools.json'), 'utf-8'),
    ) as unknown[]
    expect(schools).toHaveLength(0)
  })

  it('does not attempt to write src/data files when the apply produces zero state changes (Vercel EROFS regression)', async () => {
    // Reproduces the production crash: live state already contains the
    // refresh data, so re-classifying produces all UNCHANGED, no rows
    // need to be written. Before the hotfix, the action wrote the JSON
    // files anyway and threw EROFS on Vercel. After the hotfix, the
    // action short-circuits writes. We simulate Vercel by replacing
    // mous.json with a sentinel value and asserting it is left untouched.
    await seedDiff()
    const sentinel = '[{"id":"SENTINEL","schoolName":"do-not-overwrite"}]\n'
    await writeFile(path.join(tempRoot, 'src/data/mous.json'), sentinel, 'utf-8')

    const formData = new FormData()
    formData.append('refreshTag', 'pranav-refresh-2026-05-14')
    formData.append('apply-7', 'true')
    // The sentinel MOU does not match the refresh slug, so the row still
    // classifies as NEW and would normally write. Override by switching
    // the school name to match.
    const sentinelMatch = JSON.stringify([{
      id: 'MOU-STEAM-2627-001',
      schoolId: 'sch-brand-new-school',
      schoolName: 'Brand New School',
      programme: 'STEAM', programmeSubType: null,
      schoolScope: 'SINGLE', schoolGroupId: null,
      status: 'Active', cohortStatus: 'active', academicYear: '2026-27',
      startDate: '2026-04-01', endDate: '2027-03-31',
      studentsMou: 100, studentsActual: null,
      studentsVariance: null, studentsVariancePct: null,
      spWithoutTax: 850, spWithTax: 1000,
      contractValue: 100000, received: 0, tds: 0,
      balance: 100000, receivedPct: 0,
      paymentSchedule: '', trainerModel: 'TT',
      salesPersonId: null, templateVersion: null, generatedAt: null,
      notes: null, delayNotes: null, daysToExpiry: null,
      auditLog: [],
    }]) + '\n'
    await writeFile(path.join(tempRoot, 'src/data/mous.json'), sentinelMatch, 'utf-8')
    await writeFile(path.join(tempRoot, 'src/data/schools.json'), JSON.stringify([{
      id: 'sch-brand-new-school',
      name: 'Brand New School',
      city: 'CityX', state: 'StateX',
      auditLog: [],
    }]) + '\n', 'utf-8')

    // Capture pre-action mtime/contents to assert no write attempt.
    const beforeMous = await readFile(path.join(tempRoot, 'src/data/mous.json'), 'utf-8')
    const beforeSchools = await readFile(path.join(tempRoot, 'src/data/schools.json'), 'utf-8')

    await expect(applyRefreshAction(formData)).rejects.toThrow(/REDIRECT:\/admin\/imports\/pranav-refresh\?.*applied=1/)

    const afterMous = await readFile(path.join(tempRoot, 'src/data/mous.json'), 'utf-8')
    const afterSchools = await readFile(path.join(tempRoot, 'src/data/schools.json'), 'utf-8')
    expect(afterMous).toBe(beforeMous)
    expect(afterSchools).toBe(beforeSchools)
  })

  it('surfaces a write failure as ?error=write-failed in the redirect, not a server-side exception', async () => {
    await seedDiff()
    const formData = new FormData()
    formData.append('refreshTag', 'pranav-refresh-2026-05-14')
    formData.append('apply-7', 'true')

    // Force a write failure: delete the src/data directory so writeFile
    // rejects with ENOENT. This stands in for Vercel's EROFS.
    await rm(path.join(tempRoot, 'src/data'), { recursive: true, force: true })

    let redirected: string | null = null
    try {
      await applyRefreshAction(formData)
    } catch (e) {
      redirected = e instanceof Error ? e.message : String(e)
    }
    expect(redirected).toMatch(/REDIRECT:.*error=write-failed/)
    expect(redirected).toMatch(/applied=1/)
  })

  it('is idempotent: applying the same decisions twice produces a no-op on the second run', async () => {
    await seedDiff()

    const first = new FormData()
    first.append('refreshTag', 'pranav-refresh-2026-05-14')
    first.append('apply-7', 'true')
    await expect(applyRefreshAction(first)).rejects.toThrow(/REDIRECT:/)

    const mousAfterFirst = JSON.parse(
      await readFile(path.join(tempRoot, 'src/data/mous.json'), 'utf-8'),
    ) as Array<{ id: string }>
    expect(mousAfterFirst).toHaveLength(1)
    const firstMouId = mousAfterFirst[0]!.id

    // Second run: the action re-classifies from parsed.json against the
    // post-first-apply state, so the row classifies UNCHANGED.
    const second = new FormData()
    second.append('refreshTag', 'pranav-refresh-2026-05-14')
    second.append('apply-7', 'true')
    await expect(applyRefreshAction(second)).rejects.toThrow(/REDIRECT:\/admin\/imports\/pranav-refresh\?.*applied=1/)

    const mousAfterSecond = JSON.parse(
      await readFile(path.join(tempRoot, 'src/data/mous.json'), 'utf-8'),
    ) as Array<{ id: string }>
    expect(mousAfterSecond).toHaveLength(1)
    expect(mousAfterSecond[0]!.id).toBe(firstMouId)
  })
})
