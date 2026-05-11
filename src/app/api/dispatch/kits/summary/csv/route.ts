/*
 * GET /api/dispatch/kits/summary/csv (Gate 3 Step 9).
 *
 * Flat CSV export of every KitDispatch.
 */

import { getCurrentUser } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import type { KitDispatch, MOU, School } from '@/lib/types'
import mousJson from '@/data/mous.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import schoolsJson from '@/data/schools.json'
import { deriveSummaryRows, rowsToCsv } from '@/lib/kitDispatch/summaryView'

const mous = mousJson as unknown as MOU[]
const kitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const schools = schoolsJson as unknown as School[]

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const rows = deriveSummaryRows({ kitDispatches, mous, schools })
  const csv = rowsToCsv(rows)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition':
        'attachment; filename="kits-dispatch-summary.csv"',
    },
  })
}
