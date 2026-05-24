/*
 * POST /api/mou/[mouId]/signed-mou/upload (Gate 5A.6 Step 6).
 *
 * Sales uploads the signed PDF after the school countersigns. Stores
 * the file at public/signed-mous/<mouId>.pdf and queues an MOU update
 * with signedMouPdfPath + signing context. Triggers status transition
 * Pending Signature -> Active.
 *
 * Storage caveat: writes to the file system are durable in dev but
 * ephemeral on Vercel serverless. Mirrors the existing dispatch-challan
 * upload pattern. Production-grade storage swap is Phase 1.1.
 *
 * Permission: canEditMOU (Sales + Admin).
 */

import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import type { AuditEntry, MOU } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { enqueueUpdate } from '@/lib/pendingUpdates'

const SIGNED_DIR = path.join(process.cwd(), 'public', 'signed-mous')

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface RouteContext {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/upload-signed`)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canEditMOU(user)) {
    return redirectWith(request, mouId, { error: 'permission' })
  }

  const allMous = await mouRepo.findAll()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou) {
    return redirectWith(request, mouId, { error: 'mou-not-found' })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return redirectWith(request, mouId, { error: 'invalid-form' })
  }

  const file = formData.get('file')
  const signDateRaw = String(formData.get('signDate') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()

  if (!(file instanceof File) || file.size === 0) {
    return redirectWith(request, mouId, { error: 'no-file' })
  }
  if (file.size > 10 * 1024 * 1024) {
    return redirectWith(request, mouId, { error: 'too-large' })
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext !== 'pdf') {
    return redirectWith(request, mouId, { error: 'pdf-only' })
  }
  if (!ISO_DATE_RE.test(signDateRaw)) {
    return redirectWith(request, mouId, { error: 'invalid-date' })
  }
  const today = new Date().toISOString().slice(0, 10)
  if (signDateRaw > today) {
    return redirectWith(request, mouId, { error: 'sign-date-future' })
  }
  if (mou.startDate !== null && signDateRaw < mou.startDate) {
    return redirectWith(request, mouId, { error: 'sign-date-before-start' })
  }

  const fileName = `${mou.id}.pdf`
  const publicPath = `/signed-mous/${fileName}`
  try {
    await fs.mkdir(SIGNED_DIR, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(SIGNED_DIR, fileName), buf)
  } catch (e) {
    return redirectWith(request, mouId, {
      error: 'write-failed',
      detail: e instanceof Error ? e.message : 'fs write failed',
    })
  }

  const ts = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: ts,
    user: user.id,
    action: 'file_upload',
    before: {
      signedMouPdfPath: mou.signedMouPdfPath ?? null,
      status: mou.status,
    },
    after: {
      signedMouPdfPath: publicPath,
      status: 'Active',
      signDate: signDateRaw,
    },
    notes: notesRaw === '' ? 'Signed MOU PDF uploaded.' : `Signed MOU PDF uploaded. ${notesRaw}`,
  }

  const next: MOU = {
    ...mou,
    signedMouPdfPath: publicPath,
    effectiveDate: signDateRaw,
    status: mou.status === 'Active' || mou.status === 'Completed' ? mou.status : 'Active',
    auditLog: [...(mou.auditLog ?? []), audit],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'mou',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
  } catch (e) {
    return redirectWith(request, mouId, {
      error: 'queue-failure',
      detail: e instanceof Error ? e.message : 'queue failed',
    })
  }

  return redirectWith(request, mouId, { uploaded: '1' })
}

function redirectWith(
  request: Request,
  mouId: string,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(`/mous/${mouId}/upload-signed`, request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}
