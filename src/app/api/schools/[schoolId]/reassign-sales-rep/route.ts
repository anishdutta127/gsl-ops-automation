/*
 * POST /api/schools/[schoolId]/reassign-sales-rep
 *
 * Form target for the salesperson reassignment flow (Pranav review
 * item #6). Body fields:
 *   - newSalesPersonId: string | '' (empty = unassign)
 *   - scope: 'future-only' | 'all-mous'
 *   - reason: optional free-text
 *
 * Reads the session, calls reassignSalesRep, redirects back to the
 * school detail page with a notice or error param. Mirrors the
 * editSchool route pattern (W4-I.4 MM4) so the form-POST shape stays
 * consistent across the schools surface.
 */

import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth/session'
import {
  reassignSalesRep,
  type ReassignScope,
} from '@/lib/schools/reassignSalesRep'

interface RouteParams {
  params: Promise<{ schoolId: string }>
}

function parseScope(raw: FormDataEntryValue | null): ReassignScope | null {
  if (raw === 'future-only' || raw === 'all-mous') return raw
  return null
}

function asString(raw: FormDataEntryValue | null): string {
  return typeof raw === 'string' ? raw : ''
}

export async function POST(request: Request, { params }: RouteParams) {
  const { schoolId } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/schools/${schoolId}/reassign-sales-rep`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/schools/${schoolId}/reassign-sales-rep`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const scope = parseScope(form.get('scope'))
  if (scope === null) return errorTo('invalid-scope')

  const newSalesPersonIdRaw = asString(form.get('newSalesPersonId')).trim()
  const newSalesPersonId = newSalesPersonIdRaw === '' ? null : newSalesPersonIdRaw
  const reasonRaw = asString(form.get('reason')).trim()
  const reason = reasonRaw === '' ? null : reasonRaw

  const result = await reassignSalesRep({
    schoolId,
    newSalesPersonId,
    scope,
    reason,
    reassignedBy: session.sub,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const success = new URL(`/schools/${schoolId}`, request.url)
  success.searchParams.set(
    'notice',
    scope === 'all-mous'
      ? 'sales-rep-reassigned-all'
      : 'sales-rep-reassigned',
  )
  return NextResponse.redirect(success, { status: 303 })
}
