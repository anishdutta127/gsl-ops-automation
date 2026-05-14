#!/usr/bin/env node
/*
 * Gate 5A.8 Step 5: apply the parsed + diffed Pranav refresh to the live
 * src/data/*.json files.
 *
 * Re-uses the pure apply core from src/lib/imports/pranavApply.ts via an
 * inline JS port (mirrors the .ts/.mjs discipline of import-fy2627.mjs).
 *
 * Reads:
 *   import-data/2026-05-pranav-refresh/parsed.json
 *   import-data/2026-05-pranav-refresh/diff-report.json
 *   docs/gate-5a.8/decisions.json   (per-row decisions; built by this
 *                                    script's --auto mode or hand-edited)
 *   src/data/mous.json, payments.json, schools.json, sales_team.json
 *
 * Writes (only when --commit is passed):
 *   src/data/mous.json
 *   src/data/payments.json
 *   src/data/schools.json
 *   src/data/sales_team.json
 *   docs/gate-5a.8/apply-result.json
 *
 * Default decision policy when --auto is passed and no decisions.json
 * exists:
 *   NEW       -> apply
 *   UPDATE    -> apply
 *   UNCHANGED -> apply (no-op)
 *   CONFLICT  -> apply with keep-current (refresh data flagged for
 *                Pranav review rather than silently overwriting; the
 *                conflict cases get a SEPARATE per-conflict review pass
 *                below)
 *   AMBIGUOUS -> skip (none in this refresh)
 *
 * Flags:
 *   --auto       generate default decisions if decisions.json is absent
 *   --commit     write the new state to disk (default is dry-run preview)
 *   --decisions  path override for decisions.json
 *
 * Idempotent: re-running with --commit after a successful apply
 * produces zero new changes (UNCHANGED on every row).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(__filename), '..')

const argv = process.argv.slice(2)
const COMMIT = argv.includes('--commit')
const AUTO = argv.includes('--auto')
const DECISIONS_FLAG = argv.indexOf('--decisions')
const DECISIONS_PATH = DECISIONS_FLAG >= 0
  ? argv[DECISIONS_FLAG + 1]
  : join(REPO_ROOT, 'docs/gate-5a.8/decisions.json')

const PARSED_PATH = join(REPO_ROOT, 'import-data/2026-05-pranav-refresh/parsed.json')
const DIFF_PATH = join(REPO_ROOT, 'import-data/2026-05-pranav-refresh/diff-report.json')
const RESULT_PATH = join(REPO_ROOT, 'docs/gate-5a.8/apply-result.json')

const MOUS_PATH = join(REPO_ROOT, 'src/data/mous.json')
const PAYMENTS_PATH = join(REPO_ROOT, 'src/data/payments.json')
const SCHOOLS_PATH = join(REPO_ROOT, 'src/data/schools.json')
const SALES_PATH = join(REPO_ROOT, 'src/data/sales_team.json')

const REFRESH_TAG = 'pranav-refresh-2026-05-13'
const APPLIED_BY = 'usr-anish'  // Anish drives the apply per the brief

function readJson(p) { return JSON.parse(readFileSync(p, 'utf-8')) }
function writeJson(p, v) { writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf-8') }

const parsed = readJson(PARSED_PATH)
const diffCached = readJson(DIFF_PATH)

// ---------------------------------------------------------------------------
// Decisions: load from disk OR auto-generate
// ---------------------------------------------------------------------------

let decisionsRaw
if (existsSync(DECISIONS_PATH)) {
  decisionsRaw = readJson(DECISIONS_PATH)
  console.log(`Loaded ${decisionsRaw.length} decisions from ${DECISIONS_PATH}`)
} else if (AUTO) {
  decisionsRaw = diffCached.classified.map((c) => {
    const base = { rowNum: c.refreshRow.rowNum }
    if (c.classification === 'AMBIGUOUS') return { ...base, decision: 'skip' }
    if (c.classification === 'CONFLICT') return { ...base, decision: 'apply', conflictResolution: 'apply-refresh' }
    return { ...base, decision: 'apply' }
  })
  if (COMMIT) {
    writeJson(DECISIONS_PATH, decisionsRaw)
    console.log(`Wrote default decisions to ${DECISIONS_PATH}`)
  }
} else {
  console.error(`Decisions file not found: ${DECISIONS_PATH}`)
  console.error('Pass --auto to generate defaults, or hand-create decisions.json.')
  process.exit(1)
}

const decisions = new Map(decisionsRaw.map((d) => [d.rowNum, d]))

// ---------------------------------------------------------------------------
// Inline apply core (mirrors src/lib/imports/pranavApply.ts)
// ---------------------------------------------------------------------------

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

function maxNumericSuffix(ids, prefix) {
  let max = 0
  const escaped = prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const re = new RegExp('^' + escaped + '(\\d+)')
  for (const id of ids) {
    const m = id.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

function mintMouId(state) {
  const start = maxNumericSuffix(state.mous.map((m) => m.id), 'MOU-STEAM-2627-')
  return `MOU-STEAM-2627-${String(start + 1).padStart(3, '0')}`
}

function newAuditEntry(userId, refreshTag, changes, kind) {
  const before = {}
  const after = {}
  for (const c of changes) { before[c.field] = c.before; after[c.field] = c.after }
  return {
    timestamp: new Date().toISOString(),
    user: userId,
    action: kind,
    before: kind === 'update' ? before : undefined,
    after,
    notes: `source: ${refreshTag}`,
  }
}

function upsertSchool(state, row, refreshTag, userId) {
  const slug = row.schoolSlug
  const schoolId = `sch-${slug}`
  let existing = state.schools.find((s) => s.id === schoolId || slugify(s.name) === slug)
  const changes = []
  if (!existing) {
    const fresh = {
      id: schoolId, name: row.schoolName, legalEntity: null,
      city: row.city ?? '', state: row.state ?? '', region: '',
      pinCode: null, contactPerson: null, email: null, phone: null,
      billingName: null, pan: null, gstNumber: null,
      notes: `Created from Pranav refresh ${refreshTag}`,
      active: true, createdAt: new Date().toISOString(),
      auditLog: [newAuditEntry(userId, refreshTag, [
        { field: 'name', before: null, after: row.schoolName },
        { field: 'city', before: null, after: row.city },
        { field: 'state', before: null, after: row.state },
      ], 'create')],
    }
    state.schools.push(fresh)
    return { schoolId, isNew: true }
  }
  if (!existing.city && row.city) { changes.push({ field: 'city', before: existing.city, after: row.city }); existing.city = row.city }
  if (!existing.state && row.state) { changes.push({ field: 'state', before: existing.state, after: row.state }); existing.state = row.state }
  if (changes.length) {
    existing.auditLog = existing.auditLog ?? []
    existing.auditLog.push(newAuditEntry(userId, refreshTag, changes, 'update'))
  }
  return { schoolId: existing.id, isNew: false }
}

function upsertSalesRep(state, name, refreshTag) {
  if (!name) return null
  const slug = slugify(name)
  const id = `sp-${slug}`
  const existing = state.salesTeam.find((s) => s.id === id || slugify(s.name) === slug)
  if (existing) return existing.id
  state.salesTeam.push({
    id, name, email: null, phone: null, territories: [], active: true,
    notes: `Auto-created from Pranav refresh ${refreshTag}`,
    createdAt: new Date().toISOString(),
  })
  return id
}

function applyInstallments(state, mouId, row, refreshTag, userId, isNewMou) {
  const changes = []
  const total = Math.max(row.installments.length, 1)
  for (const inst of row.installments) {
    const id = `${mouId}-i${inst.seq}`
    let payment = state.payments.find((p) => p.id === id)
    if (!payment) {
      payment = {
        id, mouId, schoolName: row.schoolName, programme: 'STEAM',
        instalmentLabel: `${inst.seq} of ${total}`,
        instalmentSeq: inst.seq, totalInstalments: total,
        description: '',
        dueDateRaw: inst.monthRaw, dueDateIso: inst.monthIso,
        expectedAmount: inst.amount ?? 0,
        receivedAmount: inst.isReceived ? (inst.amount ?? 0) : null,
        receivedDate: inst.isReceived ? inst.monthIso : null,
        paymentMode: null, bankReference: null,
        piNumber: null, taxInvoiceNumber: null,
        status: inst.isReceived ? 'Received' : 'Pending',
        notes: `Created from Pranav refresh ${refreshTag}`,
        piSentDate: null, piSentTo: null, piGeneratedAt: null,
        studentCountActual: null, partialPayments: null,
        auditLog: [newAuditEntry(userId, refreshTag, [
          { field: 'expectedAmount', before: null, after: inst.amount ?? 0 },
          { field: 'status', before: null, after: inst.isReceived ? 'Received' : 'Pending' },
        ], 'create')],
      }
      state.payments.push(payment)
      changes.push({ field: `payment.${inst.seq}.created`, before: null, after: inst.amount })
      continue
    }
    if (isNewMou) continue
    const pc = []
    if (inst.amount !== null && Math.abs((inst.amount ?? 0) - (payment.expectedAmount ?? 0)) > 1) {
      if (payment.expectedAmount === 0 || payment.expectedAmount === null) {
        pc.push({ field: 'expectedAmount', before: payment.expectedAmount, after: inst.amount })
        payment.expectedAmount = inst.amount
      }
    }
    if (inst.monthIso && inst.monthIso !== payment.dueDateIso && !payment.dueDateIso) {
      pc.push({ field: 'dueDateIso', before: payment.dueDateIso, after: inst.monthIso })
      payment.dueDateIso = inst.monthIso
    }
    if (inst.monthRaw && inst.monthRaw !== payment.dueDateRaw && !payment.dueDateRaw) {
      pc.push({ field: 'dueDateRaw', before: payment.dueDateRaw, after: inst.monthRaw })
      payment.dueDateRaw = inst.monthRaw
    }
    if (inst.isReceived && payment.status !== 'Received' && payment.status !== 'Paid') {
      pc.push({ field: 'status', before: payment.status, after: 'Received' })
      payment.status = 'Received'
    }
    if (pc.length) {
      payment.auditLog = payment.auditLog ?? []
      payment.auditLog.push(newAuditEntry(userId, refreshTag, pc, 'update'))
      for (const c of pc) changes.push({ field: `payment.${inst.seq}.${c.field}`, before: c.before, after: c.after })
    }
  }
  return changes
}

function createMou(state, row, schoolId, salesId, refreshTag, userId) {
  const id = mintMouId(state)
  const mou = {
    id, schoolId, schoolName: row.schoolName,
    programme: 'STEAM', programmeSubType: null,
    schoolScope: 'SINGLE', schoolGroupId: null,
    status: row.mouSigned ? 'Active' : 'Pending Signature',
    cohortStatus: 'active', academicYear: '2026-27',
    startDate: row.duration.start, endDate: row.duration.end,
    studentsMou: row.studentsMou ?? 0,
    studentsActual: row.studentsActual,
    studentsVariance: null, studentsVariancePct: null,
    spWithoutTax: row.spWithoutTax ?? 0, spWithTax: row.spWithTax ?? 0,
    contractValue: row.contractValue ?? 0,
    received: row.received ?? 0, tds: row.tds ?? 0,
    balance: (row.contractValue ?? 0) - (row.received ?? 0),
    receivedPct: (row.contractValue ?? 0) > 0
      ? Math.round(((row.received ?? 0) / (row.contractValue ?? 0)) * 100) : 0,
    paymentSchedule: '', trainerModel: row.trainerModel,
    salesPersonId: salesId, templateVersion: null, generatedAt: null,
    notes: `Created from Pranav refresh ${refreshTag}`,
    delayNotes: null, daysToExpiry: null,
    auditLog: [newAuditEntry(userId, refreshTag, [
      { field: 'schoolName', before: null, after: row.schoolName },
      { field: 'contractValue', before: null, after: row.contractValue ?? 0 },
      { field: 'studentsMou', before: null, after: row.studentsMou ?? 0 },
      { field: 'trainerModel', before: null, after: row.trainerModel },
    ], 'create')],
    effectiveDate: row.duration.start,
    signedMouPdfPath: row.physicalCopyScanned ? `imports/${refreshTag}/stubs/${id}.pdf` : null,
    importNotes: [
      row.acquisitionStatus && `acquisitionStatus=${row.acquisitionStatus}`,
      row.kitsSent && `kitsSent=${row.kitsSent}`,
      `source=${refreshTag}`,
    ].filter(Boolean).join('; ') || null,
  }
  state.mous.push(mou)
  return mou
}

function updateMouFields(mou, diffs, conflictResolution, refreshTag, userId) {
  const changes = []
  for (const d of diffs) {
    const shouldApply = d.kind === 'fill' || (d.kind === 'overwrite' && conflictResolution === 'apply-refresh')
    if (!shouldApply) continue
    const before = mou[d.field]
    if (before === d.refresh) continue
    mou[d.field] = d.refresh
    changes.push({ field: d.field, before, after: d.refresh })
  }
  if (changes.length) {
    mou.balance = (mou.contractValue ?? 0) - (mou.received ?? 0)
    mou.receivedPct = (mou.contractValue ?? 0) > 0
      ? Math.round(((mou.received ?? 0) / (mou.contractValue ?? 0)) * 100) : 0
    mou.auditLog = mou.auditLog ?? []
    mou.auditLog.push(newAuditEntry(userId, refreshTag, changes, 'update'))
  }
  return changes
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const state = {
  mous: readJson(MOUS_PATH),
  payments: readJson(PAYMENTS_PATH),
  schools: readJson(SCHOOLS_PATH),
  salesTeam: readJson(SALES_PATH),
}

// Re-classify against current live state so re-runs after a successful
// apply detect the just-created MOUs and treat them as UPDATE/UNCHANGED
// rather than NEW. Without this, --commit on the second run would
// create duplicate MOUs (the cached diff-report.json is computed against
// the pre-apply state and stays stale).
const liveBySlug = new Map()
for (const m of state.mous) {
  if (m.academicYear !== '2026-27') continue
  const slug = slugify(m.schoolName)
  if (!liveBySlug.has(slug)) liveBySlug.set(slug, [])
  liveBySlug.get(slug).push(m)
}

function alignCandidate(row, candidates) {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  let best = null
  let bestScore = -1
  for (const cand of candidates) {
    let score = 0
    if (row.trainerModel && cand.trainerModel === row.trainerModel) score += 100
    if (row.contractValue && cand.contractValue) {
      const ratio = Math.min(row.contractValue, cand.contractValue) / Math.max(row.contractValue, cand.contractValue)
      score += ratio * 10
    }
    if (score > bestScore) { bestScore = score; best = cand }
  }
  return bestScore >= 5 ? best : null
}

function alignGroup(rows, candidates) {
  const used = new Set()
  const out = []
  const singleCandidate = candidates.length === 1 && rows.length === 1
  for (const row of rows) {
    let best = null
    let bestScore = -1
    for (const cand of candidates) {
      if (used.has(cand.id)) continue
      let score = 0
      if (row.refreshRow.trainerModel && cand.trainerModel === row.refreshRow.trainerModel) score += 100
      if (row.refreshRow.contractValue && cand.contractValue) {
        const ratio = Math.min(row.refreshRow.contractValue, cand.contractValue) / Math.max(row.refreshRow.contractValue, cand.contractValue)
        score += ratio * 10
      }
      if (score > bestScore) { bestScore = score; best = cand }
    }
    const accept = best && (bestScore >= 5 || singleCandidate)
    if (accept) {
      used.add(best.id)
      out.push({ row, match: best })
    } else {
      out.push({ row, match: null })
    }
  }
  return out
}

const cachedBySlug = new Map()
for (const c of diffCached.classified) {
  const slug = c.refreshRow.schoolSlug
  if (!cachedBySlug.has(slug)) cachedBySlug.set(slug, [])
  cachedBySlug.get(slug).push(c)
}

const liveClassified = []
for (const [slug, rows] of cachedBySlug) {
  const candidates = liveBySlug.get(slug) ?? []
  const aligned = alignGroup(rows, candidates)
  for (const { row, match } of aligned) {
    if (!match) {
      liveClassified.push({ ...row, classification: 'NEW', matchedMouId: null })
      continue
    }
    if (!row.matchedMouId) {
      liveClassified.push({ ...row, classification: 'UNCHANGED', matchedMouId: match.id, mouDiffs: [], installmentDiffs: [] })
      continue
    }
    liveClassified.push({ ...row, matchedMouId: match.id })
  }
}

const outcomes = []
for (const cls of liveClassified) {
  const d = decisions.get(cls.refreshRow.rowNum)
  if (!d || d.decision === 'skip') {
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'skipped', changes: [] })
    continue
  }
  if (cls.classification === 'UNCHANGED') {
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'unchanged', changes: [] })
    continue
  }

  const { schoolId, isNew: schoolIsNew } = upsertSchool(state, cls.refreshRow, REFRESH_TAG, APPLIED_BY)
  const salesId = upsertSalesRep(state, cls.refreshRow.salesRepName, REFRESH_TAG)

  if (cls.classification === 'NEW') {
    const mou = createMou(state, cls.refreshRow, schoolId, salesId, REFRESH_TAG, APPLIED_BY)
    const ic = applyInstallments(state, mou.id, cls.refreshRow, REFRESH_TAG, APPLIED_BY, true)
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'created', newMouId: mou.id, changes: ic, schoolCreated: schoolIsNew })
    continue
  }
  if (cls.classification === 'CONFLICT' && d.conflictResolution === 'keep-current') {
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'kept-current', changes: [] })
    continue
  }
  if (cls.classification === 'CONFLICT' && d.conflictResolution === 'keep-both') {
    const mou = createMou(state, cls.refreshRow, schoolId, salesId, REFRESH_TAG, APPLIED_BY)
    const ic = applyInstallments(state, mou.id, cls.refreshRow, REFRESH_TAG, APPLIED_BY, true)
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'kept-both', newMouId: mou.id, changes: ic })
    continue
  }
  const matchedId = d.ambiguousMatchId ?? cls.matchedMouId
  const mou = state.mous.find((m) => m.id === matchedId)
  if (!mou) {
    outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: 'error', message: `Matched MOU ${matchedId} missing`, changes: [] })
    continue
  }
  const mc = updateMouFields(mou, cls.mouDiffs, d.conflictResolution, REFRESH_TAG, APPLIED_BY)
  const ic = applyInstallments(state, mou.id, cls.refreshRow, REFRESH_TAG, APPLIED_BY, false)
  outcomes.push({ rowNum: cls.refreshRow.rowNum, schoolName: cls.refreshRow.schoolName, classification: cls.classification, result: mc.length + ic.length > 0 ? 'updated' : 'unchanged', changes: [...mc, ...ic] })
}

const summary = {
  created: outcomes.filter((o) => o.result === 'created').length,
  updated: outcomes.filter((o) => o.result === 'updated').length,
  unchanged: outcomes.filter((o) => o.result === 'unchanged').length,
  skipped: outcomes.filter((o) => o.result === 'skipped').length,
  keptCurrent: outcomes.filter((o) => o.result === 'kept-current').length,
  keptBoth: outcomes.filter((o) => o.result === 'kept-both').length,
  errored: outcomes.filter((o) => o.result === 'error').length,
}

const result = {
  refreshTag: REFRESH_TAG,
  appliedAt: new Date().toISOString(),
  appliedBy: APPLIED_BY,
  commit: COMMIT,
  summary,
  outcomes,
}

console.log('\nApply summary:')
console.log('  created     :', summary.created)
console.log('  updated     :', summary.updated)
console.log('  unchanged   :', summary.unchanged)
console.log('  kept-current:', summary.keptCurrent)
console.log('  kept-both   :', summary.keptBoth)
console.log('  skipped     :', summary.skipped)
console.log('  errored     :', summary.errored)
console.log('  total       :', outcomes.length)

if (COMMIT) {
  writeJson(MOUS_PATH, state.mous)
  writeJson(PAYMENTS_PATH, state.payments)
  writeJson(SCHOOLS_PATH, state.schools)
  writeJson(SALES_PATH, state.salesTeam)
  writeJson(RESULT_PATH, result)
  console.log(`\nWrote new state to src/data/ and apply-result to ${RESULT_PATH}`)
} else {
  console.log('\nDry-run only. Pass --commit to write changes.')
}
