/*
 * QueueFreshnessIndicatorClient tests (Gate 5A.5 Step 2).
 *
 * Vitest does not bridge use-client interactivity through
 * renderToStaticMarkup, so the suite covers the initial render only
 * (button label per bucket, status dot colour, aria-label shape).
 * Click-to-sync behaviour is verified manually + via the e2e harness.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

import { QueueFreshnessIndicatorClient } from './QueueFreshnessIndicatorClient'

describe('QueueFreshnessIndicatorClient', () => {
  it('renders synced state with green dot and recent age', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="synced"
        lastDrainAt="2026-05-12T11:55:00.000Z"
        ageMinutes={5}
        queueDepth={0}
        oldestPendingMinutes={null}
      />,
    )
    expect(html).toContain('data-bucket="synced"')
    expect(html).toContain('bg-signal-ok')
    expect(html).toContain('Synced 5 min ago')
  })

  it('renders pending state with amber dot and write count', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="pending"
        lastDrainAt="2026-05-12T11:55:00.000Z"
        ageMinutes={3}
        queueDepth={4}
        oldestPendingMinutes={2}
      />,
    )
    expect(html).toContain('data-bucket="pending"')
    expect(html).toContain('bg-signal-attention')
    expect(html).toContain('Pending 4 writes')
  })

  it('singularises pending label for one write', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="pending"
        lastDrainAt={null}
        ageMinutes={null}
        queueDepth={1}
        oldestPendingMinutes={2}
      />,
    )
    expect(html).toContain('Pending 1 write')
    expect(html).not.toContain('Pending 1 writes')
  })

  it('renders stalled state with red dot and stalled age', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="stalled"
        lastDrainAt="2026-05-12T10:30:00.000Z"
        ageMinutes={90}
        queueDepth={0}
        oldestPendingMinutes={null}
      />,
    )
    expect(html).toContain('data-bucket="stalled"')
    expect(html).toContain('bg-signal-alert')
    expect(html).toContain('Sync stalled')
  })

  it('renders stalled with "never" when no drain has been recorded', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="stalled"
        lastDrainAt={null}
        ageMinutes={null}
        queueDepth={0}
        oldestPendingMinutes={null}
      />,
    )
    expect(html).toContain('Sync never run')
  })

  it('exposes a screen-reader-friendly aria-label', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="synced"
        lastDrainAt="2026-05-12T11:55:00.000Z"
        ageMinutes={5}
        queueDepth={0}
        oldestPendingMinutes={null}
      />,
    )
    expect(html).toMatch(/aria-label="Sync status: Synced 5 min ago"/)
  })
})
