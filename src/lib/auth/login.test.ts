import { describe, expect, it, vi } from 'vitest'
import { authenticateLogin, type AuthenticateDeps } from './login'
import type { User } from '@/lib/types'

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'anish.d',
    name: 'Anish Dutta',
    email: 'anish.d@example.test',
    role: 'Admin',
    testingOverride: false,
    active: true,
    passwordHash: '$2y$12$placeholderhashthatwillbemockchecked',
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

function makeDeps(opts: { users?: User[]; verified?: boolean; throws?: boolean } = {}): AuthenticateDeps {
  return {
    users: opts.users ?? [user()],
    bcryptCompare: vi.fn(async () => {
      if (opts.throws) throw new Error('bcrypt failed')
      return opts.verified ?? true
    }),
  }
}

describe('authenticateLogin', () => {
  it('returns ok=true with the user on valid credentials', async () => {
    const result = await authenticateLogin(
      { email: 'anish.d@example.test', password: 'GSL#123' },
      makeDeps({ verified: true }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.user.id).toBe('anish.d')
  })

  it('case-insensitive email lookup', async () => {
    const result = await authenticateLogin(
      { email: 'ANISH.D@EXAMPLE.TEST', password: 'GSL#123' },
      makeDeps({ verified: true }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects missing-fields when email is empty', async () => {
    const result = await authenticateLogin(
      { email: '', password: 'GSL#123' },
      makeDeps(),
    )
    expect(result).toEqual({ ok: false, reason: 'missing-fields' })
  })

  it('rejects missing-fields when password is empty', async () => {
    const result = await authenticateLogin(
      { email: 'anish.d@example.test', password: '' },
      makeDeps(),
    )
    expect(result).toEqual({ ok: false, reason: 'missing-fields' })
  })

  it('rejects unknown-user when email is not in users[]', async () => {
    const result = await authenticateLogin(
      { email: 'nobody@example.test', password: 'GSL#123' },
      makeDeps(),
    )
    expect(result).toEqual({ ok: false, reason: 'unknown-user' })
  })

  it('rejects inactive user without checking the password', async () => {
    const inactive = user({ active: false })
    const compareSpy = vi.fn(async () => true)
    const result = await authenticateLogin(
      { email: 'anish.d@example.test', password: 'GSL#123' },
      { users: [inactive], bcryptCompare: compareSpy },
    )
    expect(result).toEqual({ ok: false, reason: 'inactive' })
    // Compare is NOT called: short-circuit on inactive saves bcrypt cost
    expect(compareSpy).not.toHaveBeenCalled()
  })

  it('rejects wrong-password when bcrypt compare returns false', async () => {
    const result = await authenticateLogin(
      { email: 'anish.d@example.test', password: 'wrong' },
      makeDeps({ verified: false }),
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-password' })
  })

  it('treats bcrypt throw as wrong-password (no error leak)', async () => {
    const result = await authenticateLogin(
      { email: 'anish.d@example.test', password: 'GSL#123' },
      makeDeps({ throws: true }),
    )
    expect(result).toEqual({ ok: false, reason: 'wrong-password' })
  })
})
