/*
 * gate-add-admin (Phase 0.1): verify the new full-access admin Shubhangi
 * (ujaccounts / ujaccounts@getsetlearn.info) is a genuine cross-functional
 * wildcard. Asserted under PRODUCTION LOCKDOWN (TESTING_OPEN_ACCESS=false), the
 * strictest mode, so this proves she is unrestricted by role+department, not
 * merely because testing mode opens everything.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import usersJson from '@/data/users.json'
import type { User } from '@/lib/types'
import {
  canAccessSales, canAccessOps, canAccessFinance,
  canGeneratePI, canEditFinanceData, canRaiseDispatch, canApproveDispatch,
  canEditSchoolMaster, canManageInventory, canEditMOU,
  canManageEscalations, canManageUsers, canViewAllAuditLogs,
} from '@/lib/access'

const SAVED = process.env.TESTING_OPEN_ACCESS
beforeAll(() => { process.env.TESTING_OPEN_ACCESS = 'false' }) // production lockdown
afterAll(() => {
  if (SAVED === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = SAVED
})

const shubhangi = (usersJson as unknown as User[]).find((u) => u.id === 'ujaccounts')!

describe('Shubhangi (ujaccounts) is a full cross-functional wildcard admin', () => {
  it('has the wildcard-admin record shape (role Admin, department null, active)', () => {
    expect(shubhangi).toBeTruthy()
    expect(shubhangi.role).toBe('Admin')
    expect(shubhangi.department).toBeNull()
    expect(shubhangi.active).toBe(true)
    expect(shubhangi.email).toBe('ujaccounts@getsetlearn.info')
  })

  it('passes EVERY department surface + action gate under production lockdown', () => {
    for (const gate of [
      canAccessSales, canAccessOps, canAccessFinance,
      canGeneratePI, canEditFinanceData, canRaiseDispatch, canApproveDispatch,
      canEditSchoolMaster, canManageInventory, canEditMOU,
      canManageEscalations, canManageUsers, canViewAllAuditLogs,
    ]) {
      expect(gate(shubhangi), gate.name).toBe(true)
    }
  })
})
