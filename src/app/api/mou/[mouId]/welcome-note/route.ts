/*
 * POST /api/mou/[mouId]/welcome-note (Step 3 Welcome Note).
 *
 * Ops saves a draft welcome note or marks it sent. RECORDED-STATUS ONLY:
 * there is no email-send infrastructure (no SMTP/provider); "send" records
 * the note + sent timestamp/by so the dashboard tracks sent-vs-pending.
 * Wiring an actual send is a follow-up.
 *
 * Permission: canRaiseDispatch (Ops + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import type { AuditEntry } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { welcomeNoteRepo } from '@/lib/db/repos/step3'

interface RouteContext { params: Promise<{ mouId: string }> }

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const user = await getCurrentUser()
  const backTo = `/operations/welcome/${mouId}`
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', backTo)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canRaiseDispatch(user)) {
    return NextResponse.redirect(new URL(`${backTo}?error=permission`, request.url), { status: 303 })
  }

  const mou = await mouRepo.findById(mouId)
  if (!mou) return NextResponse.redirect(new URL(`${backTo}?error=not-found`, request.url), { status: 303 })

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.redirect(new URL(`${backTo}?error=invalid-form`, request.url), { status: 303 }) }
  const action = String(form.get('action') ?? 'save')
  const noteText = String(form.get('noteText') ?? '').trim()
  if (noteText === '') return NextResponse.redirect(new URL(`${backTo}?error=empty`, request.url), { status: 303 })

  const ts = new Date().toISOString()
  try {
    if (action === 'send') {
      const audit: AuditEntry = {
        timestamp: ts, user: user.name, action: 'status_change',
        after: { welcomeNote: 'sent' }, notes: 'Welcome note marked sent (recorded; no email send wired).',
      }
      await welcomeNoteRepo.markSent({ mouId, schoolId: mou.schoolId, noteText, sentBy: user.name, audit })
      return NextResponse.redirect(new URL(`${backTo}?sent=1`, request.url), { status: 303 })
    }
    const audit: AuditEntry = {
      timestamp: ts, user: user.name, action: 'update',
      after: { welcomeNote: 'draft-saved' }, notes: 'Welcome note draft saved.',
    }
    await welcomeNoteRepo.saveDraft({ mouId, schoolId: mou.schoolId, noteText, audit })
    return NextResponse.redirect(new URL(`${backTo}?saved=1`, request.url), { status: 303 })
  } catch {
    return NextResponse.redirect(new URL(`${backTo}?error=save-failed`, request.url), { status: 303 })
  }
}
