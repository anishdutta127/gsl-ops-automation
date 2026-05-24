/*
 * GET /api/dispatch/kits/summary/csv (Gate 3 Step 9).
 *
 * Flat CSV export of every KitDispatch.
 */

import { getCurrentUser } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import { mouRepo } from '@/lib/db/repos/mou'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { schoolRepo } from '@/lib/db/repos/school'
import { deriveSummaryRows, rowsToCsv } from '@/lib/kitDispatch/summaryView'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const mous = await mouRepo.findAll()
  const kitDispatches = await kitDispatchRepo.findAll()
  const schools = await schoolRepo.findAll()
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
