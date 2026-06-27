#!/usr/bin/env node
/*
 * DIAGNOSTIC ONLY (no writes). Scan every vex_pis row and reconcile its
 * payment_received_amount against the REAL payment_logs its payment_log_ids
 * reference. Flags the over-count defects that inflate a VEX PI balance.
 *
 * TWO distinct over-count mechanisms (both produce received = k x total):
 *
 *   DANGLING-OVERCOUNT (the VEXPI-UP-26-27-020 bug): pre-fix retries each ran
 *     recordVexPayment (increment + append a logId) BEFORE the throwing
 *     enqueue, so the balance grew k times while NO payment_log ever persisted
 *     -> received = k x total AND the appended log ids are DANGLING (reference
 *     no payment_logs rows). Detect: dangling ids + stated >> reconciled.
 *
 *   DUP-LOGS-OVERCOUNT (the VEXPI-UP-26-27-013 / Funscholar bug): the SAME bank
 *     receipt was logged twice (the VEX payment route has no dedup; the finance
 *     dedup keys on reference+amount+DATE, so a re-entry on a different day slips
 *     through). BOTH payment_logs persisted, so received reconciles to them
 *     (stated == reconciled) and the OLD dangling-only scan called it CLEAN.
 *     Detect: the PI's PRESENT logs contain a duplicate receipt group (same
 *     real bank reference + amount appearing 2+ times). THIS is what the prior
 *     scan missed.
 *
 * Plus the benign / review classes:
 *   MISSING-LOGS  - balance ~1x but log ids dangling (historical shape mismatch;
 *                   balance correct, only the payment_logs rows are absent).
 *   OVERPAID-REVIEW - stated > total with no dup receipts + no dangling (a
 *                   genuine over-payment or an unexplained inflation; eyeball it).
 *
 * "reconciled" = SUM(amount) of the payment_logs rows that actually exist among
 * this PI's payment_log_ids. Dangling ids contribute nothing.
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

// A bank reference uniquely identifies a transaction. Placeholders ('NA', '-',
// blank, ...) do NOT, so two logs that both carry a placeholder ref are not a
// duplicate just because they share it.
const PLACEHOLDER_REFS = new Set(['', 'na', 'n/a', '-', '--', 'nil', 'none', 'null'])
const normRef = (r) => (r ?? '').trim().toLowerCase()
const isRealRef = (r) => !PLACEHOLDER_REFS.has(normRef(r))

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // Voided PIs (Pass 2) are excluded: their balance is zeroed + ids cleared.
  const pis = await sql`SELECT id, school_name, total, status, payment_received_amount, payment_log_ids FROM vex_pis WHERE voided_at IS NULL ORDER BY id`
  const logs = await sql`SELECT id, amount, reference, date FROM payment_logs`
  const logById = new Map(logs.map(r => [r.id, { amount: n(r.amount), reference: r.reference, date: r.date }]))

  console.log(`Scanned ${pis.length} vex_pis against ${logs.length} payment_logs rows.\n`)

  const rows = []
  for (const p of pis) {
    const ids = Array.isArray(p.payment_log_ids) ? p.payment_log_ids : []
    const presentLogs = ids.filter(id => logById.has(id)).map(id => ({ id, ...logById.get(id) }))
    const dangling = ids.filter(id => !logById.has(id))
    const stated = n(p.payment_received_amount)
    const reconciled = presentLogs.reduce((s, l) => s + l.amount, 0)
    const total = n(p.total)
    const ratio = total > 0 ? stated / total : null
    const nearInt = ratio !== null ? Math.abs(ratio - Math.round(ratio)) <= 0.02 : false
    const multiple = ratio !== null && nearInt ? Math.round(ratio) : null

    // duplicate-receipt detection among PRESENT logs: same real reference +
    // (nearly) same amount appearing 2+ times = the same receipt logged twice.
    const groups = new Map()
    for (const l of presentLogs) {
      if (!isRealRef(l.reference)) continue
      const key = `${normRef(l.reference)}::${Math.round(l.amount * 100)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(l)
    }
    const dupGroups = [...groups.values()].filter(g => g.length > 1)
    const dupExtraIds = dupGroups.flatMap(g => g.slice(1).map(l => l.id)) // surplus copies
    const dupExtraAmount = dupGroups.reduce((s, g) => s + g.slice(1).reduce((t, l) => t + l.amount, 0), 0)

    let cls = 'CLEAN'
    if (stated === 0 && ids.length === 0) cls = 'UNPAID'
    else if (dupGroups.length > 0) cls = 'DUP-LOGS-OVERCOUNT'
    else if (multiple !== null && multiple >= 2 && dangling.length >= 1) cls = 'DANGLING-OVERCOUNT'
    else if (dangling.length > 0 && Math.abs(reconciled - stated) > 0.01) cls = 'MISSING-LOGS'
    else if (Math.abs(reconciled - stated) <= 0.01 && stated <= total * 1.02 + 1) cls = 'CLEAN'
    else if (stated > total * 1.02 + 1) cls = 'OVERPAID-REVIEW'
    else cls = 'REVIEW'

    rows.push({
      id: p.id, school: (p.school_name || '').slice(0, 28), total, stated, reconciled,
      discrepancy: stated - reconciled, idCount: ids.length, dangling: dangling.length,
      present: presentLogs.length, ratio, multiple, status: p.status, cls,
      dupGroups, dupExtraIds, dupExtraAmount,
    })
  }

  // --- full table ---
  const hdr = ['PI id', 'stated recv', 'reconciled', 'discrepancy', 'dang/ids', 'total', 'x', 'class']
  const pad = (s, w) => String(s).padEnd(w)
  const padN = (s, w) => String(s).padStart(w)
  console.log([pad(hdr[0], 22), padN(hdr[1], 13), padN(hdr[2], 13), padN(hdr[3], 13), padN(hdr[4], 9), padN(hdr[5], 13), padN(hdr[6], 4), '  ' + hdr[7]].join(''))
  console.log('-'.repeat(120))
  for (const r of rows) {
    console.log([
      pad(r.id, 22), padN(fmt(r.stated), 13), padN(fmt(r.reconciled), 13),
      padN(fmt(r.discrepancy), 13), padN(r.dangling + '/' + r.idCount, 9),
      padN(fmt(r.total), 13), padN(r.multiple ? r.multiple + 'x' : (r.ratio !== null ? r.ratio.toFixed(2) : '-'), 4),
      '  ' + r.cls,
    ].join(''))
  }

  // --- summaries ---
  const byClass = {}
  for (const r of rows) byClass[r.cls] = (byClass[r.cls] || 0) + 1
  console.log('\n=== class counts ===')
  for (const [k, v] of Object.entries(byClass)) console.log(`  ${k}: ${v}`)

  const dupOver = rows.filter(r => r.cls === 'DUP-LOGS-OVERCOUNT')
  console.log(`\n=== DUP-LOGS-OVERCOUNT (Funscholar class: duplicate receipt logged twice; NEEDS recovery) ===`)
  if (!dupOver.length) console.log('  NONE.')
  for (const r of dupOver) {
    console.log(`  ${r.id} (${r.school}): stated ${fmt(r.stated)} vs total ${fmt(r.total)} (${r.multiple ? r.multiple + 'x' : r.ratio?.toFixed(2)}); over-count Rs ${fmt(r.dupExtraAmount)}`)
    for (const g of r.dupGroups) {
      console.log(`      dup receipt x${g.length}: ref="${(g[0].reference || '').slice(0, 50)}" amount ${fmt(g[0].amount)} -> ids [${g.map(l => l.id).join(', ')}]; surplus ids to drop: [${g.slice(1).map(l => l.id).join(', ')}]`)
    }
  }

  const dangOver = rows.filter(r => r.cls === 'DANGLING-OVERCOUNT')
  console.log(`\n=== DANGLING-OVERCOUNT (VEXPI-UP-26-27-020 class: increment-without-persisted-log; NEEDS recovery) ===`)
  if (!dangOver.length) console.log('  NONE.')
  for (const r of dangOver) {
    console.log(`  ${r.id} (${r.school}): stated ${fmt(r.stated)} = ${r.multiple}x total ${fmt(r.total)}; ${r.dangling} dangling ids; over-count Rs ${fmt(r.stated - r.total)}`)
  }

  const missing = rows.filter(r => r.cls === 'MISSING-LOGS')
  console.log(`\n=== MISSING-LOGS (balance ~correct, no payment_logs row; benign backfill, NOT over-count) ===`)
  console.log(`  count: ${missing.length}  (total stated across them: Rs ${fmt(missing.reduce((s, r) => s + r.stated, 0))})`)
  for (const r of missing) console.log(`    ${r.id}: stated ${fmt(r.stated)}, dangling ${r.dangling}/${r.idCount}`)

  const overpaid = rows.filter(r => r.cls === 'OVERPAID-REVIEW')
  if (overpaid.length) {
    console.log(`\n=== OVERPAID-REVIEW (stated > total, no dup receipts + no dangling; eyeball) ===`)
    for (const r of overpaid) console.log(`  ${r.id}: stated ${fmt(r.stated)}, total ${fmt(r.total)}, ratio ${r.ratio?.toFixed(3)}, dangling ${r.dangling}/${r.idCount}`)
  }

  const review = rows.filter(r => r.cls === 'REVIEW')
  if (review.length) {
    console.log(`\n=== REVIEW (does not cleanly fit any pattern) ===`)
    for (const r of review) console.log(`  ${r.id}: stated ${fmt(r.stated)}, reconciled ${fmt(r.reconciled)}, total ${fmt(r.total)}, dangling ${r.dangling}/${r.idCount}, ratio ${r.ratio?.toFixed(3)}`)
  }

  const recoverNeeded = dupOver.length + dangOver.length
  console.log(`\n=== TOTAL PIs needing over-count recovery: ${recoverNeeded} ===`)
} catch (err) {
  console.error('DIAGNOSTIC FAILED:', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
