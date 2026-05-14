/*
 * Gate 5A.8 Step 4: Pranav refresh classifier (TypeScript port).
 *
 * Pure function. Takes a ParseResult from pranavRefresh + a current state
 * snapshot, and returns ClassifiedRow[] in the shape consumed by
 * pranavApply.ts. The admin UI calls this immediately after upload so
 * the per-row decisions form can render without a CLI step.
 *
 * Mirrors scripts/diff-pranav-refresh.mjs; the .mjs version stays for the
 * one-shot CLI runs that wrote import-data/2026-05-pranav-refresh/. The
 * .ts version is what the live admin surface uses.
 *
 *   NEW       , no production match for the schoolSlug + FY
 *   UNCHANGED , exactly one match, no comparable field differs
 *   UPDATE    , exactly one match, refresh fills blanks only
 *   CONFLICT  , exactly one match, refresh disagrees with a non-null value
 *   AMBIGUOUS , two-or-more candidates survive disambiguation
 */

import type { MOU, Payment, School } from '../types'
import type { ParseResult, ParsedRow } from './pranavRefresh'
import type { ClassifiedRow } from './pranavApply'

export interface DiffSummary {
  NEW: number
  UPDATE: number
  UNCHANGED: number
  CONFLICT: number
  AMBIGUOUS: number
}

export interface DiffResult {
  classified: Array<ClassifiedRow & { matchedMouSnapshot: MouSnapshot | null }>
  summary: DiffSummary
}

export interface MouSnapshot {
  id: string
  schoolName: string
  trainerModel: string | null
  contractValue: number | null
  studentsMou: number | null
  received: number | null
}

export interface DiffInput {
  parsed: ParseResult
  mous: MOU[]
  payments: Payment[]
  schools: School[]
  fy?: string
}

const DEFAULT_FY = '2026-27'

function slugify(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function almostEqual(a: number | null, b: number | null, tol = 1): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return Math.abs(a - b) <= tol
}

interface FieldDiffOpts {
  tol?: number
  ignoreZeroVsBlank?: boolean
}

type FieldDiff = ClassifiedRow['mouDiffs'][number]

function fieldDiffNumber(
  field: string,
  refreshVal: number | null,
  currentVal: number | null,
  opts: FieldDiffOpts = {},
): FieldDiff | null {
  const tol = opts.tol ?? 1
  if (refreshVal === null && (currentVal === null || currentVal === 0)) return null
  if (almostEqual(refreshVal ?? 0, currentVal ?? 0, tol)) return null
  if (
    opts.ignoreZeroVsBlank &&
    (refreshVal === 0 || refreshVal === null) &&
    (currentVal === null || currentVal === 0)
  ) {
    return null
  }
  const isOverwrite =
    currentVal !== null && currentVal !== 0 && refreshVal !== null
  return {
    field,
    refresh: refreshVal,
    current: currentVal,
    kind: isOverwrite ? 'overwrite' : 'fill',
  }
}

function fieldDiffString(
  field: string,
  refreshVal: string | null,
  currentVal: string | null,
): FieldDiff | null {
  if ((refreshVal ?? '') === (currentVal ?? '')) return null
  if (!refreshVal && !currentVal) return null
  const isOverwrite =
    currentVal !== null && currentVal !== undefined && currentVal !== '' && !!refreshVal
  return {
    field,
    refresh: refreshVal,
    current: currentVal,
    kind: isOverwrite ? 'overwrite' : 'fill',
  }
}

function diffMou(
  row: ParsedRow,
  mou: MOU,
  schoolBySlug: Map<string, School>,
): FieldDiff[] {
  const diffs: FieldDiff[] = []
  const push = (d: FieldDiff | null): void => {
    if (d) diffs.push(d)
  }
  push(fieldDiffString('trainerModel', row.trainerModel, mou.trainerModel ?? null))
  push(fieldDiffNumber('contractValue', row.contractValue, mou.contractValue ?? null, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('studentsMou', row.studentsMou, mou.studentsMou ?? null))
  push(fieldDiffNumber('studentsActual', row.studentsActual, mou.studentsActual ?? null))
  push(fieldDiffNumber('spWithoutTax', row.spWithoutTax, mou.spWithoutTax ?? null, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('spWithTax', row.spWithTax, mou.spWithTax ?? null, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('received', row.received, mou.received ?? null, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('tds', row.tds, mou.tds ?? null, { ignoreZeroVsBlank: true }))
  push(fieldDiffString('startDate', row.duration.start, mou.startDate ?? null))
  push(fieldDiffString('endDate', row.duration.end, mou.endDate ?? null))
  const school = schoolBySlug.get(row.schoolSlug) ?? null
  push(fieldDiffString('city', row.city, school ? school.city || null : null))
  push(fieldDiffString('state', row.state, school ? school.state || null : null))
  return diffs
}

function diffInstallments(
  row: ParsedRow,
  mou: MOU,
  paymentsByMouId: Map<string, Payment[]>,
): ClassifiedRow['installmentDiffs'] {
  const existing = paymentsByMouId.get(mou.id) ?? []
  const existingBySeq = new Map<number, Payment>()
  for (const p of existing) existingBySeq.set(p.instalmentSeq, p)
  const out: ClassifiedRow['installmentDiffs'] = []
  for (const inst of row.installments) {
    const ex = existingBySeq.get(inst.seq)
    if (!ex) {
      out.push({ seq: inst.seq, status: 'new', refresh: inst, current: null })
      continue
    }
    const diffs: NonNullable<ClassifiedRow['installmentDiffs'][number]['diffs']> = []
    if (
      inst.amount !== null &&
      Math.abs((inst.amount ?? 0) - (ex.expectedAmount ?? 0)) > 1
    ) {
      diffs.push({
        field: 'expectedAmount',
        refresh: inst.amount,
        current: ex.expectedAmount,
        kind: (ex.expectedAmount ?? 0) > 0 ? 'overwrite' : 'fill',
      })
    }
    if (inst.monthIso && inst.monthIso !== ex.dueDateIso) {
      diffs.push({
        field: 'dueDateIso',
        refresh: inst.monthIso,
        current: ex.dueDateIso,
        kind: ex.dueDateIso ? 'overwrite' : 'fill',
      })
    }
    if (inst.monthRaw && inst.monthRaw !== ex.dueDateRaw) {
      diffs.push({
        field: 'dueDateRaw',
        refresh: inst.monthRaw,
        current: ex.dueDateRaw,
        kind: ex.dueDateRaw ? 'overwrite' : 'fill',
      })
    }
    if (inst.isReceived && ex.status !== 'Received' && ex.status !== 'Paid') {
      diffs.push({
        field: 'status',
        refresh: 'Received',
        current: ex.status,
        kind: 'fill',
      })
    }
    if (diffs.length > 0) {
      out.push({ seq: inst.seq, status: 'update', refresh: inst, current: ex, diffs })
    } else {
      out.push({ seq: inst.seq, status: 'unchanged', refresh: inst, current: ex })
    }
  }
  return out
}

interface Alignment {
  row: ParsedRow
  match: MOU | null
  /** When more than one candidate scored equally, every viable id is captured for AMBIGUOUS rendering. */
  remainingCandidateIds: string[]
}

function alignRefreshGroup(
  refreshRows: ParsedRow[],
  candidates: MOU[],
): Alignment[] {
  if (candidates.length === 0) {
    return refreshRows.map((row) => ({ row, match: null, remainingCandidateIds: [] }))
  }
  if (refreshRows.length === 1 && candidates.length === 1) {
    return [{ row: refreshRows[0]!, match: candidates[0]!, remainingCandidateIds: [] }]
  }
  const used = new Set<string>()
  const out: Alignment[] = []
  for (const row of refreshRows) {
    let best: MOU | null = null
    let bestScore = -1
    let tiedAtBest: MOU[] = []
    for (const cand of candidates) {
      if (used.has(cand.id)) continue
      let score = 0
      if (
        row.trainerModel &&
        cand.trainerModel &&
        row.trainerModel === cand.trainerModel
      ) {
        score += 100
      }
      if (row.contractValue !== null && cand.contractValue) {
        const ratio =
          Math.min(row.contractValue, cand.contractValue) /
          Math.max(row.contractValue, cand.contractValue)
        score += ratio * 10
      }
      if (score > bestScore) {
        bestScore = score
        best = cand
        tiedAtBest = [cand]
      } else if (score === bestScore) {
        tiedAtBest.push(cand)
      }
    }
    if (best && bestScore >= 5 && tiedAtBest.length === 1) {
      used.add(best.id)
      out.push({ row, match: best, remainingCandidateIds: [] })
    } else if (tiedAtBest.length > 1) {
      out.push({
        row,
        match: null,
        remainingCandidateIds: tiedAtBest.map((c) => c.id),
      })
    } else {
      out.push({
        row,
        match: null,
        remainingCandidateIds: candidates.filter((c) => !used.has(c.id)).map((c) => c.id),
      })
    }
  }
  return out
}

export function classifyRefresh(input: DiffInput): DiffResult {
  const fy = input.fy ?? DEFAULT_FY

  const mouBySlugFy = new Map<string, MOU[]>()
  for (const m of input.mous) {
    if (m.academicYear !== fy) continue
    const slug = slugify(m.schoolName)
    if (!mouBySlugFy.has(slug)) mouBySlugFy.set(slug, [])
    mouBySlugFy.get(slug)!.push(m)
  }

  const schoolBySlug = new Map<string, School>()
  for (const s of input.schools) schoolBySlug.set(slugify(s.name), s)

  const paymentsByMouId = new Map<string, Payment[]>()
  for (const p of input.payments) {
    if (!paymentsByMouId.has(p.mouId)) paymentsByMouId.set(p.mouId, [])
    paymentsByMouId.get(p.mouId)!.push(p)
  }

  const rowsBySlug = new Map<string, ParsedRow[]>()
  for (const row of input.parsed.rows) {
    if (!rowsBySlug.has(row.schoolSlug)) rowsBySlug.set(row.schoolSlug, [])
    rowsBySlug.get(row.schoolSlug)!.push(row)
  }

  const classified: DiffResult['classified'] = []
  for (const [slug, rows] of Array.from(rowsBySlug.entries())) {
    const candidates = mouBySlugFy.get(slug) ?? []
    const aligned = alignRefreshGroup(rows, candidates)
    for (const { row, match, remainingCandidateIds } of aligned) {
      if (!match) {
        const isAmbiguous = remainingCandidateIds.length > 1
        classified.push({
          classification: isAmbiguous ? 'AMBIGUOUS' : 'NEW',
          refreshRow: row,
          matchedMouId: null,
          candidateMatchIds: remainingCandidateIds,
          mouDiffs: [],
          installmentDiffs: [],
          matchedMouSnapshot: null,
        })
        continue
      }
      const mouDiffs = diffMou(row, match, schoolBySlug)
      const installmentDiffs = diffInstallments(row, match, paymentsByMouId)
      const anyOverwrite =
        mouDiffs.some((d) => d.kind === 'overwrite') ||
        installmentDiffs.some((i) => (i.diffs ?? []).some((d) => d.kind === 'overwrite'))
      const anyChange =
        mouDiffs.length > 0 ||
        installmentDiffs.some((i) => i.status === 'new' || i.status === 'update')
      let classification: ClassifiedRow['classification']
      if (!anyChange) classification = 'UNCHANGED'
      else if (anyOverwrite) classification = 'CONFLICT'
      else classification = 'UPDATE'
      classified.push({
        classification,
        refreshRow: row,
        matchedMouId: match.id,
        candidateMatchIds: [match.id],
        mouDiffs,
        installmentDiffs,
        matchedMouSnapshot: {
          id: match.id,
          schoolName: match.schoolName,
          trainerModel: match.trainerModel ?? null,
          contractValue: match.contractValue ?? null,
          studentsMou: match.studentsMou ?? null,
          received: match.received ?? null,
        },
      })
    }
  }

  const summary: DiffSummary = {
    NEW: classified.filter((c) => c.classification === 'NEW').length,
    UPDATE: classified.filter((c) => c.classification === 'UPDATE').length,
    UNCHANGED: classified.filter((c) => c.classification === 'UNCHANGED').length,
    CONFLICT: classified.filter((c) => c.classification === 'CONFLICT').length,
    AMBIGUOUS: classified.filter((c) => c.classification === 'AMBIGUOUS').length,
  }

  return { classified, summary }
}
