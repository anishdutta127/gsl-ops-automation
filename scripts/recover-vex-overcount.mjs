#!/usr/bin/env node
/*
 * Phase 3 gated unwind 3/3: VEX payment over-count recovery.
 * Target: VexPi VEXPI-UP-26-27-020 (St. Paul's Boarding And Day School).
 * AUTHORISED prod DB write (owner go 2026-06-25). Reviewed dry-run + backup.
 *
 * CAUSE: 5 pre-fix retries each ran recordVexPayment (+Rs 6,32,931 and appended
 * a payment_log_id) BEFORE the throwing enqueue, so payment_received_amount was
 * over-counted to Rs 31,64,655 (= 5.00x the Rs 6,32,931 real receipt) and the 5
 * appended payment_log_ids are all DANGLING (reference no payment_logs rows;
 * nothing was ever persisted to payment_logs).
 *
 * FIX (one transaction):
 *   1. Create ONE real payment_log VEXPL-RECOV-UP2627020 (Rs 6,32,931, Bank
 *      Transfer, ref NA, unmatched=false) reconstructing the single real entry.
 *   2. UPDATE vex_pis VEXPI-UP-26-27-020:
 *        payment_received_amount = 632931 (1x, not 31,64,655),
 *        payment_log_ids = ['VEXPL-RECOV-UP2627020'] (the 5 dangling ids dropped),
 *        status preserved (632931 >= total 632930.76 -> 'Delivery Pending'),
 *        audit_log += a recovery entry.
 *   There is NOTHING to delete in payment_logs (the 5 ids never existed there).
 *
 * SAFETY: default = DRY RUN (no writes). Hard pre-flight guards abort if live
 * prod has drifted from the reviewed backup pre-state (received != 31,64,655,
 * the 5 ids differ, any of the 5 unexpectedly has a payment_logs row, or the
 * recovery row already exists). Pass --apply to write inside one transaction,
 * then the script verifies the result and confirms nothing else moved.
 * Reversible via .recovery-backup/vex-VEXPI-UP-26-27-020-pre.json.
 *
 * Usage:
 *   node scripts/recover-vex-overcount.mjs          # dry run (reads only)
 *   node scripts/recover-vex-overcount.mjs --apply   # backup + apply + verify
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const RECOVERED_AT = '2026-06-25T00:00:00.000Z'
const PI_ID = 'VEXPI-UP-26-27-020'
const NEW_LOG_ID = 'VEXPL-RECOV-UP2627020'
const REAL_RECEIPT = 632931 // bank 632931 + TDS 0; the single real entry
const RECEIPT_DATE = '2026-06-24' // PI generated + payment recorded 2026-06-24

// --- env + Windows DNS fallback (same pattern as recover-stuck-queue.mjs) ---
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

// --- reviewed pre-state from the backup taken at dry-run time ---
const backup = JSON.parse(readFileSync('.recovery-backup/vex-VEXPI-UP-26-27-020-pre.json', 'utf8'))
const pre = backup[0]
if (!pre || pre.id !== PI_ID) { console.error(`backup mismatch: expected ${PI_ID}`); process.exit(1) }
const EXPECTED_RECEIVED = Number(pre.payment_received_amount) // 3164655
const EXPECTED_LOG_IDS = pre.payment_log_ids // the 5 dangling ids
const TOTAL = Number(pre.total) // 632930.76
console.log(`Reviewed pre-state (backup): received ${EXPECTED_RECEIVED}, ${EXPECTED_LOG_IDS.length} log ids, total ${TOTAL}, status ${pre.status}`)

const arrEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // ===== PRE-FLIGHT: live prod must equal the reviewed pre-state =====
  const live = (await sql`SELECT * FROM vex_pis WHERE id = ${PI_ID}`)[0]
  if (!live) { console.error(`ABORT: ${PI_ID} not found in prod.`); process.exit(1) }
  const liveReceived = Number(live.payment_received_amount)
  const liveIds = Array.isArray(live.payment_log_ids) ? live.payment_log_ids : []
  console.log('\n=== live prod (before) ===')
  console.log(`  payment_received_amount: ${liveReceived}  (expected ${EXPECTED_RECEIVED})`)
  console.log(`  payment_log_ids: ${JSON.stringify(liveIds)}`)
  console.log(`  status: ${live.status}   total: ${Number(live.total)}`)

  const drift = []
  if (liveReceived !== EXPECTED_RECEIVED) drift.push(`received ${liveReceived} != ${EXPECTED_RECEIVED}`)
  if (!arrEq(liveIds, EXPECTED_LOG_IDS)) drift.push(`payment_log_ids differ from backup`)
  if (drift.length) { console.error('\nABORT: live prod drifted from the reviewed pre-state:\n  ' + drift.join('\n  ')); process.exit(1) }

  // the 5 ids must be dangling (no payment_logs rows); recovery row must not exist yet
  const danglingRows = await sql`SELECT id FROM payment_logs WHERE id = ANY(${liveIds})`
  console.log(`\n  payment_logs rows for the 5 ids: ${danglingRows.length} (expected 0 = all dangling)`)
  if (danglingRows.length !== 0) { console.error(`ABORT: ${danglingRows.length} of the 5 ids unexpectedly have payment_logs rows: ${danglingRows.map(r => r.id).join(', ')}`); process.exit(1) }
  const already = await sql`SELECT id FROM payment_logs WHERE id = ${NEW_LOG_ID}`
  if (already.length) { console.error(`ABORT: ${NEW_LOG_ID} already exists (already applied?).`); process.exit(1) }

  // status recompute (mirrors recordVexPayment): paid -> preserve, else Delivery Pending
  const newStatus = REAL_RECEIPT >= TOTAL
    ? (live.status === 'Completed' ? 'Completed' : 'Delivery Pending')
    : (live.status === 'Generated' ? 'Payment Pending' : live.status)

  // global "nothing else moved" baseline
  const vexBefore = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plIdsBefore = (await sql`SELECT id FROM payment_logs ORDER BY id`).map(r => r.id)
  const sumBefore = Number((await sql`SELECT COALESCE(SUM(payment_received_amount),0)::text AS s FROM vex_pis`)[0].s)
  console.log(`\n  globals before: vex_pis=${vexBefore.length}, payment_logs=${plIdsBefore.length}, SUM(received)=${sumBefore}`)

  console.log('\n=== PLANNED WRITES ===')
  console.log(`  + payment_logs INSERT ${NEW_LOG_ID}: amount ${REAL_RECEIPT}, mode Bank Transfer, ref NA, unmatched=false, date ${RECEIPT_DATE}`)
  console.log(`  ~ vex_pis ${PI_ID}: received ${liveReceived} -> ${REAL_RECEIPT}; payment_log_ids ${liveIds.length} dangling -> ['${NEW_LOG_ID}']; status ${live.status} -> ${newStatus}; +1 audit entry`)
  console.log(`  expected SUM(received) after: ${sumBefore} - ${liveReceived - REAL_RECEIPT} = ${sumBefore - (liveReceived - REAL_RECEIPT)}`)

  if (!APPLY) {
    console.log('\nDRY RUN complete. No writes. Re-run with --apply to back up + apply + verify.')
    process.exit(0)
  }

  // ===== APPLY =====
  // fresh pre-apply snapshot (in addition to the dry-run backup already on disk)
  mkdirSync('.recovery-backup', { recursive: true })
  const preApplyPath = join('.recovery-backup', `vex-${PI_ID}-pre-apply-${RECOVERED_AT.replace(/[:.]/g, '-')}.json`)
  writeFileSync(preApplyPath, JSON.stringify({ at: RECOVERED_AT, vex_pi: live, dangling_ids_with_zero_logs: liveIds }, null, 2))
  console.log(`\nbackup (pre-apply): ${preApplyPath}`)

  const narration =
    `VEX PI ${PI_ID}: payment receipt Rs 6,32,931 (bank Rs 6,32,931 + TDS Rs 0) via Bank Transfer, ref NA. ` +
    `RECOVERY 2026-06-25 (Phase 3 unwind 3/3): reconstructs the single real receipt after 5 pre-fix retry-duplicates ` +
    `over-counted payment_received_amount to Rs 31,64,655 (5x). The 5 dangling payment_log_ids ` +
    `(${EXPECTED_LOG_IDS.join(', ')}) referenced no payment_logs rows and were removed.`

  const logAudit = [{
    timestamp: RECOVERED_AT,
    user: 'sync-recovery',
    action: 'create',
    notes: `Reconstructed VEX receipt for ${PI_ID} (Rs 6,32,931, Bank Transfer, ref NA). Replaces 5 dangling retry-duplicate log ids; corrects a 5x over-count.`,
  }]

  const piAudit = {
    timestamp: RECOVERED_AT,
    user: 'sync-recovery',
    action: 'payment-overcount-recovery',
    before: { paymentReceivedAmount: EXPECTED_RECEIVED, paymentLogIds: EXPECTED_LOG_IDS, status: live.status },
    after: { paymentReceivedAmount: REAL_RECEIPT, paymentLogIds: [NEW_LOG_ID], status: newStatus },
    notes:
      `Phase 3 gated unwind 3/3 (owner go 2026-06-25). 5 pre-fix retries (recordVexPayment ran before the throwing ` +
      `enqueue) over-counted to Rs 31,64,655 = 5x the Rs 6,32,931 real receipt; the 5 payment_log_ids were dangling ` +
      `(0 payment_logs rows). Reset to the single real receipt + one reconstructed payment_log ${NEW_LOG_ID}. ` +
      `Reversible via .recovery-backup/vex-${PI_ID}-pre.json.`,
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO payment_logs (id, date, amount, mode, reference, narration,
        sales_person_id, matched_installment_ids, unmatched, audit_log)
      VALUES (${NEW_LOG_ID}, ${RECEIPT_DATE}, ${REAL_RECEIPT}, 'Bank Transfer', 'NA',
        ${narration}, null, ${tx.json([])}::jsonb, false, ${tx.json(logAudit)}::jsonb)
    `
    await tx`
      UPDATE vex_pis SET
        payment_received_amount = ${REAL_RECEIPT},
        payment_log_ids = ${tx.json([NEW_LOG_ID])}::jsonb,
        status = ${newStatus},
        audit_log = audit_log || ${tx.json([piAudit])}::jsonb
      WHERE id = ${PI_ID}
    `
  })
  console.log('APPLY complete (transaction committed).')

  // ===== VERIFY (post-commit) =====
  console.log('\n=== VERIFY (after) ===')
  const after = (await sql`SELECT * FROM vex_pis WHERE id = ${PI_ID}`)[0]
  const aReceived = Number(after.payment_received_amount)
  const aIds = Array.isArray(after.payment_log_ids) ? after.payment_log_ids : []
  const newLog = (await sql`SELECT * FROM payment_logs WHERE id = ${NEW_LOG_ID}`)[0]
  const stillDangling = await sql`SELECT id FROM payment_logs WHERE id = ANY(${EXPECTED_LOG_IDS})`
  const vexAfter = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plIdsAfter = (await sql`SELECT id FROM payment_logs ORDER BY id`).map(r => r.id)
  const sumAfter = Number((await sql`SELECT COALESCE(SUM(payment_received_amount),0)::text AS s FROM vex_pis`)[0].s)

  const checks = []
  const ok = (label, cond, got) => { checks.push({ label, pass: !!cond, got }); console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${got !== undefined ? `  (${got})` : ''}`) }

  ok(`payment_received_amount = ${REAL_RECEIPT} (1x, not ${EXPECTED_RECEIVED})`, aReceived === REAL_RECEIPT, aReceived)
  ok(`payment_log_ids = ['${NEW_LOG_ID}']`, arrEq(aIds, [NEW_LOG_ID]), JSON.stringify(aIds))
  ok(`5 dangling ids gone (still 0 payment_logs rows)`, stillDangling.length === 0, `${stillDangling.length} rows`)
  ok(`exactly one new payment_log created`, !!newLog && newLog.id === NEW_LOG_ID, newLog?.id)
  ok(`  new log amount = ${REAL_RECEIPT}`, newLog && Number(newLog.amount) === REAL_RECEIPT, newLog && Number(newLog.amount))
  ok(`  new log mode/ref = Bank Transfer / NA, unmatched=false`, newLog && newLog.mode === 'Bank Transfer' && newLog.reference === 'NA' && newLog.unmatched === false, newLog && `${newLog.mode} / ${newLog.reference} / unmatched=${newLog.unmatched}`)
  ok(`  new log narration documents recovery + 5 removed retries`, newLog && newLog.narration.includes('5') && EXPECTED_LOG_IDS.every(id => newLog.narration.includes(id)), undefined)
  ok(`status correct (= ${newStatus})`, after.status === newStatus, after.status)
  ok(`vex_pis row count unchanged`, vexAfter.length === vexBefore.length, `${vexBefore.length} -> ${vexAfter.length}`)
  ok(`payment_logs count = before + 1`, plIdsAfter.length === plIdsBefore.length + 1, `${plIdsBefore.length} -> ${plIdsAfter.length}`)
  ok(`payment_logs delta = only +${NEW_LOG_ID} (no removals)`, arrEq([...plIdsBefore, NEW_LOG_ID].sort(), [...plIdsAfter].sort()), undefined)
  ok(`SUM(received) dropped by exactly ${EXPECTED_RECEIVED - REAL_RECEIPT}`, sumAfter === sumBefore - (EXPECTED_RECEIVED - REAL_RECEIPT), `${sumBefore} -> ${sumAfter}`)

  // nothing else moved: every OTHER vex_pi row identical
  const beforeMap = new Map(vexBefore.map(r => [r.id, `${r.rcv}|${r.status}`]))
  let otherMoved = 0
  for (const r of vexAfter) {
    if (r.id === PI_ID) continue
    if (beforeMap.get(r.id) !== `${r.rcv}|${r.status}`) { otherMoved++; console.log(`    moved: ${r.id} ${beforeMap.get(r.id)} -> ${r.rcv}|${r.status}`) }
  }
  ok(`no other vex_pis row changed`, otherMoved === 0, `${otherMoved} others moved`)

  const failed = checks.filter(c => !c.pass)
  console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASS' : `${failed.length} CHECK(S) FAILED`}  (${checks.length - failed.length}/${checks.length})`)
  console.log(`Reversible via .recovery-backup/vex-${PI_ID}-pre.json (full pre-state row) + ${preApplyPath}.`)
  if (failed.length) process.exit(1)
} catch (err) {
  console.error('RECOVERY FAILED (rolled back if mid-transaction):', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
