/*
 * Tests for ssoConfig helpers (Phase 6G Part 2).
 *
 * The full Auth.js handler is exercised by the Playwright walk in
 * Part 5; here we cover the pure helpers: env-detection +
 * domain-allowlist parsing.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildEntraProviderConfig,
  isEmailDomainAllowed,
  isMicrosoftEntraIdConfigured,
  parseAllowedDomains,
} from './ssoEnv'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  delete process.env.AUTH_MICROSOFT_ENTRA_ID_ID
  delete process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID
  delete process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS
  delete process.env.AUTH_SECRET
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('isMicrosoftEntraIdConfigured', () => {
  it('returns true once Client ID + Tenant ID + AUTH_SECRET are set (PKCE flow needs no client secret)', () => {
    expect(isMicrosoftEntraIdConfigured()).toBe(false)
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = 'X'
    expect(isMicrosoftEntraIdConfigured()).toBe(false)
    process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID = 'Z'
    expect(isMicrosoftEntraIdConfigured()).toBe(false)
    process.env.AUTH_SECRET = 'W'
    expect(isMicrosoftEntraIdConfigured()).toBe(true)
  })
})

describe('parseAllowedDomains', () => {
  it('returns [] when env var is missing or empty', () => {
    expect(parseAllowedDomains()).toEqual([])
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS = ''
    expect(parseAllowedDomains()).toEqual([])
  })

  it('splits comma-separated, trims whitespace, lowercases', () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ALLOWED_DOMAINS =
      ' getsetlearn.info, Mafatlal.com , '
    expect(parseAllowedDomains()).toEqual(['getsetlearn.info', 'mafatlal.com'])
  })
})

describe('isEmailDomainAllowed', () => {
  it('passes any domain when allowlist is empty (single-tenant gate is the only defence)', () => {
    expect(isEmailDomainAllowed('x@anywhere.com', [])).toBe(true)
  })

  it('blocks a domain not in the allowlist', () => {
    expect(isEmailDomainAllowed('x@anywhere.com', ['getsetlearn.info'])).toBe(false)
  })

  it('case-insensitive match: uppercase email maps to the lowercase allowlist', () => {
    expect(
      isEmailDomainAllowed('Foo@GetSetLearn.info', ['getsetlearn.info']),
    ).toBe(true)
  })

  it('rejects an email without an @ sign', () => {
    expect(isEmailDomainAllowed('no-at', ['mafatlal.com'])).toBe(false)
  })
})

describe('buildEntraProviderConfig (Phase 6G.3 dual-mode)', () => {
  it('without AUTH_MICROSOFT_ENTRA_ID_SECRET: PKCE-only public client', () => {
    const cfg = buildEntraProviderConfig({
      AUTH_MICROSOFT_ENTRA_ID_ID: 'client-abc',
      AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: 'tenant-xyz',
    } as NodeJS.ProcessEnv)
    expect(cfg.clientId).toBe('client-abc')
    expect(cfg.clientSecret).toBeUndefined()
    expect(cfg.issuer).toBe('https://login.microsoftonline.com/tenant-xyz/v2.0')
    expect(cfg.client?.token_endpoint_auth_method).toBe('none')
  })

  it('with AUTH_MICROSOFT_ENTRA_ID_SECRET set: confidential client', () => {
    const cfg = buildEntraProviderConfig({
      AUTH_MICROSOFT_ENTRA_ID_ID: 'client-abc',
      AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: 'tenant-xyz',
      AUTH_MICROSOFT_ENTRA_ID_SECRET: 'shhh-secret',
    } as NodeJS.ProcessEnv)
    expect(cfg.clientId).toBe('client-abc')
    expect(cfg.clientSecret).toBe('shhh-secret')
    expect(cfg.issuer).toBe('https://login.microsoftonline.com/tenant-xyz/v2.0')
    // No token_endpoint_auth_method override: postgres.js's openid-client
    // defaults to client_secret_basic which is what Microsoft expects
    // from a confidential Web-platform registration.
    expect(cfg.client).toBeUndefined()
  })

  it('throws when client ID or tenant ID is missing', () => {
    expect(() => buildEntraProviderConfig({} as NodeJS.ProcessEnv)).toThrow(
      /both be set/,
    )
    expect(() =>
      buildEntraProviderConfig({
        AUTH_MICROSOFT_ENTRA_ID_ID: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow()
    expect(() =>
      buildEntraProviderConfig({
        AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow()
  })

  it('issuer URL uses /v2.0 endpoint (not /common, not legacy /oauth2)', () => {
    const cfg = buildEntraProviderConfig({
      AUTH_MICROSOFT_ENTRA_ID_ID: 'c',
      AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: 't',
    } as NodeJS.ProcessEnv)
    expect(cfg.issuer).toBe('https://login.microsoftonline.com/t/v2.0')
  })
})
