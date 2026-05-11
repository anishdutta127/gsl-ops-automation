/*
 * GET /api/reports/[slug]/csv (Gate 5A Step 1).
 *
 * Single dynamic route serving CSV exports for all 5 reports.
 * Delegates to the per-report csvFor* builder. Filename is
 * `<slug>-<fyOrRange>.csv`.
 */

import { NextResponse } from 'next/server'
import type {
  Escalation,
  KitDispatch,
  MOU,
  Payment,
  School,
} from '@/lib/types'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import schoolsJson from '@/data/schools.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import escalationsJson from '@/data/escalations.json'
import salesTeamJson from '@/data/sales_team.json'
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

const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allSchools = schoolsJson as unknown as School[]
const allDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allEscalations = escalationsJson as unknown as Escalation[]
const allSalesTeam = salesTeamJson as unknown as Array<{
  id: string
  name: string
  email?: string
  active?: boolean
}>

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
