#!/usr/bin/env node
/*
 * Phase 7 Part 5 mechanical migration script.
 *
 * For each TS/TSX file under src/ that is NOT a *.test.* file:
 *   1. Find `import xJson from '@/data/x.json'` patterns.
 *   2. Find the matching `const NAME = xJson as unknown as X[]` lines.
 *   3. Replace the import with `import { xRepo } from '@/lib/db/repos/x'`.
 *   4. Replace `xJson as unknown as X[]` (and the const NAME) with a
 *      module-level removal + insertion of `const NAME = await xRepo.findAll()`
 *      inside the first async function that uses NAME.
 *
 * This works for simple cases: file has one async exported function,
 * the const NAME is module-scope and only read inside that function.
 * For complex cases (deps injection, multiple readers, server components
 * with many JSON imports), the script SKIPS the file and reports it
 * so the human can migrate manually.
 *
 * Run: node scripts/migrate-call-sites.mjs [--dry] [--filter <pattern>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DRY = process.argv.includes('--dry')
const filterIdx = process.argv.indexOf('--filter')
const FILTER = filterIdx >= 0 ? process.argv[filterIdx + 1] : null

// Map from json file basename to repo import target.
// Leaf entities all live in @/lib/db/repos/leafRepos.
const LEAF_ENTITIES = new Set([
  'adjustments','agreements','cc_rules','chain_dismissals','communication_templates',
  'communications','dispatch_requests','feedback','homepage_action_log','intake_records',
  'lifecycle_rules','magic_link_tokens','mou_import_review','payment_logs',
  'reminder_thresholds','sales_opportunities','school_groups','school_spocs',
  'signed_values','stage_responsibility','student_count_events','sync_health',
  'vex_dispatches','vex_orders',
])

function entityToRepoName(jsonBase) {
  // singularise + camelCase
  const map = {
    'mous': { name: 'mou', import: '@/lib/db/repos/mou' },
    'users': { name: 'user', import: '@/lib/db/repos/user' },
    'schools': { name: 'school', import: '@/lib/db/repos/school' },
    'payments': { name: 'payment', import: '@/lib/db/repos/payment' },
    'dispatches': { name: 'dispatch', import: '@/lib/db/repos/dispatch' },
    'kit_dispatches': { name: 'kitDispatch', import: '@/lib/db/repos/kitDispatch' },
    'escalations': { name: 'escalation', import: '@/lib/db/repos/escalation' },
    'notifications': { name: 'notification', import: '@/lib/db/repos/notification' },
    'sales_team': { name: 'salesTeam', import: '@/lib/db/repos/salesTeam' },
    'inventory_items': { name: 'inventoryItem', import: '@/lib/db/repos/inventoryItem' },
    'vendors': { name: 'vendor', import: '@/lib/db/repos/vendor' },
    'vex_products': { name: 'vexProduct', import: '@/lib/db/repos/vexProduct' },
    'vex_pis': { name: 'vexPi', import: '@/lib/db/repos/vexPi' },
  }
  if (map[jsonBase]) return map[jsonBase]
  if (LEAF_ENTITIES.has(jsonBase)) {
    const camel = jsonBase.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    // singularise (chop trailing 's'); special cases: 'feedback' stays, 'sync_health' stays
    let singular = camel.replace(/s$/, '')
    if (jsonBase === 'feedback') singular = 'feedback'
    if (jsonBase === 'sync_health') singular = 'syncHealth'
    if (jsonBase === 'communication_templates') singular = 'communicationTemplate'
    if (jsonBase === 'cc_rules') singular = 'ccRule'
    if (jsonBase === 'school_groups') singular = 'schoolGroup'
    if (jsonBase === 'school_spocs') singular = 'schoolSpoc'
    if (jsonBase === 'student_count_events') singular = 'studentCountEvent'
    if (jsonBase === 'payment_logs') singular = 'paymentLog'
    if (jsonBase === 'dispatch_requests') singular = 'dispatchRequest'
    if (jsonBase === 'intake_records') singular = 'intakeRecord'
    if (jsonBase === 'magic_link_tokens') singular = 'magicLinkToken'
    if (jsonBase === 'mou_import_review') singular = 'mouImportReview'
    if (jsonBase === 'homepage_action_log') singular = 'homepageActionLog'
    if (jsonBase === 'vex_dispatches') singular = 'vexDispatch'
    if (jsonBase === 'vex_orders') singular = 'vexOrder'
    if (jsonBase === 'sales_opportunities') singular = 'salesOpportunity'
    if (jsonBase === 'stage_responsibility') singular = 'stageResponsibility'
    if (jsonBase === 'reminder_thresholds') singular = 'reminderThreshold'
    if (jsonBase === 'chain_dismissals') singular = 'chainDismissal'
    if (jsonBase === 'lifecycle_rules') singular = 'lifecycleRule'
    if (jsonBase === 'signed_values') singular = 'signedValue'
    if (jsonBase === 'adjustments') singular = 'adjustment'
    if (jsonBase === 'agreements') singular = 'agreement'
    if (jsonBase === 'communications') singular = 'communication'
    return { name: singular, import: '@/lib/db/repos/leafRepos' }
  }
  return null
}

const REPORT = { migrated: [], skipped: [], skippedReason: {} }

function walkDir(dir) {
  const out = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '_fixtures') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkDir(full))
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      if (e.name.includes('.test.')) continue
      out.push(full)
    }
  }
  return out
}

function migrateFile(filepath) {
  const rel = path.relative(ROOT, filepath).replaceAll('\\', '/')
  if (FILTER && !rel.includes(FILTER)) return
  if (rel.startsWith('src/lib/db/')) {
    REPORT.skipped.push(rel)
    REPORT.skippedReason[rel] = 'inside repos themselves'
    return
  }

  let src = fs.readFileSync(filepath, 'utf8')

  // Find all `import xJson from '@/data/x.json'` statements.
  const importRe = /^import\s+(\w+)\s+from\s+['"]@\/data\/([\w_]+)\.json['"]\s*\n?/gm
  const imports = []
  let m
  while ((m = importRe.exec(src)) !== null) {
    imports.push({ varName: m[1], jsonBase: m[2], fullMatch: m[0] })
  }

  if (imports.length === 0) return // nothing to do

  // For each import, find the const NAME = xJson as unknown as X[] line.
  // If we can't find one, skip safely (file uses xJson directly without alias - rare).
  const transforms = []
  for (const imp of imports) {
    const constRe = new RegExp(
      `^const\\s+(\\w+)\\s*=\\s*${imp.varName}\\s+as\\s+unknown\\s+as\\s+([\\w<>\\[\\]\\s|]+?)\\s*\\n`,
      'm',
    )
    const cm = src.match(constRe)
    if (!cm) {
      REPORT.skipped.push(rel)
      REPORT.skippedReason[rel] = `direct usage of ${imp.varName} (no alias const)`
      return
    }
    const repo = entityToRepoName(imp.jsonBase)
    if (!repo) {
      REPORT.skipped.push(rel)
      REPORT.skippedReason[rel] = `no repo for entity ${imp.jsonBase}`
      return
    }
    transforms.push({
      importMatch: imp.fullMatch,
      constMatch: cm[0],
      constName: cm[1],
      repo,
    })
  }

  // Find the FIRST `export default async function` or `export async function` body start.
  const fnRe = /(export\s+(?:default\s+)?async\s+function\s+\w+\s*\([^)]*\)\s*[:\w<>,\[\]\s]*\{)/
  const fm = src.match(fnRe)
  if (!fm) {
    REPORT.skipped.push(rel)
    REPORT.skippedReason[rel] = 'no async exported function found'
    return
  }

  // Build the new source.
  let newSrc = src

  // Remove old imports + const declarations.
  for (const t of transforms) {
    newSrc = newSrc.replace(t.importMatch, '')
    newSrc = newSrc.replace(t.constMatch, '')
  }

  // Build the repo imports (consolidate by import path).
  const byImportPath = new Map()
  for (const t of transforms) {
    if (!byImportPath.has(t.repo.import)) byImportPath.set(t.repo.import, new Set())
    byImportPath.get(t.repo.import).add(`${t.repo.name}Repo`)
  }
  const repoImports = [...byImportPath.entries()]
    .map(([imp, names]) => `import { ${[...names].sort().join(', ')} } from '${imp}'`)
    .join('\n')

  // Inject repo imports after the LAST existing import line.
  const lastImportRe = /(^import .+? from .+?\n)(?!.*^import )/ms
  if (lastImportRe.test(newSrc)) {
    newSrc = newSrc.replace(lastImportRe, (match) => match + repoImports + '\n')
  } else {
    newSrc = repoImports + '\n' + newSrc
  }

  // Inject const declarations inside the first async function body.
  const constLines = transforms
    .map((t) => `  const ${t.constName} = await ${t.repo.name}Repo.findAll()`)
    .join('\n')
  const newFnRe = /(export\s+(?:default\s+)?async\s+function\s+\w+\s*\([^)]*\)\s*[:\w<>,\[\]\s]*\{)/
  newSrc = newSrc.replace(newFnRe, `$1\n${constLines}`)

  if (DRY) {
    console.log(`[DRY] ${rel} (${transforms.length} imports to migrate)`)
  } else {
    fs.writeFileSync(filepath, newSrc)
    REPORT.migrated.push(rel)
  }
}

const src = path.join(ROOT, 'src')
const files = walkDir(src)
for (const f of files) {
  try {
    migrateFile(f)
  } catch (e) {
    const rel = path.relative(ROOT, f)
    REPORT.skipped.push(rel)
    REPORT.skippedReason[rel] = `exception: ${e.message}`
  }
}

console.log('\n=== Migrated ===')
for (const r of REPORT.migrated) console.log(' +', r)
console.log(`\nMigrated: ${REPORT.migrated.length} files`)
console.log(`Skipped:  ${REPORT.skipped.length} files`)
console.log('\n=== Skipped (with reasons) ===')
for (const r of REPORT.skipped) console.log(' -', r, '|', REPORT.skippedReason[r])
