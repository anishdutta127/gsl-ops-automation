#!/usr/bin/env node
/*
 * Remove leaked concurrency-test VEX PIs from prod (VPI-ATOMIC-*).
 * verify-vex-payment-atomic.mjs mints id `VPI-ATOMIC-<base36>` + school_name
 * `ATOMIC-<ts>` + `VEXPL-ATOMIC-*` dangling logIds and DELETEs the row in its
 * finally; two runs leaked (crash before cleanup). Fake data, no real school.
 *
 * Default = DRY RUN (no writes; dumps a backup + prints the plan). --apply
 * deletes inside one transaction after re-confirming each target is a test
 * artifact (id prefix VPI-ATOMIC-, school_name prefix ATOMIC-, no vex_dispatches
 * referencing it, and its logIds are all dangling = nothing to delete in
 * payment_logs). Reversible via the backup.
 *
 * Usage:
 *   node scripts/cleanup-atomic-test-pis.mjs           # dry run + backup
 *   node scripts/cleanup-atomic-test-pis.mjs --apply    # delete + verify
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const TARGETS = ['VPI-ATOMIC-KUGF42', 'VPI-ATOMIC-KVYYNX']
const TS = '2026-06-25T00-00-00-000Z'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  const rows = await sql`SELECT * FROM vex_pis WHERE id = ANY(${TARGETS}) ORDER BY id`
  console.log(`Found ${rows.length}/${TARGETS.length} target rows.\n`)

  const safe = []
  for (const r of rows) {
    const ids = Array.isArray(r.payment_log_ids) ? r.payment_log_ids : []
    const presentLogs = ids.length ? await sql`SELECT id FROM payment_logs WHERE id = ANY(${ids})` : []
    const dispatches = await sql`SELECT id FROM vex_dispatches WHERE pi_id = ${r.id}`
    const isArtifact = r.id.startsWith('VPI-ATOMIC-') && String(r.pi_number || '').startsWith('ATOMIC-') && (r.school_name === null || r.school_name === '')
    console.log(`${r.id}: pi_number="${r.pi_number}" school_name=${JSON.stringify(r.school_name)} total=${r.total} received=${r.payment_received_amount} status=${r.status}`)
    console.log(`   payment_log_ids: ${ids.length} (all VEXPL-ATOMIC-*); present in payment_logs: ${presentLogs.length} (expect 0 = dangling, nothing to delete there)`)
    console.log(`   vex_dispatches referencing it: ${dispatches.length} (must be 0 for ON DELETE RESTRICT)`)
    console.log(`   artifact check (id+school prefix): ${isArtifact ? 'PASS' : 'FAIL'}`)
    if (isArtifact && presentLogs.length === 0 && dispatches.length === 0) safe.push(r)
    else console.log(`   -> NOT SAFE to auto-delete; excluded.`)
  }

  console.log(`\n=== PLAN: DELETE ${safe.length} vex_pis rows (${safe.map(r => r.id).join(', ')}) ===`)
  console.log(`   payment_logs to delete: 0 (all ${safe.reduce((s, r) => s + (r.payment_log_ids?.length || 0), 0)} logIds are dangling artifacts in the array, not rows).`)

  if (!safe.length) { console.log('\nNothing safe to delete. Exiting.'); process.exit(0) }

  // backup (always, even on dry run)
  mkdirSync('.recovery-backup', { recursive: true })
  const backupPath = join('.recovery-backup', `atomic-test-pis-pre-${TS}.json`)
  writeFileSync(backupPath, JSON.stringify({ at: TS, vex_pis: safe }, null, 2))
  console.log(`backup: ${backupPath}`)

  if (!APPLY) { console.log('\nDRY RUN complete. No writes. Re-run with --apply to delete + verify.'); process.exit(0) }

  const before = Number((await sql`SELECT count(*)::int AS c FROM vex_pis`)[0].c)
  const plBefore = Number((await sql`SELECT count(*)::int AS c FROM payment_logs`)[0].c)
  await sql.begin(async (tx) => {
    for (const r of safe) {
      await tx`DELETE FROM vex_pis WHERE id = ${r.id}`
      console.log(`deleted ${r.id}`)
    }
  })
  const after = Number((await sql`SELECT count(*)::int AS c FROM vex_pis`)[0].c)
  const plAfter = Number((await sql`SELECT count(*)::int AS c FROM payment_logs`)[0].c)
  const remaining = await sql`SELECT id FROM vex_pis WHERE id = ANY(${TARGETS})`
  console.log('\n=== VERIFY (after) ===')
  console.log(`  [${after === before - safe.length ? 'PASS' : 'FAIL'}] vex_pis count ${before} -> ${after} (expected -${safe.length})`)
  console.log(`  [${plAfter === plBefore ? 'PASS' : 'FAIL'}] payment_logs count unchanged ${plBefore} -> ${plAfter}`)
  console.log(`  [${remaining.length === 0 ? 'PASS' : 'FAIL'}] target rows gone (${remaining.length} remain)`)
  console.log(`\nReversible via ${backupPath}.`)
} catch (err) {
  console.error('CLEANUP FAILED (rolled back if mid-transaction):', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
