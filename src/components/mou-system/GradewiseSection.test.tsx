/*
 * Gate 3 Step 1: GradewiseSection rendering + auto-calculation tests.
 *
 * The codebase uses renderToStaticMarkup for component tests rather
 * than @testing-library/react. These tests verify the static-render
 * shape: 12 grade rows, total-students math, product-selection radios,
 * and backwards-compat with null inputs.
 *
 * Callback wiring (clicks, change events) is exercised at the
 * integration layer through the save-draft route tests.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GradewiseSection } from './GradewiseSection'
import type { GradewiseDistributionRow } from '@/lib/mouSystem/types'

const NOOP = () => undefined

describe('GradewiseSection (Gate 3 Step 1)', () => {
  it('renders 12 grade rows when expanded', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    for (let g = 1; g <= 12; g++) {
      expect(html).toContain(`Grade ${g}`)
    }
  })

  it('does not render the body when collapsed', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={false}
        onToggle={NOOP}
      />,
    )
    // The body div has id="gradewise-section-body"; absent when collapsed.
    expect(html).not.toContain('id="gradewise-section-body"')
  })

  it('shows the chosen product in the summary line', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection="TinkRworks"
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={false}
        onToggle={NOOP}
      />,
    )
    expect(html).toContain('Product: TinkRworks')
  })

  it('shows "Product: not set" when productSelection is null', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={false}
        onToggle={NOOP}
      />,
    )
    expect(html).toContain('Product: not set')
  })

  it('marks the chosen product radio as checked', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection="Both"
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    // React SSR emits checked BEFORE value, so test for the inverse order.
    expect(html).toMatch(/checked=""[^>]*value="Both"/)
    // The other two are NOT checked: their value="X" prefix has no
    // preceding checked attribute on the same input element.
    expect(html).not.toMatch(/checked=""[^>]*value="TinkRworks"/)
    expect(html).not.toMatch(/checked=""[^>]*value="Cretile"/)
  })

  it('auto-calculates total students from distribution rows', () => {
    const rows: GradewiseDistributionRow[] = [
      { grade: 1, students: 30, kitType: 'Reusable' },
      { grade: 2, students: 25, kitType: 'Reusable' },
      { grade: 5, students: 40, kitType: 'Consumable' },
    ]
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection="TinkRworks"
        gradewiseDistribution={rows}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    // The total appears inside a td with the gradewise-total testid.
    expect(html).toMatch(/data-testid="gradewise-total"[^>]*>95</)
    // And on the summary line.
    expect(html).toContain('Total students: 95')
  })

  it('renders total 0 when gradewiseDistribution is null (backwards-compat)', () => {
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    expect(html).toMatch(/data-testid="gradewise-total"[^>]*>0</)
  })

  it('shows the product-line label including TinkRworks / Cretile clarification', () => {
    // Gate 5A.5 Step 3: Misba reported the dropdown context was
    // unclear ("kit type" was being confused with "product line").
    // Header text now includes the enum values inline.
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={null}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    expect(html).toContain('Product line (TinkRworks / Cretile)')
    expect(html).toContain('Kit type')
    expect(html).toContain('(Reusable / Consumable)')
  })

  it('pre-fills students input for grades that carry data', () => {
    const rows: GradewiseDistributionRow[] = [
      { grade: 3, students: 22, kitType: 'Reusable' },
    ]
    const html = renderToStaticMarkup(
      <GradewiseSection
        productSelection={null}
        gradewiseDistribution={rows}
        onProductSelectionChange={NOOP}
        onGradewiseDistributionChange={NOOP}
        expanded={true}
        onToggle={NOOP}
      />,
    )
    // The grade-3 row's students input has value=22.
    expect(html).toMatch(/aria-label="Grade 3 students"[^>]*value="22"/)
  })
})
