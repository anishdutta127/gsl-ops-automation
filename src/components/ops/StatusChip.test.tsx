import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusChip } from './StatusChip'

describe('StatusChip', () => {
  it('renders label inside a rounded-full pill', () => {
    const html = renderToStaticMarkup(<StatusChip tone="ok" label="Signed" />)
    expect(html).toContain('rounded-full')
    expect(html).toContain('Signed')
  })

  it('emits tone-specific colour classes per tone', () => {
    const tones = ['ok', 'attention', 'alert', 'neutral', 'navy', 'teal'] as const
    for (const t of tones) {
      const html = renderToStaticMarkup(<StatusChip tone={t} label={t} />)
      expect(html).toContain(`data-tone="${t}"`)
    }
  })

  it('ok tone uses signal-ok colour family', () => {
    const html = renderToStaticMarkup(<StatusChip tone="ok" label="x" />)
    expect(html).toContain('bg-signal-ok/15')
    expect(html).toContain('text-signal-ok')
  })

  it('alert tone uses signal-alert colour family', () => {
    const html = renderToStaticMarkup(<StatusChip tone="alert" label="x" />)
    expect(html).toContain('bg-signal-alert/15')
    expect(html).toContain('text-signal-alert')
  })

  it('renders the leading dot by default', () => {
    const html = renderToStaticMarkup(<StatusChip tone="ok" label="x" />)
    expect(html).toContain('size-1.5 rounded-full')
  })

  it('withDot=false suppresses the dot', () => {
    const html = renderToStaticMarkup(<StatusChip tone="ok" label="x" withDot={false} />)
    expect(html).not.toContain('size-1.5 rounded-full')
  })

  it('testId attribute lands on the wrapper', () => {
    const html = renderToStaticMarkup(<StatusChip tone="ok" label="x" testId="esc-status" />)
    expect(html).toContain('data-testid="esc-status"')
  })
})
