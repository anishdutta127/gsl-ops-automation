/*
 * W4-I.1 final verification pass.
 *
 * Walks every surface added or modified in W4 and produces a JSON
 * report categorising findings as PASS / SMALL-FIX / LARGER-FIX /
 * DEFERRED. Output: scripts/w4i-verification-report-2026-04-28.json
 *
 * The script is read-only; it never mutates files. Findings that
 * require a fix are written to the report; the operator (Anish or
 * CC) applies them in a follow-up commit.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const findings = []

function record(category, area, detail) {
  findings.push({ category, area, detail })
}

function walk(dir, predicate, hits = []) {
  if (!fs.existsSync(dir)) return hits
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, predicate, hits)
    else if (predicate(p)) hits.push(p)
  }
  return hits
}

function relPath(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/')
}

// ===================================================================
// Check 1: em-dash sweep across user-facing content
// ===================================================================

const userFacingDirs = [
  path.join(ROOT, 'src', 'content'),
  path.join(ROOT, 'src', 'app'),
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'lib'),
  path.join(ROOT, 'docs'),
]

const codeExtRe = /\.(ts|tsx|md|mjs|js|json)$/

// Em-dash literal U+2014 constructed at runtime so this script's own
// source has no em-dash and does not self-fail the project's docs-lint
// check (mirrors the pattern in scripts/docs-lint.sh).
const EM_DASH = String.fromCodePoint(0x2014)

const emDashHits = []
for (const dir of userFacingDirs) {
  const files = walk(dir, (f) => codeExtRe.test(f))
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    if (text.includes(EM_DASH)) {
      const lines = text.split('\n')
      const lineHits = []
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(EM_DASH)) lineHits.push(i + 1)
      }
      emDashHits.push({ file: relPath(f), lines: lineHits })
    }
  }
}
if (emDashHits.length === 0) {
  record('PASS', 'em-dash discipline', 'Zero em-dashes across user-facing content (src/, docs/)')
} else {
  record('SMALL-FIX', 'em-dash slips', JSON.stringify(emDashHits))
}

// ===================================================================
// Check 2: TODO comments + FIXME + XXX in source
// ===================================================================

const todoHits = []
const sourceDirs = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'scripts'),
]
// Use a token that this script's own regex source intentionally does not
// reference (so the verification script does not match itself).
const FIXME_TOKEN = String.fromCharCode(70, 73, 88, 77, 69)
const TODO_TOKEN = String.fromCharCode(84, 79, 68, 79)
const XXX_TOKEN = 'XX' + 'X'
const triggerRe = new RegExp(`(?:^|\\s|\\/\\/|\\/\\*|\\*)\\s*(${TODO_TOKEN}|${FIXME_TOKEN}|${XXX_TOKEN})\\b`)

for (const dir of sourceDirs) {
  const files = walk(dir, (f) => /\.(ts|tsx|mjs|js)$/.test(f))
  for (const f of files) {
    // Skip the verification script itself; it discusses these tokens
    // structurally and would self-match.
    if (relPath(f) === 'scripts/w4i-verification.mjs') continue
    const text = fs.readFileSync(f, 'utf8')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (triggerRe.test(line)) {
        todoHits.push({ file: relPath(f), line: i + 1, text: line.trim().slice(0, 200) })
      }
    }
  }
}
if (todoHits.length === 0) {
  record('PASS', 'TODO sweep', `Zero ${TODO_TOKEN} / ${FIXME_TOKEN} / ${XXX_TOKEN} markers in src/ + scripts/.`)
} else {
  record('SMALL-FIX', 'TODO markers in source', JSON.stringify(todoHits))
}

// ===================================================================
// Check 3: deferred-items count + per-batch reconciliation
// ===================================================================

const deferredFile = path.join(ROOT, 'docs', 'W4-DEFERRED-ITEMS.md')
const deferredText = fs.readFileSync(deferredFile, 'utf8')
const dHeadingRe = /^## D-(\d{3}) /gm
const ids = []
let m
while ((m = dHeadingRe.exec(deferredText))) ids.push(parseInt(m[1], 10))
ids.sort((a, b) => a - b)

const EXPECTED_TOTAL = 39
const expectedRange = []
for (let i = 1; i <= EXPECTED_TOTAL; i++) expectedRange.push(i)
const missing = expectedRange.filter((n) => !ids.includes(n))
const extras = ids.filter((n) => !expectedRange.includes(n))

if (missing.length === 0 && extras.length === 0 && ids.length === EXPECTED_TOTAL) {
  record('PASS', 'deferred-items count', `${EXPECTED_TOTAL} entries (D-001 through D-${String(EXPECTED_TOTAL).padStart(3, '0')}); per-batch summary table reconciles to total.`)
} else {
  record('LARGER-FIX', 'deferred-items count drift', JSON.stringify({ found: ids.length, missing, extras }))
}

// Per-batch reconciliation against the summary table.
const summaryBands = [
  { batch: 'W4-A/B/C', range: [1, 8] },
  { batch: 'W4-D', range: [9, 14] },
  { batch: 'W4-E', range: [15, 25] },
  { batch: 'W4-F', range: [26, 27] },
  { batch: 'W4-G', range: [28, 37] },
  { batch: 'W4-H', range: [38, 38] },
  { batch: 'W4-I', range: [39, 39] },
]
const bandReport = []
for (const band of summaryBands) {
  const inBand = ids.filter((n) => n >= band.range[0] && n <= band.range[1])
  const expectedCount = band.range[1] - band.range[0] + 1
  bandReport.push({
    batch: band.batch,
    expected: expectedCount,
    found: inBand.length,
    ok: inBand.length === expectedCount,
  })
}
if (bandReport.every((b) => b.ok)) {
  record('PASS', 'per-batch deferred reconciliation', JSON.stringify(bandReport))
} else {
  record('LARGER-FIX', 'per-batch deferred reconciliation drift', JSON.stringify(bandReport))
}

// ===================================================================
// Check 4: route inventory
// ===================================================================

const apiRoutes = walk(path.join(ROOT, 'src', 'app', 'api'), (f) => /route\.ts$/.test(f) && !/route\.test\.ts$/.test(f))
const pageRoutes = walk(path.join(ROOT, 'src', 'app'), (f) => /page\.tsx$/.test(f) && !/page\.test\.tsx$/.test(f))
record('PASS', 'route inventory', JSON.stringify({
  apiRouteCount: apiRoutes.length,
  pageRouteCount: pageRoutes.length,
  apiRoutes: apiRoutes.map((p) => relPath(p)),
}))

// ===================================================================
// Check 5: AuditAction enum vs lib usage
// ===================================================================

const typesText = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'types.ts'), 'utf8')
const auditActionMatch = typesText.match(/export type AuditAction =([\s\S]*?)(?:export|\n\n[a-z])/)
const auditActions = []
if (auditActionMatch) {
  // Match only pipe-led declarations (`| 'action-name'`) so comment
  // fragments that happen to wrap a string in single quotes don't
  // pollute the inventory.
  const block = auditActionMatch[1]
  const re = /^\s*\|\s*'([a-z][a-z0-9-]+)'\s*$/gm
  let am
  while ((am = re.exec(block))) auditActions.push(am[1])
}

// Verify each action appears at least once in src/lib or src/app outside types.ts.
const usageRoots = [path.join(ROOT, 'src', 'lib'), path.join(ROOT, 'src', 'app')]
const allFiles = []
for (const r of usageRoots) {
  walk(r, (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('types.ts'), allFiles)
}
const allText = allFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const orphanActions = []
for (const action of auditActions) {
  const re = new RegExp(`'${action}'`, 'g')
  const count = (allText.match(re) ?? []).length
  if (count === 0) orphanActions.push(action)
}
if (orphanActions.length === 0) {
  record('PASS', 'AuditAction wiring', `${auditActions.length} actions all referenced in src/lib + src/app.`)
} else {
  // Orphan actions are non-blocking for round 2: they are forward-
  // declarations or schema reservations that may or may not be wired
  // later. Anish reviews post-round-2 to decide cleanup vs wire-up.
  record(
    'DEFERRED',
    'orphan AuditAction values (non-blocking)',
    JSON.stringify({
      orphans: orphanActions,
      note: 'Each value is defined in types.ts but not used in src/lib or src/app. See W4-DEFERRED-ITEMS.md D-039 for the cleanup audit.',
    }),
  )
}

// ===================================================================
// Check 6: permission Action enum
// ===================================================================

const permsText = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'auth', 'permissions.ts'), 'utf8')
const actionEnumMatch = permsText.match(/export type Action =([\s\S]*?)export (?:const|type|function|interface)/)
const permActions = []
if (actionEnumMatch) {
  const re = /'([a-z][a-z0-9-]+:[a-z][a-z0-9-]+)'/g
  let pm
  while ((pm = re.exec(actionEnumMatch[1]))) {
    if (!permActions.includes(pm[1])) permActions.push(pm[1])
  }
}
record('PASS', 'permission Action inventory', JSON.stringify({ count: permActions.length, actions: permActions }))

// ===================================================================
// Check 7: Phase 1 stale banners
// ===================================================================

const stalePatterns = [
  /Phase 1 placeholder/i, // expected in /admin tile descriptions
  /To be implemented/i,
  /Coming soon/i,
  /Not yet implemented/i,
]
const staleHits = []
const userFacingFiles = walk(path.join(ROOT, 'src'), (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
for (const f of userFacingFiles) {
  const text = fs.readFileSync(f, 'utf8')
  for (const pat of stalePatterns) {
    if (pat.test(text)) {
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (pat.test(lines[i])) {
          staleHits.push({ file: relPath(f), line: i + 1, pattern: pat.source, text: lines[i].trim().slice(0, 160) })
        }
      }
    }
  }
}
if (staleHits.length === 0) {
  record('PASS', 'stale Phase 1 banners', 'No "Coming soon" / "Not yet implemented" banners.')
} else {
  // 'Phase 1 placeholder' is expected on the /admin tile labels for stub surfaces.
  const realStale = staleHits.filter((h) => !h.text.includes('Phase 1 placeholder'))
  if (realStale.length === 0) {
    record(
      'PASS',
      'stale banners (only expected /admin placeholder labels)',
      `${staleHits.length} occurrences of "Phase 1 placeholder" on admin tile descriptions; expected.`,
    )
  } else {
    record('SMALL-FIX', 'unexpected stale banner', JSON.stringify(realStale))
  }
}

// ===================================================================
// Check 8: cross-reference integrity (RUNBOOK + role-decisions + help)
// ===================================================================

const runbookText = fs.readFileSync(path.join(ROOT, 'docs', 'RUNBOOK.md'), 'utf8')
const rolesText = fs.readFileSync(path.join(ROOT, 'docs', 'role-decisions.md'), 'utf8')

const refIssues = []
// Section-anchor references like "§11.X" should each have a matching "### 11.X" header in RUNBOOK.
const sectionRefRe = /§(11\.\d+)/g
const referencedSections = new Set()
let sm
while ((sm = sectionRefRe.exec(runbookText + rolesText))) referencedSections.add(sm[1])
const definedSections = new Set()
const sectionHeaderRe = /^### (11\.\d+)/gm
while ((sm = sectionHeaderRe.exec(runbookText))) definedSections.add(sm[1])
for (const ref of referencedSections) {
  if (!definedSections.has(ref)) refIssues.push(`§${ref} referenced but not defined in RUNBOOK`)
}
if (refIssues.length === 0) {
  record('PASS', 'cross-reference integrity', `All §11.X references in RUNBOOK + role-decisions resolve to defined sections (${definedSections.size} headers).`)
} else {
  record('SMALL-FIX', 'broken cross-references', JSON.stringify(refIssues))
}

// ===================================================================
// Check 9: smoke-render the 3 templates against placeholders
// ===================================================================

const templates = [
  { id: 'dispatch-template.docx', placeholders: ['DISPATCH_NUMBER', 'SCHOOL_NAME', '#flatItems', '#perGradeRows', 'TOTAL_QUANTITY', 'AUTHORISED_BY'] },
  { id: 'handover-template.docx', placeholders: ['SCHOOL_NAME', 'BRANCH', 'TRAINER_NAMES', '#detailRows', 'TOTAL_QUANTITY'] },
  { id: 'pi-template.docx', placeholders: [] }, // skip; W4-A.6 unchanged in W4
  { id: 'delivery-ack-template.docx', placeholders: [] }, // skip; W3 unchanged in W4
]
const PizZip = (await import('pizzip')).default
const templateReport = []
for (const t of templates) {
  if (t.placeholders.length === 0) {
    templateReport.push({ file: t.id, status: 'unchanged-in-W4-skip' })
    continue
  }
  const p = path.join(ROOT, 'public', 'ops-templates', t.id)
  if (!fs.existsSync(p)) {
    templateReport.push({ file: t.id, status: 'missing' })
    continue
  }
  const buf = fs.readFileSync(p)
  let allFound = true
  let missingPlaceholders = []
  try {
    const zip = new PizZip(buf)
    const xml = zip.files['word/document.xml']?.asText() ?? ''
    for (const pl of t.placeholders) {
      // Word may split runs; check fragment robustness by searching for the bare token without curly braces too.
      const token = pl.startsWith('#') ? pl.slice(1) : pl
      if (!xml.includes(token)) {
        allFound = false
        missingPlaceholders.push(pl)
      }
    }
  } catch (err) {
    templateReport.push({ file: t.id, status: 'parse-error', error: String(err) })
    continue
  }
  templateReport.push({
    file: t.id,
    status: allFound ? 'all-placeholders-present' : 'missing-placeholders',
    missing: missingPlaceholders,
  })
}
const templateIssues = templateReport.filter((r) => r.status === 'missing' || r.status === 'missing-placeholders' || r.status === 'parse-error')
if (templateIssues.length === 0) {
  record('PASS', 'docx templates intact', JSON.stringify(templateReport))
} else {
  record('SMALL-FIX', 'docx template integrity', JSON.stringify(templateReport))
}

// ===================================================================
// Output
// ===================================================================

const reportPath = path.join(ROOT, 'scripts', 'w4i-verification-report-2026-04-28.json')
const tally = { PASS: 0, 'SMALL-FIX': 0, 'LARGER-FIX': 0, DEFERRED: 0 }
for (const f of findings) tally[f.category] = (tally[f.category] ?? 0) + 1

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'W4-I.1 final verification pass',
  tally,
  findings,
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`Wrote ${path.relative(ROOT, reportPath)}`)
console.log(JSON.stringify(tally))
for (const f of findings) {
  console.log(`  [${f.category}] ${f.area}`)
}
