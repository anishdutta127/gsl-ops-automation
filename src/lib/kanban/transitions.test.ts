import { describe, expect, it } from 'vitest'
import {
  buildForwardFormPath,
  classifyTransition,
  validateReason,
} from './transitions'

describe('classifyTransition', () => {
  it('same column => no-op', () => {
    const r = classifyTransition('invoice-raised', 'invoice-raised', 'M1')
    expect(r.kind).toBe('no-op')
    expect(r.reasonRequired).toBe(false)
    expect(r.forwardFormPath).toBeNull()
  })

  it('drop into Pre-Ops => rejected (one-way exit)', () => {
    const r = classifyTransition('mou-signed', 'pre-ops', 'M1')
    expect(r.kind).toBe('rejected')
    expect(r.reasonRequired).toBe(false)
  })

  it('Pre-Ops exit => requires reason; triage classification', () => {
    const r = classifyTransition('pre-ops', 'mou-signed', 'M1')
    expect(r.kind).toBe('pre-ops-exit')
    expect(r.reasonRequired).toBe(true)
    expect(r.forwardFormPath).toBeNull()
  })

  it('Pre-Ops exit to invoice-raised => forwardFormPath populated for navigate-on-confirm', () => {
    const r = classifyTransition('pre-ops', 'invoice-raised', 'M-test-1')
    expect(r.kind).toBe('pre-ops-exit')
    expect(r.forwardFormPath).toBe('/mous/M-test-1/pi')
  })

  it('forward-by-one (actuals-confirmed -> cross-verification): happy path; no reason', () => {
    const r = classifyTransition('actuals-confirmed', 'cross-verification', 'M1')
    expect(r.kind).toBe('forward-by-one')
    expect(r.reasonRequired).toBe(false)
  })

  it('forward-by-one to invoice-raised => forwardFormPath = /mous/{id}/pi', () => {
    const r = classifyTransition('cross-verification', 'invoice-raised', 'MOU-X')
    expect(r.kind).toBe('forward-by-one')
    expect(r.forwardFormPath).toBe('/mous/MOU-X/pi')
  })

  it('forward-skip (mou-signed -> kit-dispatched): requires reason', () => {
    const r = classifyTransition('mou-signed', 'kit-dispatched', 'M1')
    expect(r.kind).toBe('forward-skip')
    expect(r.reasonRequired).toBe(true)
  })

  it('forward-skip to delivery-acknowledged => forwardFormPath = /mous/{id}/delivery-ack', () => {
    const r = classifyTransition('mou-signed', 'delivery-acknowledged', 'M-Z')
    expect(r.forwardFormPath).toBe('/mous/M-Z/delivery-ack')
  })

  it('backward by 1 (invoice-raised -> actuals-confirmed): requires reason; no form', () => {
    const r = classifyTransition('invoice-raised', 'actuals-confirmed', 'M1')
    expect(r.kind).toBe('backward')
    expect(r.reasonRequired).toBe(true)
    expect(r.forwardFormPath).toBeNull()
  })

  it('backward by many (feedback-submitted -> mou-signed): requires reason', () => {
    const r = classifyTransition('feedback-submitted', 'mou-signed', 'M1')
    expect(r.kind).toBe('backward')
    expect(r.reasonRequired).toBe(true)
  })

  it('Pre-Ops to Pre-Ops is no-op (not rejected)', () => {
    const r = classifyTransition('pre-ops', 'pre-ops', 'M1')
    expect(r.kind).toBe('no-op')
  })
})

describe('buildForwardFormPath', () => {
  it('actuals-confirmed -> /mous/{id}/actuals', () => {
    expect(buildForwardFormPath('actuals-confirmed', 'M1')).toBe('/mous/M1/actuals')
  })

  it('invoice-raised -> /mous/{id}/pi', () => {
    expect(buildForwardFormPath('invoice-raised', 'M1')).toBe('/mous/M1/pi')
  })

  it('kit-dispatched -> /mous/{id}/dispatch', () => {
    expect(buildForwardFormPath('kit-dispatched', 'M1')).toBe('/mous/M1/dispatch')
  })

  it('delivery-acknowledged -> /mous/{id}/delivery-ack', () => {
    expect(buildForwardFormPath('delivery-acknowledged', 'M1')).toBe('/mous/M1/delivery-ack')
  })

  it('feedback-submitted -> /mous/{id}/feedback-request', () => {
    expect(buildForwardFormPath('feedback-submitted', 'M1')).toBe('/mous/M1/feedback-request')
  })

  it('cross-verification (auto-skipped stage) returns null', () => {
    expect(buildForwardFormPath('cross-verification', 'M1')).toBeNull()
  })

  it('mou-signed (no dedicated form) returns null', () => {
    expect(buildForwardFormPath('mou-signed', 'M1')).toBeNull()
  })

  it('payment-received (Finance flow not wired) returns /mous/{id} detail page', () => {
    expect(buildForwardFormPath('payment-received', 'M1')).toBe('/mous/M1')
  })

  it('pre-ops returns null (no form for the holding bay)', () => {
    expect(buildForwardFormPath('pre-ops', 'M1')).toBeNull()
  })
})

describe('validateReason', () => {
  it('null / undefined => reason-missing', () => {
    expect(validateReason(null)).toBe('reason-missing')
    expect(validateReason(undefined)).toBe('reason-missing')
  })

  it('empty / whitespace-only => reason-missing', () => {
    expect(validateReason('')).toBe('reason-missing')
    expect(validateReason('   ')).toBe('reason-missing')
  })

  it('< 5 chars after trim => reason-too-short', () => {
    expect(validateReason('hi')).toBe('reason-too-short')
    expect(validateReason('  hi  ')).toBe('reason-too-short')
  })

  it('exactly 5 chars => valid', () => {
    expect(validateReason('hello')).toBeNull()
  })

  it('long reason => valid', () => {
    expect(validateReason('Imported from gsl-mou-system mid-flight; PI was already issued upstream.')).toBeNull()
  })
})
