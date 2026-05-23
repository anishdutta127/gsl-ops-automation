#!/usr/bin/env node
/*
 * Phase 7 Part 5 - mechanical migration v2.
 *
 * Handles the deps-injection pattern that v1 missed:
 *   import xJson from '@/data/x.json'
 *   const defaultDeps: T = { payments: paymentsJson as unknown as T[], ... }
 *   export async function fn(args, deps: T = defaultDeps)
 *
 * Converts to:
 *   import { xRepo } from '@/lib/db/repos/x'
 *   async function defaultDeps(): Promise<T> { return { payments: await paymentRepo.findAll(), ... } }
 *   export async function fn(args, depsOverride?: T) { const deps = depsOverride ?? (await defaultDeps()) }
 *
 * Run: node scripts/migrate-call-sites-v2.mjs [--dry] [--file <path>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DRY = process.argv.includes('--dry')
const fileIdx = process.argv.indexOf('--file')
const SINGLE_FILE = fileIdx >= 0 ? process.argv[fileIdx + 1] : null

const REPO_MAP = {
  'mous': { name: 'mouRepo', import: '@/lib/db/repos/mou' },
  'users': { name: 'userRepo', import: '@/lib/db/repos/user' },
  'schools': { name: 'schoolRepo', import: '@/lib/db/repos/school' },
  'payments': { name: 'paymentRepo', import: '@/lib/db/repos/payment' },
  'dispatches': { name: 'dispatchRepo', import: '@/lib/db/repos/dispatch' },
  'kit_dispatches': { name: 'kitDispatchRepo', import: '@/lib/db/repos/kitDispatch' },
  'escalations': { name: 'escalationRepo', import: '@/lib/db/repos/escalation' },
  'notifications': { name: 'notificationRepo', import: '@/lib/db/repos/notification' },
  'sales_team': { name: 'salesTeamRepo', import: '@/lib/db/repos/salesTeam' },
  'inventory_items': { name: 'inventoryItemRepo', import: '@/lib/db/repos/inventoryItem' },
  'vendors': { name: 'vendorRepo', import: '@/lib/db/repos/vendor' },
  'vex_products': { name: 'vexProductRepo', import: '@/lib/db/repos/vexProduct' },
  'vex_pis': { name: 'vexPiRepo', import: '@/lib/db/repos/vexPi' },
  // Leaf entities -> leafRepos.ts (all share the same import path)
  'adjustments': { name: 'adjustmentRepo', import: '@/lib/db/repos/leafRepos' },
  'agreements': { name: 'agreementRepo', import: '@/lib/db/repos/leafRepos' },
  'cc_rules': { name: 'ccRuleRepo', import: '@/lib/db/repos/leafRepos' },
  'chain_dismissals': { name: 'chainDismissalRepo', import: '@/lib/db/repos/leafRepos' },
  'communication_templates': { name: 'communicationTemplateRepo', import: '@/lib/db/repos/leafRepos' },
  'communications': { name: 'communicationRepo', import: '@/lib/db/repos/leafRepos' },
  'dispatch_requests': { name: 'dispatchRequestRepo', import: '@/lib/db/repos/leafRepos' },
  'feedback': { name: 'feedbackRepo', import: '@/lib/db/repos/leafRepos' },
  'homepage_action_log': { name: 'homepageActionLogRepo', import: '@/lib/db/repos/leafRepos' },
  'intake_records': { name: 'intakeRecordRepo', import: '@/lib/db/repos/leafRepos' },
  'lifecycle_rules': { name: 'lifecycleRuleRepo', import: '@/lib/db/repos/leafRepos' },
  'magic_link_tokens': { name: 'magicLinkTokenRepo', import: '@/lib/db/repos/leafRepos' },
  'mou_import_review': { name: 'mouImportReviewRepo', import: '@/lib/db/repos/leafRepos' },
  'payment_logs': { name: 'paymentLogRepo', import: '@/lib/db/repos/leafRepos' },
  'reminder_thresholds': { name: 'reminderThresholdRepo', import: '@/lib/db/repos/leafRepos' },
  'sales_opportunities': { name: 'salesOpportunityRepo', import: '@/lib/db/repos/leafRepos' },
  'school_groups': { name: 'schoolGroupRepo', import: '@/lib/db/repos/leafRepos' },
  'school_spocs': { name: 'schoolSpocRepo', import: '@/lib/db/repos/leafRepos' },
  'signed_values': { name: 'signedValueRepo', import: '@/lib/db/repos/leafRepos' },
  'stage_responsibility': { name: 'stageResponsibilityRepo', import: '@/lib/db/repos/leafRepos' },
  'student_count_events': { name: 'studentCountEventRepo', import: '@/lib/db/repos/leafRepos' },
  'sync_health': { name: 'syncHealthRepo', import: '@/lib/db/repos/leafRepos' },
  'vex_dispatches': { name: 'vexDispatchRepo', import: '@/lib/db/repos/leafRepos' },
  'vex_orders': { name: 'vexOrderRepo', import: '@/lib/db/repos/leafRepos' },
}

const REPORT = { v2migrated: [], v2skipped: [], reason: {} }

function walkDir(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '_fixtures') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkDir(full))
    else if ((e.name.endsWith('.ts') || e.name.endsWith('.tsx')) && !e.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

function migrateDepsInjection(filepath) {
  const rel = path.relative(ROOT, filepath).replaceAll('\\', '/')
  if (rel.startsWith('src/lib/db/')) return // skip the repos themselves

  let src = fs.readFileSync(filepath, 'utf8')

  // Phase 1: find imports
  const importRe = /^import\s+(\w+)\s+from\s+['"]@\/data\/([\w_]+)\.json['"]\s*\n?/gm
  const imports = []
  let m
  while ((m = importRe.exec(src)) !== null) {
    imports.push({ varName: m[1], jsonBase: m[2], fullMatch: m[0] })
  }
  if (imports.length === 0) return

  // Phase 2: check this file uses the deps-injection pattern.
  // Look for: `const defaultDeps: T = {` containing at least one of the json vars
  const defaultDepsRe = /const\s+defaultDeps\s*:\s*\w+\s*=\s*\{([\s\S]*?)\n\}\s*\n/
  const dm = src.match(defaultDepsRe)
  if (!dm) {
    REPORT.v2skipped.push(rel)
    REPORT.reason[rel] = 'no defaultDeps pattern'
    return
  }

  // Verify the defaultDeps body uses at least one of our json vars
  const usesAny = imports.some((imp) => dm[1].includes(imp.varName))
  if (!usesAny) {
    REPORT.v2skipped.push(rel)
    REPORT.reason[rel] = 'defaultDeps does not reference json imports'
    return
  }

  // Phase 3: transform
  let newSrc = src
  const repoNames = new Set()
  const repoImports = new Map() // import path -> set of repo names

  for (const imp of imports) {
    const repo = REPO_MAP[imp.jsonBase]
    if (!repo) {
      REPORT.v2skipped.push(rel)
      REPORT.reason[rel] = `no repo mapping for ${imp.jsonBase}`
      return
    }
    repoNames.add(repo.name)
    if (!repoImports.has(repo.import)) repoImports.set(repo.import, new Set())
    repoImports.get(repo.import).add(repo.name)

    // Remove the import line
    newSrc = newSrc.replace(imp.fullMatch, '')

    // Replace `xJson as unknown as T[]` (and surrounding context) inside defaultDeps with `await xRepo.findAll()`
    const usageRe = new RegExp(`${imp.varName}\\s+as\\s+unknown\\s+as\\s+([\\w<>\\[\\]\\s|]+)`, 'g')
    newSrc = newSrc.replace(usageRe, `await ${repo.name}.findAll() as $1`)
  }

  // Phase 4: insert the repo imports
  const newImportLines = [...repoImports.entries()]
    .map(([imp, names]) => `import { ${[...names].sort().join(', ')} } from '${imp}'`)
    .join('\n')
  // Insert after the last existing import in the file
  const lastImportIdx = newSrc.lastIndexOf('\nimport ')
  if (lastImportIdx >= 0) {
    const endOfLine = newSrc.indexOf('\n', lastImportIdx + 1)
    newSrc = newSrc.slice(0, endOfLine + 1) + newImportLines + '\n' + newSrc.slice(endOfLine + 1)
  } else {
    newSrc = newImportLines + '\n' + newSrc
  }

  // Phase 5: convert `const defaultDeps: T = { ... }` to `async function defaultDeps(): Promise<T> { return { ... } }`
  newSrc = newSrc.replace(
    /const\s+defaultDeps\s*:\s*(\w+)\s*=\s*\{([\s\S]*?)\n\}\s*\n/,
    'async function defaultDeps(): Promise<$1> {\n  return {$2\n  }\n}\n',
  )

  // Phase 6: convert `deps: T = defaultDeps` to `depsOverride?: T` and add `const deps = depsOverride ?? (await defaultDeps())`
  // Pattern: `args: X, deps: Y = defaultDeps` in function signatures
  newSrc = newSrc.replace(/(\bdeps)\s*:\s*(\w+)\s*=\s*defaultDeps/g, '$1Override?: $2')

  // After matching depsOverride? in the SAME function, insert `const deps = depsOverride ?? (await defaultDeps())` after the opening brace.
  // This is risky for files with multiple functions. We do it per-function by looking for `): X {` immediately after the signature.
  newSrc = newSrc.replace(
    /(\bdepsOverride\?\s*:\s*\w+\s*\)\s*:\s*[\s\S]+?\{\s*\n)/g,
    '$1  const deps = depsOverride ?? (await defaultDeps())\n',
  )

  if (DRY) {
    console.log(`[DRY] ${rel}`)
  } else {
    fs.writeFileSync(filepath, newSrc)
  }
  REPORT.v2migrated.push(rel)
}

const filesToProcess = SINGLE_FILE
  ? [path.join(ROOT, SINGLE_FILE)]
  : walkDir(path.join(ROOT, 'src'))

for (const f of filesToProcess) {
  try {
    migrateDepsInjection(f)
  } catch (e) {
    const rel = path.relative(ROOT, f)
    REPORT.v2skipped.push(rel)
    REPORT.reason[rel] = `exception: ${e.message}`
  }
}

console.log('\n=== v2 Migrated ===')
for (const r of REPORT.v2migrated) console.log(' +', r)
console.log(`\nv2 Migrated: ${REPORT.v2migrated.length}`)
console.log(`v2 Skipped:  ${REPORT.v2skipped.length}`)
