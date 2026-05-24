/*
 * GET /api/reports/[slug]/csv (Gate 5A Step 1).
 *
 * Single dynamic route serving CSV exports for all 5 reports.
 * Delegates to the per-report csvFor* builder. Filename is
 * `<slug>-<fyOrRange>.csv`.
 */

import { NextResponse } from 'next/server'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { salesTeamRepo } from '@/lib/db/repos/salesTeam'
import { getCurrentUser } from '@/lib/auth/session'
import {
  canAccessReport,
  isReportSlug,
  type ReportSlug,
} from '@/lib/reports/access'
import { parseReportFilters } from '@/lib/reports/filters'
import { csvForFySummary } from '@/lib/reports/fySummary'
import { csvForSalesPerformance } from '@/lib/reports/salesPerformance'
import { csvForDispatchPerformance } from '@/lib/reports/dispatchPerformance'
import { csvForPaymentAging } from '@/lib/reports/paymentAging'
import { csvForEscalationsReport } from '@/lib/reports/escalations'

function fileSuffix(searchParams: URLSearchParams): string {
  const fy = searchParams.get('fy')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from && to) return `${from}-to-${to}`
  if (from) return `from-${from}`
  if (to) return `to-${to}`
  if (fy) return `fy${fy}`
  return 'all'
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  if (!isReportSlug(slug)) {
    return NextResponse.json({ error: 'unknown report' }, { status: 404 })
  }
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canAccessReport(user, slug as ReportSlug)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const params: Record<string, string> = {}
  url.searchParams.forEach((v, k) => {
    params[k] = v
  })
  const filters = parseReportFilters(params)
  const now = new Date()

  const allMous = await mouRepo.findAll()
  const allPayments = await paymentRepo.findAll()
  const allSchools = await schoolRepo.findAll()
  const allDispatches = await kitDispatchRepo.findAll()
  const allEscalations = await escalationRepo.findAll()
  const allSalesTeam = await salesTeamRepo.findAll()

  let csv = ''
  if (slug === 'fy-summary') {
    csv = csvForFySummary({
      mous: allMous,
      payments: allPayments,
      dispatches: allDispatches,
      schools: allSchools,
      filters,
      now,
    })
  } else if (slug === 'sales-performance') {
    csv = csvForSalesPerformance({
      mous: allMous,
      payments: allPayments,
      salesTeam: allSalesTeam,
      filters,
      now,
    })
  } else if (slug === 'dispatch-performance') {
    csv = csvForDispatchPerformance({
      dispatches: allDispatches,
      mous: allMous,
      filters,
      now,
    })
  } else if (slug === 'payment-aging') {
    csv = csvForPaymentAging({
      payments: allPayments,
      mous: allMous,
      filters,
      now,
    })
  } else if (slug === 'escalations') {
    csv = csvForEscalationsReport({
      escalations: allEscalations,
      filters,
      now,
    })
  }

  const suffix = fileSuffix(url.searchParams)
  const filename = `${slug}-${suffix}.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
