import { describe, expect, it } from 'vitest'
import { validateNextParam } from './nextParam'

describe('validateNextParam', () => {
  it('accepts a same-origin path starting with single slash', () => {
    expect(validateNextParam('/dashboard')).toBe('/dashboard')
    expect(validateNextParam('/admin/audit?action=p2-override')).toBe(
      '/admin/audit?action=p2-override',
    )
  })

  it('rejects null / undefined / empty', () => {
    expect(validateNextParam(null)).toBeNull()
    expect(validateNextParam(undefined)).toBeNull()
    expect(validateNextParam('')).toBeNull()
  })

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(validateNextParam('//evil.com')).toBeNull()
    expect(validateNextParam('//evil.com/dashboard')).toBeNull()
  })

  it('rejects absolute URLs with scheme', () => {
    expect(validateNextParam('https://evil.com/dashboard')).toBeNull()
    expect(validateNextParam('http://evil.com')).toBeNull()
    expect(validateNextParam('javascript://alert(1)')).toBeNull()
  })

  it('rejects paths containing backslash', () => {
    expect(validateNextParam('/dashboard\\foo')).toBeNull()
    expect(validateNextParam('\\\\evil.com')).toBeNull()
  })

  it('rejects relative paths (no leading slash)', () => {
    expect(validateNextParam('dashboard')).toBeNull()
    expect(validateNextParam('admin/audit')).toBeNull()
  })

  it('rejects non-string input shapes defensively', () => {
    expect(validateNextParam(undefined)).toBeNull()
  })
})
