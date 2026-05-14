'use server'

/*
 * Gate 5A.8 Step 4: server actions for /admin/imports/pranav-refresh.
 *
 * Two actions:
 *
 *   uploadRefreshAction
 *     - Admin-only.
 *     - Persists the uploaded .xlsx to import-data/<refreshTag>/, runs the
 *       parser (parsePranavRefreshFromFile), runs the classifier
 *       (classifyRefresh), writes parsed.json + diff-report.json alongside
 *       the xlsx, appends an upload event to src/data/import_runs.json.
 *
 *   applyRefreshAction
 *     - Admin-only.
 *     - Reads per-row decisions from the form, loads the latest diff,
 *       calls applyPranavRefresh, writes the new state back to
 *       src/data/{mous,payments,schools,sales_team}.json, appends an
 *       apply event to src/data/import_runs.json.
 *
 * Writes go through the filesystem directly (NOT the GitHub queue) so
 * Anish can drive Pranav refreshes on a local clone without paying the
 * eventual-consistency tax. This matches the existing import-pranav-refresh
 * / apply-pranav-refresh CLI scripts.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import {
  applyPranavRefresh,
  type ClassifiedRow,
  type ConflictResolution,
  type RowDecision,
} from '@/lib/imports/pranavApply'
import {
  parsePranavRefreshFromFile,
  type ParseResult,
} from '@/lib/imports/pranavRefresh'
import { classifyRefresh } from '@/lib/imports/pranavDiff'
import type { MOU, Payment, School } from '@/lib/types'

const PAGE_PATH = '/admin/imports/pranav-refresh'

interface SalesTeamMember {
  id: string
  name: string
  email: string | null
  phone: string | null
  territories: string[]
  active: boolean
  notes: string | null
  createdAt: string
}

interface ImportRunsEntry {
  refreshTag: string
  kind: 'upload' | 'apply'
  at: string
  user: string
  source?: string
  parseSummary?: unknown
  diffSummary?: unknown
  applySummary?: unknown
}

function repoRoot(): string {
  // process.cwd() is the project root under Next.js (server actions run in
  // the .next runtime but Next sets cwd to the project root).
  return process.cwd()
}

function refreshTagFromFilename(name: string): string {
  const today = new Date().toISOString().slice(0, 10)
  // Accept pranav-refresh-2026-05-13.xlsx, refresh-2026-05-13.xlsx, etc.
  const match = name.match(/(\d{4}-\d{2}-\d{2})/)
  const datePart = match ? match[1] : today
  return `pranav-refresh-${datePart}`
}

async function readJson<T>(absPath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(absPath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(absPath: string, data: unknown): Promise<void> {
  await writeFile(absPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

async function appendImportRun(entry: ImportRunsEntry): Promise<void> {
  const root = repoRoot()
  const importRunsPath = path.join(root, 'src/data/import_runs.json')
  const existing = await readJson<ImportRunsEntry[]>(importRunsPath, [])
  existing.push(entry)
  await writeJson(importRunsPath, existing)
}

/**
 * Walk import-data/pranav-refresh-* and return the most recent refreshTag
 * that has a diff-report.json. Used by the page to render the tabbed view
 * after the user uploads a fresh file.
 */
export async function findLatestRefreshTag(): Promise<string | null> {
  const root = repoRoot()
  const importDir = path.join(root, 'import-data')
  let entries: string[]
  try {
    entries = await readdir(importDir)
  } catch {
    return null
  }
  const candidates = entries.filter((e) => e.startsWith('pranav-refresh-') || e === '2026-05-pranav-refresh')
  // Score by the date suffix; fall back to the literal 2026-05 dir if present.
  const withDates = candidates
    .map((tag) => {
      const m = tag.match(/(\d{4}-\d{2}-\d{2})/)
      return { tag, date: m ? m[1]! : '' }
    })
    .filter((c) => c.date !== '' || c.tag === '2026-05-pranav-refresh')
  if (withDates.length === 0) return null
  withDates.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
  // Confirm diff-report.json exists.
  for (const { tag } of withDates) {
    try {
      await readFile(path.join(importDir, tag, 'diff-report.json'), 'utf-8')
      return tag
    } catch {
      continue
    }
  }
  return null
}

export async function uploadRefreshAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(PAGE_PATH)}`)
  if (user.role !== 'Admin') redirect('/dashboard')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${PAGE_PATH}?error=missing-file`)
    return
  }

  const refreshTag = refreshTagFromFilename(file.name)
  const root = repoRoot()
  const targetDir = path.join(root, 'import-data', refreshTag)
  await mkdir(targetDir, { recursive: true })

  const xlsxPath = path.join(targetDir, file.name)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(xlsxPath, buffer)

  const parsed = parsePranavRefreshFromFile(xlsxPath)

  const parsedJsonPath = path.join(targetDir, 'parsed.json')
  await writeJson(parsedJsonPath, parsed)

  // Load current state for the classifier.
  const dataDir = path.join(root, 'src/data')
  const [mous, payments, schools] = await Promise.all([
    readJson<MOU[]>(path.join(dataDir, 'mous.json'), []),
    readJson<Payment[]>(path.join(dataDir, 'payments.json'), []),
    readJson<School[]>(path.join(dataDir, 'schools.json'), []),
  ])

  const diff = classifyRefresh({ parsed, mous, payments, schools })

  const diffJsonPath = path.join(targetDir, 'diff-report.json')
  await writeJson(diffJsonPath, {
    generatedAt: new Date().toISOString(),
    parsedSource: path.relative(root, parsedJsonPath).replace(/\\/g, '/'),
    fy: '2026-27',
    totalRefreshRows: parsed.rows.length,
    summary: diff.summary,
    classified: diff.classified,
  })

  await appendImportRun({
    refreshTag,
    kind: 'upload',
    at: new Date().toISOString(),
    user: user.id,
    source: file.name,
    parseSummary: parsed.summary,
    diffSummary: diff.summary,
  })

  revalidatePath(PAGE_PATH)
  redirect(`${PAGE_PATH}?tag=${encodeURIComponent(refreshTag)}&uploaded=1`)
}

interface DiffReportFile {
  generatedAt: string
  summary: Record<string, number>
  classified: ClassifiedRow[]
}

async function loadDiffReport(refreshTag: string): Promise<DiffReportFile | null> {
  const root = repoRoot()
  const p = path.join(root, 'import-data', refreshTag, 'diff-report.json')
  try {
    const raw = await readFile(p, 'utf-8')
    return JSON.parse(raw) as DiffReportFile
  } catch {
    return null
  }
}

function parseDecisions(
  formData: FormData,
  classified: ClassifiedRow[],
): Map<number, RowDecision> {
  const decisions = new Map<number, RowDecision>()
  for (const cls of classified) {
    const rowNum = cls.refreshRow.rowNum
    const apply = formData.get(`apply-${rowNum}`)
    if (!apply) {
      decisions.set(rowNum, { rowNum, decision: 'skip' })
      continue
    }
    const decision: RowDecision = { rowNum, decision: 'apply' }
    if (cls.classification === 'CONFLICT') {
      const raw = String(formData.get(`resolution-${rowNum}`) ?? 'keep-current')
      const allowed: ConflictResolution[] = ['keep-current', 'apply-refresh', 'keep-both']
      decision.conflictResolution = allowed.includes(raw as ConflictResolution)
        ? (raw as ConflictResolution)
        : 'keep-current'
    }
    if (cls.classification === 'AMBIGUOUS') {
      const matched = String(formData.get(`matched-${rowNum}`) ?? '')
      if (matched && matched !== 'new') decision.ambiguousMatchId = matched
    }
    decisions.set(rowNum, decision)
  }
  return decisions
}

export async function applyRefreshAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(PAGE_PATH)}`)
  if (user.role !== 'Admin') redirect('/dashboard')

  const refreshTag = String(formData.get('refreshTag') ?? '')
  if (!refreshTag) {
    redirect(`${PAGE_PATH}?error=missing-tag`)
    return
  }

  const diff = await loadDiffReport(refreshTag)
  if (!diff) {
    redirect(`${PAGE_PATH}?error=diff-not-found&tag=${encodeURIComponent(refreshTag)}`)
    return
  }

  const root = repoRoot()
  const dataDir = path.join(root, 'src/data')
  const [mous, payments, schools, salesTeam] = await Promise.all([
    readJson<MOU[]>(path.join(dataDir, 'mous.json'), []),
    readJson<Payment[]>(path.join(dataDir, 'payments.json'), []),
    readJson<School[]>(path.join(dataDir, 'schools.json'), []),
    readJson<SalesTeamMember[]>(path.join(dataDir, 'sales_team.json'), []),
  ])

  // Re-classify the parsed rows against the current live state, not the
  // stale snapshot embedded in diff-report.json. This keeps the action
  // idempotent: a second apply with the same form data observes that the
  // first run already created the matching MOU, classifies every row as
  // UNCHANGED, and writes no further changes. The diff-report.json is
  // kept for audit; the form decisions still key by rowNum which is
  // stable across re-classifications of the same parsed.json.
  const parsedPath = path.join(root, 'import-data', refreshTag, 'parsed.json')
  const parsedSnapshot = await readJson<ParseResult | null>(parsedPath, null)
  const liveClassified = parsedSnapshot
    ? classifyRefresh({ parsed: parsedSnapshot, mous, payments, schools }).classified
    : diff.classified

  const decisions = parseDecisions(formData, liveClassified)

  const result = applyPranavRefresh({
    refreshTag,
    appliedBy: user.id,
    classified: liveClassified,
    decisions,
    currentState: { mous, payments, schools, salesTeam },
  })

  await Promise.all([
    writeJson(path.join(dataDir, 'mous.json'), result.newState.mous),
    writeJson(path.join(dataDir, 'payments.json'), result.newState.payments),
    writeJson(path.join(dataDir, 'schools.json'), result.newState.schools),
    writeJson(path.join(dataDir, 'sales_team.json'), result.newState.salesTeam),
  ])

  await appendImportRun({
    refreshTag,
    kind: 'apply',
    at: new Date().toISOString(),
    user: user.id,
    applySummary: result.summary,
  })

  revalidatePath(PAGE_PATH)
  const params = new URLSearchParams({
    tag: refreshTag,
    applied: '1',
    created: String(result.summary.created),
    updated: String(result.summary.updated),
    unchanged: String(result.summary.unchanged),
    skipped: String(result.summary.skipped),
    keptCurrent: String(result.summary.keptCurrent),
    keptBoth: String(result.summary.keptBoth),
    errored: String(result.summary.errored),
  })
  redirect(`${PAGE_PATH}?${params.toString()}`)
}
