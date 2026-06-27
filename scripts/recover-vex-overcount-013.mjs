#!/usr/bin/env node
/*
 * VEX over-count recovery: VEXPI-UP-26-27-013 (Funscholar Innovations Pvt Ltd).
 * GATED prod DB write -- DRY RUN by default; requires owner go for --apply.
 *
 * CLASS: DUP-LOGS-OVERCOUNT (the NEW Funscholar mechanism, DISTINCT from the
 * VEXPI-UP-26-27-020 dangling-id class). The SAME bank receipt
 * (ref INF/INFT/044632377521/..., Rs 4,10,516) was logged TWICE by Anita C. on
 * two consecutive days:
 *     VEXPL-800ecbea  date 2026-06-26  (KEEP - the first/original entry)
 *     VEXPL-864a741b  date 2026-06-27  (DROP - the duplicate re-entry)
 * BOTH payment_logs PERSISTED (not dangling), so payment_received_amount =
 * Rs 8,21,032 = 2.00x the Rs 4,10,516 PI total. Unlike 020 there IS a real row
 * to delete (the surplus payment_log), not just a dangling id to drop.
 *
 * FIX (one transaction):
 *   1. DELETE payment_logs VEXPL-864a741b (the duplicate row).
 *   2. UPDATE vex_pis VEXPI-UP-26-27-013:
 *        payment_received_amount = 410516  (1x, the single real receipt),
 *        payment_log_ids = ['VEXPL-800ecbea']  (drop the duplicate's id),
 *        status -> the genuine single-payment state (see TARGET_STATUS below),
 *        audit_log += a recovery entry.
 *   The keeper VEXPL-800ecbea is left untouched.
 *
 * STATUS NOTE for the owner: a single Rs 4,10,516 receipt is Rs 0.10 short of
 * the Rs 4,10,516.10 PI total (a GST-rounding artifact). The PI's OWN audit log
 * shows that after the first genuine payment the system set status to
 * 'Payment Pending' (4,10,516 < 4,10,516.10). The duplicate then pushed it to
 * 'Delivery Pending'. This script restores the faithful single-payment status
 * 'Payment Pending' by default. If you consider the invoice effectively paid
 * (the 0.10 is rounding noise) and want it to stay 'Delivery Pending', say so
 * and I will set TARGET_STATUS = 'Delivery Pending' before --apply.
 *
 * SAFETY: default DRY RUN. Hard pre-flight aborts unless live prod still equals
 * the reviewed pre-state (received 8,21,032; the two ids; BOTH present as real
 * payment_logs; identical reference+amount = genuinely the same receipt). One
 * sql.begin txn. Backs up the vex_pi row + BOTH payment_log rows first, so the
 * delete is reversible. Verifies 11 invariants incl. "nothing else moved".
 *
 * Usage:
 *   node scripts/recover-vex-overcount-013.mjs           # dry run (reads only)
 *   node scripts/recover-vex-overcount-013.mjs --apply    # backup + apply + verify
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const RECOVERED_AT = '2026-06-27T00:00:00.000Z'
const PI_ID = 'VEXPI-UP-26-27-013'
const KEEP_LOG_ID = 'VEXPL-800ecbea' // first entry, date 2026-06-26
const DROP_LOG_ID = 'VEXPL-864a741b' // duplicate re-entry, date 2026-06-27
const REAL_RECEIPT = 410516 // the single real receipt
const EXPECTED_RECEIVED = 821032 // current (over-counted) balance
const EXPECTED_IDS = [KEEP_LOG_ID, DROP_LOG_ID]
// Owner decision 2026-06-27: treat the Rs 0.10 shortfall as GST-rounding noise,
// i.e. the invoice is effectively paid, so the PI stays 'Delivery Pending' (the
// single real receipt fully covers it; dispatch remains unblocked). See STATUS NOTE.
const TARGET_STATUS = 'Delivery Pending'

// --- env + Windows DNS fallback (same pattern as recover-vex-overcount.mjs) ---
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // ===== PRE-FLIGHT =====
  const live = (await sql`SELECT * FROM vex_pis WHERE id = ${PI_ID}`)[0]
  if (!live) { console.error(`ABORT: ${PI_ID} not found in prod.`); process.exit(1) }
  const liveReceived = Number(live.payment_received_amount)
  const liveIds = Array.isArray(live.payment_log_ids) ? live.payment_log_ids : []
  const total = Number(live.total)
  console.log('=== live prod (before) ===')
  console.log(`  payment_received_amount: ${liveReceived}  (expected ${EXPECTED_RECEIVED})`)
  console.log(`  payment_log_ids: ${JSON.stringify(liveIds)}`)
  console.log(`  status: ${live.status}   total: ${total}`)

  const keep = (await sql`SELECT * FROM payment_logs WHERE id = ${KEEP_LOG_ID}`)[0]
  const drop = (await sql`SELECT * FROM payment_logs WHERE id = ${DROP_LOG_ID}`)[0]
  console.log('\n=== the two payment_logs ===')
  console.log(`  KEEP ${KEEP_LOG_ID}: amount ${keep && fmt(keep.amount)} date ${keep && keep.date} ref "${keep && keep.reference}"`)
  console.log(`  DROP ${DROP_LOG_ID}: amount ${drop && fmt(drop.amount)} date ${drop && drop.date} ref "${drop && drop.reference}"`)

  const drift = []
  if (liveReceived !== EXPECTED_RECEIVED) drift.push(`received ${liveReceived} != ${EXPECTED_RECEIVED}`)
  if (!arrEq(liveIds, EXPECTED_IDS)) drift.push(`payment_log_ids ${JSON.stringify(liveIds)} != ${JSON.stringify(EXPECTED_IDS)}`)
  if (!keep) drift.push(`keeper ${KEEP_LOG_ID} missing`)
  if (!drop) drift.push(`duplicate ${DROP_LOG_ID} missing (already removed?)`)
  // confirm the two are genuinely the SAME receipt (same real reference + amount)
  if (keep && drop) {
    if ((keep.reference ?? '').trim() === '' || keep.reference !== drop.reference)
      drift.push(`references differ or blank: "${keep.reference}" vs "${drop.reference}" -- NOT a safe duplicate`)
    if (Math.abs(Number(keep.amount) - Number(drop.amount)) >= 0.01)
      drift.push(`amounts differ: ${keep.amount} vs ${drop.amount}`)
    if (Number(drop.amount) !== REAL_RECEIPT)
      drift.push(`duplicate amount ${drop.amount} != expected real receipt ${REAL_RECEIPT}`)
  }
  if (drift.length) { console.error('\nABORT: live prod drifted from the reviewed pre-state:\n  ' + drift.join('\n  ')); process.exit(1) }

  // "nothing else moved" baseline
  const vexBefore = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plIdsBefore = (await sql`SELECT id FROM payment_logs ORDER BY id`).map(r => r.id)
  const sumBefore = Number((await sql`SELECT COALESCE(SUM(payment_received_amount),0)::text AS s FROM vex_pis`)[0].s)
  console.log(`\n  globals before: vex_pis=${vexBefore.length}, payment_logs=${plIdsBefore.length}, SUM(received)=${sumBefore}`)

  console.log('\n=== PLANNED WRITES ===')
  console.log(`  - payment_logs DELETE ${DROP_LOG_ID} (the duplicate re-entry; backed up first)`)
  console.log(`  ~ vex_pis ${PI_ID}: received ${liveReceived} -> ${REAL_RECEIPT}; payment_log_ids ${JSON.stringify(liveIds)} -> ['${KEEP_LOG_ID}']; status ${live.status} -> ${TARGET_STATUS}; +1 audit entry`)
  console.log(`  expected SUM(received) after: ${sumBefore} - ${liveReceived - REAL_RECEIPT} = ${sumBefore - (liveReceived - REAL_RECEIPT)}`)

  if (!APPLY) {
    console.log('\nDRY RUN complete. No writes. Re-run with --apply (after owner go) to back up + apply + verify.')
    process.exit(0)
  }

  // ===== APPLY =====
  mkdirSync('.recovery-backup', { recursive: true })
  const backupPath = join('.recovery-backup', `vex-${PI_ID}-pre.json`)
  writeFileSync(backupPath, JSON.stringify({ at: RECOVERED_AT, vex_pi: live, keep_log: keep, dropped_log: drop }, null, 2))
  console.log(`\nbackup (full pre-state, incl. the dropped row): ${backupPath}`)

  const piAudit = {
    timestamp: RECOVERED_AT,
    user: 'sync-recovery',
    action: 'payment-overcount-recovery',
    before: { paymentReceivedAmount: EXPECTED_RECEIVED, paymentLogIds: EXPECTED_IDS, status: live.status },
    after: { paymentReceivedAmount: REAL_RECEIPT, paymentLogIds: [KEEP_LOG_ID], status: TARGET_STATUS },
    notes:
      `VEX over-count recovery (Funscholar, owner go ${RECOVERED_AT.slice(0, 10)}). The same NEFT receipt ` +
      `(ref ${keep.reference}, Rs ${fmt(REAL_RECEIPT)}) was logged twice (${KEEP_LOG_ID} on ${keep.date}, ` +
      `${DROP_LOG_ID} on ${drop.date}), over-counting payment_received_amount to Rs ${fmt(EXPECTED_RECEIVED)} (2x). ` +
      `Deleted the duplicate payment_log ${DROP_LOG_ID}; reset balance to the single real receipt; kept ${KEEP_LOG_ID}. ` +
      `Reversible via ${backupPath}.`,
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM payment_logs WHERE id = ${DROP_LOG_ID}`
    await tx`
      UPDATE vex_pis SET
        payment_received_amount = ${REAL_RECEIPT},
        payment_log_ids = ${tx.json([KEEP_LOG_ID])}::jsonb,
        status = ${TARGET_STATUS},
        audit_log = audit_log || ${tx.json([piAudit])}::jsonb
      WHERE id = ${PI_ID}
    `
  })
  console.log('APPLY complete (transaction committed).')

  // ===== VERIFY =====
  console.log('\n=== VERIFY (after) ===')
  const after = (await sql`SELECT * FROM vex_pis WHERE id = ${PI_ID}`)[0]
  const aReceived = Number(after.payment_received_amount)
  const aIds = Array.isArray(after.payment_log_ids) ? after.payment_log_ids : []
  const keepAfter = (await sql`SELECT * FROM payment_logs WHERE id = ${KEEP_LOG_ID}`)[0]
  const dropAfter = (await sql`SELECT id FROM payment_logs WHERE id = ${DROP_LOG_ID}`)[0]
  const vexAfter = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plIdsAfter = (await sql`SELECT id FROM payment_logs ORDER BY id`).map(r => r.id)
  const sumAfter = Number((await sql`SELECT COALESCE(SUM(payment_received_amount),0)::text AS s FROM vex_pis`)[0].s)

  const checks = []
  const ok = (label, cond, got) => { checks.push({ pass: !!cond }); console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${got !== undefined ? `  (${got})` : ''}`) }

  ok(`payment_received_amount = ${REAL_RECEIPT} (1x, not ${EXPECTED_RECEIVED})`, aReceived === REAL_RECEIPT, aReceived)
  ok(`payment_log_ids = ['${KEEP_LOG_ID}']`, arrEq(aIds, [KEEP_LOG_ID]), JSON.stringify(aIds))
  ok(`duplicate ${DROP_LOG_ID} deleted`, !dropAfter, dropAfter ? 'still present' : 'gone')
  ok(`keeper ${KEEP_LOG_ID} intact (amount ${REAL_RECEIPT})`, keepAfter && Number(keepAfter.amount) === REAL_RECEIPT, keepAfter && Number(keepAfter.amount))
  ok(`status = ${TARGET_STATUS}`, after.status === TARGET_STATUS, after.status)
  ok(`vex_pis row count unchanged`, vexAfter.length === vexBefore.length, `${vexBefore.length} -> ${vexAfter.length}`)
  ok(`payment_logs count = before - 1`, plIdsAfter.length === plIdsBefore.length - 1, `${plIdsBefore.length} -> ${plIdsAfter.length}`)
  ok(`payment_logs delta = only -${DROP_LOG_ID} (no other change)`, arrEq(plIdsBefore.filter(x => x !== DROP_LOG_ID), plIdsAfter), undefined)
  ok(`SUM(received) dropped by exactly ${EXPECTED_RECEIVED - REAL_RECEIPT}`, sumAfter === sumBefore - (EXPECTED_RECEIVED - REAL_RECEIPT), `${sumBefore} -> ${sumAfter}`)

  const beforeMap = new Map(vexBefore.map(r => [r.id, `${r.rcv}|${r.status}`]))
  let otherMoved = 0
  for (const r of vexAfter) {
    if (r.id === PI_ID) continue
    if (beforeMap.get(r.id) !== `${r.rcv}|${r.status}`) { otherMoved++; console.log(`    moved: ${r.id} ${beforeMap.get(r.id)} -> ${r.rcv}|${r.status}`) }
  }
  ok(`no other vex_pis row changed`, otherMoved === 0, `${otherMoved} others moved`)

  const failed = checks.filter(c => !c.pass)
  console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASS' : `${failed.length} CHECK(S) FAILED`}  (${checks.length - failed.length}/${checks.length})`)
  console.log(`Reversible via ${backupPath} (full pre-state incl. the deleted payment_log row).`)
  if (failed.length) process.exit(1)
} catch (err) {
  console.error('RECOVERY FAILED (rolled back if mid-transaction):', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
