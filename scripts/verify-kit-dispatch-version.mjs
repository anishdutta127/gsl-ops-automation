#!/usr/bin/env node
import dns from 'node:dns'
import { Resolver } from 'node:dns/promises'
const pr = new Resolver()
pr.setServers(['1.1.1.1', '8.8.8.8'])
const orig = dns.lookup
dns.lookup = function(h, o, cb) {
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
const col = await sql`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='kit_dispatches' AND column_name='version'`
console.log('version column:', JSON.stringify(col[0]))
const stats = await sql`SELECT COUNT(*)::int AS c, MIN(version) AS minv, MAX(version) AS maxv FROM kit_dispatches`
console.log('rows:', JSON.stringify(stats[0]))
await sql.end()
