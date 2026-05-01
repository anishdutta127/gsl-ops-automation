/*
 * POST /api/mou/[mouId]/intake-edit (W4-I.4 MM3).
 *
 * Form target for /mous/[id]/intake/edit. Reads the kit allocation +
 * SPOC backfill fields and dispatches to editIntake. Resolves the
 * intake record by mouId so the operator does not need to know the
 * IntakeRecord.id.
 *
 * Per-grade students are read from grade1..grade10 form fields and
 * collapsed into the gradeBreakdown array. Empty strings are dropped
 * (so partial backfills work); when every grade is empty the array
 * collapses to null inside the lib.
 */

import { NextResponse } from 'next/server'
import intakeRecordsJson from '@/data/intake_records.json'
import type { IntakeRecord } from '@/lib/types'
import { editIntake, type EditIntakePatch } from '@/lib/intake/editIntake'
import { getCurrentSession } from '@/lib/auth/session'

const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

export async function POST(
  request: Request,
  context: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await context.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/intake/edit`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/mous/${mouId}/intake/edit`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const intake = allIntakeRecords.find((r) => r.mouId === mouId)
  if (!intake) return errorTo('intake-not-found')

  const form = await request.formData()
  const patch: EditIntakePatch = {}

  if (form.has('location')) {
    patch.location = String(form.get('location') ?? '')
  }
  if (form.has('grades')) {
    patch.grades = String(form.get('grades') ?? '')
  }
  if (form.has('schoolPointOfContactName')) {
    patch.schoolPointOfContactName = String(form.get('schoolPointOfContactName') ?? '')
  }
  if (form.has('schoolPointOfContactPhone')) {
    patch.schoolPointOfContactPhone = String(form.get('schoolPointOfContactPhone') ?? '')
  }
  if (form.has('studentsAtIntake')) {
    const n = Number(form.get('studentsAtIntake') ?? '0')
    if (Number.isFinite(n) && n > 0) patch.studentsAtIntake = n
  }
  if (form.has('rechargeableBatteries')) {
    const raw = String(form.get('rechargeableBatteries') ?? '').trim()
    if (raw === '') {
      patch.rechargeableBatteries = null
    } else {
      const n = Number(raw)
      if (Number.isFinite(n)) patch.rechargeableBatteries = n
    }
  }

  // Collapse grade1..grade10 fields. Operators may leave any subset
  // blank (partial backfill); empty entries drop. The lib turns an
  // empty resulting array back into null.
  const gradeBreakdown: { grade: number; students: number }[] = []
  let anyGradeFieldSent = false
  for (let g = 1; g <= 10; g++) {
    const key = `grade${g}`
    if (form.has(key)) {
      anyGradeFieldSent = true
      const raw = String(form.get(key) ?? '').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) {
        gradeBreakdown.push({ grade: g, students: n })
      }
    }
  }
  if (anyGradeFieldSent) {
    patch.gradeBreakdown = gradeBreakdown
  }

  const result = await editIntake({
    id: intake.id,
    patch,
    editedBy: session.sub,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/mous/${mouId}/dispatch`, request.url)
  url.searchParams.set('intakeEdited', String(result.changedFields.length))
  return NextResponse.redirect(url, { status: 303 })
}
