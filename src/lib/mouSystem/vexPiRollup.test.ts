import { describe, it, expect } from 'vitest'
import { rollUpVexPiStatus } from './vexPiRollup'
import type { VexPi, VexPiLineItem, VexPiStatus } from './types'

function li(partNumber: string, quantity: number): VexPiLineItem {
  return {
    partNumber,
    productName: partNumber,
    quantity,
    unitPrice: 100,
    total: 100 * quantity,
  }
}

function pi(
  status: VexPiStatus,
  lineItems: VexPiLineItem[],
): Pick<VexPi, 'id' | 'status' | 'lineItems'> {
  return { id: 'VEXPI-UP-2627-001', status, lineItems }
}

function d(
  status: string,
  items: { partNumber: string; qty: number }[],
  piId = 'VEXPI-UP-2627-001',
) {
  return { piId, status, items }
}

describe('rollUpVexPiStatus', () => {
  it('returns null when the PI has no dispatches', () => {
    expect(rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5)]), [])).toBeNull()
  })

  it('returns null when dispatches exist but none are Delivered (still in flight)', () => {
    const r = rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5)]), [
      d('Shipped', [{ partNumber: 'A', qty: 5 }]),
    ])
    expect(r).toBeNull()
  })

  it('Completed when every line item is fully dispatched and all dispatches Delivered', () => {
    const r = rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5), li('B', 2)]), [
      d('Delivered', [{ partNumber: 'A', qty: 5 }]),
      d('Delivered', [{ partNumber: 'B', qty: 2 }]),
    ])
    expect(r).toBe('Completed')
  })

  it('Partially Dispatched when delivered but a line item has qty still pending', () => {
    const r = rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5)]), [
      d('Delivered', [{ partNumber: 'A', qty: 3 }]),
    ])
    expect(r).toBe('Partially Dispatched')
  })

  it('Partially Dispatched when one dispatch delivered and another still shipped', () => {
    const r = rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5)]), [
      d('Delivered', [{ partNumber: 'A', qty: 2 }]),
      d('Shipped', [{ partNumber: 'A', qty: 3 }]),
    ])
    expect(r).toBe('Partially Dispatched')
  })

  it('does NOT mark Completed when some ordered qty was never dispatched (confirmed guard)', () => {
    const r = rollUpVexPiStatus(pi('Delivery Pending', [li('A', 5), li('B', 2)]), [
      d('Delivered', [{ partNumber: 'A', qty: 5 }]), // B never dispatched
    ])
    expect(r).toBe('Partially Dispatched')
  })

  it('is forward-only: never rewinds a PI already further along', () => {
    expect(
      rollUpVexPiStatus(pi('Completed', [li('A', 5)]), [
        d('Delivered', [{ partNumber: 'A', qty: 2 }]),
      ]),
    ).toBeNull()
    expect(
      rollUpVexPiStatus(pi('Partially Dispatched', [li('A', 5)]), [
        d('Delivered', [{ partNumber: 'A', qty: 2 }]),
      ]),
    ).toBeNull()
  })

  it('advances Generated straight to Completed on full delivery', () => {
    const r = rollUpVexPiStatus(pi('Generated', [li('A', 1)]), [
      d('Delivered', [{ partNumber: 'A', qty: 1 }]),
    ])
    expect(r).toBe('Completed')
  })
})
