import { NextResponse } from 'next/server'
import { currentBackend } from '@/lib/db/backend'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ ok: false, reason: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  if (currentBackend() !== 'postgres') {
    return NextResponse.json({ ok: true, skipped: true, backend: 'json' })
  }

  const { getSql } = await import('@/lib/db/client')
  const sql = getSql()
  const t0 = Date.now()
  const rows = await sql`SELECT 1 AS ping`
  const ms = Date.now() - t0

  return NextResponse.json({ ok: true, ping: rows[0]?.ping ?? 1, ms, backend: 'postgres' })
}
