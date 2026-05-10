import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { User } from '@/lib/types'
import {
  DepartmentDashboardSkeleton,
  type PrimaryAction,
  type RecentActivityItem,
} from './DepartmentDashboardSkeleton'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'misba.m', name: 'Misba M.', email: 'misba.m@example.test',
    role: 'Admin', department: 'ops', testingOverride: false, active: true,
    passwordHash: 'X', createdAt: '', auditLog: [], ...overrides,
  }
}

const sampleActions: PrimaryAction[] = [
  { label: 'Raise dispatch', href: '/dispatch', description: 'Kit dispatch flow' },
  { label: 'Escalations', href: '/escalations', description: 'Open tickets' },
]

describe('DepartmentDashboardSkeleton', () => {
  it('renders the welcome card with the user name', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser({ name: 'Pradeep R.' })}
        stageDepartment="ops"
        title="Operations workspace"
        subtitle="Ops summary"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).toContain('Pradeep R.')
    expect(html).toContain('Operations workspace')
    expect(html).toContain('Ops summary')
  })

  it('renders the department badge with the stage label', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="finance"
        title="Finance workspace"
        subtitle="Finance summary"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).toMatch(/data-testid="dashboard-dept-badge"[^>]*data-dept="finance"/)
    expect(html).toContain('Finance')
  })

  it('renders primary action cards with their hrefs', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="ops"
        title="Ops"
        subtitle="Ops"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).toContain('href="/dispatch"')
    expect(html).toContain('href="/escalations"')
    expect(html).toContain('Raise dispatch')
    expect(html).toContain('Escalations')
  })

  it('renders the empty state when recent activity is empty', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="sales"
        title="Sales"
        subtitle="Sales"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).toContain('data-testid="dashboard-recent-activity-empty"')
    expect(html).toContain('No recent activity yet')
  })

  it('renders activity rows when recentActivity is non-empty', () => {
    const items: RecentActivityItem[] = [
      {
        id: 'a1',
        timestamp: '2026-05-10T10:00:00Z',
        user: 'misba.m',
        action: 'dispatch-raised',
        description: 'Raised dispatch DSP-001 for Riverdale Mumbai',
      },
    ]
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="ops"
        title="Ops"
        subtitle="Ops"
        primaryActions={sampleActions}
        recentActivity={items}
      />,
    )
    expect(html).toContain('Raised dispatch DSP-001 for Riverdale Mumbai')
    expect(html).toContain('dispatch-raised')
    expect(html).toContain('2026-05-10')
  })

  it('renders the KPI placeholder pointing at /reports', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="cross-functional"
        title="Leadership"
        subtitle="Leadership"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).toContain('data-testid="dashboard-kpi-empty-state"')
    expect(html).toContain('href="/reports"')
    expect(html).toContain('Detailed KPIs available in the Reports module')
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(
      <DepartmentDashboardSkeleton
        user={makeUser()}
        stageDepartment="ops"
        title="Ops"
        subtitle="Ops"
        primaryActions={sampleActions}
        recentActivity={[]}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
