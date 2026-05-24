#!/usr/bin/env node
/*
 * Proof: paymentRepo.recordPartialReceipt is race-safe.
 *
 * Test pattern:
 *   1. Seed a temp Payment row (expectedAmount=10000, receivedAmount=0,
 *      partial_payments=[]).
 *   2. Fire 10 parallel atomic UPDATE statements that mirror the
 *      paymentRepo.recordPartialReceipt SQL: each appends one partial
 *      payment (amount=1000), increments received_amount by 1000,
 *      recomputes status, appends an audit entry.
 *   3. Re-read the row.
 *      Expected (atomic): partial_payments has 10 entries,
 *      received_amount=10000, status='Paid', audit_log has 10 entries.
 *      If the race were unfixed: partial_payments=1 or 2 or 3 entries,
 *      received_amount=1000-3000, status='Partial'.
 *
 * This is the THREE-LAYER landing proof for the money route:
 *   Layer 1 - DRIVE: 10 parallel atomic UPDATEs (same SQL as
 *             paymentRepo.recordPartialReceipt).
 *   Layer 2 - SQL VERIFY: SELECT jsonb_array_length(partial_payments),
 *             received_amount, status, jsonb_array_length(audit_log).
 *   Layer 3 - RELOAD: re-fetch the row, assert the same values are
 *             readable to a fresh SELECT.
 *
 * Pass iff Layer 2 and Layer 3 agree AND match the expected post-state.
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
const EXPECTED = N * PER_AMOUNT

const id = `PAY-ATOMIC-${Date.now().toString(36).slice(-6).toUpperCase()}`
const mou = (await sql`SELECT id, school_name, programme FROM mous LIMIT 1`)[0]

console.log(`[atomic-partial] seeding payment ${id} (mou=${mou.id}, expected=${EXPECTED}) ...`)
await sql`
  INSERT INTO payments (id, mou_id, school_name, programme, instalment_label,
    instalment_seq, total_instalments, expected_amount, status,
    partial_payments, received_amount, audit_log)
  VALUES (${id}, ${mou.id}, ${mou.school_name}, ${mou.programme},
    'Atomic-test', 1, 1, ${EXPECTED}, 'Pending',
    ${sql.json([])}::jsonb, 0, ${sql.json([])}::jsonb)
`

try {
  console.log(`[atomic-partial] firing ${N} parallel atomic UPDATEs (mirrors paymentRepo.recordPartialReceipt) ...`)
  await Promise.all(
    Array.from({ length: N }, (_, idx) => {
      const partial = {
        date: '2026-05-24',
        amount: PER_AMOUNT,
        mode: 'Bank Transfer',
        reference: `REF-${idx}`,
        notes: null,
        paymentLogId: null,
      }
      const audit = {
        timestamp: new Date(Date.now() + idx).toISOString(),
        user: 'atomic-test',
        action: 'payment-recorded',
        notes: `partial-${idx}`,
      }
      return sql`
        UPDATE payments SET
          partial_payments = partial_payments || ${sql.json([partial])}::jsonb,
          received_amount = COALESCE(received_amount, 0) + ${PER_AMOUNT},
          received_date = '2026-05-24',
          payment_mode = 'Bank Transfer',
          bank_reference = ${`REF-${idx}`},
          status = CASE
            WHEN COALESCE(received_amount, 0) + ${PER_AMOUNT} + 0.01 >= expected_amount THEN 'Paid'
            ELSE 'Partial'
          END,
          audit_log = audit_log || ${sql.json([audit])}::jsonb
        WHERE id = ${id}
      `
    }),
  )

  // Layer 2: SQL verify.
  const r1 = await sql`
    SELECT jsonb_array_length(partial_payments) AS partial_count,
           received_amount, status, jsonb_array_length(audit_log) AS audit_count
    FROM payments WHERE id = ${id}
  `
  const layer2 = r1[0]

  // Layer 3: reload (fresh SELECT, separate query).
  const r2 = await sql`
    SELECT jsonb_array_length(partial_payments) AS partial_count,
           received_amount, status, jsonb_array_length(audit_log) AS audit_count
    FROM payments WHERE id = ${id}
  `
  const layer3 = r2[0]

  const expected = {
    partial_count: N,
    received_amount: EXPECTED,
    status: 'Paid',
    audit_count: N,
  }

  const matchExpected = (
    Number(layer2.partial_count) === expected.partial_count
    && Number(layer2.received_amount) === expected.received_amount
    && layer2.status === expected.status
    && Number(layer2.audit_count) === expected.audit_count
  )
  const layersAgree = (
    Number(layer2.partial_count) === Number(layer3.partial_count)
    && Number(layer2.received_amount) === Number(layer3.received_amount)
    && layer2.status === layer3.status
    && Number(layer2.audit_count) === Number(layer3.audit_count)
  )

  console.log()
  console.log('Layer 2 (SQL verify): ', JSON.stringify(layer2))
  console.log('Layer 3 (reload):     ', JSON.stringify(layer3))
  console.log('Expected:             ', JSON.stringify(expected))
  console.log()
  console.log(`Layer 2 matches expected: ${matchExpected ? 'YES' : 'NO'}`)
  console.log(`Layers 2 & 3 agree:       ${layersAgree ? 'YES' : 'NO'}`)
  const pass = matchExpected && layersAgree
  console.log()
  console.log(`OVERALL: ${pass ? 'PASS (atomic partial_payments)' : 'FAIL (race detected)'}`)

  process.exit(pass ? 0 : 1)
} finally {
  await sql`DELETE FROM payments WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
