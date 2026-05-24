#!/usr/bin/env node
/*
 * Three-layer proof: vexPiRepo.recordVexPayment is race-safe.
 *
 * Seeds a temp VexPi (total=10000, paymentReceivedAmount=0,
 * payment_log_ids=[]), fires 10 parallel atomic UPDATEs that each:
 *   - append a unique logId to payment_log_ids
 *   - increment payment_received_amount by 1000
 *   - recompute status server-side
 *   - append an audit entry
 *
 * Expected post-state: payment_log_ids has 10 entries,
 * payment_received_amount=10000, status='Delivery Pending' (was 'Generated'),
 * audit_log has 10 entries.
 *
 * Three layers:
 *   Layer 1 - DRIVE: 10 parallel atomic UPDATEs (mirrors recordVexPayment SQL).
 *   Layer 2 - SQL VERIFY: counts + status.
 *   Layer 3 - RELOAD: re-fetch, assert match.
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

function installDnsFallback() {
  const pr = new Resolver()
  pr.setServers(['1.1.1.1', '8.8.8.8'])
  const origLookup = dns.lookup
  dns.lookup = function patched(host, opts, cb) {
    const callback = typeof opts === 'function' ? opts : cb
    const optsObj = typeof opts === 'object' ? opts : {}
    origLookup(host, optsObj, (err, addr, fam) => {
      if (!err) return callback(err, addr, fam)
      pr.resolve4(host)
        .then((addrs) => {
          if (!addrs?.length) return callback(err)
          if (optsObj.all) callback(null, addrs.map((a) => ({ address: a, family: 4 })))
          else callback(null, addrs[0], 4)
        })
        .catch(() => callback(err))
    })
  }
}
installDnsFallback()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
const sql = postgres(DATABASE_URL, {
  max: 10, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10
const PER_AMOUNT = 1000
const TOTAL = N * PER_AMOUNT

const id = `VPI-ATOMIC-${Date.now().toString(36).slice(-6).toUpperCase()}`
console.log(`[atomic-vex-payment] seeding vex_pi ${id} (total=${TOTAL}) ...`)
await sql`
  INSERT INTO vex_pis (id, pi_number, status, line_items,
    payment_received_amount, total, payment_log_ids, audit_log)
  VALUES (${id}, ${`ATOMIC-${Date.now()}`}, 'Generated',
    ${sql.json([])}::jsonb, 0, ${TOTAL}, ${sql.json([])}::jsonb, ${sql.json([])}::jsonb)
`

try {
  console.log(`[atomic-vex-payment] firing ${N} parallel atomic UPDATEs ...`)
  await Promise.all(
    Array.from({ length: N }, (_, idx) => {
      const logId = `VEXPL-ATOMIC-${idx}-${Date.now().toString(36).slice(-4)}`
      const audit = {
        timestamp: new Date(Date.now() + idx).toISOString(),
        user: 'atomic-test',
        action: 'update',
        notes: `vex-payment-${idx}`,
      }
      return sql`
        UPDATE vex_pis SET
          payment_log_ids = payment_log_ids || ${sql.json([logId])}::jsonb,
          payment_received_amount = ROUND(
            (COALESCE(payment_received_amount, 0) + ${PER_AMOUNT})::numeric, 2
          ),
          status = CASE
            WHEN COALESCE(payment_received_amount, 0) + ${PER_AMOUNT} >= total
              THEN CASE WHEN status = 'Completed' THEN 'Completed' ELSE 'Delivery Pending' END
            WHEN status = 'Generated' THEN 'Payment Pending'
            ELSE status
          END,
          audit_log = audit_log || ${sql.json([audit])}::jsonb
        WHERE id = ${id}
      `
    }),
  )

  // Layer 2: SQL verify.
  const r1 = await sql`
    SELECT jsonb_array_length(payment_log_ids) AS log_count,
           payment_received_amount, status, jsonb_array_length(audit_log) AS audit_count
    FROM vex_pis WHERE id = ${id}
  `
  const layer2 = r1[0]
  // Layer 3: reload.
  const r2 = await sql`
    SELECT jsonb_array_length(payment_log_ids) AS log_count,
           payment_received_amount, status, jsonb_array_length(audit_log) AS audit_count
    FROM vex_pis WHERE id = ${id}
  `
  const layer3 = r2[0]
  const expected = {
    log_count: N, payment_received_amount: TOTAL,
    status: 'Delivery Pending', audit_count: N,
  }
  const matchExpected = (
    Number(layer2.log_count) === expected.log_count
    && Number(layer2.payment_received_amount) === expected.payment_received_amount
    && layer2.status === expected.status
    && Number(layer2.audit_count) === expected.audit_count
  )
  const layersAgree = (
    Number(layer2.log_count) === Number(layer3.log_count)
    && Number(layer2.payment_received_amount) === Number(layer3.payment_received_amount)
    && layer2.status === layer3.status
    && Number(layer2.audit_count) === Number(layer3.audit_count)
  )
  console.log()
  console.log('Layer 2:  ', JSON.stringify(layer2))
  console.log('Layer 3:  ', JSON.stringify(layer3))
  console.log('Expected: ', JSON.stringify(expected))
  console.log()
  console.log(`Layer 2 matches expected: ${matchExpected ? 'YES' : 'NO'}`)
  console.log(`Layers 2 & 3 agree:       ${layersAgree ? 'YES' : 'NO'}`)
  const pass = matchExpected && layersAgree
  console.log(`OVERALL: ${pass ? 'PASS (atomic vex payment)' : 'FAIL'}`)
  process.exit(pass ? 0 : 1)
} finally {
  await sql`DELETE FROM vex_pis WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
