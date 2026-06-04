/*
 * POST /api/recce/create (Step 3 Recce report).
 *
 * Record a school's lab-requirement reconnaissance (what facilities exist /
 * are missing). Record-keeping only, not a workflow. Permission:
 * canRaiseDispatch (Ops + Admin wildcard).
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import type { AuditEntry, RecceReport } from '@/lib/types'
import { schoolRepo } from '@/lib/db/repos/school'
import { recceReportRepo } from '@/lib/db/repos/step3'

function back(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL('/operations/recce', request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url, { status: 303 })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/operations/recce')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canRaiseDispatch(user)) return back(request, { error: 'permission' })

  let form: FormData
  try { form = await request.formData() } catch { return back(request, { error: 'invalid-form' }) }
  const schoolId = String(form.get('schoolId') ?? '').trim()
  const requirements = String(form.get('requirements') ?? '').trim()
  if (!schoolId) return back(request, { error: 'missing-school' })
  if (requirements === '') return back(request, { error: 'empty' })

  const school = (await schoolRepo.findAll()).find((s) => s.id === schoolId)
  if (!school) return back(request, { error: 'school-not-found' })

  const ts = new Date().toISOString()
  const id = `RECCE-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`
  const audit: AuditEntry = {
    timestamp: ts, user: user.name, action: 'create',
    after: { id, schoolId }, notes: 'Recce report recorded.',
  }
  const report: RecceReport = {
    id, schoolId, mouId: null, requirements, status: 'recorded',
    createdBy: user.name, createdAt: ts, auditLog: [audit],
  }
  try {
    await recceReportRepo.create(report)
  } catch {
    return back(request, { error: 'save-failed' })
  }
  return back(request, { created: '1' })
}
