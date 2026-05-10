import { describe, expect, it } from 'vitest'
import type { User } from './types'
import {
  FINANCE_ONLY_SCHOOL_FIELDS,
  canEditFinanceSchoolFields,
  isFinanceOnlySchoolField,
} from './schoolFieldConfig'

function user(args: { role: User['role']; department?: User['department']; active?: boolean }): User {
  return {
    id: 'test',
    name: 'test',
    email: 'test@example.test',
    role: args.role,
    department: args.department,
    testingOverride: false,
    active: args.active ?? true,
    passwordHash: 'X',
    createdAt: '',
    auditLog: [],
  }
}

describe('schoolFieldConfig: FINANCE_ONLY_SCHOOL_FIELDS', () => {
  it('lists gstNumber, pan, and billingName', () => {
    expect(FINANCE_ONLY_SCHOOL_FIELDS).toEqual(['gstNumber', 'pan', 'billingName'])
  })
})

describe('schoolFieldConfig: isFinanceOnlySchoolField', () => {
  it('matches the three finance fields', () => {
    expect(isFinanceOnlySchoolField('gstNumber')).toBe(true)
    expect(isFinanceOnlySchoolField('pan')).toBe(true)
    expect(isFinanceOnlySchoolField('billingName')).toBe(true)
  })

  it('rejects non-finance fields', () => {
    expect(isFinanceOnlySchoolField('name')).toBe(false)
    expect(isFinanceOnlySchoolField('city')).toBe(false)
    expect(isFinanceOnlySchoolField('phone')).toBe(false)
    expect(isFinanceOnlySchoolField('notes')).toBe(false)
  })
})

describe('schoolFieldConfig: canEditFinanceSchoolFields', () => {
  it('grants Finance department + null-dept Admin', () => {
    expect(canEditFinanceSchoolFields(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canEditFinanceSchoolFields(user({ role: 'Admin', department: null }))).toBe(true)
  })

  it('blocks Admin role with department=ops (Misba MM4 case)', () => {
    expect(canEditFinanceSchoolFields(user({ role: 'Admin', department: 'ops' }))).toBe(false)
  })

  it('blocks SalesRep + OpsHead', () => {
    expect(canEditFinanceSchoolFields(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canEditFinanceSchoolFields(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
  })

  it('blocks Leadership (read-most, not write)', () => {
    expect(canEditFinanceSchoolFields(user({ role: 'Leadership', department: null }))).toBe(false)
  })
})
