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

  it('unburies the three previously-orphaned routes', () => {
    const hrefs = NAV_ZONES.flatMap((z) => z.items.map((i) => i.href))
    expect(hrefs).toContain('/kanban') // Pipeline
    expect(hrefs).toContain('/dashboard/exceptions') // Attention
    expect(hrefs).toContain('/dashboard/leadership') // Pulse
  })
})

describe('navModel: activeTestId longest-match resolution', () => {
  const cases: Array<[string, string | null]> = [
    ['/', 'nav-home'],
    ['/mous', 'nav-mous'],
    ['/mous/MOU-STEAM-2526-001', 'nav-mous'],
    ['/kanban', 'nav-pipeline'],
    ['/dashboard/ops/kanban', 'nav-pipeline'],
    ['/dashboard/exceptions', 'nav-attention'],
    ['/dashboard/leadership', 'nav-pulse'],
    ['/dashboard/leadership/accountability', 'nav-pulse'],
    ['/finance', 'nav-fin-home'],
    ['/finance/payments', 'nav-fin-payments'],
    ['/finance/payments/new', 'nav-fin-payments'],
    ['/finance/pi/pending', 'nav-fin-pi'],
    ['/finance/adjustments', 'nav-fin-adjustments'],
    ['/finance/tally-export', 'nav-fin-tally'],
    ['/operations', 'nav-ops-home'],
    ['/operations/vex', 'nav-ops-vex'],
    ['/operations/vex/pi/new', 'nav-ops-vex'],
    ['/operations/vendors', 'nav-ops-vex'],
    ['/operations/agreements', 'nav-ops-vex'],
    ['/dispatch/kits', 'nav-ops-dispatch'],
    ['/dispatch/kits/MOU-1', 'nav-ops-dispatch'],
    ['/dispatch/kits/summary', 'nav-ops-deliveries'],
    ['/dispatch/request', 'nav-ops-dispatch'],
    ['/escalations', 'nav-ops-escalations'],
    ['/schools', 'nav-schools'],
    ['/schools/S-1', 'nav-schools'],
    ['/admin', 'nav-admin'],
    ['/admin/users', 'nav-admin'],
    ['/login', null],
    ['/feedback/abc', null],
  ]

  it.each(cases)('resolves %s to %s', (pathname, expected) => {
    expect(activeTestId(pathname)).toBe(expected)
  })
})
