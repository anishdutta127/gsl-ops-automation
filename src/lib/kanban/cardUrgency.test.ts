/*
 * W4-E.6.5 cardUrgency tests.
 */

import { describe, expect, it } from 'vitest'
import { getCardUrgency, urgencyAriaLabel } from './cardUrgency'

describe('W4-E.6.5 getCardUrgency', () => {
  it('returns none when daysInStage is null', () => {
    expect(getCardUrgency('mou-signed', null)).toBe('none')
  })

  it('returns none for terminal / holding stages even when daysInStage is set', () => {
    expect(getCardUrgency('pre-ops', 100)).toBe('none')
    expect(getCardUrgency('cross-verification', 100)).toBe('none')
    expect(getCardUrgency('feedback-submitted', 100)).toBe('none')
  })

  it('returns ok when daysInStage < 50% of limit (mou-signed limit 14d)', () => {
    expect(getCardUrgency('mou-signed', 0)).toBe('ok')
    expect(getCardUrgency('mou-signed', 6)).toBe('ok')
  })

  it('returns attention at 50%..100% of limit', () => {
    expect(getCardUrgency('mou-signed', 7)).toBe('attention')
    expect(getCardUrgency('mou-signed', 14)).toBe('attention')
  })

  it('returns alert when daysInStage exceeds limit', () => {
    expect(getCardUrgency('mou-signed', 15)).toBe('alert')
    expect(getCardUrgency('payment-received', 8)).toBe('alert')
  })
})

describe('W4-E.6.5 urgencyAriaLabel', () => {
  it('returns empty string for none level', () => {
    expect(urgencyAriaLabel('none', 'mou-signed', null)).toBe('')
  })

  it('renders "On track" wording for ok level', () => {
    expect(urgencyAriaLabel('ok', 'mou-signed', 5)).toContain('on track')
  })

  it('renders the remaining count for attention level', () => {
    expect(urgencyAriaLabel('attention', 'mou-signed', 10)).toContain('4 remaining')
  })

  it('renders Overdue wording for alert', () => {
    expect(urgencyAriaLabel('alert', 'mou-signed', 18)).toContain('Overdue by 4 days')
  })
})
