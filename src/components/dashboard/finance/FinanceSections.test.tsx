/*
 * Section-level structural tests for the Finance dashboard components
 * (Gate 4.95 Session 2). Each section is exercised with mock props
 * via renderToStaticMarkup; assertions cover key copy + testids.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KpiStrip } from './KpiStrip'
import { HighPriorityAlertsPanel } from './HighPriorityAlertsPanel'
import { TopOverduePaymentsPanel } from './TopOverduePaymentsPanel'
import { RenewalNeededPanel } from './RenewalNeededPanel'
import { AmountReceiptSummary } from './AmountReceiptSummary'
import { VexKitOrdersTile } from './VexKitOrdersTile'
import { ProgrammeBreakdown } from './ProgrammeBreakdown'
import type {
  HighPriorityAlert,
  KpiStripData,
  ProgrammeBreakdownRow,
  RenewalRow,
  TopOverdueRow,
} from '@/lib/dashboard/financeDashboardData'

const KPI: KpiStripData = {
  contractValue: 12500000,
  schoolsCount: 9,
  collectedAmount: 5000000,
  collectedPct: 40,
  outstandingAmount: 7500000,
  outstandingSchoolsCount: 6,
  needsAttentionCount: 5,
  overduePaymentsCount: 3,
  stalledPiCount: 2,
}

describe('KpiStrip', () => {
  it('renders the four headline testids in order: contract value, collected, outstanding, needs attention', () => {
    const html = renderToStaticMarkup(
      <KpiStrip data={KPI} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('data-testid="kpi-contract-value"')
    expect(html).toContain('data-testid="kpi-collected"')
    expect(html).toContain('data-testid="kpi-outstanding"')
    expect(html).toContain('data-testid="kpi-needs-attention"')
    expect(html.indexOf('kpi-contract-value')).toBeLessThan(
      html.indexOf('kpi-collected'),
    )
    expect(html.indexOf('kpi-collected')).toBeLessThan(
      html.indexOf('kpi-outstanding'),
    )
    expect(html.indexOf('kpi-outstanding')).toBeLessThan(
      html.indexOf('kpi-needs-attention'),
    )
  })

  it('shows the contract-value subtitle "across N active schools" by default', () => {
    const html = renderToStaticMarkup(
      <KpiStrip data={KPI} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('across 9 active schools')
  })

  it('shows "across N schools in FY 2026-27" when scopeLabel is set', () => {
    const html = renderToStaticMarkup(
      <KpiStrip
        data={KPI}
        needsAttentionHref="/dashboard/finance#top-overdue-payments"
        scopeLabel="FY 2026-27"
      />,
    )
    expect(html).toContain('across 9 schools in FY 2026-27')
  })

  it('collected subtitle reads "X% of total contract value"', () => {
    const html = renderToStaticMarkup(
      <KpiStrip data={KPI} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('40.0% of total contract value')
  })

  it('outstanding subtitle reads "across N schools with balance"', () => {
    const html = renderToStaticMarkup(
      <KpiStrip data={KPI} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('across 6 schools with balance')
  })

  it('needs-attention card links to the drilldown href and breaks down overdue + stalled', () => {
    const html = renderToStaticMarkup(
      <KpiStrip data={KPI} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toMatch(
      /data-testid="kpi-needs-attention"[^>]*href="\/dashboard\/finance#top-overdue-payments"|href="\/dashboard\/finance#top-overdue-payments"[^>]*data-testid="kpi-needs-attention"/,
    )
    expect(html).toContain('3 overdue payments')
    expect(html).toContain('2 stalled PIs')
  })

  it('shows the empty-state subtitle when nothing needs attention', () => {
    const calmKpi: KpiStripData = {
      ...KPI,
      needsAttentionCount: 0,
      overduePaymentsCount: 0,
      stalledPiCount: 0,
    }
    const html = renderToStaticMarkup(
      <KpiStrip data={calmKpi} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('No overdue payments or stalled PIs')
  })

  it('shows "Every school has settled" when outstandingSchoolsCount is zero', () => {
    const settled: KpiStripData = {
      ...KPI,
      outstandingSchoolsCount: 0,
    }
    const html = renderToStaticMarkup(
      <KpiStrip data={settled} needsAttentionHref="/dashboard/finance#top-overdue-payments" />,
    )
    expect(html).toContain('Every school has settled')
  })
})

describe('HighPriorityAlertsPanel', () => {
  it('renders empty state when no alerts', () => {
    const html = renderToStaticMarkup(<HighPriorityAlertsPanel alerts={[]} />)
    expect(html).toContain('data-testid="high-priority-alerts-panel"')
    expect(html).toContain('No high-priority alerts')
  })

  it('renders alert cards when populated', () => {
    const alerts: HighPriorityAlert[] = [
      {
        id: 'ESC-1',
        severity: 'critical',
        type: 'Payment',
        schoolName: 'Test School',
        description: 'Payment overdue 60 days',
        href: '/escalations/ESC-1',
      },
      {
        id: 'ESC-2',
        severity: 'high',
        type: 'Delivery',
        schoolName: 'Another School',
        description: 'Kits stuck in transit',
        href: '/escalations/ESC-2',
      },
    ]
    const html = renderToStaticMarkup(<HighPriorityAlertsPanel alerts={alerts} />)
    expect(html).toContain('Test School')
    expect(html).toContain('Another School')
    expect(html).toContain('Critical')
    expect(html).toContain('High')
  })
})

describe('TopOverduePaymentsPanel', () => {
  it('renders empty state when no rows', () => {
    const html = renderToStaticMarkup(<TopOverduePaymentsPanel rows={[]} />)
    expect(html).toContain('data-testid="top-overdue-payments-panel"')
    expect(html).toContain('No overdue payments')
  })

  it('renders rows when populated', () => {
    const rows: TopOverdueRow[] = [
      {
        paymentId: 'P-1',
        mouId: 'MOU-1',
        schoolName: 'STEAM School',
        programme: 'STEAM',
        piNumber: 'GSL/OPS/26-27/0001',
        instalmentLabel: '1 of 4',
        description: 'First instalment',
        dueDateRaw: '15-Apr-2026',
        balance: 250000,
        daysOverdue: 12,
      },
    ]
    const html = renderToStaticMarkup(<TopOverduePaymentsPanel rows={rows} />)
    expect(html).toContain('STEAM School')
    expect(html).toContain('GSL/OPS/26-27/0001')
    expect(html).toContain('1 of 4')
    expect(html).toContain('1 payment past due')
  })
})

describe('RenewalNeededPanel', () => {
  it('renders empty state when no rows', () => {
    const html = renderToStaticMarkup(
      <RenewalNeededPanel rows={[]} expiredCount={0} expiringSoonCount={0} />,
    )
    expect(html).toContain('data-testid="renewal-needed-panel"')
    expect(html).toContain('No MOUs need renewal in the next 30 days')
  })

  it('renders rows when populated', () => {
    const rows: RenewalRow[] = [
      {
        mouId: 'MOU-RENEW-1',
        schoolName: 'Renew School',
        programme: 'Robotics',
        status: 'Active',
        endDate: '2026-05-30',
        daysToExpiry: 18,
        isExpired: false,
        contractValue: 500000,
      },
      {
        mouId: 'MOU-EXPIRED-1',
        schoolName: 'Expired School',
        programme: 'STEAM',
        status: 'Expired',
        endDate: '2026-03-30',
        daysToExpiry: -42,
        isExpired: true,
        contractValue: 700000,
      },
    ]
    const html = renderToStaticMarkup(
      <RenewalNeededPanel rows={rows} expiredCount={1} expiringSoonCount={1} />,
    )
    expect(html).toContain('Renew School')
    expect(html).toContain('Expired School')
    expect(html).toContain('1 expired, 1 due in 30 days')
    expect(html).toContain('expires in 18d')
    expect(html).toContain('expired 42d ago')
  })
})

describe('AmountReceiptSummary', () => {
  it('renders summary cards + windowLabel + drilldown href', () => {
    const html = renderToStaticMarkup(
      <AmountReceiptSummary
        data={{
          schoolsCount: 12,
          totalDue: 4500000,
          received: 3000000,
          pending: 1500000,
          excessAmount: 0,
        }}
        windowLabel="FY 2026-27"
        receiptsHref="/finance/receipts?fy=2026-27"
      />,
    )
    expect(html).toContain('data-testid="amount-receipt-summary"')
    expect(html).toContain('FY 2026-27')
    expect(html).toContain('Total Schools')
    expect(html).toContain('Total Due')
    expect(html).toContain('Received')
    expect(html).toContain('Pending')
    expect(html).toContain('href="/finance/receipts?fy=2026-27"')
  })

  it('shows the excess-credit warning when excess > 0', () => {
    const html = renderToStaticMarkup(
      <AmountReceiptSummary
        data={{
          schoolsCount: 1,
          totalDue: 100000,
          received: 150000,
          pending: 0,
          excessAmount: 50000,
        }}
        windowLabel="this FY"
        receiptsHref="/finance/receipts"
      />,
    )
    expect(html).toContain('data-testid="receipt-excess-warning"')
    expect(html).toContain('Receipts exceed dues')
  })
})

describe('VexKitOrdersTile', () => {
  it('renders all 4 VEX cards', () => {
    const html = renderToStaticMarkup(
      <VexKitOrdersTile
        data={{
          vexSchools: 4,
          piCount: 6,
          totalPipeline: 1200000,
          pendingDispatch: 2,
          salesInvoiceAmount: 800000,
        }}
        windowLabel="this FY"
      />,
    )
    expect(html).toContain('data-testid="vex-kit-orders-tile"')
    expect(html).toContain('VEX schools')
    expect(html).toContain('Pipeline value')
    expect(html).toContain('Awaiting dispatch')
    expect(html).toContain('Sales invoice amount')
    expect(html).toContain('6 PIs in this FY')
  })
})

describe('ProgrammeBreakdown', () => {
  const ROWS: ProgrammeBreakdownRow[] = [
    {
      programme: 'STEAM',
      mouCount: 10,
      studentsCount: 1500,
      contractValue: 7500000,
      barPct: 100,
    },
    {
      programme: 'Young Pioneers',
      mouCount: 4,
      studentsCount: 600,
      contractValue: 1500000,
      barPct: 40,
    },
    {
      programme: 'Harvard HBPE',
      mouCount: 0,
      studentsCount: 0,
      contractValue: 0,
      barPct: 0,
    },
    {
      programme: 'Robotics',
      mouCount: 2,
      studentsCount: 200,
      contractValue: 300000,
      barPct: 20,
    },
  ]

  it('renders one row per programme + bar widths', () => {
    const html = renderToStaticMarkup(
      <ProgrammeBreakdown rows={ROWS} filterActive={false} />,
    )
    expect(html).toContain('data-testid="programme-breakdown"')
    expect(html).toContain('data-testid="programme-row-STEAM"')
    expect(html).toContain('data-testid="programme-row-Young Pioneers"')
    expect(html).toContain('10 MOUs · 1500 students')
    expect(html).toContain('width:100%')
  })

  it('shows filter footnote when active', () => {
    const html = renderToStaticMarkup(
      <ProgrammeBreakdown rows={ROWS} filterActive={true} />,
    )
    expect(html).toContain('Filtered view')
  })

  it('hides filter footnote when not active', () => {
    const html = renderToStaticMarkup(
      <ProgrammeBreakdown rows={ROWS} filterActive={false} />,
    )
    expect(html).not.toContain('Filtered view')
  })
})
