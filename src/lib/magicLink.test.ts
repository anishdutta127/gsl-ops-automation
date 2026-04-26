import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signMagicLink, verifyMagicLink } from './magicLink'

const TEST_KEY = 'unit-test-magic-link-key-32-bytes-of-entropy'

const payload = {
  purpose: 'feedback-submit' as const,
  mouId: 'MOU-STEAM-2627-001',
  installmentSeq: 1,
  spocEmail: 'spoc.greenfield@example.test',
  issuedAt: '2026-04-25T10:00:00Z',
}

describe('signMagicLink + verifyMagicLink', () => {
  let originalKey: string | undefined

  beforeEach(() => {
    originalKey = process.env.GSL_SNAPSHOT_SIGNING_KEY
    process.env.GSL_SNAPSHOT_SIGNING_KEY = TEST_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GSL_SNAPSHOT_SIGNING_KEY
    else process.env.GSL_SNAPSHOT_SIGNING_KEY = originalKey
  })

  it('signs deterministically: same payload -> same signature', () => {
    const a = signMagicLink(payload)
    const b = signMagicLink(payload)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies a signature it produced', () => {
    const sig = signMagicLink(payload)
    expect(verifyMagicLink(payload, sig)).toBe(true)
  })

  it('rejects a tampered signature', () => {
    const sig = signMagicLink(payload)
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')
    expect(verifyMagicLink(payload, tampered)).toBe(false)
  })

  it('rejects a payload-purpose swap (feedback-submit signature on status-view request)', () => {
    const fbSig = signMagicLink({ ...payload, purpose: 'feedback-submit' })
    expect(
      verifyMagicLink({ ...payload, purpose: 'status-view' }, fbSig),
    ).toBe(false)
  })

  it('rejects empty signature', () => {
    expect(verifyMagicLink(payload, '')).toBe(false)
  })

  it('rejects malformed (non-hex) signature', () => {
    expect(verifyMagicLink(payload, 'not-hex-at-all')).toBe(false)
  })

  it('rejects signature of wrong length', () => {
    expect(verifyMagicLink(payload, 'aabb')).toBe(false)
  })

  it('rejects when payload mouId differs', () => {
    const sig = signMagicLink(payload)
    expect(
      verifyMagicLink({ ...payload, mouId: 'MOU-OTHER' }, sig),
    ).toBe(false)
  })

  it('rejects when payload installmentSeq differs', () => {
    const sig = signMagicLink(payload)
    expect(
      verifyMagicLink({ ...payload, installmentSeq: 2 }, sig),
    ).toBe(false)
  })

  it('throws when GSL_SNAPSHOT_SIGNING_KEY is unset', () => {
    delete process.env.GSL_SNAPSHOT_SIGNING_KEY
    expect(() => signMagicLink(payload)).toThrow('GSL_SNAPSHOT_SIGNING_KEY')
  })
})
