/*
 * POST /api/admin/schools/create
 *
 * Form target for /admin/schools/new. Reads School fields, normalises
 * empty strings to null for optional fields, and calls createSchool.
 *
 * Success: 303 to /admin/schools. Failure: 303 back with error.
 */

import { NextResponse } from 'next/server'
import {
  createSchool,
  type CreateSchoolArgs,
} from '@/lib/schools/createSchool'
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
    url.searchParams.set('next', '/admin/schools/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/schools/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const args: CreateSchoolArgs = {
    id: String(form.get('id') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
    legalEntity: nullable(form.get('legalEntity')),
    city: String(form.get('city') ?? '').trim(),
    state: String(form.get('state') ?? '').trim(),
    region: String(form.get('region') ?? '').trim(),
    pinCode: nullable(form.get('pinCode')),
    contactPerson: nullable(form.get('contactPerson')),
    email: nullable(form.get('email')),
    phone: nullable(form.get('phone')),
    billingName: nullable(form.get('billingName')),
    pan: nullable(form.get('pan')),
    gstNumber: nullable(form.get('gstNumber')),
    notes: nullable(form.get('notes')),
    createdBy: session.sub,
  }

  const result = await createSchool(args)
  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/schools', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
