#!/usr/bin/env node
/*
 * P2b.X OCC #4: dispatch_summary cross-flow race proof.
 *
 * 6 writers across 4 sub-flows can touch the same kit_dispatch's
 * dispatch_summary concurrently:
 *   - allocate (allocations + sales_approval_status reset)
 *   - approveSalesReview (approve + initial dispatchSummary)
 *   - accountsExecute (dispatchStatus + dispatchSummary.accountsEntries)
 *   - editDispatchSummary (summary form save)
 *   - challan/upload (dispatchSummary.deliveryChallanPath)
 *   - warehouse-email (dispatchSummary.warehouseEmailLoggedAt)
 *
 * The subtle cross-flow race: while Ops is uploading a challan, Sales
 * is editing the summary, AND Accounts is hitting accountsExecute, all
 * within the same kd's RMW window. Each reads the same baseline
 * version, computes its own next-state, writes back. Without OCC, the
 * last writer overwrites the others' JSONB key updates silently.
 *
 * This test fires N=10 parallel writers in pairs - 5 different sub-flow
 * pairs - each pair targeting the SAME kit_dispatch with the SAME loaded
 * version. Expected: exactly ONE writer wins, the other 9 (from any
 * sub-flow) get a clean conflict result, no silent overwrite.
 *
 * Then the loser-retry path: a losing writer re-reads at v=2,
 * re-submits, succeeds at v=3. Proves the recovery loop works across
 * sub-flow boundaries (Ops retry of challan after Accounts won).
 */

import postgres from 'postgres'
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'

const pr = new Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8'])
const orig = dns.lookup
dns.lookup = function (h, o, cb) {
  const callback = typeof o === 'function' ? o : cb
  const opts = typeof o === 'object' ? o : {}
  orig(h, opts, (e, a, f) => {
    if (!e) return callback(e, a, f)
    pr.resolve4(h).then((addrs) => {
      if (!addrs?.length) return callback(e)
      if (opts.all) callback(null, addrs.map((a) => ({ address: a, family: 4 })))
      else callback(null, addrs[0], 4)
    }).catch(() => callback(e))
  })
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 10, idle_timeout: 10, connect_timeout: 30, prepare: false,
  onnotice: () => {},
})

const N = 10

const mou = (await sql`
  SELECT id, school_id, school_name FROM mous
  WHERE id NOT IN (SELECT mou_id FROM kit_dispatches) LIMIT 1
`)[0]
if (!mou) {
  console.error('no available mou')
  process.exit(1)
}
const id = `KIT-CROSS-${Date.now().toString(36).slice(-6).toUpperCase()}`
const initialSummary = {
  schoolName: mou.school_name,
  shippingAddress: 'TC, TS',
  contactPerson: 'Test',
  contactNumber: '99999',
  salesRemarks: null,
  approvedBy: 'approver',
  approvedAt: new Date().toISOString(),
  accountsEntries: [],
  deliveryChallanPath: null,
  warehouseEmailLoggedAt: null,
}

await sql`
  INSERT INTO kit_dispatches (id, mou_id, school_id, school_name,
    dispatch_status, allocations, audit_log, version, dispatch_summary,
    sales_approval_status)
  VALUES (${id}, ${mou.id}, ${mou.school_id}, ${mou.school_name},
    'Pending', ${sql.json([])}::jsonb, ${sql.json([])}::jsonb, 1,
    ${sql.json(initialSummary)}::jsonb, 'Approved')
`
console.log(`[occ-4] seeded ${id} at version=1, dispatch_summary present`)

// Mimic the 6 sub-flow OCC writers; each computes a different patch
// (different JSONB key inside dispatch_summary) but they all share the
// version=1 baseline.
const subflows = [
  { name: 'challan-upload', patch: (i) => ({
      dispatch_summary: { ...initialSummary, deliveryChallanPath: `/path/challan-${i}.pdf` },
    }), audit: (i) => ({ action: 'file_upload', notes: `challan ${i}` }) },
  { name: 'warehouse-email', patch: (i) => ({
      dispatch_summary: { ...initialSummary, warehouseEmailLoggedAt: `2026-05-${10 + i}T00:00:00Z` },
    }), audit: (i) => ({ action: 'update', notes: `warehouse-email ${i}` }) },
  { name: 'summary-edit', patch: (i) => ({
      dispatch_summary: { ...initialSummary, salesRemarks: `remarks ${i}` },
    }), audit: (i) => ({ action: 'update', notes: `summary edit ${i}` }) },
  { name: 'accounts-execute', patch: (i) => ({
      dispatch_summary: { ...initialSummary, accountsEntries: [{ idx: i }] },
      dispatch_status: 'In Transit',
    }), audit: (i) => ({ action: 'status_change', notes: `accounts ${i}` }) },
  { name: 'approve-sales-review', patch: (_i) => ({
      sales_approval_status: 'Approved',
      dispatch_summary: initialSummary,
    }), audit: (i) => ({ action: 'status_change', notes: `approve ${i}` }) },
]

try {
  // Build 10 writers: pair each sub-flow type up to N=10. Iterate
  // through subflows round-robin so we have heterogeneous concurrent
  // writes (the "cross-flow" pattern).
  const writers = Array.from({ length: N }, (_, i) => {
    const sf = subflows[i % subflows.length]
    return { idx: i, name: sf.name, patch: sf.patch(i), audit: sf.audit(i) }
  })
  console.log(`[occ-4] firing ${N} cross-flow writers (round-robin sub-flow types) ...`)

  const results = await Promise.all(
    writers.map((w) => {
      const audit = {
        timestamp: new Date(Date.now() + w.idx).toISOString(),
        user: `writer-${w.idx}`,
        ...w.audit,
      }
      // Build the UPDATE dynamically. All writers target version=1; the
      // first one wins, the rest get 0 rows. We use a templated UPDATE
      // that always patches dispatch_summary (and optionally dispatch_status /
      // sales_approval_status when present in patch).
      const ds = w.patch.dispatch_summary
      const dstat = w.patch.dispatch_status
      const sas = w.patch.sales_approval_status
      return sql`
        UPDATE kit_dispatches SET
          dispatch_summary = ${sql.json(ds)}::jsonb,
          ${dstat ? sql`dispatch_status = ${dstat},` : sql``}
          ${sas ? sql`sales_approval_status = ${sas},` : sql``}
          audit_log = audit_log || ${sql.json([audit])}::jsonb,
          version = version + 1
        WHERE id = ${id} AND version = 1
        RETURNING version
      `.then((rows) => ({ ...w, ok: rows.length === 1, newVersion: rows[0]?.version }))
       .catch((e) => ({ ...w, ok: false, error: e.message }))
    }),
  )

  const winners = results.filter((r) => r.ok)
  const losers = results.filter((r) => !r.ok)

  console.log()
  console.log('Per-writer outcome:')
  for (const r of results) {
    if (r.ok) {
      console.log(`  writer-${String(r.idx).padStart(2)} [${r.name.padEnd(22)}]: WIN (v=${r.newVersion})`)
    } else {
      console.log(`  writer-${String(r.idx).padStart(2)} [${r.name.padEnd(22)}]: CONFLICT (0 rows)`)
    }
  }

  const final = (await sql`
    SELECT version, dispatch_summary, dispatch_status, sales_approval_status,
      jsonb_array_length(audit_log) AS audit_count
    FROM kit_dispatches WHERE id = ${id}
  `)[0]

  // Confirm cross-flow: the winning sub-flow's patch is what's in the
  // row, NOT a mash-up of multiple sub-flows.
  const winnerSubflow = winners[0]?.name
  let crossFlowCleanState = true
  if (winnerSubflow === 'challan-upload') {
    crossFlowCleanState = final.dispatch_summary.deliveryChallanPath?.startsWith('/path/challan-')
  } else if (winnerSubflow === 'warehouse-email') {
    crossFlowCleanState = final.dispatch_summary.warehouseEmailLoggedAt?.startsWith('2026-05-')
  } else if (winnerSubflow === 'summary-edit') {
    crossFlowCleanState = final.dispatch_summary.salesRemarks?.startsWith('remarks ')
  } else if (winnerSubflow === 'accounts-execute') {
    crossFlowCleanState = final.dispatch_status === 'In Transit'
      && Array.isArray(final.dispatch_summary.accountsEntries)
      && final.dispatch_summary.accountsEntries.length === 1
  } else if (winnerSubflow === 'approve-sales-review') {
    crossFlowCleanState = final.sales_approval_status === 'Approved'
  }

  console.log()
  console.log('Final state:')
  console.log('  version:                 ', final.version)
  console.log('  winning sub-flow:        ', winnerSubflow)
  console.log('  dispatch_summary.dCP:    ', final.dispatch_summary.deliveryChallanPath)
  console.log('  dispatch_summary.wEL:    ', final.dispatch_summary.warehouseEmailLoggedAt)
  console.log('  dispatch_summary.sR:     ', final.dispatch_summary.salesRemarks)
  console.log('  dispatch_summary.accE:   ', JSON.stringify(final.dispatch_summary.accountsEntries))
  console.log('  dispatch_status:         ', final.dispatch_status)
  console.log('  sales_approval_status:   ', final.sales_approval_status)
  console.log('  audit count:             ', final.audit_count, '(only winner contributed)')

  console.log()
  console.log('=== CROSS-FLOW INVARIANTS ===')
  const occCount = winners.length === 1 && losers.length === N - 1
  const versionBumpedOnce = Number(final.version) === 2
  const onlyWinnerAuditLanded = Number(final.audit_count) === 1
  console.log(`exactly one winner (across DIFFERENT sub-flows): ${occCount ? 'OK' : 'FAIL'}`)
  console.log(`version bumped exactly once:                     ${versionBumpedOnce ? 'OK' : 'FAIL'}`)
  console.log(`only winner's audit landed (cross-flow):         ${onlyWinnerAuditLanded ? 'OK' : 'FAIL'}`)
  console.log(`winner sub-flow state is clean (no mash-up):     ${crossFlowCleanState ? 'OK' : 'FAIL'}`)

  // Loser-retry across sub-flow: pick a loser, retry at v=2 with a
  // DIFFERENT sub-flow than the original winner. Proves the OCC
  // recovery loop works across sub-flow boundaries.
  console.log()
  const aLoser = losers[0]
  const retrySubflow = subflows.find((s) => s.name !== winnerSubflow) ?? subflows[0]
  console.log(`[occ-4] loser-retry: writer-${aLoser.idx} (orig: ${aLoser.name}) retries via ${retrySubflow.name} at v=2 ...`)
  const retryPatch = retrySubflow.patch(99)
  const retryAudit = {
    timestamp: new Date().toISOString(),
    user: `writer-${aLoser.idx}-retry`,
    ...retrySubflow.audit(99),
  }
  const retryDs = retryPatch.dispatch_summary
  const retryDstat = retryPatch.dispatch_status
  const retrySas = retryPatch.sales_approval_status
  const retry = await sql`
    UPDATE kit_dispatches SET
      dispatch_summary = ${sql.json(retryDs)}::jsonb,
      ${retryDstat ? sql`dispatch_status = ${retryDstat},` : sql``}
      ${retrySas ? sql`sales_approval_status = ${retrySas},` : sql``}
      audit_log = audit_log || ${sql.json([retryAudit])}::jsonb,
      version = version + 1
    WHERE id = ${id} AND version = 2
    RETURNING version
  `
  const retryOk = retry.length === 1 && retry[0].version === 3
  console.log(`retry: ${retryOk ? `WIN (v=3) - clean cross-flow recovery from 409` : 'FAIL'}`)

  const overall = occCount && versionBumpedOnce && onlyWinnerAuditLanded && crossFlowCleanState && retryOk
  console.log()
  console.log(`OVERALL: ${overall ? 'PASS (cross-flow OCC enforced, no silent overwrite, clean retry)' : 'FAIL'}`)
  process.exit(overall ? 0 : 1)
} finally {
  await sql`DELETE FROM kit_dispatches WHERE id = ${id}`
  await sql.end({ timeout: 5 })
}
