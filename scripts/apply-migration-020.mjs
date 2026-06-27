#!/usr/bin/env node
/*
 * Gated apply for migration 020 (payment_logs soft-delete tombstone columns).
 * DRY RUN by default: shows current state + planned ALTER, writes nothing.
 * --apply runs 020-payment-log-void.sql (additive ADD COLUMN IF NOT EXISTS,
 * reversible via the .down.sql) then verifies the three columns exist.
 *
 * Additive nullable columns: no row backup needed (no existing data changes;
 * reversal is the down migration).
 *
 * Usage:
 *   node scripts/apply-migration-020.mjs           # dry run (reads only)
 *   node scripts/apply-migration-020.mjs --apply    # apply + verify
 */
import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const COLS = ['voided_at', 'voided_by', 'void_reason']
const SQL_FILE = 'scripts/migrations/020-payment-log-void.sql'

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
  const present = (await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'payment_logs' AND column_name = ANY(${COLS})
  `).map(r => r.column_name)
  console.log(`host: ${process.env.DATABASE_URL.match(/@([^/]+)/)?.[1] ?? '(unknown)'}`)
  console.log(`payment_logs rows: ${(await sql`SELECT count(*)::int AS n FROM payment_logs`)[0].n}`)
  console.log(`\ntarget columns present BEFORE: ${present.length ? present.join(', ') : '(none)'}`)
  console.log('planned: ' + COLS.filter(c => !present.includes(c)).map(c => `ADD COLUMN ${c}`).join(', '))

  if (!APPLY) {
    console.log(`\nDRY RUN. No writes. Re-run with --apply to run ${SQL_FILE} + verify.`)
    process.exit(0)
  }

  console.log(`\napplying ${SQL_FILE} ...`)
  await sql.unsafe(readFileSync(SQL_FILE, 'utf8'), [], { prepare: false })

  const after = (await sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'payment_logs' AND column_name = ANY(${COLS})
    ORDER BY column_name
  `)
  console.log('\n=== VERIFY (after) ===')
  for (const c of COLS) {
    const row = after.find(r => r.column_name === c)
    console.log(`  [${row ? 'PASS' : 'FAIL'}] ${c}${row ? ` (${row.data_type}, nullable=${row.is_nullable})` : ' MISSING'}`)
  }
  const ok = COLS.every(c => after.some(r => r.column_name === c))
  console.log(`\n${ok ? 'ALL COLUMNS PRESENT. Migration 020 applied.' : 'FAILED: some columns missing.'}`)
  if (!ok) process.exit(1)
} catch (err) {
  console.error('FAILED:', err.message); process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
