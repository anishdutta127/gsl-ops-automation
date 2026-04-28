/*
 * InventoryStatusPanel render tests (W4-G.6).
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InventoryItem } from '@/lib/types'
import { InventoryStatusPanel } from './InventoryStatusPanel'

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'INV-STEAM-KIT', skuName: 'STEAM kit set',
    category: 'Other', cretileGrade: null,
    mastersheetSourceName: null, currentStock: 200,
    reorderThreshold: 50, notes: null, active: true,
    lastUpdatedAt: '2026-04-26T10:00:00Z', lastUpdatedBy: 'system-test',
    auditLog: [],
    ...overrides,
  }
}

describe('InventoryStatusPanel', () => {
  it('renders the matched SKU stock and threshold', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType={null}
        inventoryItems={[item()]}
      />,
    )
    expect(html).toContain('STEAM kit set:')
    expect(html).toContain('200 units available')
    expect(html).toContain('threshold 50')
    expect(html).not.toContain('No inventory record')
  })

  it('shows the missing-record warning when SKU is absent', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType="Robotics"
        inventoryItems={[item({ skuName: 'Mismatch SKU' })]}
      />,
    )
    expect(html).toContain('No inventory record for SKU')
    expect(html).toContain('STEAM (Robotics) kit set')
    expect(html).toContain('/admin/inventory')
  })

  it('renders Low chip when stock at-or-below threshold', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType={null}
        inventoryItems={[item({ currentStock: 50, reorderThreshold: 50 })]}
      />,
    )
    expect(html).toContain('>Low<')
  })

  it('renders Out chip when stock zero', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType={null}
        inventoryItems={[item({ currentStock: 0 })]}
      />,
    )
    expect(html).toContain('>Out<')
  })

  it('renders Sunset chip when active=false', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType={null}
        inventoryItems={[item({ active: false })]}
      />,
    )
    expect(html).toContain('>Sunset<')
  })

  it('omits chip when stock is healthy', () => {
    const html = renderToStaticMarkup(
      <InventoryStatusPanel
        programme="STEAM"
        programmeSubType={null}
        inventoryItems={[item({ currentStock: 200, reorderThreshold: 50 })]}
      />,
    )
    expect(html).not.toContain('>Low<')
    expect(html).not.toContain('>Out<')
    expect(html).not.toContain('>Sunset<')
  })
})
