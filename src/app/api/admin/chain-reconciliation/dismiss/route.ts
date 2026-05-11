/*
 * POST /api/admin/chain-reconciliation/dismiss (Gate 5A Step 4).
 *
 * Marks a school as "not a chain" by appending its id to
 * chain_dismissals.json. The page filters dismissed ids out of the
 * candidate list. Admin-only via canPerform('admin:manage-users').
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { atomicUpdateJson } from '@/lib/githubQueue'

const DISMISSALS_PATH = 'src/data/chain_dismissals.json'

interface DismissalsFile {
  _comment?: string
  dismissedSchoolIds: string[]
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/chain-mou-reconciliation')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageUsers(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const schoolId = String(form.get('schoolId') ?? '').trim()
  if (!schoolId) {
    const url = new URL('/admin/chain-mou-reconciliation', request.url)
    url.searchParams.set('error', 'missing-school-id')
    return NextResponse.redirect(url, { status: 303 })
  }

  try {
    await atomicUpdateJson<DismissalsFile>(DISMISSALS_PATH, (current) => {
      const file = (current as DismissalsFile | null) ?? { dismissedSchoolIds: [] }
      const existing = new Set(file.dismissedSchoolIds ?? [])
      // Idempotency: already-dismissed is a no-op.
      if (existing.has(schoolId)) return file
      return {
        _comment: file._comment,
        dismissedSchoolIds: [...(file.dismissedSchoolIds ?? []), schoolId],
      }
    })
  } catch (e) {
    const url = new URL('/admin/chain-mou-reconciliation', request.url)
    url.searchParams.set('error', e instanceof Error ? e.message : 'dismiss-failed')
    return NextResponse.redirect(url, { status: 303 })
  }

  const url = new URL('/admin/chain-mou-reconciliation', request.url)
  url.searchParams.set('flash', 'Marked as standalone. Removed from candidate list.')
  return NextResponse.redirect(url, { status: 303 })
}
