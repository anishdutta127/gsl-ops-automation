/*
 * POST /api/schools/[id] (W4-I.4 MM4).
 *
 * Form target for /schools/[id]/edit. Misba's MM4 feedback flagged
 * that saving any change on the edit page returned 404 because the
 * route handler had never been authored (the page noted a "501 stub"
 * placeholder; Next.js 404s when no handler matches).
 *
 * Reads the editable School fields, normalises blanks to null, calls
 * editSchool. Permission gate ('school:edit') is enforced inside the
 * lib so the form-hide of GSTIN for non-Finance/non-Admin matches the
 * server-side rule.
 *
 * Status codes:
 *   303 redirect to /schools/[id]              -> success
 *   303 redirect back with ?error=...          -> validation / permission
 */

import { NextResponse } from 'next/server'
import { editSchool, type EditSchoolPatch } from '@/lib/schools/editSchool'
import { getCurrentSession } from '@/lib/auth/session'

interface RouteParams {
  params: Promise<{ id: string }>
}

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function required(raw: FormDataEntryValue | null): string {
  if (typeof raw !== 'string') return ''
  return raw
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/schools/${id}/edit`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/schools/${id}/edit`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  // Build a patch from the form fields. Required text fields stay as
  // strings (the lib enforces non-empty); optional fields normalise
  // empty -> null. gstNumber is included unconditionally; the lib drops
  // it when the caller is not Finance/Admin.
  const patch: EditSchoolPatch = {
    name: required(form.get('name')),
    legalEntity: nullable(form.get('legalEntity')),
    city: required(form.get('city')),
    state: required(form.get('state')),
    region: required(form.get('region')),
    pinCode: nullable(form.get('pinCode')),
    contactPerson: nullable(form.get('contactPerson')),
    email: nullable(form.get('email')),
    phone: nullable(form.get('phone')),
    billingName: nullable(form.get('billingName')),
    pan: nullable(form.get('pan')),
    notes: nullable(form.get('notes')),
  }
  // Only include gstNumber when the form actually sent the field.
  // Hidden field would be absent for non-Finance/non-Admin users.
  if (form.has('gstNumber')) {
    patch.gstNumber = nullable(form.get('gstNumber'))
  }
  // Checkboxes are absent from FormData when unchecked; treat that
  // as active=false so the deactivate flow works through the form.
  patch.active = form.get('active') !== null

  const result = await editSchool({
    id,
    patch,
    editedBy: session.sub,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/schools/${id}`, request.url)
  return NextResponse.redirect(url, { status: 303 })
}
