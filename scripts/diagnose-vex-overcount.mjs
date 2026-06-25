#!/usr/bin/env node
/*
 * DIAGNOSTIC ONLY (no writes). Scan every vex_pis row and reconcile its
 * payment_received_amount against the REAL payment_logs its payment_log_ids
 * reference. Flags the two distinct defects:
 *
 *   OVER-COUNT (the VEXPI-UP-26-27-020 bug): received is an integer multiple
 *     (>=2x) of the PI total AND the log ids are dangling -> pre-fix retries
 *     each re-incremented received + appended a logId that never persisted.
 *
 *   MISSING-LOGS (benign, separate backfill): received reconciles to ~1x but
 *     the payment_log_ids are dangling -> the historical VEX payload<->log
 *     shape mismatch meant no payment_log was ever written; the BALANCE is
 *     correct, only the log rows are absent. NOT an over-count.
 *
 * "reconciled received" = SUM(amount) of the payment_logs rows that actually
 * exist among this PI's payment_log_ids. Dangling ids contribute nothing.
 *
 * Usage: node scripts/diagnose-vex-overcount.mjs
 */
import { readFileSync } from 'node:fs'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const n = (v) => v === null || v === undefined ? 0 : Number(v)
const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  const pis = await sql`SELECT id, school_name, total, status, payment_received_amount, payment_log_ids FROM vex_pis ORDER BY id`
  const logs = await sql`SELECT id, amount FROM payment_logs`
  const logById = new Map(logs.map(r => [r.id, n(r.amount)]))

  console.log(`Scanned ${pis.length} vex_pis against ${logs.length} payment_logs rows.\n`)

  const rows = []
  for (const p of pis) {
    const ids = Array.isArray(p.payment_log_ids) ? p.payment_log_ids : []
    const present = ids.filter(id => logById.has(id))
    const dangling = ids.filter(id => !logById.has(id))
    const stated = n(p.payment_received_amount)
    const reconciled = present.reduce((s, id) => s + logById.get(id), 0)
    const total = n(p.total)
    const ratio = total > 0 ? stated / total : null
    const nearInt = ratio !== null ? Math.abs(ratio - Math.round(ratio)) <= 0.02 : false
    const multiple = ratio !== null && nearInt ? Math.round(ratio) : null

    let cls = 'CLEAN'
    if (stated === 0 && ids.length === 0) cls = 'UNPAID'
    else if (multiple !== null && multiple >= 2 && dangling.length >= 2) cls = 'OVER-COUNT'
    else if (dangling.length > 0 && reconciled !== stated) cls = 'MISSING-LOGS'
    else if (reconciled === stated) cls = 'CLEAN'
    else cls = 'REVIEW'

    rows.push({
      id: p.id, school: (p.school_name || '').slice(0, 28), total, stated, reconciled,
      discrepancy: stated - reconciled, idCount: ids.length, dangling: dangling.length,
      present: present.length, ratio, multiple, status: p.status, cls,
    })
  }

  // --- full table ---
  const hdr = ['PI id', 'stated recv', 'reconciled', 'discrepancy', 'dangling', 'total', 'x', 'class']
  const pad = (s, w) => String(s).padEnd(w)
  const padN = (s, w) => String(s).padStart(w)
  console.log([pad(hdr[0], 22), padN(hdr[1], 13), padN(hdr[2], 12), padN(hdr[3], 13), padN(hdr[4], 9), padN(hdr[5], 12), padN(hdr[6], 4), '  ' + hdr[7]].join(''))
  console.log('-'.repeat(110))
  for (const r of rows) {
    console.log([
      pad(r.id, 22), padN(fmt(r.stated), 13), padN(fmt(r.reconciled), 12),
      padN(fmt(r.discrepancy), 13), padN(r.dangling + '/' + r.idCount, 9),
      padN(fmt(r.total), 12), padN(r.multiple ? r.multiple + 'x' : (r.ratio !== null ? r.ratio.toFixed(2) : '-'), 4),
      '  ' + r.cls,
    ].join(''))
  }

  // --- summaries ---
  const byClass = {}
  for (const r of rows) byClass[r.cls] = (byClass[r.cls] || 0) + 1
  console.log('\n=== class counts ===')
  for (const [k, v] of Object.entries(byClass)) console.log(`  ${k}: ${v}`)

  const overcount = rows.filter(r => r.cls === 'OVER-COUNT')
  console.log(`\n=== OVER-COUNT (same defect as VEXPI-UP-26-27-020; would need recovery) ===`)
  if (!overcount.length) console.log('  NONE.')
  for (const r of overcount) {
    console.log(`  ${r.id} (${r.school}): stated ${fmt(r.stated)} = ${r.multiple}x total ${fmt(r.total)}; ${r.dangling} dangling ids; over-count Rs ${fmt(r.stated - r.total)}`)
  }

  const missing = rows.filter(r => r.cls === 'MISSING-LOGS')
  console.log(`\n=== MISSING-LOGS (balance ~correct, no payment_logs row; benign backfill, NOT over-count) ===`)
  console.log(`  count: ${missing.length}  (total stated across them: Rs ${fmt(missing.reduce((s, r) => s + r.stated, 0))})`)

  const review = rows.filter(r => r.cls === 'REVIEW')
  if (review.length) {
    console.log(`\n=== REVIEW (does not cleanly fit either pattern) ===`)
    for (const r of review) console.log(`  ${r.id}: stated ${fmt(r.stated)}, reconciled ${fmt(r.reconciled)}, total ${fmt(r.total)}, dangling ${r.dangling}/${r.idCount}, ratio ${r.ratio?.toFixed(3)}`)
  }
} catch (err) {
  console.error('DIAGNOSTIC FAILED:', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
