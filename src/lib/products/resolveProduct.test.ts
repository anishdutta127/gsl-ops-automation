import { describe, expect, it } from 'vitest'
import type { Product } from '@/lib/types'
import { resolveProduct, isKnownProgramme } from './resolveProduct'

const PRODUCTS: Product[] = [
  { id: 'stem-robotics', name: 'STEM - Robotics', active: true, sortOrder: 1, legacyProgrammes: ['STEAM', 'Robotics'], createdAt: '', createdBy: null, auditLog: [] },
  { id: 'yp', name: 'YP', active: true, sortOrder: 2, legacyProgrammes: ['Young Pioneers'], createdAt: '', createdBy: null, auditLog: [] },
  { id: 'aiq', name: 'AIQ', active: false, sortOrder: 3, legacyProgrammes: [], createdAt: '', createdBy: null, auditLog: [] },
]

describe('resolveProduct (Phase 1.4 validation)', () => {
  it('matches by canonical product name (new MOUs)', () => {
    expect(resolveProduct('STEM - Robotics', PRODUCTS)?.id).toBe('stem-robotics')
    expect(resolveProduct('AIQ', PRODUCTS)?.id).toBe('aiq') // resolves even if retired
  })

  it('matches by legacy programme (existing MOUs)', () => {
    expect(resolveProduct('STEAM', PRODUCTS)?.id).toBe('stem-robotics')
    expect(resolveProduct('Robotics', PRODUCTS)?.id).toBe('stem-robotics')
    expect(resolveProduct('Young Pioneers', PRODUCTS)?.id).toBe('yp')
  })

  it('returns null for unknown / empty programmes', () => {
    expect(resolveProduct('Nonexistent', PRODUCTS)).toBeNull()
    expect(resolveProduct('', PRODUCTS)).toBeNull()
    expect(resolveProduct(null, PRODUCTS)).toBeNull()
  })

  it('isKnownProgramme reflects resolution', () => {
    expect(isKnownProgramme('STEAM', PRODUCTS)).toBe(true)
    expect(isKnownProgramme('YP', PRODUCTS)).toBe(true)
    expect(isKnownProgramme('Bogus', PRODUCTS)).toBe(false)
  })
})
