/*
 * QueueFreshnessIndicatorClient tests (Gate 5A.5 Step 2; simplified
 * post-walkthrough Fix 1).
 *
 * The top-nav surface is a plain "Sync now" button without colour-
 * coded status. The dropdown shows neutral diagnostic info (last
 * drain timestamp, pending-write count) but never a red/amber/green
 * status indicator. Click-to-sync behaviour is verified manually +
 * via the e2e harness; renderToStaticMarkup cannot exercise the
 * interactive POST path.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

import { QueueFreshnessIndicatorClient } from './QueueFreshnessIndicatorClient'

describe('QueueFreshnessIndicatorClient (post-walkthrough Fix 1)', () => {
  it('renders the top-nav button with "Sync now" label and no status dot', () => {
    const html = renderToStaticMarkup(
      <QueueFreshnessIndicatorClient
        bucket="synced"
        lastDrainAt="2026-05-12T11:55:00.000Z"
        ageMinutes={5}
        queueDepth={0}
        oldestPendingMinutes={null}
      />,
    )
    expect(html).toContain('data-testid="queue-freshness-button"')
    expect(html).toContain('Sync now')
    // Colour-coded indicators no longer surface on the top nav.
    expect(html).not.toContain('bg-signal-ok')
    expect(html).not.toContain('bg-signal-attention')
    expect(html).not.toContain('bg-signal-alert')
    expect(html).not.toContain('Synced 5 min ago')
    expect(html).not.toContain('Sync stalled')
    expect(html).not.toContain('Pending')
  })

  it('exposes a neutral aria-label regardless of bucket state', () => {
    for (const bucket of ['synced', 'pending', 'stalled'] as const) {
      const html = renderToStaticMarkup(
        <QueueFreshnessIndicatorClient
          bucket={bucket}
          lastDrainAt="2026-05-12T11:55:00.000Z"
          ageMinutes={bucket === 'stalled' ? 200 : 5}
          queueDepth={bucket === 'pending' ? 3 : 0}
          oldestPendingMinutes={bucket === 'pending' ? 2 : null}
        />,
      )
      expect(html).toMatch(/aria-label="Sync now"/)
    }
  })

  it('uses identical button markup across all three bucket inputs', () => {
    function buttonMarkup(bucket: 'synced' | 'pending' | 'stalled') {
      const html = renderToStaticMarkup(
        <QueueFreshnessIndicatorClient
          bucket={bucket}
          lastDrainAt="2026-05-12T11:55:00.000Z"
          ageMinutes={5}
          queueDepth={0}
          oldestPendingMinutes={null}
        />,
      )
      const match = html.match(
        /<button[^>]*data-testid="queue-freshness-button"[^>]*>[\s\S]*?<\/button>/,
      )
      return match?.[0]
    }
    expect(buttonMarkup('synced')).toBe(buttonMarkup('pending'))
    expect(buttonMarkup('pending')).toBe(buttonMarkup('stalled'))
  })
})
