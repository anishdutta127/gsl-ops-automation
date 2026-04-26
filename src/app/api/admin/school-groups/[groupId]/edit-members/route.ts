/*
 * POST /api/admin/school-groups/[groupId]/edit-members
 *
 * Form target for /admin/school-groups/[groupId]. The form posts the
 * full target memberSchoolIds list as repeated checkbox values; the
 * lib computes added + removed deltas internally.
 *
 * Success: 303 to /admin/school-groups/[groupId]. Failure: 303 back
 * with error.
 */

import { NextResponse } from 'next/server'
import {
  editSchoolGroupMembers,
} from '@/lib/schoolGroups/schoolGroup'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/admin/school-groups/${groupId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/admin/school-groups/${groupId}`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const memberSchoolIds = form.getAll('memberSchoolIds').map(String)
  const notes = String(form.get('notes') ?? '').trim() || undefined

  const result = await editSchoolGroupMembers({
    groupId,
    memberSchoolIds,
    editedBy: session.sub,
    notes,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/admin/school-groups/${groupId}`, request.url)
  return NextResponse.redirect(url, { status: 303 })
}
