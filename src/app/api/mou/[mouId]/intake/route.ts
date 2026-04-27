/*
 * POST /api/mou/[mouId]/intake (W4-C.2).
 *
 * Form target for /mous/[id]/intake. 22 fields per the W4-C recon
 * map. 303 redirects back to the form on result; the calling page
 * renders flash + variance banners as appropriate.
 */

import { NextResponse } from 'next/server'
import { recordIntake } from '@/lib/intake/recordIntake'
import { getCurrentSession } from '@/lib/auth/session'
import type { GslTrainingMode, Programme, SubmissionStatus } from '@/lib/types'

export async function POST(
  request: Request,
  context: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await context.params

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/intake`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const form = await request.formData()
  const errorTo = (reason: string) => {
    const url = new URL(`/mous/${mouId}/intake`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const result = await recordIntake({
    mouId,
    salesOwnerId: String(form.get('salesOwnerId') ?? ''),
    location: String(form.get('location') ?? ''),
    grades: String(form.get('grades') ?? ''),
    recipientName: String(form.get('recipientName') ?? ''),
    recipientDesignation: String(form.get('recipientDesignation') ?? ''),
    recipientEmail: String(form.get('recipientEmail') ?? ''),
    studentsAtIntake: Number(form.get('studentsAtIntake') ?? '0'),
    durationYears: Number(form.get('durationYears') ?? '0'),
    startDate: String(form.get('startDate') ?? ''),
    endDate: String(form.get('endDate') ?? ''),
    physicalSubmissionStatus: String(form.get('physicalSubmissionStatus') ?? '') as SubmissionStatus,
    softCopySubmissionStatus: String(form.get('softCopySubmissionStatus') ?? '') as SubmissionStatus,
    productConfirmed: String(form.get('productConfirmed') ?? '') as Programme,
    gslTrainingMode: String(form.get('gslTrainingMode') ?? '') as GslTrainingMode,
    schoolPointOfContactName: String(form.get('schoolPointOfContactName') ?? ''),
    schoolPointOfContactPhone: String(form.get('schoolPointOfContactPhone') ?? ''),
    signedMouUrl: String(form.get('signedMouUrl') ?? ''),
    recordedBy: session.sub,
  })

  if (!result.ok) {
    return errorTo(result.reason)
  }

  const url = new URL(`/mous/${mouId}/intake`, request.url)
  url.searchParams.set('recorded', result.record.id)
  if (result.variances.studentsVariance !== 0) {
    url.searchParams.set('studentsVariance', String(result.variances.studentsVariance))
  }
  if (result.variances.productMismatch) {
    url.searchParams.set('productMismatch', '1')
  }
  if (result.variances.trainingModeMismatch) {
    url.searchParams.set('trainingModeMismatch', '1')
  }
  return NextResponse.redirect(url, { status: 303 })
}
