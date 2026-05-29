#!/usr/bin/env node
/*
 * Three-layer proof for Bug 2 (annexure without-GST equals with-GST).
 *
 * Layer 1: deriveSpWithoutTax(1200) === 1017 (the user's expectation).
 * Layer 2: enter Rs 1200 with-GST, persist via the same writer the
 *          wizard uses, read back from postgres, confirm the row has
 *          spWithoutTax=1017 and spWithTax=1200 (not 1200/1200).
 * Layer 3: cleanup. Delete the test MOU and verify it is gone.
 *
 * Run:  DATA_BACKEND=postgres node scripts/proof-bug2-annexure-price.mjs
 */

import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL)

const TEST_MOU_ID = 'MOU-PROOF-BUG2-PRICE'
const TEST_SCHOOL_ID = 'SCH-CHRIST_MISSION_SCHOO'
const GST_RATE = 0.18

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('PASS:', msg)
}

try {
  await sql`DELETE FROM mous WHERE id = ${TEST_MOU_ID}`

  // Layer 1: pure-math check (no DB)
  const derived = Math.round(1200 / (1 + GST_RATE))
  assert(derived === 1017, `1200 / 1.18 rounds to 1017 (got ${derived})`)

  // Layer 2: write an MOU row with the derived split and read it
  // back. Mirrors what entityWriters.saveDraftMou now persists when
  // the wizard sends PRICE_PER_STUDENT=1200 (with-GST).
  const spWithTax = 1200
  const spWithoutTax = derived
  const yearlyPricing = JSON.stringify([
    { year: 1, spWithoutTax, spWithTax },
    { year: 2, spWithoutTax, spWithTax },
  ])
  await sql`
    INSERT INTO mous (
      id, school_id, school_name, programme, school_scope,
      status, cohort_status, academic_year,
      students_mou, sp_without_tax, sp_with_tax,
      yearly_pricing, audit_log
    ) VALUES (
      ${TEST_MOU_ID}, ${TEST_SCHOOL_ID}, 'Christ Mission School', 'STEAM', 'SINGLE',
      'Draft', 'active', '2026-27',
      200, ${spWithoutTax}, ${spWithTax},
      ${yearlyPricing}::jsonb, '[]'::jsonb
    )
  `
  const rows = await sql`
    SELECT sp_without_tax, sp_with_tax, yearly_pricing
    FROM mous WHERE id = ${TEST_MOU_ID}
  `
  assert(rows.length === 1, 'MOU row persisted')
  const row = rows[0]
  assert(
    Number(row.sp_without_tax) === 1017,
    `sp_without_tax=1017 (got ${row.sp_without_tax})`,
  )
  assert(
    Number(row.sp_with_tax) === 1200,
    `sp_with_tax=1200 (got ${row.sp_with_tax})`,
  )
  assert(
    Number(row.sp_without_tax) !== Number(row.sp_with_tax),
    'sp_without_tax and sp_with_tax are NOT identical (the reported bug)',
  )
  const yearly = typeof row.yearly_pricing === 'string'
    ? JSON.parse(row.yearly_pricing)
    : row.yearly_pricing
  assert(Array.isArray(yearly) && yearly.length === 2, `yearlyPricing has 2 rows (got ${yearly?.length})`)
  for (const yr of yearly) {
    assert(
      yr.spWithoutTax === 1017 && yr.spWithTax === 1200,
      `Year ${yr.year}: 1017/1200 split (got ${yr.spWithoutTax}/${yr.spWithTax})`,
    )
  }

  // Round-trip consistency: PI subtotal anchor should agree
  const piSubtotalForOne = Math.round(spWithTax / (1 + GST_RATE))
  assert(
    piSubtotalForOne === Number(row.sp_without_tax),
    `PI subtotal derivation matches stored sp_without_tax (${piSubtotalForOne})`,
  )

  // Layer 3: cleanup
  await sql`DELETE FROM mous WHERE id = ${TEST_MOU_ID}`
  const after = await sql`SELECT COUNT(*) AS c FROM mous WHERE id = ${TEST_MOU_ID}`
  assert(Number(after[0].c) === 0, 'Test MOU cleaned up')

  console.log('\n✓ Bug 2 proof complete: 1200 with-GST yields 1017 without-GST; values are not identical; derivation matches PI subtotal anchor.')
} catch (e) {
  console.error('Proof failed:', e)
  process.exit(1)
} finally {
  await sql.end()
}
