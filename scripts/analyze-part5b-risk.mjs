#!/usr/bin/env node
/*
 * Part 5.B risk analysis. For each of the 199 unmigrated files,
 * classify into:
 *   A_RMW_JSONB  : writes via RMW on a JSONB column (audit_log spread,
 *                  comments append, lineItems mutate, etc.). HIGH risk;
 *                  Blocker 1 race class lives here.
 *   B_WRITE      : writes (calls enqueueUpdate) but no JSONB RMW.
 *                  Mostly scalar field updates. Bridge-safe IF the
 *                  entity is in the dispatcher.
 *   C_READ_ONLY  : no writes; just renders data. In postgres mode it
 *                  reads stale bundled JSON until migrated. UX risk,
 *                  not data corruption.
 *
 * Also surface which entity each WRITE writes to, so we can check
 * the bridge dispatcher's coverage.
 */
import fs from 'node:fs'

const BRIDGE_SUPPORTED = new Set([
  'mou', 'user', 'school', 'payment', 'dispatch', 'kitDispatch',
  'escalation', 'notification', 'vexPi', 'vendor', 'inventoryItem',
  'salesTeam', 'vexProduct',
])

const files = fs.readFileSync('docs/PHASE_7_PART_5B_UNMIGRATED.txt', 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')

const cats = { A_RMW_JSONB: [], B_WRITE: [], C_READ_ONLY: [] }
const byEntity = {} // entity -> { A: count, B: count }
const bridgeMissing = new Set()

for (const f of files) {
  let src
  try { src = fs.readFileSync(f, 'utf8') } catch { continue }

  // Detect WRITE: does it call enqueueUpdate or repo .update / .create?
  const callsEnqueue = /\benqueueUpdate\b/.test(src)
  const callsRepoUpdate = /\b\w+Repo\.(update|create|appendAudit|updateWithAudit|updatePartial)\b/.test(src)
  const isWrite = callsEnqueue || callsRepoUpdate

  // Detect RMW-on-JSONB: spread + JSONB array push pattern.
  // Common patterns: `auditLog: [...{thing}.auditLog, ...]`, `comments: [...{thing}.comments, ...]`,
  // `partialPayments: [...{thing}.partialPayments, ...]`, etc.
  const rmwJsonb = /\[\s*\.\.\.\s*\w+\.(auditLog|comments|lineItems|allocations|partialPayments|paymentLogIds|studentCountEventIds|notifiedEmails|payload)\s*[\?,\]]/.test(src)

  // Detect entity in enqueue call.
  const entityMatch = src.match(/enqueueUpdate\(\{[\s\S]*?entity:\s*['"](\w+)['"]/m)
  const entity = entityMatch ? entityMatch[1] : null

  if (isWrite && rmwJsonb) {
    cats.A_RMW_JSONB.push({ file: f, entity })
    if (entity) byEntity[entity] = byEntity[entity] || { A: 0, B: 0 }
    if (entity) byEntity[entity].A++
    if (entity && !BRIDGE_SUPPORTED.has(entity)) bridgeMissing.add(entity)
  } else if (isWrite) {
    cats.B_WRITE.push({ file: f, entity })
    if (entity) byEntity[entity] = byEntity[entity] || { A: 0, B: 0 }
    if (entity) byEntity[entity].B++
    if (entity && !BRIDGE_SUPPORTED.has(entity)) bridgeMissing.add(entity)
  } else {
    cats.C_READ_ONLY.push({ file: f })
  }
}

console.log('=== Part 5.B risk breakdown ===')
console.log()
console.log(`A_RMW_JSONB (Blocker 1 race class - MUST migrate + atomic refactor):  ${cats.A_RMW_JSONB.length}`)
console.log(`B_WRITE     (writes but no JSONB RMW; bridge-safe if entity supported): ${cats.B_WRITE.length}`)
console.log(`C_READ_ONLY (no writes; UX-stale in postgres until migrated):           ${cats.C_READ_ONLY.length}`)
console.log(`TOTAL:                                                                 ${files.length}`)
console.log()
console.log('=== Per-entity write counts ===')
for (const [ent, c] of Object.entries(byEntity).sort()) {
  const inBridge = BRIDGE_SUPPORTED.has(ent) ? 'BRIDGED' : 'NOT-BRIDGED'
  console.log(`  ${ent.padEnd(28)} A=${c.A.toString().padStart(2)}  B=${c.B.toString().padStart(2)}  [${inBridge}]`)
}
console.log()
console.log('=== Bridge gaps (entities with unmigrated writes that the bridge does NOT dispatch) ===')
for (const e of [...bridgeMissing].sort()) console.log('  -', e)
console.log()
console.log('=== A_RMW_JSONB files (the must-fix-before-cutover list) ===')
for (const r of cats.A_RMW_JSONB) console.log('  -', r.file, '[' + (r.entity || '?') + ']')
console.log()
console.log('=== Bridge-unsafe writes (write but entity not in bridge OR is RMW-on-JSONB) ===')
const unsafe = [...cats.A_RMW_JSONB, ...cats.B_WRITE]
  .filter((r) => r.entity && !BRIDGE_SUPPORTED.has(r.entity))
console.log(`Count: ${unsafe.length}`)
for (const r of unsafe.slice(0, 30)) console.log('  -', r.file, '[' + r.entity + ']')

// Dump full lists to files
fs.writeFileSync('tmp/risk-A-rmw-jsonb.txt', cats.A_RMW_JSONB.map(r => r.file).join('\n'))
fs.writeFileSync('tmp/risk-B-writes.txt', cats.B_WRITE.map(r => r.file).join('\n'))
fs.writeFileSync('tmp/risk-C-readonly.txt', cats.C_READ_ONLY.map(r => r.file).join('\n'))
console.log()
console.log('Lists written to tmp/risk-{A,B,C}-*.txt')
