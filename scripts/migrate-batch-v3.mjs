#!/usr/bin/env node
/*
 * v3 migration: handles deps-injection files where the lazy regex in v2 failed.
 * Strategy: walk character by character to find the matching close brace of
 * `const defaultDeps: T = { ... }`.
 */
import fs from 'node:fs'

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

function findMatchingBrace(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function migrate(filepath) {
  let src = fs.readFileSync(filepath, 'utf8')
  const log = []

  // 1. Collect json imports
  const importRe = /^import\s+(\w+)\s+from\s+['"]@\/data\/([\w_]+)\.json['"]\s*\n?/gm
  const imports = []
  let m
  while ((m = importRe.exec(src)) !== null) {
    imports.push({ varName: m[1], jsonBase: m[2], fullMatch: m[0] })
  }
  if (imports.length === 0) return { filepath, changed: false, log: ['no JSON imports'] }

  // 2. Build repo imports + delete json imports
  const repoImports = new Map()
  for (const imp of imports) {
    const repo = REPO_MAP[imp.jsonBase]
    if (!repo) return { filepath, changed: false, log: [`no repo for ${imp.jsonBase}`] }
    if (!repoImports.has(repo.import)) repoImports.set(repo.import, new Set())
    repoImports.get(repo.import).add(repo.name)
    src = src.replace(imp.fullMatch, '')
  }

  // 3. Find the `const defaultDeps: T = {` opening
  const defStart = src.match(/const\s+defaultDeps\s*:\s*(\w+)\s*=\s*\{/m)
  if (!defStart) return { filepath, changed: false, log: ['no const defaultDeps'] }
  const typeName = defStart[1]
  const openIdx = src.indexOf('{', defStart.index)
  const closeIdx = findMatchingBrace(src, openIdx)
  if (closeIdx === -1) return { filepath, changed: false, log: ['no matching brace'] }

  // Body is between openIdx+1 and closeIdx
  const bodyRaw = src.slice(openIdx + 1, closeIdx)
  // Find the trailing chars after the closing brace (newline, etc.)
  let trailingEnd = closeIdx + 1
  while (trailingEnd < src.length && /[\s\n]/.test(src[trailingEnd]) && src[trailingEnd] !== '\n') trailingEnd++
  if (src[trailingEnd] === '\n') trailingEnd++

  // Convert body: replace `xJson as unknown as T[]` with `await xRepo.findAll() as T[]`
  let bodyConverted = bodyRaw
  for (const imp of imports) {
    const repo = REPO_MAP[imp.jsonBase]
    const re = new RegExp(`${imp.varName}\\s+as\\s+unknown\\s+as\\s+([\\w<>\\[\\]\\s|,]+?)\\s*,`, 'g')
    bodyConverted = bodyConverted.replace(re, `await ${repo.name}.findAll() as $1,`)
    const reLast = new RegExp(`${imp.varName}\\s+as\\s+unknown\\s+as\\s+([\\w<>\\[\\]\\s|]+)$`, 'gm')
    bodyConverted = bodyConverted.replace(reLast, `await ${repo.name}.findAll() as $1`)
  }

  const newDefaultDeps =
    `async function defaultDeps(): Promise<${typeName}> {\n  return {${bodyConverted}}\n}\n`

  // Replace the const block with the async function
  src = src.slice(0, defStart.index) + newDefaultDeps + src.slice(trailingEnd)
  log.push('converted defaultDeps to async')

  // 4. Insert repo imports after the LAST `from '...'` import statement
  // (handle multi-line `import { ... } from '...'` by tracking brace depth)
  const lines = src.split('\n')
  let lastImportLineEnd = -1
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('import ') || depth > 0) {
      depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length
      if (l.includes('from ') && depth === 0) lastImportLineEnd = i
    }
  }
  const newImportLines = [...repoImports.entries()]
    .map(([imp, names]) => `import { ${[...names].sort().join(', ')} } from '${imp}'`)
  lines.splice(lastImportLineEnd + 1, 0, ...newImportLines)
  src = lines.join('\n')
  log.push(`inserted ${newImportLines.length} repo imports`)

  // 5. Convert function signatures: `deps: T = defaultDeps,` -> `depsOverride?: T,`
  src = src.replace(/(\bdeps)\s*:\s*(\w+)\s*=\s*defaultDeps/g, '$1Override?: $2')

  // 6. Insert `const deps = depsOverride ?? (await defaultDeps())` after each function body opens
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
