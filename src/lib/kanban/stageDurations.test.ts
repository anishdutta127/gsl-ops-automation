import { describe, expect, it } from 'vitest'
import {
  getStageDurationDays,
  isOverdue,
} from './stageDurations'

describe('getStageDurationDays', () => {
  it('reads transitions from lifecycle_rules.json (W3-D)', () => {
    expect(getStageDurationDays('mou-signed')).toBe(14)
    expect(getStageDurationDays('actuals-confirmed')).toBe(14)
    expect(getStageDurationDays('invoice-raised')).toBe(30)
    expect(getStageDurationDays('payment-received')).toBe(7)
    expect(getStageDurationDays('kit-dispatched')).toBe(5)
    expect(getStageDurationDays('delivery-acknowledged')).toBe(7)
    expect(getStageDurationDays('feedback-submitted')).toBe(30)
  })

  it('Pre-Ops triage budget stays hardcoded at 30 days (special case)', () => {
    expect(getStageDurationDays('pre-ops')).toBe(30)
  })

  it('cross-verification has no defined duration (auto-skipped stage)', () => {
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
