/*
 * POST /api/dispatch/kits/[mouId]/pod/upload (Gate 3 Step 8).
 *
 * Ops uploads the Proof of Delivery. Stored at
 * public/delivery-pods/<dispatchId>.<ext>. The upload auto-flips
 * dispatchStatus to 'Delivered' per joint spec section 11 updated logic.
 */

import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth/session'
import { canUploadPOD } from '@/lib/access'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { recordPOD } from '@/lib/kitDispatch/shipment'
import { emitPodUploaded } from '@/lib/notifications/workflowTriggers'

const POD_DIR = path.join(process.cwd(), 'public', 'delivery-pods')
const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png'])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  if (!canUploadPOD(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const kitDispatches = await kitDispatchRepo.findAll()
  const kd = kitDispatches.find((k) => k.mouId === mouId)
  if (!kd) return NextResponse.json({ error: 'dispatch-not-found' }, { status: 404 })

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
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: 'unsupported-ext' }, { status: 400 })
  }

  const fileName = `${kd.id}.${ext}`
  const publicPath = `/delivery-pods/${fileName}`
  try {
    await fs.mkdir(POD_DIR, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(POD_DIR, fileName), buf)
  } catch (e) {
    return NextResponse.json(
      {
        error: 'write-failed',
        message: e instanceof Error ? e.message : 'Failed to write POD',
      },
      { status: 500 },
    )
  }

  const result = await recordPOD(
    { mouId, user: { id: user.id, name: user.name }, filePath: publicPath },
    { kitDispatches },
  )
  if (!result.ok) {
    const status = result.reason === 'dispatch-not-found' ? 404 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }

  // Gate 4.5 Step 4: fan out 'pod-uploaded' to Finance (raise tax
  // invoice) + Sales (informational). Best-effort; failure does not
  // roll back the POD write.
  try {
    await emitPodUploaded({
      kitDispatchId: kd.id,
      mouId: kd.mouId,
      schoolName: kd.schoolName,
      deliveredOn: new Date().toISOString().slice(0, 10),
      senderUserId: user.id,
    })
  } catch (notifyErr) {
    console.error('[pod-upload] notification fan-out failed:', notifyErr)
  }

  return NextResponse.json({ ok: true, path: publicPath, newDispatchStatus: result.newDispatchStatus })
}
