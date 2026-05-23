#!/usr/bin/env node
/*
 * Mechanical migration for files that use the deps-injection pattern.
 * For each file:
 *  1. Replace `import xJson from '@/data/x.json'` with the repo import.
 *  2. Replace `const defaultDeps: T = { ... }` with `async function defaultDeps(): Promise<T> { return { ... } }`.
 *  3. Replace each `xJson as unknown as T[]` line inside defaultDeps with `await xRepo.findAll() as T[]`.
 *  4. Change `deps: T = defaultDeps` to `depsOverride?: T`.
 *  5. Insert `const deps = depsOverride ?? (await defaultDeps())` after the opening `{` of each function.
 *
 * Files are passed on the command line: `node scripts/migrate-batch2.mjs file1 file2 ...`.
 * Reports per-file what was changed. Does NOT touch test files.
 */
import fs from 'node:fs'
import path from 'node:path'

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

function migrate(filepath) {
  let src = fs.readFileSync(filepath, 'utf8')
  const log = []

  // Collect all `import xJson from '@/data/x.json'` lines
  const importRe = /^import\s+(\w+)\s+from\s+['"]@\/data\/([\w_]+)\.json['"]\s*\n?/gm
  const imports = []
  let m
  while ((m = importRe.exec(src)) !== null) {
    imports.push({ varName: m[1], jsonBase: m[2], fullMatch: m[0] })
  }
  if (imports.length === 0) return { filepath, changed: false, log: ['no JSON imports'] }

  const repoNames = new Map() // import path -> Set of names
  for (const imp of imports) {
    const repo = REPO_MAP[imp.jsonBase]
    if (!repo) return { filepath, changed: false, log: [`no repo for ${imp.jsonBase}`] }
    if (!repoNames.has(repo.import)) repoNames.set(repo.import, new Set())
    repoNames.get(repo.import).add(repo.name)
    src = src.replace(imp.fullMatch, '')
  }

  // Insert repo imports at top (after the last existing import line, ignoring multi-line blocks).
  // Heuristic: find the last `\nimport ... from .+\n` single-line and append after.
  const insertion = [...repoNames.entries()]
    .map(([imp, names]) => `import { ${[...names].sort().join(', ')} } from '${imp}'`)
    .join('\n') + '\n'
  // Insert after the last `^import ... from .+$` line, accounting for multi-line imports
  const lines = src.split('\n')
  let lastImportEnd = -1
  let braceDepth = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('import ') || braceDepth > 0) {
      // Track open braces for multi-line imports
      braceDepth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length
      if (l.includes('from ') && braceDepth === 0) lastImportEnd = i
    }
  }
  if (lastImportEnd >= 0) {
    lines.splice(lastImportEnd + 1, 0, insertion.trimEnd())
    src = lines.join('\n')
  } else {
    src = insertion + src
  }

  // Convert `const defaultDeps: T = { ... }` to async function form.
  // Match the const declaration including its body up to the matching close brace.
  const constMatch = src.match(/const\s+defaultDeps\s*:\s*(\w+)\s*=\s*\{\n([\s\S]*?)^\}\s*\n/m)
  if (!constMatch) return { filepath, changed: false, log: ['no const defaultDeps pattern'] }
  const typeName = constMatch[1]
  const bodyRaw = constMatch[2]
  // For each line in body, replace `xJson as unknown as T[]` with `await xRepo.findAll() as T[]`
  let bodyConverted = bodyRaw
  for (const imp of imports) {
    const repo = REPO_MAP[imp.jsonBase]
    const re = new RegExp(`${imp.varName}\\s+as\\s+unknown\\s+as\\s+([\\w<>\\[\\]\\s|]+)`, 'g')
    bodyConverted = bodyConverted.replace(re, `await ${repo.name}.findAll() as $1`)
  }
  const newDefaultDeps = `async function defaultDeps(): Promise<${typeName}> {\n  return {\n${bodyConverted}  }\n}\n`
  src = src.replace(constMatch[0], newDefaultDeps)
  log.push(`converted defaultDeps to async`)

  // Convert function signatures: `deps: T = defaultDeps` -> `depsOverride?: T`
  // and add `const deps = depsOverride ?? (await defaultDeps())` after the opening `{`.
  // Find all `): ReturnType { ... ' patterns where a `deps: T = defaultDeps` appears in the sig.
  src = src.replace(
    /(\s*deps): (\w+)\s*=\s*defaultDeps/g,
    '$1Override?: $2',
  )

  // Insert `const deps = depsOverride ?? (await defaultDeps())` after function bodies starting
  // immediately after `depsOverride?: T,?\n): ...\n{` (heuristically).
  // Match each function definition that takes depsOverride, find its opening { and insert next line.
  src = src.replace(
    /(\bdepsOverride\?\s*:\s*\w+,?\s*\)\s*:[\s\S]*?\{\s*\n)/g,
    '$1  const deps = depsOverride ?? (await defaultDeps())\n',
  )

  fs.writeFileSync(filepath, src)
  return { filepath, changed: true, log }
}

const files = process.argv.slice(2)
for (const f of files) {
  const r = migrate(f)
  console.log(`${r.changed ? '+' : '-'} ${r.filepath}: ${r.log.join('; ')}`)
}
