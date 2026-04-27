import { describe, expect, it } from 'vitest'
import { importSchool, type RawUpstreamSchool } from './fromSchools'

const TS = '2026-04-27T10:00:00.000Z'

function raw(overrides: Partial<RawUpstreamSchool> = {}): RawUpstreamSchool {
  return {
    id: 'SCH-TEST',
    name: 'Test School',
    state: 'Maharashtra',
    city: 'Pune',
    ...overrides,
  }
}

describe('importSchool', () => {
  it('maps known states to canonical regions', () => {
    expect(importSchool(raw({ state: 'West Bengal' }), TS).school.region).toBe('East')
    expect(importSchool(raw({ state: 'Delhi' }), TS).school.region).toBe('North')
    expect(importSchool(raw({ state: 'Karnataka' }), TS).school.region).toBe('South-West')
    expect(importSchool(raw({ state: 'Maharashtra' }), TS).school.region).toBe('South-West')
  })

  it('maps known typo variants to the canonical region', () => {
    expect(importSchool(raw({ state: 'Karanataka' }), TS).school.region).toBe('South-West')
    expect(importSchool(raw({ state: 'Tamilnadu' }), TS).school.region).toBe('South-West')
    expect(importSchool(raw({ state: 'Chhatisgarh' }), TS).school.region).toBe('South-West')
  })

  it('falls back to East and surfaces an anomaly when state is unmapped', () => {
    const result = importSchool(raw({ state: 'Mars' }), TS)
    expect(result.school.region).toBe('East')
    const anomaly = result.anomalies.find(a => a.kind === 'unmapped-state')
    expect(anomaly?.detail).toContain('Mars')
  })

  it('falls back to East and surfaces null-state anomaly when state is null', () => {
    const result = importSchool(raw({ state: null }), TS)
    expect(result.school.region).toBe('East')
    const anomaly = result.anomalies.find(a => a.kind === 'null-state')
    expect(anomaly).toBeDefined()
  })

  it('surfaces an incomplete-contact anomaly for missing email + GSTIN + contactPerson + pinCode', () => {
    const result = importSchool(raw({ email: null, contactPerson: null, gstNumber: null, pinCode: null }), TS)
    const anomaly = result.anomalies.find(a => a.kind === 'incomplete-contact')
    expect(anomaly?.detail).toContain('email')
    expect(anomaly?.detail).toContain('gstNumber')
    expect(anomaly?.detail).toContain('contactPerson')
    expect(anomaly?.detail).toContain('pinCode')
  })

  it('records a single create-action audit entry on import', () => {
    const result = importSchool(raw(), TS)
    expect(result.school.auditLog).toHaveLength(1)
    expect(result.school.auditLog[0]?.action).toBe('create')
    expect(result.school.auditLog[0]?.timestamp).toBe(TS)
  })

  it('sets active=true and createdAt=importTimestamp', () => {
    const result = importSchool(raw(), TS)
    expect(result.school.active).toBe(true)
    expect(result.school.createdAt).toBe(TS)
  })
})
