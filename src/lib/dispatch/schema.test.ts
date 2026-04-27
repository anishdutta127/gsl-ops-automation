import { describe, expect, it } from 'vitest'
import type {
  Dispatch,
  DispatchLineItem,
  DispatchOrigin,
  DispatchRequest,
} from '@/lib/types'
import dispatchesJson from '@/data/dispatches.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'

const dispatches = dispatchesJson as unknown as Dispatch[]
const requests = dispatchRequestsJson as unknown as DispatchRequest[]

const VALID_ORIGINS: ReadonlySet<DispatchOrigin> = new Set<DispatchOrigin>([
  'sales-request',
  'ops-direct',
  'pre-w4d',
])

function assertLineItem(item: DispatchLineItem): void {
  if (item.kind === 'flat') {
    expect(typeof item.skuName).toBe('string')
    expect(item.skuName.length).toBeGreaterThan(0)
    expect(Number.isFinite(item.quantity)).toBe(true)
    expect(item.quantity).toBeGreaterThan(0)
  } else {
    expect(item.kind).toBe('per-grade')
    expect(typeof item.skuName).toBe('string')
    expect(item.skuName.length).toBeGreaterThan(0)
    expect(Array.isArray(item.gradeAllocations)).toBe(true)
    expect(item.gradeAllocations.length).toBeGreaterThan(0)
    for (const a of item.gradeAllocations) {
      expect(Number.isInteger(a.grade)).toBe(true)
      expect(a.grade).toBeGreaterThanOrEqual(1)
      expect(a.grade).toBeLessThanOrEqual(12)
      expect(Number.isFinite(a.quantity)).toBe(true)
      expect(a.quantity).toBeGreaterThan(0)
    }
  }
}

describe('W4-D.1 Dispatch fixture migration', () => {
  it('every dispatch carries the W4-D.1 required fields', () => {
    expect(dispatches.length).toBe(5)
    for (const d of dispatches) {
      expect(Array.isArray(d.lineItems)).toBe(true)
      expect(d.lineItems.length).toBeGreaterThanOrEqual(1)
      for (const li of d.lineItems) assertLineItem(li)
      expect(VALID_ORIGINS.has(d.raisedFrom)).toBe(true)
      expect(typeof d.raisedBy).toBe('string')
      expect(d.raisedBy.length).toBeGreaterThan(0)
      // requestId is null for pre-w4d migrations + ops-direct fresh raises
      if (d.raisedFrom !== 'sales-request') {
        expect(d.requestId).toBeNull()
      }
    }
  })

  it('all 5 pre-W4-D fixtures carry raisedFrom=pre-w4d (migration sentinel)', () => {
    for (const d of dispatches) {
      expect(d.raisedFrom).toBe('pre-w4d')
    }
  })

  it('DIS-002 keeps mouId null (P2 override pilot) and raisedBy attribution', () => {
    const dis002 = dispatches.find((d) => d.id === 'DIS-002')
    expect(dis002).toBeDefined()
    expect(dis002!.mouId).toBeNull()
    expect(dis002!.raisedBy).toBe('ameet.z')
  })
})

describe('W4-D.1 DispatchRequest fixture', () => {
  it('starts empty (no requests until W4-D.2 wires the Sales-side flow)', () => {
    expect(Array.isArray(requests)).toBe(true)
    expect(requests.length).toBe(0)
  })
})

describe('W4-D.1 DispatchLineItem discriminated union', () => {
  it('narrows correctly via the kind discriminator', () => {
    const flat: DispatchLineItem = { kind: 'flat', skuName: 'TWs Pampered Plant', quantity: 30 }
    const perGrade: DispatchLineItem = {
      kind: 'per-grade',
      skuName: 'Cretile Grade-band kit',
      gradeAllocations: [
        { grade: 1, quantity: 25 },
        { grade: 2, quantity: 25 },
      ],
    }
    function quantityTotal(item: DispatchLineItem): number {
      if (item.kind === 'flat') return item.quantity
      return item.gradeAllocations.reduce((sum, a) => sum + a.quantity, 0)
    }
    expect(quantityTotal(flat)).toBe(30)
    expect(quantityTotal(perGrade)).toBe(50)
  })
})
