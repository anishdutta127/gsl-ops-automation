/*
 * POST /api/admin/school-groups/create
 *
 * Form target for /admin/school-groups/new. Reads SchoolGroup fields
 * with member ids as repeated checkbox values, and calls
 * createSchoolGroup.
 *
 * Success: 303 to /admin/school-groups. Failure: 303 back with error.
 */

import { NextResponse } from 'next/server'
import {
  createSchoolGroup,
  type CreateSchoolGroupArgs,
} from '@/lib/schoolGroups/schoolGroup'
import { getCurrentSession } from '@/lib/auth/session'

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export async function POST(request: Request) {
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/school-groups/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/school-groups/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const memberSchoolIds = form.getAll('memberSchoolIds').map(String)

  const args: CreateSchoolGroupArgs = {
    id: String(form.get('id') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
    region: String(form.get('region') ?? '').trim(),
    memberSchoolIds,
    notes: nullable(form.get('notes')),
    createdBy: session.sub,
  }

  const result = await createSchoolGroup(args)
  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/school-groups', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
