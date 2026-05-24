#!/usr/bin/env node
/*
 * P2b smart-bridge END-TO-END proof.
 *
 * Fires N parallel enqueueUpdate({ operation: 'update' }) calls, each
 * with payload.auditLog grown by 1 entry over the row's current state.
 * The smart-bridge in pendingUpdates.ts is expected to:
 *   1. Compute the audit diff (1 new entry per call)
 *   2. Call repo.updatePartial(id, scalarPatch) once per request
 *   3. Call repo.appendAudit(id, newEntry) once per request
 * Because appendAudit uses `audit_log || jsonb`, all N entries should
 * land atomically. Final audit_log length should equal N.
 *
 * Unlike verify-p2b-concurrency.mjs (which exercises the SQL primitive
 * directly), this script exercises the SMART-BRIDGE PATH the libs
 * actually take: `deps.enqueue → enqueueUpdate → dispatchToRepo →
 * dispatchAuditedUpdate → repo.updatePartial + repo.appendAudit`.
 *
 * Usage:
 *   DATABASE_URL=... DATA_BACKEND=postgres node scripts/verify-p2b-bridge-e2e.mjs
 */

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

process.env.DATA_BACKEND = 'postgres'
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required')
  process.exit(1)
}

// We need to load the TS module via tsx; this script assumes tsx is
// available via the dev dependency. If not, install with `npm i -D tsx`.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
try { register('tsx/esm', pathToFileURL('./')) } catch (e) {
  console.error('tsx required to load TypeScript modules:', e.message)
  process.exit(1)
}

const { enqueueUpdate } = await import('../src/lib/pendingUpdates.ts')
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10
const ENTITY = 'school'
const id = `SCH-E2E-${Date.now().toString(36).slice(-6).toUpperCase()}`

console.log(`[e2e] seeding ${ENTITY} ${id} ...`)
await sql`
  INSERT INTO schools (id, name, city, state, region, active, audit_log)
  VALUES (${id}, 'P2b E2E Fixture', 'TC', 'TS', 'south', TRUE, ${sql.json([])}::jsonb)
`

try {
  // Read the current full row to use as the base for each payload.
  const baseRow = await sql`SELECT * FROM schools WHERE id = ${id}`
  const cur = baseRow[0]
  // Build full-row payload shape (camelCase, what the lib would build).
  function buildPayload(idx) {
    return {
      id: cur.id,
      name: cur.name,
      legalEntity: null,
      city: cur.city,
      state: cur.state,
      region: cur.region,
      pinCode: null,
      contactPerson: null,
      email: null,
      phone: null,
      billingName: null,
      pan: null,
      gstNumber: null,
      notes: `e2e-test-${idx}`,
      active: cur.active,
      // critical: auditLog grew by 1 vs the row's current state.
      // The bridge should detect this 1-entry diff and route through
      // appendAudit (atomic), NOT through a full-row update (race-prone).
      auditLog: [
        ...(cur.audit_log ?? []),
        {
          timestamp: new Date(Date.now() + idx).toISOString(),
          user: 'p2b-e2e',
          action: 'school-edited',
          notes: `e2e-${idx}`,
        },
      ],
    }
  }

  console.log(`[e2e] firing ${N} parallel enqueueUpdate(op='update') via smart-bridge ...`)
  await Promise.all(
    Array.from({ length: N }, (_, idx) =>
      enqueueUpdate({
        queuedBy: 'p2b-e2e',
        entity: ENTITY,
        operation: 'update',
        payload: buildPayload(idx),
      }),
    ),
  )

  const r = await sql`SELECT jsonb_array_length(audit_log) AS len, notes FROM schools WHERE id = ${id}`
  const after = Number(r[0].len)
  const finalNotes = r[0].notes
  const pass = after === N

  console.log()
  console.log(`audit_log length: ${after} (expected ${N})`)
  console.log(`final notes col:  ${finalNotes} (proves scalar UPDATE ran; last-writer wins for scalars is OK - bridge contract is per-audit-entry atomicity)`)
  console.log(`overall:          ${pass ? 'PASS' : 'FAIL'}`)
  process.exit(pass ? 0 : 1)
} finally {
  await sql`DELETE FROM schools WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
