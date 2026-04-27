import { describe, expect, it } from 'vitest'
import {
  getStageDurationDays,
  isOverdue,
  STAGE_DURATION_DAYS,
} from './stageDurations'

describe('STAGE_DURATION_DAYS', () => {
  it('matches the W3-D plan + Anish refinements', () => {
    expect(STAGE_DURATION_DAYS['mou-signed']).toBe(14)
    expect(STAGE_DURATION_DAYS['actuals-confirmed']).toBe(14)
    expect(STAGE_DURATION_DAYS['invoice-raised']).toBe(30)
    expect(STAGE_DURATION_DAYS['payment-received']).toBe(7)
    expect(STAGE_DURATION_DAYS['kit-dispatched']).toBe(5)
    expect(STAGE_DURATION_DAYS['delivery-acknowledged']).toBe(7)
    expect(STAGE_DURATION_DAYS['feedback-submitted']).toBe(30)
    expect(STAGE_DURATION_DAYS['pre-ops']).toBe(30)
  })

  it('cross-verification has no defined duration (auto-skipped stage)', () => {
    expect(STAGE_DURATION_DAYS['cross-verification']).toBeNull()
  })
})

describe('getStageDurationDays', () => {
  it('returns the limit for known stages', () => {
    expect(getStageDurationDays('invoice-raised')).toBe(30)
  })

  it('returns null for cross-verification', () => {
    expect(getStageDurationDays('cross-verification')).toBeNull()
  })
})

describe('isOverdue', () => {
  it('returns false when daysInStage is null', () => {
    expect(isOverdue('invoice-raised', null)).toBe(false)
  })

  it('returns false when stage has no duration (cross-verification)', () => {
    expect(isOverdue('cross-verification', 100)).toBe(false)
  })

  it('returns false when within budget', () => {
    expect(isOverdue('invoice-raised', 20)).toBe(false)
    expect(isOverdue('invoice-raised', 30)).toBe(false) // boundary: equal is NOT overdue
  })

  it('returns true past budget', () => {
    expect(isOverdue('invoice-raised', 31)).toBe(true)
    expect(isOverdue('kit-dispatched', 6)).toBe(true) // 5-day budget
  })

  it('Pre-Ops triage: 30 days budget', () => {
    expect(isOverdue('pre-ops', 30)).toBe(false)
    expect(isOverdue('pre-ops', 31)).toBe(true)
  })
})
