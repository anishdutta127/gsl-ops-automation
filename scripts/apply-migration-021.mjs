#!/usr/bin/env node
/*
 * Gated apply for migration 021 (vex_pis + vex_dispatches soft-delete tombstone).
 * DRY RUN by default; --apply runs 021-vex-void.sql (additive ADD COLUMN IF NOT
 * EXISTS, reversible via the .down.sql) then verifies the six columns exist.
 * Additive nullable columns: no row backup needed.
 *
 * Usage:
 *   node scripts/apply-migration-021.mjs           # dry run (reads only)
 *   node scripts/apply-migration-021.mjs --apply    # apply + verify
 */
import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const TARGETS = [
  ['vex_pis', ['voided_at', 'voided_by', 'void_reason']],
  ['vex_dispatches', ['voided_at', 'voided_by', 'void_reason']],
]
const SQL_FILE = 'scripts/migrations/021-vex-void.sql'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
const colsOf = async (table, cols) =>
  (await sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table} AND column_name = ANY(${cols})`).map(r => r.column_name)

try {
  console.log(`host: ${process.env.DATABASE_URL.match(/@([^/]+)/)?.[1] ?? '(unknown)'}`)
  for (const [t, cols] of TARGETS) {
    const present = await colsOf(t, cols)
    const n = (await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`))[0].n
    console.log(`\n${t} (${n} rows): present BEFORE: ${present.length ? present.join(', ') : '(none)'}`)
    console.log('  planned: ' + cols.filter(c => !present.includes(c)).map(c => `ADD ${c}`).join(', '))
  }

  if (!APPLY) {
    console.log(`\nDRY RUN. No writes. Re-run with --apply to run ${SQL_FILE} + verify.`)
    process.exit(0)
  }

  console.log(`\napplying ${SQL_FILE} ...`)
  await sql.unsafe(readFileSync(SQL_FILE, 'utf8'), [], { prepare: false })

  console.log('\n=== VERIFY (after) ===')
  let allOk = true
  for (const [t, cols] of TARGETS) {
    const after = await colsOf(t, cols)
    for (const c of cols) {
      const ok = after.includes(c)
      if (!ok) allOk = false
      console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${t}.${c}`)
    }
  }
  console.log(`\n${allOk ? 'ALL COLUMNS PRESENT. Migration 021 applied.' : 'FAILED: some columns missing.'}`)
  if (!allOk) process.exit(1)
} catch (err) {
  console.error('FAILED:', err.message); process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
