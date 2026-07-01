#!/usr/bin/env node
/*
 * VEX PI status reconcile: stale "Payment Pending" rows that are actually fully
 * paid modulo GST rounding. GATED prod DB write -- DRY RUN by default; requires
 * owner go for --apply.
 *
 * CAUSE: a PI total carries 2-dp GST (e.g. Rs 1,14,284.18) but banks remit whole
 * rupees (Rs 1,14,284). vexPiRepo.recordVexPayment used a STRICT
 * `received >= total` comparison, so a whole-rupee receipt a few paise short of
 * the total left the PI at 'Payment Pending'. The mechanism fix
 * (src/lib/vex/vexPiStatus.ts, PAID_TOLERANCE = Rs 1) treats a sub-rupee
 * shortfall as fully paid. This script brings the ALREADY-STALE rows in line.
 *
 * STATUS-ONLY: no money field changes. payment_received_amount, payment_log_ids,
 * and every payment_logs row are left untouched. Each target moves
 * 'Payment Pending' -> 'Delivery Pending' (fully paid, awaiting dispatch) and
 * gets one audit entry documenting the recompute.
 *
 * The 5 targets (the only live PIs whose stored status is BEHIND the
 * tolerance-aware payment floor; the 3 rounding-short PIs already at 'Completed'
 * are AHEAD and untouched; genuine partials are short by >> Rs 1 and untouched):
 *
 * SAFETY: default DRY RUN. Hard pre-flight aborts unless each live row still
 * equals its reviewed pre-state (exact received + total + status 'Payment
 * Pending' + not voided + derived target = 'Delivery Pending'). One sql.begin
 * txn. Backs up every target row first. Verifies invariants incl. "nothing else
 * moved" (no received changed anywhere; payment_logs entirely unchanged).
 *
 * Usage:
 *   node scripts/reconcile-vex-status-rounding.mjs          # dry run (reads only)
 *   node scripts/reconcile-vex-status-rounding.mjs --apply   # backup + apply + verify
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
import postgres from 'postgres'

const APPLY = process.argv.includes('--apply')
const RECONCILED_AT = '2026-06-29T00:00:00.000Z'

// Mirror of src/lib/vex/vexPiStatus.ts (the .mjs cannot import the TS module).
const PAID_TOLERANCE = 1
const ORDER = ['Generated', 'Payment Pending', 'Delivery Pending', 'Partially Dispatched', 'Completed']
const isFullyPaid = (received, total) => received > 0 && received >= total - PAID_TOLERANCE
function deriveStatus(received, total, current) {
  if (received <= 0) return 'Generated'
  if (!isFullyPaid(received, total)) return 'Payment Pending'
  return ORDER.indexOf(current) >= ORDER.indexOf('Delivery Pending') ? current : 'Delivery Pending'
}

// Reviewed pre-state (from scripts/_diagnose-vex-status-stale.mjs, 2026-06-29).
const TARGETS = [
  { id: 'VEXPI-MH-26-27-004', received: 1149917, total: 1149917.08, school: 'DCS Sporting Private Limited' },
  { id: 'VEXPI-UP-26-27-006', received: 426446, total: 426446.1, school: 'The Galaxy School - Wadi' },
  { id: 'VEXPI-UP-26-27-011', received: 31566, total: 31566.18, school: 'Mr. Anay Kamat' },
  { id: 'VEXPI-UP-26-27-017', received: 114284, total: 114284.18, school: 'Amitkumar Pandey' },
  { id: 'VEXPI-UP-26-27-018', received: 91432, total: 91432.3, school: 'Mr. C. Fernandes' },
]
const EXPECTED_FROM = 'Payment Pending'
const EXPECTED_TO = 'Delivery Pending'

// --- env + Windows DNS fallback (same pattern as the recovery scripts) ---
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); const ol = dns.lookup
dns.lookup = function (h, o, c) {
  if (typeof o === 'function') { c = o; o = {} } if (typeof o === 'number') o = { family: o }
  ol.call(dns, h, o, (e, a, f) => { if (!e) return c(e, a, f); pr.resolve4(h).then(x => { if (!x?.length) return c(e); o && o.all ? c(null, x.map(z => ({ address: z, family: 4 }))) : c(null, x[0], 4) }).catch(() => c(e)) })
}

const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // ===== PRE-FLIGHT =====
  console.log('=== PRE-FLIGHT (live prod vs reviewed pre-state) ===')
  const liveRows = []
  const drift = []
  for (const t of TARGETS) {
    const row = (await sql`SELECT * FROM vex_pis WHERE id = ${t.id}`)[0]
    if (!row) { drift.push(`${t.id}: not found`); continue }
    const received = Number(row.payment_received_amount)
    const total = Number(row.total)
    const derived = deriveStatus(received, total, row.status)
    console.log(`  ${t.id} (${t.school}): received ${fmt(received)} / total ${fmt(total)} status "${row.status}" -> derived "${derived}"`)
    if (row.voided_at) drift.push(`${t.id}: voided`)
    if (!near(received, t.received)) drift.push(`${t.id}: received ${received} != reviewed ${t.received}`)
    if (!near(total, t.total)) drift.push(`${t.id}: total ${total} != reviewed ${t.total}`)
    if (row.status !== EXPECTED_FROM) drift.push(`${t.id}: status "${row.status}" != "${EXPECTED_FROM}"`)
    if (derived !== EXPECTED_TO) drift.push(`${t.id}: derived "${derived}" != "${EXPECTED_TO}"`)
    liveRows.push({ t, row, received, total, derived })
  }
  if (drift.length) { console.error('\nABORT: live prod drifted from the reviewed pre-state:\n  ' + drift.join('\n  ')); process.exit(1) }

  // "nothing else moved" baseline
  const allBefore = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plCountBefore = Number((await sql`SELECT count(*)::int AS c FROM payment_logs`)[0].c)
  console.log(`\n  globals before: vex_pis=${allBefore.length}, payment_logs=${plCountBefore}`)

  console.log('\n=== PLANNED WRITES (status-only; no money fields touched) ===')
  for (const { t } of liveRows) console.log(`  ~ ${t.id}: status "${EXPECTED_FROM}" -> "${EXPECTED_TO}"  (+1 audit entry)`)

  if (!APPLY) {
    console.log('\nDRY RUN complete. No writes. Re-run with --apply (after owner go) to back up + apply + verify.')
    process.exit(0)
  }

  // ===== APPLY =====
  mkdirSync('.recovery-backup', { recursive: true })
  const backupPath = join('.recovery-backup', 'vex-status-reconcile-pre.json')
  writeFileSync(backupPath, JSON.stringify({ at: RECONCILED_AT, rows: liveRows.map(r => r.row) }, null, 2))
  console.log(`\nbackup (full pre-state of all ${liveRows.length} rows): ${backupPath}`)

  await sql.begin(async (tx) => {
    for (const { t, received, total } of liveRows) {
      const audit = {
        timestamp: RECONCILED_AT,
        user: 'sync-recovery',
        action: 'status_change',
        before: { status: EXPECTED_FROM },
        after: { status: EXPECTED_TO },
        notes:
          `Status reconcile (GST-rounding fix, owner go ${RECONCILED_AT.slice(0, 10)}). ` +
          `Receipt Rs ${fmt(received)} covers total Rs ${fmt(total)} within the Rs ${PAID_TOLERANCE} rounding tolerance, ` +
          `so the PI is fully paid; status recomputed from '${EXPECTED_FROM}' to '${EXPECTED_TO}'. ` +
          `No money fields changed. Reversible via ${backupPath}.`,
      }
      await tx`
        UPDATE vex_pis SET
          status = ${EXPECTED_TO},
          audit_log = audit_log || ${tx.json([audit])}::jsonb
        WHERE id = ${t.id}
      `
    }
  })
  console.log('APPLY complete (transaction committed).')

  // ===== VERIFY =====
  console.log('\n=== VERIFY (after) ===')
  const checks = []
  const ok = (label, cond, got) => { checks.push({ pass: !!cond }); console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${got !== undefined ? `  (${got})` : ''}`) }

  const targetIds = new Set(TARGETS.map(t => t.id))
  for (const { t, received } of liveRows) {
    const after = (await sql`SELECT * FROM vex_pis WHERE id = ${t.id}`)[0]
    ok(`${t.id} status = ${EXPECTED_TO}`, after.status === EXPECTED_TO, after.status)
    ok(`${t.id} received unchanged (${fmt(received)})`, near(after.payment_received_amount, received), fmt(after.payment_received_amount))
  }

  const allAfter = await sql`SELECT id, payment_received_amount::text AS rcv, status FROM vex_pis ORDER BY id`
  const plCountAfter = Number((await sql`SELECT count(*)::int AS c FROM payment_logs`)[0].c)
  const beforeMap = new Map(allBefore.map(r => [r.id, `${r.rcv}|${r.status}`]))
  let unexpectedMoved = 0
  let receivedMoved = 0
  for (const r of allAfter) {
    const before = beforeMap.get(r.id)
    const now = `${r.rcv}|${r.status}`
    if (before === now) continue
    // any received change is forbidden; status change allowed ONLY on the 5 targets
    const [bRcv] = (before ?? '|').split('|')
    if (bRcv !== r.rcv) { receivedMoved++; console.log(`    RECEIVED MOVED: ${r.id} ${before} -> ${now}`) }
    if (!targetIds.has(r.id)) { unexpectedMoved++; console.log(`    UNEXPECTED: ${r.id} ${before} -> ${now}`) }
  }
  ok(`no payment_received_amount changed anywhere`, receivedMoved === 0, `${receivedMoved} moved`)
  ok(`only the ${TARGETS.length} targets changed status`, unexpectedMoved === 0, `${unexpectedMoved} unexpected`)
  ok(`vex_pis row count unchanged`, allAfter.length === allBefore.length, `${allBefore.length} -> ${allAfter.length}`)
  ok(`payment_logs unchanged (${plCountBefore})`, plCountAfter === plCountBefore, `${plCountBefore} -> ${plCountAfter}`)

  const failed = checks.filter(c => !c.pass)
  console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASS' : `${failed.length} CHECK(S) FAILED`}  (${checks.length - failed.length}/${checks.length})`)
  console.log(`Reversible via ${backupPath}.`)
  if (failed.length) process.exit(1)
} catch (err) {
  console.error('RECONCILE FAILED (rolled back if mid-transaction):', err.message)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
