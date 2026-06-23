import { describe, expect, it } from 'vitest'
import { NAV_ZONES, activeTestId } from './navModel'

describe('navModel: structure', () => {
  it('exposes the five zones in WATCH / WORK / RECORDS / ADMIN order', () => {
    expect(NAV_ZONES.map((z) => z.id)).toEqual([
      'watch',
      'finance',
      'operations',
      'records',
      'admin',
    ])
  })

  it('gives every item a unique testId', () => {
    const ids = NAV_ZONES.flatMap((z) => z.items.map((i) => i.testId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Phase 1.2: Watch is consolidated to Overview + Reports', () => {
    const watch = NAV_ZONES.find((z) => z.id === 'watch')!
    expect(watch.items.map((i) => i.label)).toEqual(['Overview', 'Reports'])
  })

  it('Phase 1.2: the moved surfaces are OFF the everyday nav (now in Advanced)', () => {
    const hrefs = NAV_ZONES.flatMap((z) => z.items.map((i) => i.href))
    for (const moved of [
      '/dashboard/leadership', // Pulse
      '/kanban', // Pipeline
      '/dashboard/exceptions', // Attention
      '/finance/dispatch-requests',
      '/finance/pi/pending',
      '/finance/adjustments',
      '/finance/tally-export',
      '/dispatch/kits/summary', // Deliveries
      '/operations/welcome',
      '/operations/recce',
    ]) {
      expect(hrefs).not.toContain(moved)
    }
  })

  it('Phase 1.2: Advanced is added under the Admin zone', () => {
    const admin = NAV_ZONES.find((z) => z.id === 'admin')!
    expect(admin.items.map((i) => i.href)).toContain('/admin/advanced')
  })
})

describe('navModel: activeTestId longest-match resolution', () => {
  const cases: Array<[string, string | null]> = [
    ['/work', 'nav-home'],
    ['/work/admin', 'nav-home'],
    ['/mous', 'nav-mous'],
    ['/mous/MOU-STEAM-2526-001', 'nav-mous'],
    ['/reports', 'nav-reports'],
    ['/reports/fy-summary', 'nav-reports'],
    ['/work/finance', 'nav-fin-home'],
    ['/finance/payments', 'nav-fin-payments'],
    ['/finance/payments/new', 'nav-fin-payments'],
    ['/work/ops', 'nav-ops-home'],
    ['/operations/review', 'nav-ops-review'],
    ['/operations/review/MOU-1', 'nav-ops-review'],
    ['/operations/vex', 'nav-ops-vex'],
    ['/operations/vex/pi/new', 'nav-ops-vex'],
    ['/operations/vendors', 'nav-ops-vex'],
    ['/operations/agreements', 'nav-ops-vex'],
    ['/dispatch/kits', 'nav-ops-dispatch'],
    ['/dispatch/kits/MOU-1', 'nav-ops-dispatch'],
    ['/dispatch/request', 'nav-ops-dispatch'],
    ['/escalations', 'nav-ops-escalations'],
    ['/schools', 'nav-schools'],
    ['/schools/S-1', 'nav-schools'],
    ['/admin', 'nav-admin'],
    ['/admin/users', 'nav-admin'],
    ['/admin/advanced', 'nav-advanced'],
    // Surfaces moved off the nav in Phase 1.2 no longer resolve to a nav item
    // (their routes still work; they live under Admin -> Advanced).
    ['/kanban', null],
    ['/dashboard/exceptions', null],
    ['/dashboard/leadership', null],
    ['/finance/dispatch-requests', null],
    ['/finance/pi/pending', null],
    ['/finance/adjustments', null],
    ['/finance/tally-export', null],
    ['/operations/welcome', null],
    ['/operations/recce', null],
    // Deliveries is removed, but /dispatch/kits/summary still highlights the
    // Dispatch item (it is under /dispatch/kits).
    ['/dispatch/kits/summary', 'nav-ops-dispatch'],
    ['/login', null],
    ['/feedback/abc', null],
  ]

  it.each(cases)('resolves %s to %s', (pathname, expected) => {
    expect(activeTestId(pathname)).toBe(expected)
  })
})
