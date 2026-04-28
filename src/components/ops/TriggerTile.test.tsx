import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TriggerTile } from './TriggerTile'

describe('TriggerTile', () => {
  it('renders label, primary, and threshold', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="CEO Overrides (7d)"
        primary="2"
        threshold="Trigger: 3+/week × 2 weeks"
      />,
    )
    expect(html).toContain('CEO Overrides (7d)')
    expect(html).toContain('2')
    expect(html).toContain('Trigger: 3+/week')
  })

  it('aria-label combines label, primary, status, and threshold', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Bounce Rate"
        primary="6%"
        threshold="5% triggers alert"
        status="alert"
      />,
    )
    expect(html).toMatch(/aria-label="[^"]*Bounce Rate[^"]*"/)
    expect(html).toMatch(/aria-label="[^"]*Threshold breached[^"]*"/)
  })

  it('includes redundant icon plus sr-only status text alongside coloured number', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Drift Queue"
        primary="6"
        threshold="5+ triggers attention"
        status="attention"
      />,
    )
    expect(html).toContain('Drifting')
    expect(html).toContain('var(--signal-attention)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  // W4-B.2: info popover button per tile (when the tile label has
  // matching content in TRIGGER_TILE_INFO).
  it('renders an Info popover button when the tile label has registered content', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="P2 overrides (7d)"
        primary="0"
        threshold="ok 0; alert > 3/wk"
        status="ok"
      />,
    )
    expect(html).toContain('aria-label="Information about P2 overrides (7d)"')
    expect(html).toContain('data-testid="trigger-info-P2 overrides (7d)"')
  })

  it('omits the Info popover button for tiles with no registered content', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Made-up tile"
        primary="0"
        threshold="N/A"
        status="neutral"
      />,
    )
    expect(html).not.toContain('aria-label="Information about Made-up tile"')
  })

  it('Info popover button hits the 44px touch target spec (size-11)', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Sales drift queue"
        primary="0"
        threshold="ok ≤ 5"
      />,
    )
    expect(html).toMatch(
      /<button[^>]*class="[^"]*\bsize-11\b[^"]*"[^>]*aria-label="Information about Sales drift queue"/,
    )
  })

  it('contains no raw hex codes (token discipline)', () => {
    const html = renderToStaticMarkup(
      <TriggerTile
        label="Email bounce (7d)"
        primary="2%"
        threshold="ok < 5%"
        status="ok"
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
  })
})

describe('TriggerTile W4-E.6.5 category accents', () => {
  it('Sales tiles carry data-category=sales (Sales drift queue, Captured commitments)', () => {
    for (const label of ['Sales drift queue', 'Captured commitments']) {
      const html = renderToStaticMarkup(
        <TriggerTile label={label} primary="0" threshold="x" status="ok" />,
      )
      expect(html).toContain('data-category="sales"')
      expect(html).toContain('bg-brand-teal/[0.06]')
    }
  })

  it('Ops tiles carry data-category=ops (4 tiles)', () => {
    const opsLabels = [
      'P2 overrides (7d)',
      'CC scope deltas (7d)',
      'CC toggle-offs (30d)',
      'Email bounce (7d)',
    ]
    for (const label of opsLabels) {
      const html = renderToStaticMarkup(
        <TriggerTile label={label} primary="0" threshold="x" status="ok" />,
      )
      expect(html).toContain('data-category="ops"')
      expect(html).toContain('bg-brand-navy/[0.04]')
    }
  })

  it('Finance tiles carry data-category=finance', () => {
    for (const label of ['PI blocked (GSTIN)', 'Reconcile health']) {
      const html = renderToStaticMarkup(
        <TriggerTile label={label} primary="0%" threshold="x" status="ok" />,
      )
      expect(html).toContain('data-category="finance"')
      expect(html).toContain('bg-emerald-500/[0.06]')
    }
  })

  it('Cross-functional Assignment queue carries data-category=cross', () => {
    const html = renderToStaticMarkup(
      <TriggerTile label="Assignment queue" primary="0" threshold="x" status="ok" />,
    )
    expect(html).toContain('data-category="cross"')
    expect(html).toContain('bg-amber-500/[0.05]')
  })

  it('unrecognised label has no data-category attribute (graceful fallback)', () => {
    const html = renderToStaticMarkup(
      <TriggerTile label="Some Future Tile" primary="0" threshold="x" status="ok" />,
    )
    expect(html).not.toContain('data-category=')
  })
})
