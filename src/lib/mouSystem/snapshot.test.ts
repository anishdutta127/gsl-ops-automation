// @vitest-environment node
// crypto.subtle.importKey strict-checks keyData `instanceof ArrayBuffer` against
// its own realm. Under the repo-default jsdom environment the ArrayBuffer comes
// from the jsdom realm while crypto.subtle is Node-native, so Node 20 rejects it
// (ERR_INVALID_ARG_TYPE); Node 24 happens to be lenient. Prod runs this in pure
// Node (same realm), so the node environment matches reality.
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
