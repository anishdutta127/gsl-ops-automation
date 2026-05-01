/*
 * GET /api/mou/[mouId]/kit-allocation (W4-I.4 MM3).
 *
 * CSV export of the kit allocation row for one MOU. The dispatch page
 * renders the same data as a table; this endpoint returns the same
 * row in CSV form so operators can paste into Excel for offline ops.
 *
 * Single-row CSV mirrors the on-screen table:
 *   School Name,Address,SPOC Name,Contact Number,Grade 1..10,Rechargeable Batteries
 *
 * No auth gate beyond getCurrentSession: the dispatch page is already
 * visible to every authenticated user (W3-B baseline) and CSV export
 * carries no data the dispatch page does not already render.
 */

import { NextResponse } from 'next/server'
import mousJson from '@/data/mous.json'
import schoolsJson from '@/data/schools.json'
import intakeRecordsJson from '@/data/intake_records.json'
import type { IntakeRecord, MOU, School } from '@/lib/types'
import { getCurrentSession } from '@/lib/auth/session'

const allMous = mousJson as unknown as MOU[]
const allSchools = schoolsJson as unknown as School[]
const allIntakeRecords = intakeRecordsJson as unknown as IntakeRecord[]

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function gradeCellFor(intake: IntakeRecord | null, grade: number): string {
  const row = intake?.gradeBreakdown?.find((g) => g.grade === grade)
  return row ? String(row.students) : ''
}

export async function GET(
  request: Request,
  context: { params: Promise<{ mouId: string }> },
) {
  const { mouId } = await context.params
  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/mous/${mouId}/dispatch`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const mou = allMous.find((m) => m.id === mouId)
  if (!mou) {
    return NextResponse.json({ error: 'mou-not-found' }, { status: 404 })
  }

  const school = allSchools.find((s) => s.id === mou.schoolId) ?? null
  const intake = allIntakeRecords.find((r) => r.mouId === mou.id) ?? null

  const headers = [
    'School Name', 'Address', 'SPOC Name', 'Contact Number',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Rechargeable Batteries',
  ]

  const addressParts = school
    ? [school.city, school.state, school.pinCode].filter((p) => p && p !== '')
    : []
  const address = addressParts.join(', ')
  const spocName = intake?.schoolPointOfContactName ?? school?.contactPerson ?? ''
  const spocPhone = intake?.schoolPointOfContactPhone ?? school?.phone ?? ''
  const batteries = intake?.rechargeableBatteries ?? ''

  const row = [
    school?.name ?? mou.schoolName, address, spocName, spocPhone,
    ...Array.from({ length: 10 }, (_, i) => gradeCellFor(intake, i + 1)),
    batteries,
  ]

  const csv = `${headers.map(csvEscape).join(',')}\n${row.map(csvEscape).join(',')}\n`
  const filename = `${mou.id}-kit-allocation.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
