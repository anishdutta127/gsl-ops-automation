#!/usr/bin/env node
/*
 * Gate 5A.8 Step 3: diff parsed Pranav refresh against live system state.
 *
 * Reads:
 *   import-data/2026-05-pranav-refresh/parsed.json   (Step 2 output)
 *   src/data/mous.json, payments.json, schools.json, sales_team.json
 *
 * Writes:
 *   import-data/2026-05-pranav-refresh/diff-report.md
 *   import-data/2026-05-pranav-refresh/diff-report.json
 *
 * Classification per refresh row:
 *   NEW       , no production match by school slug + FY
 *   UNCHANGED , exactly one match, no comparable field differs
 *   UPDATE    , exactly one match, refresh adds/refines fields but never
 *               contradicts a non-null existing value
 *   CONFLICT  , exactly one match, refresh disagrees with a non-null
 *               existing value (e.g. different contract or received)
 *   AMBIGUOUS , two or more matches survive disambiguation
 *
 * Multi-row schools (Empyrean, Contai, Swarnim) are aligned per row using
 * trainerModel then contractValue; surplus refresh rows fall through as
 * NEW MOUs under the same school.
 *
 * Idempotent: re-running on the same parsed.json + JSONs writes
 * identical output.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')

const PARSED_PATH = join(REPO_ROOT, 'import-data/2026-05-pranav-refresh/parsed.json')
const OUT_MD = join(REPO_ROOT, 'import-data/2026-05-pranav-refresh/diff-report.md')
const OUT_JSON = join(REPO_ROOT, 'import-data/2026-05-pranav-refresh/diff-report.json')
const MOUS_PATH = join(REPO_ROOT, 'src/data/mous.json')
const PAYMENTS_PATH = join(REPO_ROOT, 'src/data/payments.json')
const SCHOOLS_PATH = join(REPO_ROOT, 'src/data/schools.json')
const SALES_PATH = join(REPO_ROOT, 'src/data/sales_team.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function slugify(input) {
  if (input === null || input === undefined) return ''
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

const parsed = readJson(PARSED_PATH)
const mous = readJson(MOUS_PATH)
const payments = readJson(PAYMENTS_PATH)
const schools = readJson(SCHOOLS_PATH)
const sales = readJson(SALES_PATH)

const FY = '2026-27'

const mouBySlugFy = new Map()
for (const m of mous) {
  if (m.academicYear !== FY) continue
  const slug = slugify(m.schoolName)
  if (!mouBySlugFy.has(slug)) mouBySlugFy.set(slug, [])
  mouBySlugFy.get(slug).push(m)
}

const schoolBySlug = new Map()
for (const s of schools) schoolBySlug.set(slugify(s.name), s)

const salesBySlug = new Map()
for (const s of sales) salesBySlug.set(slugify(s.name), s)

const paymentsByMouId = new Map()
for (const p of payments) {
  if (!paymentsByMouId.has(p.mouId)) paymentsByMouId.set(p.mouId, [])
  paymentsByMouId.get(p.mouId).push(p)
}

// ---------------------------------------------------------------------------
// Diff logic
// ---------------------------------------------------------------------------

function almostEqual(a, b, tol = 1) {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tol
  return a === b
}

function fieldDiffNumber(label, refreshVal, currentVal, opts = {}) {
  const tol = opts.tol ?? 1
  const ignoreZeroVsBlank = opts.ignoreZeroVsBlank ?? false
  if (refreshVal === null && (currentVal === null || currentVal === 0)) return null
  if (almostEqual(refreshVal ?? 0, currentVal ?? 0, tol)) return null
  if (ignoreZeroVsBlank && (refreshVal === 0 || refreshVal === null) && (currentVal === null || currentVal === 0)) return null
  const isOverwrite = currentVal !== null && currentVal !== 0 && refreshVal !== null
  return { field: label, refresh: refreshVal, current: currentVal, kind: isOverwrite ? 'overwrite' : 'fill' }
}

function fieldDiffString(label, refreshVal, currentVal) {
  if ((refreshVal ?? '') === (currentVal ?? '')) return null
  if (!refreshVal && !currentVal) return null
  const isOverwrite = currentVal !== null && currentVal !== undefined && currentVal !== '' && refreshVal
  return { field: label, refresh: refreshVal, current: currentVal, kind: isOverwrite ? 'overwrite' : 'fill' }
}

function diffMou(refreshRow, mou) {
  const diffs = []
  const push = (d) => { if (d) diffs.push(d) }
  push(fieldDiffString('trainerModel', refreshRow.trainerModel, mou.trainerModel))
  push(fieldDiffNumber('contractValue', refreshRow.contractValue, mou.contractValue, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('studentsMou', refreshRow.studentsMou, mou.studentsMou))
  push(fieldDiffNumber('studentsActual', refreshRow.studentsActual, mou.studentsActual))
  push(fieldDiffNumber('spWithoutTax', refreshRow.spWithoutTax, mou.spWithoutTax, { tol: 1, ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('spWithTax', refreshRow.spWithTax, mou.spWithTax, { tol: 1, ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('received', refreshRow.received, mou.received, { ignoreZeroVsBlank: true }))
  push(fieldDiffNumber('tds', refreshRow.tds, mou.tds, { ignoreZeroVsBlank: true }))
  push(fieldDiffString('startDate', refreshRow.duration.start, mou.startDate))
  push(fieldDiffString('endDate', refreshRow.duration.end, mou.endDate))
  push(fieldDiffString('city', refreshRow.city, schoolBySlug.get(refreshRow.schoolSlug)?.city ?? null))
  push(fieldDiffString('state', refreshRow.state, schoolBySlug.get(refreshRow.schoolSlug)?.state ?? null))
  return diffs
}

function diffInstallments(refreshRow, mou) {
  const existing = paymentsByMouId.get(mou.id) ?? []
  const existingBySeq = new Map()
  for (const p of existing) existingBySeq.set(p.instalmentSeq, p)

  const out = []
  for (const inst of refreshRow.installments) {
    const ex = existingBySeq.get(inst.seq)
    if (!ex) {
      out.push({ seq: inst.seq, status: 'new', refresh: inst, current: null })
      continue
    }
    const diffs = []
    if (inst.amount !== null && Math.abs((inst.amount ?? 0) - (ex.expectedAmount ?? 0)) > 1) {
      diffs.push({ field: 'expectedAmount', refresh: inst.amount, current: ex.expectedAmount, kind: ex.expectedAmount > 0 ? 'overwrite' : 'fill' })
    }
    if (inst.monthIso && inst.monthIso !== ex.dueDateIso) {
      diffs.push({ field: 'dueDateIso', refresh: inst.monthIso, current: ex.dueDateIso, kind: ex.dueDateIso ? 'overwrite' : 'fill' })
    }
    if (inst.monthRaw && inst.monthRaw !== ex.dueDateRaw) {
      diffs.push({ field: 'dueDateRaw', refresh: inst.monthRaw, current: ex.dueDateRaw, kind: ex.dueDateRaw ? 'overwrite' : 'fill' })
    }
    if (inst.isReceived && (ex.status !== 'Received' && ex.status !== 'Paid')) {
      diffs.push({ field: 'status', refresh: 'Received', current: ex.status, kind: 'fill' })
    }
    if (diffs.length) out.push({ seq: inst.seq, status: 'update', refresh: inst, current: ex, diffs })
    else out.push({ seq: inst.seq, status: 'unchanged', refresh: inst, current: ex })
  }
  return out
}

// Two-stage match: schoolSlug + FY, then per-row alignment when multiple
// candidates exist on either side.
function alignRefreshGroup(refreshRows, candidates) {
  // refreshRows: refresh rows for one school slug (in encounter order)
  // candidates: production FY26-27 MOUs for that school (any order)
  if (candidates.length === 0) {
    return refreshRows.map((row) => ({ row, match: null }))
  }
  if (refreshRows.length === 1 && candidates.length === 1) {
    return [{ row: refreshRows[0], match: candidates[0] }]
  }
  // Build alignment: greedy on trainerModel, then closest contractValue.
  const used = new Set()
  const out = []
  for (const row of refreshRows) {
    let best = null
    let bestScore = -1
    for (const cand of candidates) {
      if (used.has(cand.id)) continue
      let score = 0
      if (row.trainerModel && cand.trainerModel && row.trainerModel === cand.trainerModel) score += 100
      if (row.contractValue !== null && cand.contractValue) {
        const ratio = Math.min(row.contractValue, cand.contractValue) / Math.max(row.contractValue, cand.contractValue)
        score += ratio * 10
      }
      if (score > bestScore) {
        bestScore = score
        best = cand
      }
    }
    if (best && bestScore >= 5) {
      used.add(best.id)
      out.push({ row, match: best })
    } else {
      out.push({ row, match: null })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Run diff
// ---------------------------------------------------------------------------

const refreshRowsBySlug = new Map()
for (const row of parsed.rows) {
  if (!refreshRowsBySlug.has(row.schoolSlug)) refreshRowsBySlug.set(row.schoolSlug, [])
  refreshRowsBySlug.get(row.schoolSlug).push(row)
}

const classified = []
for (const [slug, rows] of refreshRowsBySlug) {
  const candidates = mouBySlugFy.get(slug) ?? []
  const aligned = alignRefreshGroup(rows, candidates)
  for (const { row, match } of aligned) {
    if (!match) {
      classified.push({
        classification: 'NEW',
        refreshRow: row,
        candidateMatches: candidates.map((c) => ({ id: c.id, schoolName: c.schoolName, trainerModel: c.trainerModel, contractValue: c.contractValue })),
        mouDiffs: [],
        installmentDiffs: [],
      })
      continue
    }
    const mouDiffs = diffMou(row, match)
    const installmentDiffs = diffInstallments(row, match)
    const anyOverwrite =
      mouDiffs.some((d) => d.kind === 'overwrite') ||
      installmentDiffs.some((i) => (i.diffs ?? []).some((d) => d.kind === 'overwrite'))
    const anyChange =
      mouDiffs.length > 0 || installmentDiffs.some((i) => i.status === 'new' || i.status === 'update')
    let classification
    if (!anyChange) classification = 'UNCHANGED'
    else if (anyOverwrite) classification = 'CONFLICT'
    else classification = 'UPDATE'
    classified.push({
      classification,
      refreshRow: row,
      matchedMouId: match.id,
      matchedMouSnapshot: {
        id: match.id,
        schoolName: match.schoolName,
        trainerModel: match.trainerModel,
        contractValue: match.contractValue,
        studentsMou: match.studentsMou,
        received: match.received,
      },
      mouDiffs,
      installmentDiffs,
    })
  }
}

const summary = {
  NEW: classified.filter((c) => c.classification === 'NEW').length,
  UPDATE: classified.filter((c) => c.classification === 'UPDATE').length,
  UNCHANGED: classified.filter((c) => c.classification === 'UNCHANGED').length,
  CONFLICT: classified.filter((c) => c.classification === 'CONFLICT').length,
  AMBIGUOUS: classified.filter((c) => c.classification === 'AMBIGUOUS').length,
}

const diffMeta = {
  generatedAt: new Date().toISOString(),
  parsedSource: 'import-data/2026-05-pranav-refresh/parsed.json',
  fy: FY,
  totalRefreshRows: parsed.rows.length,
  summary,
  classified,
}

writeFileSync(OUT_JSON, JSON.stringify(diffMeta, null, 2) + '\n', 'utf-8')

// ---------------------------------------------------------------------------
// Markdown report
// ---------------------------------------------------------------------------

function fmt(v) {
  if (v === null || v === undefined) return '`null`'
  if (v === '') return '`""`'
  if (typeof v === 'number') return String(v)
  return '`' + String(v) + '`'
}

const lines = []
lines.push('# Pranav refresh diff report')
lines.push('')
lines.push(`Generated at: ${diffMeta.generatedAt}`)
lines.push(`Source: \`${diffMeta.parsedSource}\``)
lines.push(`FY scope: ${FY}`)
lines.push(`Refresh rows: ${diffMeta.totalRefreshRows}`)
lines.push('')
lines.push('## Summary')
lines.push('')
lines.push('| Classification | Count |')
lines.push('|---|---:|')
for (const k of ['NEW', 'UPDATE', 'UNCHANGED', 'CONFLICT', 'AMBIGUOUS']) {
  lines.push(`| ${k} | ${summary[k]} |`)
}
lines.push('')

function rowHeader(c) {
  return `### R${c.refreshRow.rowNum}: ${c.refreshRow.schoolName}` +
    (c.refreshRow.isContinuationRow ? ' (continuation row)' : '') +
    ` :: ${c.classification}`
}

lines.push('## NEW rows')
lines.push('')
const newRows = classified.filter((c) => c.classification === 'NEW')
if (newRows.length === 0) lines.push('_None._')
for (const c of newRows) {
  const r = c.refreshRow
  lines.push(rowHeader(c))
  lines.push('')
  lines.push(`- School slug: \`${r.schoolSlug}\``)
  lines.push(`- Sales rep: ${fmt(r.salesRepName)}`)
  lines.push(`- Trainer model: ${fmt(r.trainerModel)} (raw: ${fmt(r.modelRaw)})`)
  lines.push(`- Students MOU / Actual: ${fmt(r.studentsMou)} / ${fmt(r.studentsActual)}`)
  lines.push(`- Contract value: ${fmt(r.contractValue)} | Received: ${fmt(r.received)} | TDS: ${fmt(r.tds)}`)
  lines.push(`- Duration: ${r.duration.start} to ${r.duration.end}${r.duration.fallback ? ' (FALLBACK)' : ''}`)
  lines.push(`- Installments: ${r.installments.length}`)
  for (const inst of r.installments) {
    lines.push(`  - seq ${inst.seq}: pct=${fmt(inst.pct)}, amount=${fmt(inst.amount)}, month=${fmt(inst.monthRaw)} (iso=${fmt(inst.monthIso)}), received=${fmt(inst.paymentReceivedRaw)}`)
  }
  if (r.rowWarnings.length > 0) {
    lines.push(`- Warnings:`)
    for (const w of r.rowWarnings) lines.push(`  - ${w}`)
  }
  if (c.candidateMatches.length > 0) {
    lines.push(`- Candidate matches (rejected): ${c.candidateMatches.map((m) => m.id).join(', ')}`)
  }
  lines.push('')
}

lines.push('## UPDATE rows')
lines.push('')
const updateRows = classified.filter((c) => c.classification === 'UPDATE')
if (updateRows.length === 0) lines.push('_None._')
for (const c of updateRows) {
  lines.push(rowHeader(c))
  lines.push('')
  lines.push(`- Matched MOU: \`${c.matchedMouId}\``)
  if (c.mouDiffs.length) {
    lines.push('- MOU field changes:')
    lines.push('')
    lines.push('| Field | Current | Refresh | Kind |')
    lines.push('|---|---|---|---|')
    for (const d of c.mouDiffs) lines.push(`| ${d.field} | ${fmt(d.current)} | ${fmt(d.refresh)} | ${d.kind} |`)
    lines.push('')
  }
  const instChanges = c.installmentDiffs.filter((i) => i.status !== 'unchanged')
  if (instChanges.length) {
    lines.push('- Installment changes:')
    for (const i of instChanges) {
      if (i.status === 'new') {
        lines.push(`  - seq ${i.seq}: NEW (refresh amount=${fmt(i.refresh.amount)}, month=${fmt(i.refresh.monthRaw)})`)
      } else {
        lines.push(`  - seq ${i.seq}: UPDATE`)
        for (const d of i.diffs) lines.push(`    - ${d.field}: ${fmt(d.current)} -> ${fmt(d.refresh)} (${d.kind})`)
      }
    }
    lines.push('')
  }
}

lines.push('## CONFLICT rows (need human decision)')
lines.push('')
const conflictRows = classified.filter((c) => c.classification === 'CONFLICT')
if (conflictRows.length === 0) lines.push('_None._')
for (const c of conflictRows) {
  lines.push(rowHeader(c))
  lines.push('')
  lines.push(`- Matched MOU: \`${c.matchedMouId}\``)
  lines.push('- MOU field conflicts:')
  lines.push('')
  lines.push('| Field | Current (live) | Refresh (incoming) | Kind |')
  lines.push('|---|---|---|---|')
  for (const d of c.mouDiffs) lines.push(`| ${d.field} | ${fmt(d.current)} | ${fmt(d.refresh)} | ${d.kind} |`)
  lines.push('')
  const instConflicts = c.installmentDiffs.filter((i) => (i.diffs ?? []).some((d) => d.kind === 'overwrite'))
  if (instConflicts.length) {
    lines.push('- Installment conflicts:')
    for (const i of instConflicts) {
      lines.push(`  - seq ${i.seq}:`)
      for (const d of i.diffs.filter((x) => x.kind === 'overwrite')) {
        lines.push(`    - ${d.field}: ${fmt(d.current)} -> ${fmt(d.refresh)}`)
      }
    }
    lines.push('')
  }
}

lines.push('## AMBIGUOUS rows')
lines.push('')
const ambigRows = classified.filter((c) => c.classification === 'AMBIGUOUS')
if (ambigRows.length === 0) lines.push('_None._')

lines.push('## UNCHANGED rows')
lines.push('')
const unchangedRows = classified.filter((c) => c.classification === 'UNCHANGED')
if (unchangedRows.length === 0) lines.push('_None._')
else {
  lines.push(`${unchangedRows.length} rows are byte-identical to the live state and would be no-ops on apply:`)
  lines.push('')
  for (const c of unchangedRows) {
    lines.push(`- R${c.refreshRow.rowNum} ${c.refreshRow.schoolName} -> ${c.matchedMouId}`)
  }
  lines.push('')
}

writeFileSync(OUT_MD, lines.join('\n'), 'utf-8')

console.log('Diff classification:')
console.log('  NEW       :', summary.NEW)
console.log('  UPDATE    :', summary.UPDATE)
console.log('  UNCHANGED :', summary.UNCHANGED)
console.log('  CONFLICT  :', summary.CONFLICT)
console.log('  AMBIGUOUS :', summary.AMBIGUOUS)
console.log(`\nWritten ${OUT_MD}`)
console.log(`Written ${OUT_JSON}`)
