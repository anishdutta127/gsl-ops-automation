/*
 * Signed snapshot token utilities.
 *
 * Token format: base64url(json(payload)) + "." + base64url(hmac_sha256(payload, key))
 *
 * Verification: split on ".", decode payload, check v === 1, recompute HMAC
 * with a constant-time compare, check expiresAt > now.
 *
 * The signing key is a 32-byte hex string from process.env.GSL_SNAPSHOT_SIGNING_KEY.
 * Rotation invalidates every outstanding token.
 *
 * Implementation: WebCrypto (globalThis.crypto.subtle). Works in both the
 * Node runtime that handles /api/snapshot/create and the Edge runtime that
 * runs middleware.ts.
 */

export const SNAPSHOT_TOKEN_VERSION = 1 as const

export interface SnapshotTokenPayload {
  v: typeof SNAPSHOT_TOKEN_VERSION
  issuedAt: number
  expiresAt: number
  issuedBy: string
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number)
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const normal = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary = typeof atob === 'function' ? atob(normal) : Buffer.from(normal, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function stringToBuffer(s: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(s)
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

async function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    stringToBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function hmacSign(payloadB64: string, key: string): Promise<string> {
  const k = await importKey(key)
  const sig = await crypto.subtle.sign('HMAC', k, stringToBuffer(payloadB64))
  return bytesToBase64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export async function mintSnapshotToken(
  identityName: string,
  ttlSeconds: number,
  key: string,
): Promise<{ token: string; expiresAt: number; issuedAt: number }> {
  if (!key) throw new Error('GSL_SNAPSHOT_SIGNING_KEY is not set')
  const now = Math.floor(Date.now() / 1000)
  const payload: SnapshotTokenPayload = {
    v: SNAPSHOT_TOKEN_VERSION,
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    issuedBy: identityName,
  }
  const payloadB64 = bytesToBase64Url(new Uint8Array(stringToBuffer(JSON.stringify(payload))))
  const sig = await hmacSign(payloadB64, key)
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
  }
}

export async function verifySnapshotToken(
  token: string,
  key: string,
): Promise<{ valid: false } | { valid: true; payload: SnapshotTokenPayload }> {
  if (!token || !key) return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const payloadB64 = parts[0]
  const sigB64 = parts[1]
  if (!payloadB64 || !sigB64) return { valid: false }

  let payload: SnapshotTokenPayload
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payloadB64))
    const parsed = JSON.parse(json) as SnapshotTokenPayload
    if (parsed.v !== SNAPSHOT_TOKEN_VERSION) return { valid: false }
    if (typeof parsed.issuedAt !== 'number' || typeof parsed.expiresAt !== 'number') {
      return { valid: false }
    }
    if (typeof parsed.issuedBy !== 'string') return { valid: false }
    payload = parsed
  } catch {
    return { valid: false }
  }

  const expected = await hmacSign(payloadB64, key)
  if (!timingSafeEqual(expected, sigB64)) return { valid: false }

  const now = Math.floor(Date.now() / 1000)
  if (payload.expiresAt <= now) return { valid: false }

  return { valid: true, payload }
}
