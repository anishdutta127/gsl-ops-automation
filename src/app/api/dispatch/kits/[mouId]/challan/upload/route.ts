/*
 * POST /api/dispatch/kits/[mouId]/challan/upload (Gate 3 Step 6).
 *
 * Finance uploads the Tally Delivery Challan. Stored at
 * public/delivery-challans/<dispatchId>.<ext>. The queue write
 * updates the KitDispatch's dispatchSummary.deliveryChallanPath
 * with the public path so download links work.
 *
 * Storage caveat: writes to the file system are durable in dev but
 * ephemeral on Vercel serverless. The brief's path mirrors the existing
 * signed-MOU pattern; production-grade S3 + CDN is a Phase 1.1 swap.
 * See STEP9_QUESTIONS.md Q5.
 */

import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth/session'
import { canExecuteDispatch } from '@/lib/access'
import type { AuditEntry, KitDispatch } from '@/lib/types'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]

const CHALLAN_DIR = path.join(process.cwd(), 'public', 'delivery-challans')

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canExecuteDispatch(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const kd = kitDispatches.find((k) => k.mouId === mouId)
  if (!kd) return NextResponse.json({ error: 'dispatch-not-found' }, { status: 404 })
  if (!kd.dispatchSummary) {
    return NextResponse.json({ error: 'no-summary' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid-form' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no-file' }, { status: 400 })
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  if (ext !== 'pdf') {
    return NextResponse.json({ error: 'pdf-only' }, { status: 400 })
  }

  const fileName = `${kd.id}.pdf`
  const publicPath = `/delivery-challans/${fileName}`
  try {
    await fs.mkdir(CHALLAN_DIR, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(CHALLAN_DIR, fileName), buf)
  } catch (e) {
    return NextResponse.json(
      {
        error: 'write-failed',
        message: e instanceof Error ? e.message : 'Failed to write challan',
      },
      { status: 500 },
    )
  }

  const isoNow = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: isoNow,
    user: user.id,
    action: 'file_upload',
    before: { deliveryChallanPath: kd.dispatchSummary.deliveryChallanPath },
    after: { deliveryChallanPath: publicPath },
    notes: 'Delivery challan uploaded.',
  }
  const nextRecord: KitDispatch = {
    ...kd,
    dispatchSummary: {
      ...kd.dispatchSummary,
      deliveryChallanPath: publicPath,
    },
    auditLog: [...kd.auditLog, audit],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'kitDispatch',
      operation: 'update',
      payload: {
        id: kd.id,
        mouId,
        record: nextRecord as unknown as Record<string, unknown>,
      },
    })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message: e instanceof Error ? e.message : 'Queue failure',
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, path: publicPath })
}
