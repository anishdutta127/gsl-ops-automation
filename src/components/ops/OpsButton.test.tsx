import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpsButton, opsButtonClass } from './OpsButton'

describe('opsButtonClass', () => {
  it('emits navy primary classes by default', () => {
    const c = opsButtonClass()
    expect(c).toContain('bg-brand-navy')
    expect(c).toContain('text-white')
    expect(c).toContain('min-h-11')
  })

  it('action variant: teal fill + navy text', () => {
    const c = opsButtonClass({ variant: 'action' })
    expect(c).toContain('bg-brand-teal')
    expect(c).toContain('text-brand-navy')
  })

  it('outline variant: white card + border + navy text', () => {
    const c = opsButtonClass({ variant: 'outline' })
    expect(c).toContain('bg-card')
    expect(c).toContain('border-border')
    expect(c).toContain('text-brand-navy')
  })

  it('destructive variant: signal-alert fill + white text', () => {
    const c = opsButtonClass({ variant: 'destructive' })
    expect(c).toContain('bg-signal-alert')
    expect(c).toContain('text-white')
  })

  it('size sm flips touch target down to 36px (min-h-9)', () => {
    expect(opsButtonClass({ size: 'sm' })).toContain('min-h-9')
  })

  it('size lg flips up to 48px (min-h-12)', () => {
    expect(opsButtonClass({ size: 'lg' })).toContain('min-h-12')
  })

  it('appends caller className', () => {
    expect(opsButtonClass({ className: 'w-full' })).toContain('w-full')
  })

  it('always carries focus + disabled styling tokens', () => {
    const c = opsButtonClass()
    expect(c).toContain('focus-visible:ring-2')
    expect(c).toContain('disabled:cursor-not-allowed')
    expect(c).toContain('disabled:opacity-60')
  })
})

describe('OpsButton', () => {
  it('renders <button> with type=button by default', () => {
    const html = renderToStaticMarkup(<OpsButton>Click me</OpsButton>)
    expect(html).toMatch(/^<button[^>]*type="button"/)
    expect(html).toContain('Click me')
  })

  it('respects an explicit type=submit override', () => {
    const html = renderToStaticMarkup(<OpsButton type="submit">Save</OpsButton>)
    expect(html).toContain('type="submit"')
  })

  it('forwards aria + data attributes', () => {
    const html = renderToStaticMarkup(
      <OpsButton aria-label="Open menu" data-testid="x">Open</OpsButton>,
    )
    expect(html).toContain('aria-label="Open menu"')
    expect(html).toContain('data-testid="x"')
  })

  it('disabled prop passes through', () => {
    const html = renderToStaticMarkup(<OpsButton disabled>X</OpsButton>)
    expect(html).toContain('disabled')
  })
})
