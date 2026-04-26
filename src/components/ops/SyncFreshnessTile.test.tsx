import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SyncFreshnessTile,
  bucketForAgeMinutes,
  formatRelativeAge,
} from './SyncFreshnessTile'

const NOW = new Date('2026-04-26T10:00:00.000Z')

describe('bucketForAgeMinutes', () => {
  it('alert when never synced (null age)', () => {
    expect(bucketForAgeMinutes(null, true)).toBe('alert')
  })

  it('alert when ok=false regardless of age', () => {
    expect(bucketForAgeMinutes(5, false)).toBe('alert')
  })

  it('ok when fresh (<120 min)', () => {
    expect(bucketForAgeMinutes(0, true)).toBe('ok')
    expect(bucketForAgeMinutes(60, true)).toBe('ok')
    expect(bucketForAgeMinutes(119, true)).toBe('ok')
  })

  it('attention at 2-24h', () => {
    expect(bucketForAgeMinutes(120, true)).toBe('attention')
    expect(bucketForAgeMinutes(60 * 12, true)).toBe('attention')
    expect(bucketForAgeMinutes(60 * 23, true)).toBe('attention')
  })

  it('alert when stale (>=24h)', () => {
    expect(bucketForAgeMinutes(60 * 24, true)).toBe('alert')
    expect(bucketForAgeMinutes(60 * 48, true)).toBe('alert')
  })
})

describe('formatRelativeAge', () => {
  it('returns Never when ageMinutes is null', () => {
    expect(formatRelativeAge(null)).toBe('Never')
  })

  it('shows minutes for under an hour', () => {
    expect(formatRelativeAge(0)).toBe('just now')
    expect(formatRelativeAge(15)).toBe('15 min ago')
    expect(formatRelativeAge(59)).toBe('59 min ago')
  })

  it('shows hours up to 23h', () => {
    expect(formatRelativeAge(60)).toBe('1h ago')
    expect(formatRelativeAge(60 * 5)).toBe('5h ago')
    expect(formatRelativeAge(60 * 23)).toBe('23h ago')
  })

  it('shows yesterday at 24h', () => {
    expect(formatRelativeAge(60 * 24)).toBe('yesterday')
    expect(formatRelativeAge(60 * 30)).toBe('yesterday')
  })

  it('shows days for 2+ days', () => {
    expect(formatRelativeAge(60 * 48)).toBe('2d ago')
    expect(formatRelativeAge(60 * 72)).toBe('3d ago')
  })
})

describe('SyncFreshnessTile component', () => {
  it('renders Never state with alert dot when latestAt is null', () => {
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={null} ok={true} now={NOW} />,
    )
    expect(html).toContain('Never')
    expect(html).toContain('No syncs recorded yet')
    expect(html).toContain('var(--signal-alert)')
  })

  it('renders fresh ok state with green dot', () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString()
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={fiveMinAgo} ok={true} now={NOW} />,
    )
    expect(html).toContain('5 min ago')
    expect(html).toContain('Last run healthy')
    expect(html).toContain('var(--signal-ok)')
  })

  it('renders amber attention state for 2-24h old', () => {
    const fiveHoursAgo = new Date(NOW.getTime() - 5 * 60 * 60_000).toISOString()
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={fiveHoursAgo} ok={true} now={NOW} />,
    )
    expect(html).toContain('5h ago')
    expect(html).toContain('var(--signal-attention)')
  })

  it('renders alert when last run was ok=false', () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString()
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={fiveMinAgo} ok={false} now={NOW} />,
    )
    expect(html).toContain('Anomaly recorded')
    expect(html).toContain('var(--signal-alert)')
  })

  it('links to /admin', () => {
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={null} ok={false} now={NOW} />,
    )
    expect(html).toContain('href="/admin"')
  })

  it('uses CSS variables, no raw hex', () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString()
    const html = renderToStaticMarkup(
      <SyncFreshnessTile latestAt={fiveMinAgo} ok={true} now={NOW} />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})
