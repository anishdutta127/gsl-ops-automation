import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Department, User, UserRole } from './types'
import {
  canAccessFinance,
  canAccessLeadershipReports,
  canAccessOps,
  canAccessSales,
  canApproveDispatch,
  canEditFinanceData,
  canEditMOU,
  canEditSchoolMaster,
  canExecuteDispatch,
  canGeneratePI,
  canManageEscalations,
  canManageInventory,
  canManageUsers,
  canRaiseDispatch,
  canViewAllAuditLogs,
  defaultDepartmentForRole,
  getDepartment,
  isTestingOpenAccess,
} from './access'

function user(args: {
  id?: string
  role: UserRole
  department?: Department
  active?: boolean
}): User {
  return {
    id: args.id ?? 'test-user',
    name: args.id ?? 'test-user',
    email: `${args.id ?? 'test-user'}@getsetlearn.info`,
    role: args.role,
    department: args.department,
    testingOverride: false,
    active: args.active ?? true,
    passwordHash: 'bcrypt:placeholder',
    createdAt: '2026-05-10T00:00:00Z',
    auditLog: [],
  }
}

const ALL_ROLES: UserRole[] = [
  'Admin',
  'Leadership',
  'SalesHead',
  'SalesRep',
  'OpsHead',
  'OpsEmployee',
  'Finance',
  'TrainerHead',
]

describe('access: defaultDepartmentForRole', () => {
  it('maps SalesHead and SalesRep to sales', () => {
    expect(defaultDepartmentForRole('SalesHead')).toBe('sales')
    expect(defaultDepartmentForRole('SalesRep')).toBe('sales')
  })

  it('maps OpsHead, OpsEmployee, TrainerHead to ops', () => {
    expect(defaultDepartmentForRole('OpsHead')).toBe('ops')
    expect(defaultDepartmentForRole('OpsEmployee')).toBe('ops')
    expect(defaultDepartmentForRole('TrainerHead')).toBe('ops')
  })

  it('maps Finance to finance', () => {
    expect(defaultDepartmentForRole('Finance')).toBe('finance')
  })

  it('maps Admin and Leadership to null', () => {
    expect(defaultDepartmentForRole('Admin')).toBeNull()
    expect(defaultDepartmentForRole('Leadership')).toBeNull()
  })
})

describe('access: getDepartment', () => {
  it('reads user.department directly when set', () => {
    expect(getDepartment(user({ role: 'Admin', department: 'ops' }))).toBe('ops')
    expect(getDepartment(user({ role: 'Finance', department: null }))).toBeNull()
  })

  it('falls back to role default when department is undefined', () => {
    const u = user({ role: 'Finance' })
    delete (u as { department?: Department }).department
    expect(getDepartment(u)).toBe('finance')
  })
})

describe('access: TESTING_OPEN_ACCESS toggle', () => {
  const originalEnv = process.env.TESTING_OPEN_ACCESS

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TESTING_OPEN_ACCESS
    } else {
      process.env.TESTING_OPEN_ACCESS = originalEnv
    }
  })

  it('returns true when env is unset (fail-open default)', () => {
    delete process.env.TESTING_OPEN_ACCESS
    expect(isTestingOpenAccess()).toBe(true)
  })

  it('returns true when env is empty string', () => {
    process.env.TESTING_OPEN_ACCESS = ''
    expect(isTestingOpenAccess()).toBe(true)
  })

  it("returns true when env is 'true'", () => {
    process.env.TESTING_OPEN_ACCESS = 'true'
    expect(isTestingOpenAccess()).toBe(true)
  })

  it("returns true when env is 'TRUE' (case-insensitive)", () => {
    process.env.TESTING_OPEN_ACCESS = 'TRUE'
    expect(isTestingOpenAccess()).toBe(true)
  })

  it("returns false when env is 'false'", () => {
    process.env.TESTING_OPEN_ACCESS = 'false'
    expect(isTestingOpenAccess()).toBe(false)
  })

  it("returns false when env is 'FALSE' (case-insensitive)", () => {
    process.env.TESTING_OPEN_ACCESS = 'FALSE'
    expect(isTestingOpenAccess()).toBe(false)
  })
})

// ----------------------------------------------------------------------------
// VIEW gates × testing mode
// ----------------------------------------------------------------------------

describe('access: VIEW gates in testing-open mode (default)', () => {
  beforeEach(() => {
    delete process.env.TESTING_OPEN_ACCESS
  })

  it.each(ALL_ROLES)('every active role can canAccessSales: %s', (role) => {
    expect(canAccessSales(user({ role, department: 'finance' }))).toBe(true)
  })

  it.each(ALL_ROLES)('every active role can canAccessOps: %s', (role) => {
    expect(canAccessOps(user({ role, department: 'finance' }))).toBe(true)
  })

  it.each(ALL_ROLES)('every active role can canAccessFinance: %s', (role) => {
    expect(canAccessFinance(user({ role, department: 'sales' }))).toBe(true)
  })

  it.each(ALL_ROLES)(
    'every active role can canAccessLeadershipReports: %s',
    (role) => {
      expect(
        canAccessLeadershipReports(user({ role, department: 'sales' })),
      ).toBe(true)
    },
  )

  it('inactive user blocked from VIEW gates even in testing mode', () => {
    const u = user({ role: 'Admin', department: null, active: false })
    expect(canAccessSales(u)).toBe(false)
    expect(canAccessOps(u)).toBe(false)
    expect(canAccessFinance(u)).toBe(false)
    expect(canAccessLeadershipReports(u)).toBe(false)
  })
})

describe('access: VIEW gates in production-strict mode', () => {
  beforeEach(() => {
    process.env.TESTING_OPEN_ACCESS = 'false'
  })

  afterEach(() => {
    delete process.env.TESTING_OPEN_ACCESS
  })

  it('canAccessSales: only sales department + Admin + Leadership', () => {
    expect(canAccessSales(user({ role: 'SalesRep', department: 'sales' }))).toBe(true)
    expect(canAccessSales(user({ role: 'SalesHead', department: 'sales' }))).toBe(true)
    expect(canAccessSales(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canAccessSales(user({ role: 'Leadership', department: null }))).toBe(true)
    expect(canAccessSales(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canAccessSales(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })

  it('canAccessOps: only ops department + Admin + Leadership', () => {
    expect(canAccessOps(user({ role: 'OpsHead', department: 'ops' }))).toBe(true)
    expect(canAccessOps(user({ role: 'OpsEmployee', department: 'ops' }))).toBe(true)
    expect(canAccessOps(user({ role: 'TrainerHead', department: 'ops' }))).toBe(true)
    expect(canAccessOps(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canAccessOps(user({ role: 'Leadership', department: null }))).toBe(true)
    expect(canAccessOps(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canAccessOps(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })

  it('canAccessFinance: only finance department + Admin + Leadership', () => {
    expect(canAccessFinance(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canAccessFinance(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canAccessFinance(user({ role: 'Leadership', department: null }))).toBe(true)
    expect(canAccessFinance(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canAccessFinance(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
  })

  it('canAccessLeadershipReports: Admin and Leadership only', () => {
    expect(canAccessLeadershipReports(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canAccessLeadershipReports(user({ role: 'Leadership', department: null }))).toBe(true)
    expect(canAccessLeadershipReports(user({ role: 'SalesHead', department: 'sales' }))).toBe(false)
    expect(canAccessLeadershipReports(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canAccessLeadershipReports(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

// ----------------------------------------------------------------------------
// EDIT gates × testing mode
// ----------------------------------------------------------------------------

describe('access: EDIT gates open in testing-open mode (default)', () => {
  beforeEach(() => {
    delete process.env.TESTING_OPEN_ACCESS
  })

  it('canGeneratePI: Ops Admin opens during testing window', () => {
    const opsUser = user({ id: 'misba.m', role: 'Admin', department: 'ops' })
    expect(canGeneratePI(opsUser)).toBe(true)
  })

  it('canEditMOU: Finance Admin opens during testing window (Pranav hotfix)', () => {
    const financeUser = user({
      id: 'pranav.b',
      role: 'Admin',
      department: 'finance',
    })
    expect(canEditMOU(financeUser)).toBe(true)
  })

  it('canRaiseDispatch: Sales Admin opens during testing window', () => {
    const salesUser = user({
      id: 'pratik.d',
      role: 'Admin',
      department: 'sales',
    })
    expect(canRaiseDispatch(salesUser)).toBe(true)
  })

  it.each(ALL_ROLES)('every active role can canEditMOU: %s', (role) => {
    expect(canEditMOU(user({ role, department: 'finance' }))).toBe(true)
  })

  it.each(ALL_ROLES)('every active role can canGeneratePI: %s', (role) => {
    expect(canGeneratePI(user({ role, department: 'ops' }))).toBe(true)
  })

  it('inactive user blocked from EDIT gates even in testing mode', () => {
    const u = user({ role: 'Admin', department: null, active: false })
    expect(canEditMOU(u)).toBe(false)
    expect(canEditFinanceData(u)).toBe(false)
    expect(canGeneratePI(u)).toBe(false)
    expect(canRaiseDispatch(u)).toBe(false)
  })
})

// Production-strict suites: each EDIT-gate test below relies on
// `TESTING_OPEN_ACCESS=false` so the department-scoped semantics apply.
// The shared scaffold lives in `editStrictMode()` below; each describe
// calls it once.
function editStrictMode() {
  beforeEach(() => {
    process.env.TESTING_OPEN_ACCESS = 'false'
  })
  afterEach(() => {
    delete process.env.TESTING_OPEN_ACCESS
  })
}

describe('access: canEditMOU (production strict)', () => {
  editStrictMode()
  it('grants Sales department + Admin null wildcard only', () => {
    expect(canEditMOU(user({ role: 'SalesHead', department: 'sales' }))).toBe(true)
    expect(canEditMOU(user({ role: 'SalesRep', department: 'sales' }))).toBe(true)
    expect(canEditMOU(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canEditMOU(user({ role: 'Admin', department: 'finance' }))).toBe(false)
    expect(canEditMOU(user({ role: 'Leadership', department: null }))).toBe(false)
    expect(canEditMOU(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canEditMOU(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: canEditFinanceData (production strict)', () => {
  editStrictMode()
  it('grants Finance department + Admin null wildcard only', () => {
    expect(canEditFinanceData(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canEditFinanceData(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canEditFinanceData(user({ role: 'Admin', department: 'sales' }))).toBe(false)
    expect(canEditFinanceData(user({ role: 'Leadership', department: null }))).toBe(false)
    expect(canEditFinanceData(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canEditFinanceData(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
  })
})

describe('access: canGeneratePI (Misba MM2, production strict)', () => {
  editStrictMode()
  it('grants Finance + Admin null wildcard only', () => {
    expect(canGeneratePI(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canGeneratePI(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canGeneratePI(user({ role: 'Admin', department: 'ops' }))).toBe(false)
    expect(canGeneratePI(user({ role: 'Leadership', department: null }))).toBe(false)
    expect(canGeneratePI(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canGeneratePI(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canGeneratePI(user({ role: 'OpsEmployee', department: 'ops' }))).toBe(false)
  })
})

describe('access: canRaiseDispatch (production strict)', () => {
  editStrictMode()
  it('grants Ops + Admin null wildcard only', () => {
    expect(canRaiseDispatch(user({ role: 'OpsHead', department: 'ops' }))).toBe(true)
    expect(canRaiseDispatch(user({ role: 'OpsEmployee', department: 'ops' }))).toBe(true)
    expect(canRaiseDispatch(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canRaiseDispatch(user({ role: 'Admin', department: 'finance' }))).toBe(false)
    expect(canRaiseDispatch(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
    expect(canRaiseDispatch(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: canApproveDispatch (Misba MM1, production strict)', () => {
  editStrictMode()
  it('grants Sales + Admin null wildcard only', () => {
    expect(canApproveDispatch(user({ role: 'SalesHead', department: 'sales' }))).toBe(true)
    expect(canApproveDispatch(user({ role: 'SalesRep', department: 'sales' }))).toBe(true)
    expect(canApproveDispatch(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canApproveDispatch(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canApproveDispatch(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: canExecuteDispatch (production strict)', () => {
  editStrictMode()
  it('grants Finance + Admin null wildcard only', () => {
    expect(canExecuteDispatch(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canExecuteDispatch(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canExecuteDispatch(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canExecuteDispatch(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
  })
})

describe('access: canManageInventory (production strict)', () => {
  editStrictMode()
  it('grants Finance + Admin null wildcard (W4-G OpsHead gate lives in permissions.ts)', () => {
    expect(canManageInventory(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canManageInventory(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canManageInventory(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canManageInventory(user({ role: 'SalesRep', department: 'sales' }))).toBe(false)
  })
})

describe('access: canEditSchoolMaster (production strict)', () => {
  editStrictMode()
  it('grants Sales + Admin null wildcard only', () => {
    expect(canEditSchoolMaster(user({ role: 'SalesHead', department: 'sales' }))).toBe(true)
    expect(canEditSchoolMaster(user({ role: 'SalesRep', department: 'sales' }))).toBe(true)
    expect(canEditSchoolMaster(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canEditSchoolMaster(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canEditSchoolMaster(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: canManageEscalations (production strict)', () => {
  editStrictMode()
  it('grants Sales, Ops, Finance + Admin null wildcard', () => {
    expect(canManageEscalations(user({ role: 'SalesHead', department: 'sales' }))).toBe(true)
    expect(canManageEscalations(user({ role: 'OpsHead', department: 'ops' }))).toBe(true)
    expect(canManageEscalations(user({ role: 'Finance', department: 'finance' }))).toBe(true)
    expect(canManageEscalations(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canManageEscalations(user({ role: 'Leadership', department: null }))).toBe(false)
  })
})

describe('access: canViewAllAuditLogs', () => {
  it('grants Leadership + Admin only', () => {
    expect(canViewAllAuditLogs(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canViewAllAuditLogs(user({ role: 'Leadership', department: null }))).toBe(true)
    expect(canViewAllAuditLogs(user({ role: 'SalesHead', department: 'sales' }))).toBe(false)
    expect(canViewAllAuditLogs(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canViewAllAuditLogs(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: canManageUsers', () => {
  it('grants Admin only', () => {
    expect(canManageUsers(user({ role: 'Admin', department: null }))).toBe(true)
    expect(canManageUsers(user({ role: 'Leadership', department: null }))).toBe(false)
    expect(canManageUsers(user({ role: 'SalesHead', department: 'sales' }))).toBe(false)
    expect(canManageUsers(user({ role: 'OpsHead', department: 'ops' }))).toBe(false)
    expect(canManageUsers(user({ role: 'Finance', department: 'finance' }))).toBe(false)
  })
})

describe('access: inactive users always blocked', () => {
  it('every gate returns false for inactive users', () => {
    const u = user({ role: 'Admin', department: null, active: false })
    expect(canAccessSales(u)).toBe(false)
    expect(canAccessOps(u)).toBe(false)
    expect(canAccessFinance(u)).toBe(false)
    expect(canAccessLeadershipReports(u)).toBe(false)
    expect(canEditMOU(u)).toBe(false)
    expect(canEditFinanceData(u)).toBe(false)
    expect(canGeneratePI(u)).toBe(false)
    expect(canRaiseDispatch(u)).toBe(false)
    expect(canApproveDispatch(u)).toBe(false)
    expect(canExecuteDispatch(u)).toBe(false)
    expect(canManageInventory(u)).toBe(false)
    expect(canEditSchoolMaster(u)).toBe(false)
    expect(canManageEscalations(u)).toBe(false)
    expect(canViewAllAuditLogs(u)).toBe(false)
    expect(canManageUsers(u)).toBe(false)
  })
})
