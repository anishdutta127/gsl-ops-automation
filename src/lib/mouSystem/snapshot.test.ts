import { describe, it, expect } from 'vitest'
import { mintSnapshotToken, verifySnapshotToken } from './snapshot'

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('snapshot token', () => {
  it('mints + verifies a valid token', async () => {
    const { token, expiresAt, issuedAt } = await mintSnapshotToken('Shubhangi', 48 * 3600, KEY)
    expect(token.split('.').length).toBe(2)
    expect(expiresAt - issuedAt).toBe(48 * 3600)
    const r = await verifySnapshotToken(token, KEY)
    expect(r.valid).toBe(true)
    if (r.valid) {
      expect(r.payload.issuedBy).toBe('Shubhangi')
      expect(r.payload.v).toBe(1)
    }
  })

  it('rejects tokens signed with a different key', async () => {
    const { token } = await mintSnapshotToken('Shubhangi', 3600, KEY)
    const other = 'deadbeef'.repeat(8)
    const r = await verifySnapshotToken(token, other)
    expect(r.valid).toBe(false)
  })

  it('rejects malformed tokens', async () => {
    expect((await verifySnapshotToken('not-a-token', KEY)).valid).toBe(false)
    expect((await verifySnapshotToken('', KEY)).valid).toBe(false)
    expect((await verifySnapshotToken('one.two.three', KEY)).valid).toBe(false)
  })

  it('rejects expired tokens', async () => {
    const { token } = await mintSnapshotToken('Shubhangi', -10, KEY)
    const r = await verifySnapshotToken(token, KEY)
    expect(r.valid).toBe(false)
  })

  it('rejects wrong-version payload', async () => {
    const header = Buffer.from(
      JSON.stringify({ v: 2, issuedAt: 1, expiresAt: 99999999999, issuedBy: 'x' }),
      'utf-8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const token = `${header}.sig`
    const r = await verifySnapshotToken(token, KEY)
    expect(r.valid).toBe(false)
  })
})
