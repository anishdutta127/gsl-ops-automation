#!/usr/bin/env node
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
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 30 })

const rows = await sql`
  WITH p AS (
    SELECT mou_id, SUM(received_amount) AS sum_received
    FROM payments WHERE received_amount IS NOT NULL
    GROUP BY mou_id
  )
  SELECT m.id, m.school_name,
    m.received AS mou_received,
    p.sum_received AS sum_payments,
    ABS(COALESCE(m.received,0) - COALESCE(p.sum_received,0)) AS diff
  FROM mous m LEFT JOIN p ON m.id = p.mou_id
  WHERE ABS(COALESCE(m.received,0) - COALESCE(p.sum_received,0)) > 0.01
  ORDER BY diff DESC
`
console.log(`Total drifted MOUs: ${rows.length}`)
console.log('Top 10 drifted (used for parity cross-check):')
for (const r of rows.slice(0, 10)) {
  console.log(`  ${r.id.padEnd(28)} mou.received=${r.mou_received ?? 'null'} sum(payments)=${r.sum_payments ?? 'null'} diff=${r.diff}`)
}
await sql.end()
